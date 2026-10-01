/**
 * Scraping engine — hybrid: real navigation + Next.js data routes, with
 * shape-based fallbacks (page-payload.ts) so a site change degrades gracefully.
 *
 * Strategy:
 *   1. First page: REAL navigation (browser.ts did it already) → read the page
 *      snapshot (__NEXT_DATA__ → inline JSON → captured network JSON → /ad/ links).
 *   2. Subsequent pages: /_next/data/{buildId}/recherche.json?... — exactly what
 *      Next.js's client router fetches. If there is no buildId, or the route
 *      stops answering with ads, switch to real navigation `&page=N`.
 *   3. Ad details: /_next/data/{buildId}/ad/{category}/{id}.json, else navigate
 *      to the ad and read its snapshot.
 *
 * Why this works:
 *   - First navigation is real → DataDome sees a normal user
 *   - Data route requests mimic Next.js internal client routing
 *   - All cookies (DataDome) are sent automatically via fetch()
 *   - No Puppeteer, no automation flags
 */
import { waitForPageReady } from "./browser";
import { isOnCaptcha, waitForCaptchaResolution } from "./captcha";
import type { CDPClient } from "./cdp";
import { config } from "./config";
import { type SearchPayload, findAdPayload, findSearchPayload, processAdData, processSearchData } from "./exploit";
import { logger } from "./logger";
import { JsonSniffer, type PayloadSource, adFromSnapshot, categoryIdFromSnapshot, readPageSnapshot, searchFromSnapshot } from "./page-payload";
import { type NormalizedSearch, buildQueryString } from "./query";
import type { Ad } from "./types";
import { delay } from "./utils";

/** Hard ceiling on pages when the page doesn't expose max_pages (Leboncoin
 *  caps search pagination far below this; the guard just prevents runaways). */
const FALLBACK_MAX_PAGES = 100;

interface SearchPage {
  payload: SearchPayload;
  source: PayloadSource;
  buildId: string;
  categoryId: string | null;
}

/** Read the current page's search results from the best available source. */
async function readSearchPage(cdp: CDPClient, sniffer?: JsonSniffer): Promise<SearchPage> {
  const snap = await readPageSnapshot(cdp);
  const found = searchFromSnapshot(snap, sniffer?.bodies ?? []);
  if (!found) {
    throw new Error(
      "No search results found on the page (no __NEXT_DATA__, inline JSON, network JSON or /ad/ links). " +
        "The page may not have loaded, a CAPTCHA may be blocking, or the site changed — run `leboncoin doctor`.",
    );
  }
  if (found.source !== "next-data") logger.warn(`Search results read from ${found.source} (no __NEXT_DATA__ payload) — the site may have changed.`);
  return { ...found, buildId: snap.buildId ?? "", categoryId: categoryIdFromSnapshot(snap) };
}

/**
 * Fetch a subsequent search page through the Next.js data route; returns the
 * located payload, or throws (BLOCKED:403 / HTTP_xxx / NO_SEARCH_DATA).
 */
async function fetchNextDataRoute(cdp: CDPClient, buildId: string, query: string, page: number): Promise<SearchPayload> {
  const json = await cdp.evaluate<unknown>(`(async () => {
    const url = '/_next/data/' + ${JSON.stringify(buildId)} + '/recherche.json?' + ${JSON.stringify(query)} + '&page=' + ${page};
    const res = await fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      if (res.status === 403) throw new Error('BLOCKED:403');
      throw new Error('HTTP_' + res.status);
    }
    return await res.json();
  })()`);
  const payload = findSearchPayload(json);
  if (!payload) throw new Error("NO_SEARCH_DATA");
  return payload;
}

