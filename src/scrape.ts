/**
 * The read-only scraper, exposed as the `scrape` subcommand. This is the
 * original index.ts main() loop, lifted verbatim into a function so the CLI can
 * dispatch to it (and so importing config.ts — with its browser-profile side
 * effects — only happens when a CDP command actually runs).
 */
import fs from "node:fs";
import { connectAndNavigate } from "./browser";
import { readPageSnapshot } from "./page-payload";
import { scrapeAllSearchPages, scrapeAdDetails } from "./scraper";
import { formatDateWithTimestamp } from "./utils";
import { normalizeSearchInput } from "./query";
import type { Ad } from "./types";
import { logger } from "./logger";
import { config, selectBrowser } from "./config";
import type { BrowserType } from "./config";

export interface ScrapeOptions {
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

async function loadConfigFile(configPath: string): Promise<{ query: string; output?: string }> {
  try {
    const content = fs.readFileSync(configPath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to load config file ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function runScrape(args: ScrapeOptions): Promise<void> {
  // Browser selection: --browser > --chrome-path > env > remembered choice > auto-detect.
  // --reset-profile wipes that browser's scraper profile so it gets re-copied.
  selectBrowser({ browser: args.browser, chromePath: args.chromePath, resetProfile: args.resetProfile });
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
    outputName = configData.output || "search_" + formatDateWithTimestamp(new Date());
  } else {
    rawQuery = args.query || "category=9&locations=75012__48.84105_2.38928_5000&price=150000-300000";
    outputName = args.output || "search_" + formatDateWithTimestamp(new Date());
  }

  // Normalize input: accept full URL (/recherche or /carte map view),
  // path+query, or raw query params — and translate map params to /recherche.
  const search = normalizeSearchInput(rawQuery, config.api.baseUrl);
  logger.info(`Navigating to: ${search.navigateUrl}`);

  // Connect to browser and navigate to the search URL
  const cdp = await connectAndNavigate(search.navigateUrl);

  try {
    let buildId = "";

    if (!args.detailsOnly) {
      const searchResult = await scrapeAllSearchPages(cdp, search);
      buildId = searchResult.buildId;
      fs.mkdirSync(config.output.directory, { recursive: true });
      const outputPath = `${config.output.directory}/${outputName}.json`;
      fs.writeFileSync(outputPath, JSON.stringify(searchResult.ads, null, 2));
      logger.success(`Saved ${searchResult.ads.length} results to ${outputPath} (source: ${searchResult.source})`);
      if (config.output.saveRawJson) {
        // The untouched first-page payload: what to diff when the site changes shape.
        const rawPath = `${config.output.directory}/raw_${outputName}.json`;
        fs.writeFileSync(rawPath, JSON.stringify(searchResult.rawFirstPage, null, 2));
        logger.info(`Saved the raw first-page payload to ${rawPath}`);
      }
    }

    if (args.withDetails || args.detailsOnly) {
      const resultsPath = `${config.output.directory}/${outputName}.json`;

      if (!fs.existsSync(resultsPath)) {
        logger.error(`Results file not found: ${resultsPath}. Run without --details-only first.`);
        process.exit(1);
      }

      const results: Ad[] = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
      const urls = results.map((ad) => ad.url).filter(Boolean);

      if (urls.length > 0) {
        // --details-only: take the buildId from the current page when it has one.
        // Without it, details are read by visiting each ad page (slower, same data).
        if (!buildId) buildId = (await readPageSnapshot(cdp)).buildId ?? "";
        if (!buildId) logger.warn("No Next.js buildId on the page — reading each ad page directly.");

        const details = await scrapeAdDetails(cdp, urls, buildId);
        const detailsPath = `${config.output.directory}/details_${outputName}.json`;
        fs.writeFileSync(detailsPath, JSON.stringify(details.success, null, 2));
        logger.success(`Saved ${details.success.length} ad details to ${detailsPath}`);

        if (details.failed.length > 0) {
          const failedPath = `${config.output.directory}/failed_${outputName}.json`;
          fs.writeFileSync(failedPath, JSON.stringify(details.failed, null, 2));
          logger.warn(`${details.failed.length} pages failed — see ${failedPath}`);
        }
      } else {
        logger.warn("No URLs found in results file");
      }
    }

    logger.success("All tasks completed successfully");
  } finally {
    cdp.disconnect();
  }
}
