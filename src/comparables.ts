/**
 * `comparables` — reuse the read-only scraper to pull live listings similar to a
 * draft, so the agent can ground price / category / attributes in what the site
 * actually shows. Writes comparables.json (raw Ad[]) and comparables.md (a
 * human-readable digest) into the annonce folder.
 */
import fs from "node:fs";
import path from "node:path";
import { connectAndNavigate } from "./browser";
import { config, createWrapperDataDir, detectUserDataDir, getBrowserPath } from "./config";
import type { BrowserType } from "./config";
import { logger } from "./logger";
import { parseAnnonce } from "./markdown";
import { normalizeSearchInput } from "./query";
import { scrapeAdDetails, scrapeAllSearchPages } from "./scraper";
import type { Ad, Annonce } from "./types";

export interface ComparablesOptions {
  query?: string;
  maxPages?: number;
  withDetails?: boolean;
  browser?: BrowserType;
  chromePath?: string;
  debuggingPort?: number;
  pageTimeout?: number;
}

function buildQueryFromAnnonce(a: Annonce): string {
  const params = new URLSearchParams();
  if (a.title) params.set("text", a.title);
  if (a.zipcode) params.set("locations", a.zipcode);
  return params.toString();
}

function escapePipe(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function digest(a: Annonce, ads: Ad[]): string {
  const prices = ads
    .map((x) => x.price)
    .filter((p) => p > 0)
    .sort((x, y) => x - y);
  const min = prices[0] ?? 0;
  const max = prices[prices.length - 1] ?? 0;
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;

  const lines = [
    `# Comparables — ${a.slug}`,
    "",
    `Query: \`${a.title || "(no title)"}\` · ${a.zipcode || "(no zipcode)"}`,
    `Found ${ads.length} comparable listing(s).`,
    "",
    `Price (where available): min **${min} €** · median **${median} €** · max **${max} €**`,
    "",
    "Use these to set `price`, `category` and category-specific `attributes` in annonce.md.",
    "",
    "| # | Title | Price | City | Key attributes |",
    "|---|-------|-------|------|----------------|",
  ];
  ads.slice(0, 40).forEach((x, i) => {
    const attrs = Object.entries(x.attributes ?? {})
      .slice(0, 4)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    lines.push(`| ${i + 1} | ${escapePipe(x.title)} | ${x.price || "?"} € | ${escapePipe(x.city ?? "")} | ${escapePipe(attrs)} |`);
  });
  lines.push("");
  return lines.join("\n");
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
