import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import { parseAdDetails, parseSearchResults } from './exploit';
import {
  formatDate,
  getNextJsProps,
  mergeAllAssetsJsonFiles,
  chunkArray,
  delay,
} from './utils';
import { config, getBrowserAppName } from './config';
import { logger } from './logger';
import {
  acceptCookieConsent,
  waitForCaptchaResolution,
  applyPostNavigationHumanSignals,
  getMinimalPreLaunchConfig,
} from './botPrevention';
import type { PreLaunchConfig } from './botPrevention';
import fs from 'fs';
import { execSync, spawn } from 'child_process';

// Stealth plugin reduces bot-detection fingerprints
puppeteer.use(StealthPlugin());

interface ScrapingResult {
  success: string[];
  failed: { url: string; error: string }[];
}

/**
 * Gracefully quit the browser via AppleScript (macOS).
 */
function quitBrowserGracefully(appName: string): boolean {
  try {
    execSync(
      `osascript -e 'tell application "${appName}" to quit'`,
      { stdio: 'ignore', timeout: 5000 },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Check whether the browser process is currently running.
 * Uses the binary path to avoid matching Electron apps.
 */
function isBrowserRunning(): boolean {
  try {
    const out = execSync(
      `pgrep -f "${config.browser.chromePath}"`,
      { encoding: 'utf-8' },
    ).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

/**
 * Wait until the browser process has fully exited.
 */
async function waitForBrowserExit(
  timeoutMs = 10000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isBrowserRunning()) return;
    await delay(500);
  }
  // Force kill as a last resort
  try {
    execSync(`pkill -9 -f "${config.browser.chromePath}"`, { stdio: 'ignore' });
    await delay(1000);
  } catch {
    // ignore
  }
}

/**
 * Pick a random high port for CDP.  DataDome probes well-known ports
 * (9222, 9229 …) to detect automation.  A random port in the
 * ephemeral range is invisible to those scans.
 */
function randomHighPort(): number {
  return 30000 + Math.floor(Math.random() * 20000); // 30000-49999
}

/**
 * Connect to Chrome / Brave, handling every scenario:
 *   1. Already running with CDP on known port → connect via WS
 *   2. Running without CDP → quit, then spawn with CDP on random port
 *   3. Not running → spawn with CDP on random port
 *
 * Steps 2-3 use spawn() to start Chrome as a completely normal process,
 * then puppeteer.connect() attaches passively.  This is critical:
 *   • No puppeteer.launch() = no automation flags injected at all
 *   • Random high port = DataDome port scans miss it
 *   • Wrapper profile = full symlink of real profile = same cookies/tokens
 */
async function connectToBrowser(): Promise<{
  browser: Browser;
  preCfg: PreLaunchConfig;
}> {
  const preCfg = getMinimalPreLaunchConfig();
  const browserName = getBrowserAppName(config.browser.chromePath);

  // ---- 1. Try an already-running CDP endpoint (manual launch) ----
  if (config.browser.debuggingPort > 0) {
    const debugUrl = `http://127.0.0.1:${config.browser.debuggingPort}`;
    try {
      const resp = await fetch(`${debugUrl}/json/version`);
      if (resp.ok) {
        const data = (await resp.json()) as { webSocketDebuggerUrl: string };
        logger.info(`Connecting to existing ${browserName} on port ${config.browser.debuggingPort}`);
        const browser = await puppeteer.connect({
          browserWSEndpoint: data.webSocketDebuggerUrl,
          defaultViewport: null,
        });
        return { browser, preCfg };
      }
    } catch {
      // CDP not available
    }
  }

  // ---- 2. If browser is running without CDP, quit it first ----
  if (isBrowserRunning()) {
    logger.warn(
      `${browserName} is running without CDP – quitting to relaunch…`,
    );
    quitBrowserGracefully(browserName);
    await waitForBrowserExit();
    logger.info(`${browserName} closed`);
  }

  // ---- 3. Spawn Chrome ourselves on a random high port ----
  const port = randomHighPort();
  config.browser.debuggingPort = port;

  logger.info(`Launching ${browserName} with your real profile…`);
  logger.info(`  Binary  : ${config.browser.chromePath}`);
  logger.info(`  Profile : ${config.browser.userDataDir}`);
  logger.info(`  CDP port: ${port} (random)`);

  const child = spawn(
    config.browser.chromePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${config.browser.userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-session-crashed-bubble',
      '--hide-crash-restore-bubble',
      '--disable-blink-features=AutomationControlled',
    ],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();

  // Wait for CDP endpoint to become available
  const debugUrl = `http://127.0.0.1:${port}`;
  let cdpData: { webSocketDebuggerUrl: string } | null = null;
  for (let i = 0; i < 30; i++) {
    await delay(500);
    try {
      const resp = await fetch(`${debugUrl}/json/version`);
      if (resp.ok) {
        cdpData = (await resp.json()) as { webSocketDebuggerUrl: string };
        break;
      }
    } catch {
      // not ready yet
    }
  }

  if (!cdpData) {
    throw new Error(
      `${browserName} did not expose CDP on port ${port} within 15 seconds`,
    );
  }

  const browser = await puppeteer.connect({
    browserWSEndpoint: cdpData.webSocketDebuggerUrl,
    defaultViewport: null,
  });

  logger.success('Browser launched and ready');
  return { browser, preCfg };
}

/**
 * When connected to a real browser, we DON'T close it - just disconnect.
 */
function disconnectBrowser(browser: Browser): void {
  try {
    browser.disconnect();
  } catch {
    // ignore
  }
}

/**
 * Get a page to work with.  Reuses the first existing tab when possible
 * (looks more natural than opening a brand-new tab via CDP).  Falls back
 * to newPage() only if no tabs exist.
 */
async function getOrCreatePage(browser: Browser): Promise<Page> {
  const pages = await browser.pages();
  if (pages.length > 0) return pages[0];
  return browser.newPage();
}

async function fetchPageWithRetry(
  page: Page,
  url: string,
  preCfg: PreLaunchConfig,
  retries = config.scraping.maxRetries,
): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await page.goto(url, {
        timeout: config.browser.timeout,
        waitUntil: 'networkidle2',
      });

      // Human-like behaviour before inspecting the page
      await applyPostNavigationHumanSignals(page, preCfg);

      const captchaSolved = await waitForCaptchaResolution(page);

      if (captchaSolved) {
        // DataDome redirects back to the original URL after solving.
        // Wait for that navigation to finish instead of forcing a new one
        // (a new goto() is a strong bot signal).
        try {
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
        } catch {
          // Navigation may have already completed
        }
        // Extra human delay after solving the challenge
        await delay(1500 + Math.floor(Math.random() * 1500));
      }

      const content = await page.content();
      getNextJsProps(content);
      return content;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      // Detached frame = page navigated under us (CAPTCHA redirect)
      // Close this page and open a fresh one for the retry
      if (msg.includes('detached Frame') || msg.includes('Execution context')) {
        logger.warn('Page frame replaced (CAPTCHA redirect) – retrying with fresh tab');
        try {
          const browser = page.browser();
          await page.close().catch(() => {});
          page = await browser.newPage();
        } catch {
          // best effort
        }
      }

      if (attempt === retries - 1) {
        throw new Error(
          `Failed to load ${url} after ${retries} attempts: ${msg}`,
        );
      }
      logger.warn(`Retry ${attempt + 1}/${retries} for ${url}`);
      await delay(2000 * (attempt + 1) + Math.floor(Math.random() * 2000));
    }
  }
  throw new Error('Unexpected error in fetchPageWithRetry');
}

export async function saveAllSearchResults(
  query: string,
  fileName = 'search_' + formatDate(new Date()),
): Promise<void> {
  logger.startTask(`Scraping search results for query: ${query}`);

  if (!query || query.trim().length === 0) {
    throw new Error('Query parameter cannot be empty');
  }

  const searchUrl = `${config.api.baseUrl}/recherche?${query}`;
  const { browser, preCfg } = await connectToBrowser();

  try {
    const page = await getOrCreatePage(browser);

    logger.info('Fetching first page via your real browser');
    const content = await fetchPageWithRetry(page, searchUrl, preCfg);

    await acceptCookieConsent(page);

    const result = parseSearchResults(
      content,
      `${fileName}_1`,
      config.output.saveRawJson ? `${fileName}_raw_1` : undefined,
    );

    const nbPages = Math.ceil(result.total / config.scraping.resultPerPage);
    logger.info(`Found ${result.total} results across ${nbPages} pages`);

    if (nbPages > 1) {
      for (let i = 2; i <= nbPages; i++) {
        logger.progress(i - 1, nbPages, `Page ${i}/${nbPages}`);
        await delay(
          config.scraping.rateLimit + Math.floor(Math.random() * 2000),
        );
        const pageContent = await fetchPageWithRetry(
          page,
          `${searchUrl}&page=${i}`,
          preCfg,
        );
        parseSearchResults(
          pageContent,
          `${fileName}_${i}`,
          config.output.saveRawJson ? `${fileName}_raw_${i}` : undefined,
        );
      }
      logger.progress(nbPages, nbPages);
    }

    logger.info('Merging results');
    mergeAllAssetsJsonFiles(fileName, Math.max(1, nbPages));

    await page.close();
    logger.endTask();
  } catch (error) {
    logger.error(
      `Scraping failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  } finally {
    disconnectBrowser(browser);
  }
}

export async function savePageDetailsParallel(
  urls: string[],
  fileName = 'page_' + formatDate(new Date()),
): Promise<ScrapingResult> {
  logger.startTask(
    `Scraping ${urls.length} individual pages (${config.scraping.parallelPages} parallel)`,
  );

  if (!urls || urls.length === 0) {
    throw new Error('URLs array cannot be empty');
  }

  const { browser, preCfg } = await connectToBrowser();
  const result: ScrapingResult = { success: [], failed: [] };

  try {
    const chunks = chunkArray(urls, config.scraping.parallelPages);
    let processed = 0;

    for (const chunk of chunks) {
      const tasks = chunk.map(async (url) => {
        const page = await browser.newPage();
        try {
          const content = await fetchPageWithRetry(page, url, preCfg);
          const slug = url.split('/').pop()?.replace('.htm', '') ?? 'unknown';
          parseAdDetails(
            content,
            `${fileName}_${slug}`,
            config.output.saveRawJson ? `${fileName}_raw_${slug}` : undefined,
          );
          result.success.push(url);
        } catch (error) {
          result.failed.push({
            url,
            error: error instanceof Error ? error.message : String(error),
          });
          logger.error(`Failed to scrape ${url}`);
        } finally {
          await page.close();
        }
      });

      await Promise.all(tasks);
      processed += chunk.length;
      logger.progress(processed, urls.length);

      if (processed < urls.length) {
        await delay(
          config.scraping.rateLimit + Math.floor(Math.random() * 3000),
        );
      }
    }

    if (result.failed.length > 0) {
      const failedFile = `${config.output.directory}/${fileName}_failed.json`;
      fs.writeFileSync(failedFile, JSON.stringify(result.failed, null, 2));
      logger.warn(`${result.failed.length} pages failed. See ${failedFile}`);
    }

    logger.success(
      `Successfully scraped ${result.success.length}/${urls.length} pages`,
    );
    logger.endTask();
  } catch (error) {
    logger.error(
      `Scraping failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  } finally {
    disconnectBrowser(browser);
  }

  return result;
}
