/**
 * Scraping engine — hybrid: real navigation + Next.js data routes.
 *
 * Strategy:
 *   1. First page: REAL navigation (browser.ts did it already)
 *      → read __NEXT_DATA__ from the DOM → get searchData + buildId
 *   2. Subsequent pages: use /_next/data/{buildId}/recherche.json?...
 *      This is EXACTLY what Next.js's client-side router uses for
 *      navigation — completely natural, returns JSON directly.
 *   3. Ad details: /_next/data/{buildId}/ad/{category}/{id}.json
 *
 * Why this works:
 *   - First navigation is real → DataDome sees a normal user
 *   - Data route requests mimic Next.js internal client routing
 *   - All cookies (DataDome) are sent automatically via fetch()
 *   - No Puppeteer, no automation flags
 */
import { CDPClient } from './cdp';
import { waitForPageReady } from './browser';
import { processSearchData, processAdData } from './exploit';
import { config } from './config';
import { logger } from './logger';
import { delay } from './utils';
import { buildQueryString, type NormalizedSearch } from './query';
import type { Ad } from './types';

/** Hard ceiling on pages when the page doesn't expose max_pages (Leboncoin
 *  caps search pagination far below this; the guard just prevents runaways). */
const FALLBACK_MAX_PAGES = 100;

interface FirstPageData {
  buildId: string;
  searchData: { total: number; ads: any[]; max_pages?: number };
  categoryId: string | null;
}

/**
 * Extract __NEXT_DATA__ from the currently loaded page's DOM.
 * This is used after a real navigation (first page).
 *
 * Handles both result shapes:
 *   - /recherche page → pageProps.searchData
 *   - /carte map page → pageProps.searchResult
 */
async function extractNextDataFromDOM(cdp: CDPClient): Promise<FirstPageData> {
  const result = await cdp.evaluate<FirstPageData | null>(
    `(() => {
      const el = document.getElementById('__NEXT_DATA__');
      if (!el || !el.textContent) return null;
      const data = JSON.parse(el.textContent);
      const pp = data.props && data.props.pageProps;
      const searchData = pp ? (pp.searchData || pp.searchResult || null) : null;
      const categoryId =
        (pp && pp.categoryId) || (data.query && data.query.category) || null;
      return { buildId: data.buildId, searchData, categoryId };
    })()`,
  );

  if (!result) {
    throw new Error(
      'Could not read __NEXT_DATA__ from the page. ' +
        'The page may not have loaded correctly or a CAPTCHA may be blocking.',
    );
  }

  if (!result.searchData) {
    throw new Error(
      'No searchData/searchResult in __NEXT_DATA__ — the page may not be a search results page.',
    );
  }

  return result;
}

/**
 * Fetch a subsequent search page using the Next.js data route.
 * This mimics Next.js client-side navigation and returns JSON directly.
 */
async function fetchNextDataRoute(
  cdp: CDPClient,
  buildId: string,
  query: string,
  page: number,
): Promise<{ total: number; ads: any[] }> {
  const escapedBuildId = JSON.stringify(buildId);
  const escapedQuery = JSON.stringify(query);

  const result = await cdp.evaluate<any>(`(async () => {
    const url = '/_next/data/' + ${escapedBuildId} + '/recherche.json?' + ${escapedQuery} + '&page=' + ${page};
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      if (res.status === 403) throw new Error('BLOCKED:403');
      throw new Error('HTTP_' + res.status);
    }
    const data = await res.json();
    if (data.pageProps && data.pageProps.searchData) return data.pageProps.searchData;
    throw new Error('NO_SEARCH_DATA');
  })()`);

  return result;
}

/**
 * Fetch ad detail using the Next.js data route.
 */
async function fetchAdDataRoute(
  cdp: CDPClient,
  buildId: string,
  adPath: string,
): Promise<any> {
  const escapedBuildId = JSON.stringify(buildId);
  // adPath is e.g. "/ad/ventes_immobilieres/3138258318"
  const jsonPath = adPath.replace(/\.htm$/, '') + '.json';
  const escapedPath = JSON.stringify(jsonPath);

  const result = await cdp.evaluate<any>(`(async () => {
    const url = '/_next/data/' + ${escapedBuildId} + ${escapedPath};
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      if (res.status === 403) throw new Error('BLOCKED:403');
      throw new Error('HTTP_' + res.status);
    }
    const data = await res.json();
    if (data.pageProps && data.pageProps.ad) return data.pageProps.ad;
    throw new Error('NO_AD_DATA');
  })()`);

  return result;
}

/**
 * Handle CAPTCHA by waiting for the user to solve it.
 */
async function waitForCaptchaResolution(cdp: CDPClient): Promise<void> {
  logger.warn('CAPTCHA / bot challenge detected');
  logger.warn('Please solve the CAPTCHA in the browser window…');
  logger.info('Waiting up to 5 minutes…');

  const start = Date.now();
  while (Date.now() - start < 5 * 60 * 1_000) {
    await delay(3_000);
    try {
      const clear = await cdp.evaluate<boolean>(
        `window.location.hostname.includes('leboncoin.fr') && ` +
          `!document.querySelector('iframe[src*="captcha"]') && ` +
          `!document.querySelector('iframe[src*="datadome"]') && ` +
          `!document.body.innerHTML.includes('geo.captcha-delivery')`,
        false,
      );
      if (clear) {
        logger.success('CAPTCHA resolved — resuming');
        await delay(2_000);
        return;
      }
    } catch {
      // Page might be mid-navigation
    }
  }
  throw new Error('CAPTCHA not solved within 5 minutes');
}

/**
 * Navigate to a URL, handling CAPTCHA if it appears.
 */
