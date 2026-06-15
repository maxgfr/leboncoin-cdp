/**
 * `comparables` — reuse the read-only scraper to pull live listings similar to a
 * draft, so the agent can ground price / category / attributes in what the site
 * actually shows. Writes comparables.json (raw Ad[]) and comparables.md (a
 * human-readable digest) into the annonce folder.
 */
import fs from "node:fs";
import path from "node:path";
import { connectAndNavigate } from "./browser";
import { buildQueryFromAnnonce, digest } from "./comparables-format";
import { config, createWrapperDataDir, detectUserDataDir, getBrowserPath } from "./config";
import type { BrowserType } from "./config";
import { logger } from "./logger";
import { parseAnnonce } from "./markdown";
import { normalizeSearchInput } from "./query";
import { scrapeAdDetails, scrapeAllSearchPages } from "./scraper";
import type { Ad } from "./types";

export interface ComparablesOptions {
  query?: string;
  maxPages?: number;
  withDetails?: boolean;
  browser?: BrowserType;
  chromePath?: string;
  debuggingPort?: number;
  pageTimeout?: number;
}

export async function runComparables(
  annoncesDir: string,
  slug: string,
  opts: ComparablesOptions = {},
): Promise<{ count: number; jsonPath: string; mdPath: string }> {
  const dir = path.join(annoncesDir, slug);
  const a = parseAnnonce(dir);
  const rawQuery = opts.query ?? buildQueryFromAnnonce(a);
  if (!rawQuery) {
    throw new Error(`cannot build a comparables query for "${slug}" — add a title/zipcode or pass --query`);
  }

  if (opts.browser) {
    config.browser.chromePath = getBrowserPath(opts.browser);
    config.browser.userDataDir = createWrapperDataDir(detectUserDataDir(config.browser.chromePath));
  } else if (opts.chromePath) {
    config.browser.chromePath = opts.chromePath;
    config.browser.userDataDir = createWrapperDataDir(detectUserDataDir(opts.chromePath));
  }
  if (opts.debuggingPort) config.browser.debuggingPort = opts.debuggingPort;
  if (opts.pageTimeout) config.browser.timeout = opts.pageTimeout;
  config.scraping.maxPages = opts.maxPages && opts.maxPages > 0 ? opts.maxPages : 1;

  const search = normalizeSearchInput(rawQuery, config.api.baseUrl);
  logger.info(`Scraping comparables: ${search.navigateUrl}`);
  const cdp = await connectAndNavigate(search.navigateUrl);
  try {
    const { ads, buildId } = await scrapeAllSearchPages(cdp, search);
    let enriched: Ad[] = ads;
    if (opts.withDetails && ads.length) {
      const detail = await scrapeAdDetails(
        cdp,
        ads.map((x) => x.url),
        buildId,
      );
      if (detail.success.length) enriched = detail.success;
    }
    const jsonPath = path.join(dir, "comparables.json");
    const mdPath = path.join(dir, "comparables.md");
    fs.writeFileSync(jsonPath, JSON.stringify(enriched, null, 2));
    fs.writeFileSync(mdPath, digest(a, enriched));
    logger.success(`Wrote ${enriched.length} comparable(s) to ${mdPath}`);
    return { count: enriched.length, jsonPath, mdPath };
  } finally {
    cdp.disconnect();
  }
}
