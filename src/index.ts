import fs from 'fs';
import { saveAllSearchResults, savePageDetailsParallel } from './headless';
import { formatDate } from './utils';
import type { Ad } from './types';
import { logger } from './logger';
import { config, detectUserDataDir, createWrapperDataDir } from './config';

interface CliArgs {
  query?: string;
  output?: string;
  configFile?: string;
  detailsOnly?: boolean;
  searchOnly?: boolean;
  // Config overrides (CLI > env > default)
  chromePath?: string;
  debuggingPort?: number;
  pageTimeout?: number;
  maxRetries?: number;
  rateLimit?: number;
  parallelPages?: number;
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
      case '--parallel':
        result.parallelPages = parseInt(args[++i], 10);
        break;
      case '--output-dir':
        result.outputDir = args[++i];
        break;
      case '--save-raw':
        result.saveRaw = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
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
Leboncoin Scraper - Generic scraper for leboncoin.fr

Usage: pnpm start -- [options]

Options:
  -q, --query <query>        Search query parameters (e.g., "category=9&price=150000-300000")
  -o, --output <name>        Output filename prefix (default: search_YYYY-MM-DD)
  -c, --config <file>        Load configuration from JSON file
  --search-only              Only scrape search results, skip individual pages
  --details-only             Only scrape individual pages from existing search results
  -h, --help                 Show this help message

Browser options:
  --chrome-path <path>       Browser executable path (default: Brave Browser)
  -p, --port <port>          CDP remote debugging port (default: 9222)
  --timeout <ms>             Page load timeout in ms (default: 30000)

Scraping options:
  --retries <n>              Max retries for failed pages (default: 5)
  --rate-limit <ms>          Delay between pages in ms (default: 1000)
  --parallel <n>             Number of parallel pages for details (default: 3)

Output options:
  --output-dir <dir>         Output directory (default: ./assets)
  --save-raw                 Save raw API responses

Examples:
  pnpm start -- --query "category=9&locations=75012&price=150000-300000"
  pnpm start -- --query "category=9" --output "paris" --parallel 5 --rate-limit 2000
  pnpm start -- --query "category=9" --chrome-path "/usr/bin/brave-browser" --port 9333
  pnpm start -- --query "category=9" --search-only
  pnpm start -- --output "search_2026-2-5" --details-only
  pnpm start -- --config "./queries/paris.json"
`;
  process.stdout.write(help);
}

async function loadConfigFile(path: string): Promise<{
  query: string;
  output?: string;
}> {
  try {
    const content = fs.readFileSync(path, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to load config file ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function main() {
  const args = parseCliArgs();

  // Apply CLI overrides to config (CLI > env > default)
  if (args.chromePath) {
    config.browser.chromePath = args.chromePath;
    // Recompute wrapper profile for the new browser
    config.browser.userDataDir = createWrapperDataDir(detectUserDataDir(args.chromePath));
  }
  if (args.debuggingPort) config.browser.debuggingPort = args.debuggingPort;
  if (args.pageTimeout) config.browser.timeout = args.pageTimeout;
  if (args.maxRetries) config.scraping.maxRetries = args.maxRetries;
  if (args.rateLimit) config.scraping.rateLimit = args.rateLimit;
  if (args.parallelPages) config.scraping.parallelPages = args.parallelPages;
  if (args.outputDir) config.output.directory = args.outputDir;
  if (args.saveRaw) config.output.saveRawJson = true;

  let query: string;
  let outputName: string;

  if (args.configFile) {
    const configData = await loadConfigFile(args.configFile);
    query = configData.query;
    outputName = configData.output || 'search_' + formatDate(new Date());
  } else {
    query =
      args.query ||
      'category=9&locations=75012__48.84105000000001_2.3892800000000003_5000%2C75017__48.883869999999995_2.3186300000000006_2930&price=150000-300000';
    outputName = args.output || 'search_' + formatDate(new Date());
  }

  try {
    if (!args.detailsOnly) {
      await saveAllSearchResults(query, outputName);
    }

    if (!args.searchOnly) {
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
        await savePageDetailsParallel(urls, `page_${outputName}`);
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
  }
}

main();
