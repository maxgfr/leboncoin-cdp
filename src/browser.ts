/**
 * Browser management — launch/connect to Chrome or Brave with CDP.
 *
 * Unlike Puppeteer, we never call puppeteer.launch() or puppeteer.connect().
 * We spawn the browser as a normal process and attach via raw WebSocket CDP.
 * This means zero automation flags — the browser is indistinguishable from
 * a manually launched instance.
 */
import { spawn, execSync } from 'child_process';
import { config, getBrowserAppName } from './config';
import { logger } from './logger';
import { delay } from './utils';
import { CDPClient } from './cdp';

interface TabInfo {
  id: string;
  title: string;
  url: string;
  type: string;
  webSocketDebuggerUrl: string;
}

function randomHighPort(): number {
  return 30_000 + Math.floor(Math.random() * 20_000);
}

function isBrowserRunning(): boolean {
  try {
    return (
      execSync(`pgrep -f "${config.browser.chromePath}"`, {
        encoding: 'utf-8',
      }).trim().length > 0
    );
  } catch {
    return false;
  }
}

function quitBrowser(appName: string): void {
  try {
    execSync(`osascript -e 'tell application "${appName}" to quit'`, {
      stdio: 'ignore',
      timeout: 5_000,
    });
  } catch {
    // ignore
  }
}

async function waitForBrowserExit(timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isBrowserRunning()) return;
    await delay(500);
  }
  try {
    execSync(`pkill -9 -f "${config.browser.chromePath}"`, {
      stdio: 'ignore',
    });
    await delay(1_000);
  } catch {
    // ignore
  }
}

async function getCdpInfo(port: number): Promise<{ wsUrl: string } | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (!res.ok) return null;
    const data = (await res.json()) as { webSocketDebuggerUrl: string };
    return { wsUrl: data.webSocketDebuggerUrl };
  } catch {
    return null;
  }
}

async function listTabs(port: number): Promise<TabInfo[]> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    return res.ok ? ((await res.json()) as TabInfo[]) : [];
  } catch {
    return [];
  }
}

/**
 * Find or create a tab and navigate it to the target URL.
 * Returns a CDPClient connected to that tab's JS context.
 */
async function openTab(port: number, targetUrl: string): Promise<CDPClient> {
  const tabs = await listTabs(port);

  // Prefer an existing leboncoin tab (re-use it)
  let target = tabs.find(
    (t) => t.type === 'page' && t.url.includes('leboncoin.fr'),
  );

  if (!target) {
    target = tabs.find((t) => t.type === 'page');
    if (!target) {
      const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`);
      target = (await res.json()) as TabInfo;
    }
  }

  logger.info(`Connecting to tab: ${target.url || 'about:blank'}`);
  let cdp = await CDPClient.connect(target.webSocketDebuggerUrl);

  // Try to enable Page domain — might fail on stale/restored tabs
  try {
    await cdp.send('Page.enable', {}, 10_000);
  } catch {
    logger.warn('Tab not responding — opening a fresh tab…');
    cdp.disconnect();
    const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`);
    const freshTab = (await res.json()) as TabInfo;
    cdp = await CDPClient.connect(freshTab.webSocketDebuggerUrl);
    await cdp.send('Page.enable', {}, 15_000);
  }

  // Navigate to the required URL
  logger.info(`Navigating to ${targetUrl}`);
  await cdp.send('Page.navigate', { url: targetUrl });

  // Wait for full page load
  try {
    await cdp.once('Page.loadEventFired', config.browser.timeout);
  } catch {
    // Might already be loaded
  }
  await delay(2_000); // Extra time for JS hydration + DataDome init

  // Check if we landed on a CAPTCHA
  const onCaptcha = await cdp
    .evaluate<boolean>(
      `document.body.innerHTML.includes('geo.captcha-delivery') || ` +
        `!!document.querySelector('iframe[src*="datadome"]')`,
      false,
    )
    .catch(() => false);

  if (onCaptcha) {
    logger.warn('CAPTCHA detected after navigation — solve it in the browser');
    logger.info('Waiting up to 5 minutes…');
    const start = Date.now();
    while (Date.now() - start < 5 * 60 * 1_000) {
      await delay(3_000);
      const clear = await cdp
        .evaluate<boolean>(
          `window.location.hostname.includes('leboncoin.fr') && ` +
            `!document.querySelector('iframe[src*="captcha"]') && ` +
            `!document.querySelector('iframe[src*="datadome"]') && ` +
            `!document.body.innerHTML.includes('geo.captcha-delivery')`,
          false,
        )
        .catch(() => false);
      if (clear) {
        logger.success('CAPTCHA resolved');
        await delay(1_500);
        break;
      }
    }
  }

  logger.success('Page loaded');
  return cdp;
}

/**
 * Ensure a browser is running with CDP and return a CDPClient
 * connected to a tab navigated to `targetUrl`.
 */
export async function connectAndNavigate(
  targetUrl: string,
): Promise<CDPClient> {
  const browserName = getBrowserAppName(config.browser.chromePath);
  const port = config.browser.debuggingPort;

  // 1. Try connecting to an already-running CDP endpoint
  if (port > 0) {
    const info = await getCdpInfo(port);
    if (info) {
      logger.info(`Found existing ${browserName} with CDP on port ${port}`);
      return openTab(port, targetUrl);
    }
  }

  // 2. If browser is running without CDP, quit it and relaunch
  if (isBrowserRunning()) {
    logger.warn(`${browserName} running without CDP — restarting…`);
    quitBrowser(browserName);
    await waitForBrowserExit();
  }

  // 3. Launch browser with CDP on a random high port
  const newPort = randomHighPort();
  config.browser.debuggingPort = newPort;

  logger.info(`Launching ${browserName} with CDP on port ${newPort}`);
  logger.info(`  Binary  : ${config.browser.chromePath}`);
  logger.info(`  Profile : ${config.browser.userDataDir}`);

  const child = spawn(
    config.browser.chromePath,
    [
      `--remote-debugging-port=${newPort}`,
      `--user-data-dir=${config.browser.userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-session-crashed-bubble',
      '--hide-crash-restore-bubble',
    ],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();

  // Wait for CDP to become available
  let cdpReady = false;
  for (let i = 0; i < 30; i++) {
    await delay(500);
    if (await getCdpInfo(newPort)) {
      cdpReady = true;
      break;
    }
  }

  if (!cdpReady) {
    throw new Error(
      `${browserName} did not expose CDP on port ${newPort} within 15s`,
    );
  }

  logger.success('Browser launched and ready');
  return openTab(newPort, targetUrl);
}
