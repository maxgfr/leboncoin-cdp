/**
 * `comparables` from the user's OWN browser — no scraper browser launched:
 *   - `--own-browser` → the search URL (same query building as the CDP run) and a
 *     one-line JS snippet to run there (Claude in Chrome `javascript_tool`) that writes
 *     the search results into the page as compact JSON `{ total, ads: [RawAd…] }`, read
 *     back with `get_page_text` (javascript_tool truncates its return value);
 *   - `--import <file>` → comparables.json + comparables.md from that JSON (a pasted
 *     get_page_text block, or a whole `__NEXT_DATA__`, works too: the ad list is found
 *     by shape, exactly like the scraper's page-payload parser).
 * Config-free (no browser/CDP import), so it runs without profile side effects.
 */
import fs from "node:fs";
import path from "node:path";
import { buildQueryFromAnnonce, digest } from "./comparables-format";
import { findSearchPayload, processSearchData } from "./exploit";
import { parseAnnonce } from "./markdown";
import { normalizeSearchInput } from "./query";
import { BASE_URL } from "./selectors";

/** Where the agent saves the snippet's result (a suggestion; any path works). */
export const OWN_BROWSER_FILENAME = "comparables-browser.json";

/** Attribute keys the snippet drops (UI flags, ids, shop data): halves the export, keeps condition, brand, model, year… */
export const NOISY_ATTRIBUTES =
  /^(profile_|estimated_|is_|country_|shipping|rating|payment|purchase|negotiation|stock|activity_|custom_ref|vehicle_vsp)|_cta_visible$|_id$/;

/**
 * Runs in the search page: finds the largest array of `list_id` objects in `__NEXT_DATA__`
 * (by shape, like findSearchPayload), projects the first 40 ads to the fields the digest uses
 * (minus NOISY_ATTRIBUTES), REPLACES the page with `<pre id="lbc-export">JSON</pre>` (title
 * `lbc-export`) and returns only a short status — javascript_tool truncates its return value at
 * ~1,000 chars, so the JSON is read back with get_page_text.
 */
export const OWN_BROWSER_SNIPPET =
  "(()=>{const n=document.getElementById('__NEXT_DATA__');if(!n)return 'NO_NEXT_DATA';let b=null,t;const w=(o,p)=>{if(!o||typeof o!=='object')return;" +
  "if(Array.isArray(o)){if(o.length&&o.every(a=>a&&a.list_id)){if(!b||o.length>b.length){b=o;t=p&&p.total}return}o.forEach(x=>w(x))}else for(const v of Object.values(o))w(v,o)};" +
  `w(JSON.parse(n.textContent));if(!b)return 'NO_ADS';const X=/${NOISY_ATTRIBUTES.source}/,A=b.slice(0,40);` +
  "const s=JSON.stringify({total:typeof t==='number'?t:b.length,ads:A.map(a=>({list_id:a.list_id,subject:a.subject,url:a.url,price:a.price,index_date:a.index_date," +
  "location:{city_label:a.location&&a.location.city_label,zipcode:a.location&&a.location.zipcode},attributes:(a.attributes||[]).filter(x=>x&&!X.test(x.key)).map(x=>({key:x.key,value_label:x.value_label??x.value}))}))});" +
  "const e=document.createElement('pre');e.id='lbc-export';e.textContent=s;document.body.replaceChildren(e);document.title='lbc-export';" +
  "return 'OK '+A.length+' ads, '+s.length+' chars — read it with get_page_text'})()";

export interface OwnBrowserPlan {
  slug: string;
  url: string;
  snippet: string;
  save_to: string;
  import: string;
}