/** Fetch ad detail JSON through the Next.js data route (whole JSON; the ad is located by shape). */
async function fetchAdDataRoute(cdp: CDPClient, buildId: string, adPath: string): Promise<unknown> {
  // adPath is e.g. "/ad/ventes_immobilieres/3138258318"
  const jsonPath = adPath.replace(/\.htm$/, "").replace(/[?#].*$/, "") + ".json";
  return cdp.evaluate<unknown>(`(async () => {
    const url = '/_next/data/' + ${JSON.stringify(buildId)} + ${JSON.stringify(jsonPath)};
    const res = await fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      if (res.status === 403) throw new Error('BLOCKED:403');
      throw new Error('HTTP_' + res.status);
    }
    return await res.json();
  })()`);
}

/** Navigate to a URL, handling CAPTCHA if it appears. */
async function navigateWithCaptchaHandling(cdp: CDPClient, url: string): Promise<void> {
  await cdp.send("Page.enable");
  await cdp.send("Page.navigate", { url });
  await waitForPageReady(cdp);
  await delay(2_000);

  if (await isOnCaptcha(cdp)) {
    const ok = await waitForCaptchaResolution(cdp);
    if (!ok) throw new Error("CAPTCHA not solved within 5 minutes");
  }
}

export interface SearchScrape {
  ads: Ad[];
  buildId: string;
  query: string;
  /** Where page 1 was read from (next-data / json-script / network / dom-links). */
  source: PayloadSource;
  /** The raw first-page payload (written by --save-raw). */
  rawFirstPage: SearchPayload;
}

/**
 * Scrape all search result pages for the given query string.
 *
 * The browser should ALREADY be on the first search results page (browser.ts
 * navigated there). Page 1 is read from the page itself; the rest through the
 * Next.js data route, or by real navigation when that route is unavailable.
 */
export async function scrapeAllSearchPages(cdp: CDPClient, search: NormalizedSearch): Promise<SearchScrape> {
  logger.startTask("Scraping search results");

  let first: SearchPage;
  try {
    first = await readSearchPage(cdp);
  } catch (error: any) {
    // Maybe the page didn't load right — navigate again, this time also capturing
    // the JSON the page downloads (works without __NEXT_DATA__).
    logger.warn(`First extraction failed: ${error.message}`);
    logger.info("Re-navigating to search URL (capturing network JSON)…");
    const sniffer = new JsonSniffer(cdp);
    await sniffer.start();
    await navigateWithCaptchaHandling(cdp, search.navigateUrl);
    first = await readSearchPage(cdp, sniffer);
  }

  const { buildId, payload, categoryId } = first;

  // Canonical pagination query (injects the numeric category for /carte URLs).
  const query = buildQueryString(search.params, categoryId);

  const firstPage = processSearchData(payload);
  const allAds = [...firstPage.results];

  // Cap pages: Leboncoin limits search pagination, the user may request fewer
  // via --max-pages, and a misread total must never trigger millions of requests.
  const perPage = firstPage.results.length > 0 ? Math.max(firstPage.results.length, config.scraping.resultPerPage) : config.scraping.resultPerPage;
  const totalPages = Math.max(1, Math.ceil(firstPage.total / perPage));
  const siteCap = typeof payload.max_pages === "number" && payload.max_pages > 0 ? payload.max_pages : FALLBACK_MAX_PAGES;
  const userCap = config.scraping.maxPages && config.scraping.maxPages > 0 ? config.scraping.maxPages : Infinity;
  const nbPages = Math.min(totalPages, siteCap, userCap);

  logger.info(`Found ${firstPage.total} results across ${totalPages} pages (source: ${first.source}${buildId ? `, buildId: ${buildId}` : ""})`);
  logger.info(`Pagination query: ${query}`);
  if (nbPages < totalPages) {
    const reason =
      userCap <= siteCap && userCap < totalPages
        ? `limited to ${nbPages} page(s) via --max-pages`
        : `Leboncoin caps pagination at ${nbPages} of ${totalPages} pages`;
    logger.warn(`Scraping the first ${nbPages} page(s) — ${reason}.`);
  }

  // Data route while it works; real navigation otherwise (no buildId, route gone).
  let useDataRoute = !!buildId;
  for (let i = 2; i <= nbPages; i++) {
    await delay(config.scraping.rateLimit + Math.floor(Math.random() * 2_000));
    logger.progress(i - 1, nbPages, `Page ${i}/${nbPages}`);
    const pageUrl = `${config.api.baseUrl}/recherche?${query}&page=${i}`;

    try {
      if (useDataRoute) {
        try {
          allAds.push(...processSearchData(await fetchNextDataRoute(cdp, buildId, query, i)).results);
          continue;
        } catch (error: any) {
          if (error.message?.includes("BLOCKED") || error.message?.includes("CAPTCHA")) throw error;
          logger.warn(`Data route failed (${error.message}) — switching to page navigation.`);
          useDataRoute = false;
        }
      }
      await navigateWithCaptchaHandling(cdp, pageUrl);
      allAds.push(...processSearchData((await readSearchPage(cdp)).payload).results);
    } catch (error: any) {
      if (error.message?.includes("BLOCKED") || error.message?.includes("CAPTCHA")) {
        await navigateWithCaptchaHandling(cdp, pageUrl);
        allAds.push(...processSearchData((await readSearchPage(cdp)).payload).results);
      } else {
        logger.error(`Failed page ${i}: ${error.message}`);
      }
    }
  }

  if (nbPages > 1) logger.progress(nbPages, nbPages);
  logger.endTask();
  return { ads: allAds, buildId, query, source: first.source, rawFirstPage: payload };
}

/** Scrape individual ad detail pages (data route, else the ad page itself). */
export async function scrapeAdDetails(cdp: CDPClient, urls: string[], buildId: string): Promise<{ success: Ad[]; failed: { url: string; error: string }[] }> {
  logger.startTask(`Scraping ${urls.length} ad details`);

  const result: { success: Ad[]; failed: { url: string; error: string }[] } = { success: [], failed: [] };
  const retried = new Set<number>();

  for (let i = 0; i < urls.length; i++) {
    logger.progress(i + 1, urls.length);
    const url = urls[i] as string;

    try {
      const urlPath = url.replace(/^https?:\/\/[^/]+/, "");
      const raw = buildId ? findAdPayload(await fetchAdDataRoute(cdp, buildId, urlPath)) : null;
      if (raw) {
        result.success.push(processAdData(raw));
      } else {
        // No data route (or no ad in it): read the ad page itself.
        await navigateWithCaptchaHandling(cdp, url);
        const found = adFromSnapshot(await readPageSnapshot(cdp));
        if (!found) throw new Error("NO_AD_DATA");
        result.success.push(processAdData(found.ad));
      }
    } catch (error: any) {
      if ((error.message?.includes("BLOCKED") || error.message?.includes("CAPTCHA")) && !retried.has(i)) {
        // Navigate to the ad page to clear CAPTCHA, then retry this ad once.
        retried.add(i);
        await navigateWithCaptchaHandling(cdp, url).catch(() => {});
        i--;
        continue;
      }
      result.failed.push({ url, error: error instanceof Error ? error.message : String(error) });
      logger.error(`Failed: ${url}`);
    }

    if (i < urls.length - 1) {
      await delay(config.scraping.rateLimit + Math.floor(Math.random() * 1_500));
    }
  }

  logger.endTask();
  return result;
}
