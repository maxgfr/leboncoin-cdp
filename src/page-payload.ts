/**
 * Where the scraper finds its data, in order — so a front-end migration degrades
 * the scrape instead of breaking it:
 *   1. `__NEXT_DATA__` (Next.js pages router — what the site serves as of 2026-10);
 *   2. any other inline JSON (`<script type="application/json">`, JSON-LD), e.g. an
 *      App Router / RSC payload;
 *   3. JSON responses captured from the network (CDP `Network` domain) while the
 *      page loads — the site's own XHRs, nothing synthetic;
 *   4. the `/ad/…` links of the rendered page (minimal ads: id, title, URL).
 * Each source is searched by SHAPE (exploit.ts findSearchPayload/findAdPayload),
 * never by a fixed path.
 */
import type { CDPClient } from "./cdp";
import { type RawAd, type SearchPayload, findAdPayload, findSearchPayload } from "./exploit";

export interface PageSnapshot {
  url: string;
  buildId?: string;
  nextData?: unknown;
  /** Parsed inline JSON scripts other than __NEXT_DATA__. */
  jsonScripts: unknown[];
  /** Rendered `/ad/` links (last-resort source). */
  adLinks: { href: string; text: string }[];
}

export type PayloadSource = "next-data" | "json-script" | "network" | "dom-links";

const MAX_SCRIPT_CHARS = 5_000_000;

const SNAPSHOT_JS = `(() => {
  /* page-snapshot */
  const out = { url: location.href, jsonScripts: [], adLinks: [] };
  const nd = document.getElementById('__NEXT_DATA__');
  if (nd && nd.textContent) { try { const d = JSON.parse(nd.textContent); out.nextData = d; out.buildId = d.buildId; } catch (e) {} }
  for (const s of Array.from(document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]'))) {
    if (s === nd || !s.textContent || s.textContent.length > ${MAX_SCRIPT_CHARS}) continue;
    try { out.jsonScripts.push(JSON.parse(s.textContent)); } catch (e) {}
    if (out.jsonScripts.length >= 30) break;
  }
  const seen = new Set();
  for (const a of Array.from(document.querySelectorAll('a[href*="/ad/"]'))) {
    const href = a.href;
    if (!href || seen.has(href)) continue;
    seen.add(href);
    out.adLinks.push({ href, text: ((a.innerText || a.textContent || '').replace(/\\s+/g, ' ').trim()).slice(0, 200) });
    if (out.adLinks.length >= 200) break;
  }
  return out;
})()`;

/** Read everything the current page exposes (never throws). */
export async function readPageSnapshot(cdp: CDPClient): Promise<PageSnapshot> {
  const s = await cdp.evaluate<PageSnapshot | null>(SNAPSHOT_JS, false).catch(() => null);
  return s && typeof s === "object" ? { ...s, jsonScripts: s.jsonScripts ?? [], adLinks: s.adLinks ?? [] } : { url: "", jsonScripts: [], adLinks: [] };
}

/** Minimal ads from rendered links: the numeric id in the URL, the link text as title. */
export function adsFromLinks(links: { href: string; text: string }[]): RawAd[] {
  const ads: RawAd[] = [];
  const seen = new Set<string>();
  for (const l of links) {
    const id = l.href.match(/\/(\d{6,})(?:\.htm)?(?:[/?#]|$)/)?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ads.push({ list_id: Number(id), subject: l.text.split(" · ")[0]?.trim() ?? l.text, url: l.href });
  }
  return ads;
}

/** The search results of a page, from the best available source. */
export function searchFromSnapshot(s: PageSnapshot, sniffed: unknown[] = []): { payload: SearchPayload; source: PayloadSource } | null {
  const fromNext = s.nextData ? findSearchPayload(s.nextData) : null;
  if (fromNext) return { payload: fromNext, source: "next-data" };
  const fromScripts = findSearchPayload(s.jsonScripts);
  if (fromScripts) return { payload: fromScripts, source: "json-script" };
  const fromNetwork = findSearchPayload(sniffed);
  if (fromNetwork) return { payload: fromNetwork, source: "network" };
  const ads = adsFromLinks(s.adLinks);
  if (ads.length) return { payload: { ads, total: ads.length }, source: "dom-links" };
  return null;
}

/** The ad of a detail page, from the best available source. */
export function adFromSnapshot(s: PageSnapshot, sniffed: unknown[] = []): { ad: RawAd; source: PayloadSource } | null {
  const fromNext = s.nextData ? findAdPayload(s.nextData) : null;
  if (fromNext) return { ad: fromNext, source: "next-data" };
  const fromScripts = findAdPayload(s.jsonScripts);
  if (fromScripts) return { ad: fromScripts, source: "json-script" };
  const fromNetwork = findAdPayload(sniffed);
  if (fromNetwork) return { ad: fromNetwork, source: "network" };
  return null;
}

/** The numeric category id of a search page (needed for /carte pagination), if exposed. */
export function categoryIdFromSnapshot(s: PageSnapshot): string | null {
  const nd = s.nextData as { props?: { pageProps?: { categoryId?: unknown } }; query?: { category?: unknown } } | undefined;
  const id = nd?.props?.pageProps?.categoryId ?? nd?.query?.category;
  return id === undefined || id === null ? null : String(id);
}

/**
 * Passive capture of the JSON the page itself downloads (CDP Network domain):
 * start() before a navigation, then read `bodies`. Only responses whose MIME type
 * is JSON are kept; nothing is requested on the page's behalf.
 */
export class JsonSniffer {
  bodies: unknown[] = [];
  private pending = new Map<string, true>();
  private started = false;

  constructor(
    private cdp: CDPClient,
    private maxBodies = 40,
  ) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.cdp.send("Network.enable").catch(() => {});
    this.cdp.on("Network.responseReceived", (p: { requestId: string; response?: { mimeType?: string } }) => {
      if (/json/i.test(p.response?.mimeType ?? "")) this.pending.set(p.requestId, true);
    });
    this.cdp.on("Network.loadingFinished", (p: { requestId: string }) => {
      if (!this.pending.delete(p.requestId) || this.bodies.length >= this.maxBodies) return;
      this.cdp
        .send("Network.getResponseBody", { requestId: p.requestId })
        .then((r: { body?: string; base64Encoded?: boolean }) => {
          if (!r?.body) return;
          const text = r.base64Encoded ? Buffer.from(r.body, "base64").toString("utf8") : r.body;
          try {
            this.bodies.push(JSON.parse(text));
          } catch {
            /* not JSON after all */
          }
        })
        .catch(() => {});
    });
  }
}