async function navigateWithCaptchaHandling(
  cdp: CDPClient,
  url: string,
): Promise<void> {
  await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url });
  await waitForPageReady(cdp);
  await delay(2_000);

  const onCaptcha = await cdp
    .evaluate<boolean>(
      `document.body.innerHTML.includes('geo.captcha-delivery') || ` +
        `!!document.querySelector('iframe[src*="datadome"]')`,
      false,
    )
    .catch(() => false);

  if (onCaptcha) {
    await waitForCaptchaResolution(cdp);
  }
}

/**
 * Scrape all search result pages for the given query string.
 *
 * The browser should ALREADY be on the first search results page
 * (browser.ts navigated there). We read __NEXT_DATA__ from the DOM
 * for the first page, then use /_next/data routes for the rest.
 */
export async function scrapeAllSearchPages(
  cdp: CDPClient,
  search: NormalizedSearch,
): Promise<{ ads: Ad[]; buildId: string; query: string }> {
  logger.startTask('Scraping search results');

  // First page: read from the already-loaded DOM
  let firstPage: FirstPageData;
  try {
    firstPage = await extractNextDataFromDOM(cdp);
  } catch (error: any) {
    // Maybe the page didn't load right — try navigating directly
    logger.warn(`First extraction failed: ${error.message}`);
    logger.info('Re-navigating to search URL…');
    await navigateWithCaptchaHandling(cdp, search.navigateUrl);
    firstPage = await extractNextDataFromDOM(cdp);
  }

  const { buildId, searchData, categoryId } = firstPage;

  // Canonical pagination query (injects the numeric category for /carte URLs).
  const query = buildQueryString(search.params, categoryId);

  const first = processSearchData(searchData);
  const allAds = [...first.results];

  // Cap pages: Leboncoin limits search pagination, the user may request fewer
  // via --max-pages, and a misread total must never trigger millions of
  // requests.
  const totalPages = Math.ceil(first.total / config.scraping.resultPerPage);
  const siteCap =
    typeof searchData.max_pages === 'number' && searchData.max_pages > 0
      ? searchData.max_pages
      : FALLBACK_MAX_PAGES;
  const userCap =
    config.scraping.maxPages && config.scraping.maxPages > 0
      ? config.scraping.maxPages
      : Infinity;
  const nbPages = Math.min(totalPages, siteCap, userCap);

  logger.info(
    `Found ${first.total} results across ${totalPages} pages (buildId: ${buildId})`,
  );
  logger.info(`Pagination query: ${query}`);
  if (nbPages < totalPages) {
    const reason =
      userCap <= siteCap && userCap < totalPages
        ? `limited to ${nbPages} page(s) via --max-pages`
        : `Leboncoin caps pagination at ${nbPages} of ${totalPages} pages`;
    logger.warn(`Scraping the first ${nbPages} page(s) — ${reason}.`);
  }

  // Subsequent pages via Next.js data routes
  for (let i = 2; i <= nbPages; i++) {
    await delay(config.scraping.rateLimit + Math.floor(Math.random() * 2_000));
    logger.progress(i - 1, nbPages, `Page ${i}/${nbPages}`);

    try {
      const pageData = await fetchNextDataRoute(cdp, buildId, query, i);
      const page = processSearchData(pageData);
      allAds.push(...page.results);
    } catch (error: any) {
      if (
        error.message?.includes('BLOCKED') ||
        error.message?.includes('CAPTCHA')
      ) {
        await navigateWithCaptchaHandling(
          cdp,
          `${config.api.baseUrl}/recherche?${query}&page=${i}`,
        );
        const retryData = await extractNextDataFromDOM(cdp);
        allAds.push(...processSearchData(retryData.searchData).results);
      } else {
        logger.error(`Failed page ${i}: ${error.message}`);
      }
    }
  }

  if (nbPages > 1) logger.progress(nbPages, nbPages);
  logger.endTask();
  return { ads: allAds, buildId, query };
}

/**
 * Scrape individual ad detail pages via Next.js data routes.
 */
export async function scrapeAdDetails(
  cdp: CDPClient,
  urls: string[],
  buildId: string,
): Promise<{ success: Ad[]; failed: { url: string; error: string }[] }> {
  logger.startTask(`Scraping ${urls.length} ad details`);

  const result: {
    success: Ad[];
    failed: { url: string; error: string }[];
  } = { success: [], failed: [] };

  for (let i = 0; i < urls.length; i++) {
    logger.progress(i + 1, urls.length);

    try {
      const urlPath = urls[i].replace(/^https?:\/\/[^/]+/, '');
      const adData = await fetchAdDataRoute(cdp, buildId, urlPath);
      result.success.push(processAdData(adData));
    } catch (error: any) {
      if (
        error.message?.includes('BLOCKED') ||
        error.message?.includes('CAPTCHA')
      ) {
        // Navigate to the ad page to clear CAPTCHA
        await navigateWithCaptchaHandling(cdp, urls[i]);
        try {
          const dom = await cdp.evaluate<any>(
            `(() => {
              const el = document.getElementById('__NEXT_DATA__');
              if (!el) return null;
              return JSON.parse(el.textContent).props.pageProps.ad;
            })()`,
          );
          if (dom) {
            result.success.push(processAdData(dom));
            continue;
          }
        } catch {
          // Fall through to failed
        }
        i--; // Retry
        continue;
      }
      result.failed.push({
        url: urls[i],
        error: error instanceof Error ? error.message : String(error),
      });
      logger.error(`Failed: ${urls[i]}`);
    }

    if (i < urls.length - 1) {
      await delay(
        config.scraping.rateLimit + Math.floor(Math.random() * 1_500),
      );
    }
  }

  logger.endTask();
  return result;
}
