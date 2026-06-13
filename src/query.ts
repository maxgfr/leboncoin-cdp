/**
 * Search-input normalization.
 *
 * Leboncoin has two views of the same search:
 *   - /recherche?...        → page props under `searchData`, paginated via
 *                             /_next/data/{buildId}/recherche.json
 *   - /carte/{category}?... → MAP view, page props under `searchResult`.
 *     The map view uses a different set of query params (lat/lng/city/
 *     defaultRadius) which the /recherche endpoint silently IGNORES — pasting
 *     a map URL straight into /recherche returns the WHOLE site (~87M ads).
 *
 * This module converts any accepted input (full URL, path+query, or raw query
 * string — for either view) into:
 *   - `navigateUrl`: the URL to open for the first, real navigation.
 *   - `params`: the filter params used to build recherche.json pagination
 *     requests, with map-only keys translated to a `locations` param.
 *
 * The numeric category id is not always present in a /carte URL (it lives in
 * the path slug, not the query), so it is injected later via buildQueryString()
 * once read from the loaded page's __NEXT_DATA__.
 */

/** Map-view-only query keys that the /recherche endpoint does not understand. */
const MAP_ONLY_KEYS = ['lat', 'lng', 'city', 'defaultRadius', 'radius', 'zoom'];

export interface NormalizedSearch {
  /** Where to navigate for the first page (real navigation → sets cookies). */
  navigateUrl: string;
  /** Filter params for /_next/data recherche.json pagination requests. */
  params: URLSearchParams;
  /** True when the input was a map-view (/carte) URL or carried lat/lng. */
  isMap: boolean;
}

/**
 * Parse a search input into a navigation URL + pagination params.
 *
 * Accepts:
 *   - Full URL:   https://www.leboncoin.fr/carte/ventes_immobilieres?lat=...
 *   - Full URL:   https://www.leboncoin.fr/recherche?category=9&...
 *   - Path+query: recherche?category=9&...  /  carte/voitures?lat=...
 *   - Raw query:  category=9&locations=...&price=...
 */
export function normalizeSearchInput(
  input: string,
  baseUrl: string,
): NormalizedSearch {
  const trimmed = input.trim();

  let pathname = '/recherche';
  let params: URLSearchParams;
  let originalUrl: string | null = null;

  if (/^https?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
    pathname = url.pathname;
    params = url.searchParams;
    originalUrl = trimmed;
  } else {
    const qIndex = trimmed.indexOf('?');
    if (qIndex >= 0) {
      // "recherche?..." | "/carte/voitures?..."
      pathname = '/' + trimmed.slice(0, qIndex).replace(/^\/+/, '');
      params = new URLSearchParams(trimmed.slice(qIndex + 1));
    } else {
      // Bare query string: "a=b&c=d"
      params = new URLSearchParams(trimmed);
    }
  }

  const isMap =
    /\/carte\//.test(pathname) || (params.has('lat') && params.has('lng'));

  if (isMap) {
    const lat = params.get('lat');
    const lng = params.get('lng');
    const city = params.get('city') ?? '';
    const radius = params.get('defaultRadius') ?? params.get('radius');

    // Translate the map's geo params into the /recherche `locations` encoding:
    //   "<city label>__<lat>_<lng>_<radius>"
    if (lat && lng && radius && !params.has('locations')) {
      params.set('locations', `${city}__${lat}_${lng}_${radius}`);
    }
    for (const key of MAP_ONLY_KEYS) params.delete(key);
  }

  // For a full URL, navigate to the user's actual page (a /carte page exposes
  // searchResult + categoryId; a /recherche page exposes searchData). For a
  // bare/path query, build the canonical /recherche URL.
  const navigateUrl = originalUrl ?? `${baseUrl}/recherche?${params.toString()}`;

  return { navigateUrl, params, isMap };
}

/**
 * Build the query string used for recherche.json pagination requests,
 * injecting the numeric category id (read from the first loaded page) when the
 * params don't already carry one (e.g. a /carte URL where it was path-encoded).
 */
export function buildQueryString(
  params: URLSearchParams,
  categoryId?: string | null,
): string {
  const out = new URLSearchParams(params);
  if (categoryId && !out.get('category')) out.set('category', categoryId);
  return out.toString();
}