/** `comparables <slug> --own-browser`: what to open and run in the user's own browser. */
export function ownBrowserComparables(annoncesDir: string, slug: string, query?: string): OwnBrowserPlan {
  const dir = path.join(annoncesDir, slug);
  const a = parseAnnonce(dir);
  const raw = query ?? buildQueryFromAnnonce(a);
  if (!raw) throw new Error(`cannot build a comparables query for "${slug}" — add a title/zipcode or pass --query`);
  const saveTo = path.join(dir, OWN_BROWSER_FILENAME);
  return {
    slug,
    url: normalizeSearchInput(raw, BASE_URL).navigateUrl,
    snippet: OWN_BROWSER_SNIPPET,
    save_to: saveTo,
    import: `leboncoin comparables ${slug} --import ${saveTo}`,
  };
}

export function renderOwnBrowserPlan(p: OwnBrowserPlan): string {
  return [
    "In the user's own browser, with Claude in Chrome (javascript_tool truncates its return value at ~1,000 chars: never return large data from it):",
    "1. tabs_context_mcp, then tabs_create_mcp: a new tab of your own.",
    `2. navigate it to ${p.url} — a captcha / « Vérification » is the human's.`,
    "3. Once the results show, run this with javascript_tool. It REPLACES the page with the JSON (reload the URL if you need the page again) and returns only a status (« OK <n> ads, <m> chars … »; NO_NEXT_DATA / NO_ADS = nothing to export):",
    "",
    p.snippet,
    "",
    "4. get_page_text on that tab: it returns a header (Title: / URL: / Source element: / ---) then the JSON.",
    `5. Save the JSON after the --- line, as is, to ${p.save_to} (the header is tolerated too).`,
    `6. ${p.import}`,
    "7. Close the tab (tabs_close_mcp).",
    "",
  ].join("\n");
}

const SHAPE_HINT = 'expected the --own-browser snippet\'s output ({"total":n,"ads":[{"list_id":…,"subject":…,"price":…},…]}) or a page\'s __NEXT_DATA__';

/** A pasted get_page_text block starts with `Title:` / `URL:` / `Source element:` lines, then `---`: keep what follows. */
function stripPageTextHeader(text: string): string {
  const t = text.trim();
  if (!/^(Title|URL|Source element):/.test(t)) return t;
  const sep = t.match(/^-{3,}[ \t]*$/m);
  return sep?.index === undefined ? t : t.slice(sep.index + sep[0].length).trim();
}

/** Parse the imported text; a JSON string holding JSON (double-encoded) is unwrapped once. */
function parseImport(text: string, file: string): unknown {
  const t = stripPageTextHeader(text);
  if (t === "NO_NEXT_DATA" || t === "NO_ADS" || t === '"NO_NEXT_DATA"' || t === '"NO_ADS"') {
    throw new Error(`${file}: the snippet found no ${t.includes("NEXT") ? "__NEXT_DATA__ (not a search results page?)" : "ads (empty search: widen --query)"}`);
  }
  let v: unknown;
  try {
    v = JSON.parse(t);
    if (typeof v === "string") v = JSON.parse(v);
  } catch {
    throw new Error(`${file}: not valid JSON — ${SHAPE_HINT}`);
  }
  return v;
}

/** `comparables <slug> --import <file>`: comparables.json + comparables.md from a JSON captured in the user's browser. */
export function importComparables(annoncesDir: string, slug: string, file: string): { count: number; jsonPath: string; mdPath: string } {
  const dir = path.join(annoncesDir, slug);
  const a = parseAnnonce(dir);
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new Error(`cannot read ${file}`);
  }
  const payload = findSearchPayload(parseImport(text, file));
  if (!payload) throw new Error(`${file}: no ad list found — ${SHAPE_HINT}`);
  const ads = processSearchData(payload).results;
  const jsonPath = path.join(dir, "comparables.json");
  const mdPath = path.join(dir, "comparables.md");
  fs.writeFileSync(jsonPath, JSON.stringify(ads, null, 2));
  fs.writeFileSync(mdPath, digest(a, ads));
  return { count: ads.length, jsonPath, mdPath };
}
