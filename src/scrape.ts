/**
 * The read-only scraper, exposed as the `scrape` subcommand. This is the
 * original index.ts main() loop, lifted verbatim into a function so the CLI can
 * dispatch to it (and so importing config.ts — with its browser-profile side
 * effects — only happens when a CDP command actually runs).
 */
import fs from "node:fs";
import { connectAndNavigate, waitForPageReady } from "./browser";
import { scrapeAllSearchPages, scrapeAdDetails } from "./scraper";
import { formatDateWithTimestamp } from "./utils";
import { normalizeSearchInput } from "./query";
import type { Ad } from "./types";
import { logger } from "./logger";
import { config, detectUserDataDir, createWrapperDataDir, getBrowserPath, resetScraperProfile } from "./config";
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
  // --reset-profile: wipe the scraper profile so it gets re-created
  if (args.resetProfile) {
    resetScraperProfile();
  }

  // Browser selection: --browser > --chrome-path > env > auto-detect
  if (args.browser) {
    config.browser.chromePath = getBrowserPath(args.browser);
    config.browser.userDataDir = createWrapperDataDir(detectUserDataDir(config.browser.chromePath));
  } else if (args.chromePath) {
    config.browser.chromePath = args.chromePath;
    config.browser.userDataDir = createWrapperDataDir(detectUserDataDir(args.chromePath));
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
      logger.success(`Saved ${searchResult.ads.length} results to ${outputPath}`);
    }

    if (args.withDetails || args.detailsOnly) {
      const resultsPath = `${config.output.directory}/${outputName}.json`;

      if (!fs.existsSync(resultsPath)) {
        logger.error(`Results file not found: ${resultsPath}. Run without --details-only first.`);
        process.exit(1);
      }

      const results: Ad[] = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
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
          buildId = nextData?.buildId || "";

          if (!buildId) {
            logger.warn("Could not get buildId — navigating to get one…");
            await cdp.send("Page.enable");
            await cdp.send("Page.navigate", { url: urls[0] });
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
            buildId = nd?.buildId || "";
          }
        }

        if (!buildId) {
          logger.error("Cannot determine buildId — ad detail scraping requires it.");
          process.exit(1);
        }

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
