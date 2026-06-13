import fs from 'fs';
import { connectAndNavigate, waitForPageReady } from './browser';
import { scrapeAllSearchPages, scrapeAdDetails } from './scraper';
import { formatDateWithTimestamp } from './utils';
import { normalizeSearchInput } from './query';
import type { Ad } from './types';
import { logger } from './logger';
import {
  config,
  detectUserDataDir,
  createWrapperDataDir,
  getBrowserPath,
  resetScraperProfile,
} from './config';
import type { BrowserType } from './config';

interface CliArgs {
  query?: string;
  output?: string;
  configFile?: string;
  detailsOnly?: boolean;
  searchOnly?: boolean;
  withDetails?: boolean;
  resetProfile?: boolean;
  browser?: BrowserType;
  chromePath?: string;
  debuggingPort?: number;
  pageTimeout?: number;
  maxRetries?: number;
  rateLimit?: number;
  maxPages?: number;
  outputDir?: string;
  saveRaw?: boolean;
}

function parseCliArgs(): CliArgs {
  const args = process.argv.slice(2);
  const result: CliArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--query':
      case '-q':
        result.query = args[++i];
        break;
      case '--output':
      case '-o':
        result.output = args[++i];
        break;
      case '--config':
      case '-c':
        result.configFile = args[++i];
        break;
      case '--details-only':
        result.detailsOnly = true;
        break;
      case '--search-only':
        result.searchOnly = true;
        break;
      case '--with-details':
      case '-d':
        result.withDetails = true;
        break;
      case '--browser':
      case '-b':
        result.browser = args[++i] as BrowserType;
        break;
      case '--chrome-path':
        result.chromePath = args[++i];
        break;
      case '--port':
      case '-p':
        result.debuggingPort = parseInt(args[++i], 10);
        break;
      case '--timeout':
        result.pageTimeout = parseInt(args[++i], 10);
        break;
      case '--retries':
        result.maxRetries = parseInt(args[++i], 10);
        break;
      case '--rate-limit':
        result.rateLimit = parseInt(args[++i], 10);
        break;
      case '--max-pages':
      case '--pages':
        result.maxPages = parseInt(args[++i], 10);
        break;
      case '--output-dir':
        result.outputDir = args[++i];
        break;
      case '--save-raw':
        result.saveRaw = true;
        break;
      case '--reset-profile':
        result.resetProfile = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      case '--':
        // Skip -- separator (pnpm passes this through)
        break;
      default:
        if (arg.startsWith('-')) {
          logger.error(`Unknown option: ${arg}`);
          printHelp();
          process.exit(1);
        }
    }
  }

  return result;
}

function printHelp(): void {
  const help = `
Leboncoin Scraper — CDP + Next.js data routes (zero bot detection)

How it works:
  1. Opens your real browser (Brave/Chrome/Opera) and navigates to the search URL
  2. Reads __NEXT_DATA__ from the loaded page (first page of results)
  3. Uses Next.js /_next/data routes for subsequent pages — exactly like
     the site's own client-side navigation
  4. All cookies (DataDome) are sent automatically

Usage: pnpm start -- [options]

Options:
  -q, --query <query>        Search query parameters (or full URL)
  -o, --output <name>        Output filename prefix (default: search_YYYY-MM-DD_HHMMSS)
  -c, --config <file>        Load configuration from JSON file
  -h, --help                 Show help message

Scraping modes:
  --search-only              Only scrape search results (default behavior)
  -d, --with-details         Also scrape individual ad detail pages
  --details-only             Only scrape ad details from existing results file

Browser options:
  -b, --browser <name>       Browser to use: brave | chrome | opera | chromium (default: auto-detect)
  --chrome-path <path>       Custom browser binary path (overrides --browser)
  -p, --port <port>          CDP remote debugging port (default: auto / saved from previous run)
  --timeout <ms>             Page load timeout in ms (default: 30000)
  --reset-profile            Re-copy your real browser profile to the scraper profile
                             (use if extensions/settings changed since first run)

Scraping options:
  --retries <n>              Max retries for failed pages (default: 5)
  --rate-limit <ms>          Delay between pages in ms (default: 1000)
  --max-pages <n>            Limit number of search pages to scrape (default: all)

Output options:
  --output-dir <dir>         Output directory (default: ./assets)
  --save-raw                 Save raw __NEXT_DATA__ responses

Examples:
  # Search only (default - no ad details)
  pnpm start -- --browser brave --query "category=9&locations=75012&price=150000-300000"
  
  # Search + individual ad details
  pnpm start -- --browser chrome --query "category=2&locations=Lyon&price=0-15000" --with-details
  
  # Custom output name with slower rate limit
  pnpm start -- --query "category=9" --output "paris_houses" --rate-limit 2000
  
  # Only scrape ad details from existing results
  pnpm start -- --output "search_2026-02-07_143022" --details-only
  
  # Use config file
  pnpm start -- --config "./queries/paris.json"
  
  # Re-sync extensions/settings from your real browser profile
  pnpm start -- --browser brave --reset-profile --query "text=mac+m1"
`;
  process.stdout.write(help);
}

async function loadConfigFile(configPath: string): Promise<{
  query: string;
  output?: string;
}> {
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to load config file ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function main() {
  const args = parseCliArgs();

  // --reset-profile: wipe the scraper profile so it gets re-created
  if (args.resetProfile) {
    resetScraperProfile();
  }

  // Browser selection: --browser > --chrome-path > env > auto-detect
  if (args.browser) {
    config.browser.chromePath = getBrowserPath(args.browser);
    config.browser.userDataDir = createWrapperDataDir(
      detectUserDataDir(config.browser.chromePath),
    );
  } else if (args.chromePath) {
    config.browser.chromePath = args.chromePath;
    config.browser.userDataDir = createWrapperDataDir(
      detectUserDataDir(args.chromePath),
    );
  }
  if (args.debuggingPort) config.browser.debuggingPort = args.debuggingPort;
  if (args.pageTimeout) config.browser.timeout = args.pageTimeout;
  if (args.maxRetries) config.scraping.maxRetries = args.maxRetries;
  if (args.rateLimit) config.scraping.rateLimit = args.rateLimit;
  if (args.maxPages) config.scraping.maxPages = args.maxPages;
  if (args.outputDir) config.output.directory = args.outputDir;
  if (args.saveRaw) config.output.saveRawJson = true;

  let rawQuery: string;
  let outputName: string;

  if (args.configFile) {
    const configData = await loadConfigFile(args.configFile);
    rawQuery = configData.query;
    outputName =
      configData.output || 'search_' + formatDateWithTimestamp(new Date());
  } else {
    rawQuery =
      args.query ||
      'category=9&locations=75012__48.84105_2.38928_5000&price=150000-300000';
    outputName = args.output || 'search_' + formatDateWithTimestamp(new Date());
  }

  // Normalize input: accept full URL (/recherche or /carte map view),
  // path+query, or raw query params — and translate map params to /recherche.
  const search = normalizeSearchInput(rawQuery, config.api.baseUrl);
  logger.info(`Navigating to: ${search.navigateUrl}`);

  // Connect to browser and navigate to the search URL
  const cdp = await connectAndNavigate(search.navigateUrl);

  try {
    let buildId = '';

    if (!args.detailsOnly) {
      const searchResult = await scrapeAllSearchPages(cdp, search);
      buildId = searchResult.buildId;
      const outputPath = `${config.output.directory}/${outputName}.json`;
      fs.writeFileSync(outputPath, JSON.stringify(searchResult.ads, null, 2));
      logger.success(
        `Saved ${searchResult.ads.length} results to ${outputPath}`,
      );
    }

    if (args.withDetails || args.detailsOnly) {
      const resultsPath = `${config.output.directory}/${outputName}.json`;

      if (!fs.existsSync(resultsPath)) {
        logger.error(
          `Results file not found: ${resultsPath}. Run without --details-only first.`,
        );
        process.exit(1);
      }

      const results: Ad[] = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      const urls = results.map((ad) => ad.url);

      if (urls.length > 0) {
        // If we don't have buildId (--details-only), extract it from the current page
        if (!buildId) {
          const nextData = await cdp
            .evaluate<{ buildId: string } | null>(
              `(() => {
              const el = document.getElementById('__NEXT_DATA__');
              return el ? JSON.parse(el.textContent).buildId : null;
            })()`,
            )
            .catch(() => null);
          buildId = nextData?.buildId || '';

          if (!buildId) {
            logger.warn('Could not get buildId — navigating to get one…');
            await cdp.send('Page.enable');
            await cdp.send('Page.navigate', { url: urls[0] });
            await waitForPageReady(cdp);
            await new Promise((r) => setTimeout(r, 2000));
            const nd = await cdp
              .evaluate<{ buildId: string } | null>(
                `(() => {
                const el = document.getElementById('__NEXT_DATA__');
                return el ? { buildId: JSON.parse(el.textContent).buildId } : null;
              })()`,
              )
              .catch(() => null);
            buildId = nd?.buildId || '';
          }
        }

        if (!buildId) {
          logger.error(
            'Cannot determine buildId — ad detail scraping requires it.',
          );
          process.exit(1);
        }

        const details = await scrapeAdDetails(cdp, urls, buildId);
        const detailsPath = `${config.output.directory}/details_${outputName}.json`;
        fs.writeFileSync(detailsPath, JSON.stringify(details.success, null, 2));
        logger.success(
          `Saved ${details.success.length} ad details to ${detailsPath}`,
        );

        if (details.failed.length > 0) {
          const failedPath = `${config.output.directory}/failed_${outputName}.json`;
          fs.writeFileSync(failedPath, JSON.stringify(details.failed, null, 2));
          logger.warn(
            `${details.failed.length} pages failed — see ${failedPath}`,
          );
        }
      } else {
        logger.warn('No URLs found in results file');
      }
    }

    logger.success('All tasks completed successfully');
  } catch (error) {
    logger.error(
      `Fatal error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  } finally {
    cdp.disconnect();
  }
}

main();
