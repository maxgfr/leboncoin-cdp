import { describe, expect, it, vi } from "vitest";

vi.mock("../utils", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, delay: () => Promise.resolve() };
});

import { config } from "../config";
import { JsonSniffer, adsFromLinks, readPageSnapshot, searchFromSnapshot } from "../page-payload";
import { normalizeSearchInput } from "../query";
import { scrapeAllSearchPages } from "../scraper";
import { DomCDP, fixture } from "./helpers/dom-cdp";

const ad = (id: number) => ({ list_id: id, subject: `Ad ${id}`, url: `https://www.leboncoin.fr/ad/informatique/${id}`, price: [100 + id] });

/** A page from a hypothetical App Router migration: no __NEXT_DATA__, the data sits in inline JSON. */
function appRouterPage(ids: number[], total = 70): string {
  const blob = JSON.stringify({ state: { data: { listing: { results: ids.map(ad), total_count: total } } } });
  return `<html><body><main>${ids.map((i) => `<a href="/ad/informatique/${i}">Ad ${i}</a>`).join("")}</main><script type="application/json" id="rsc">${blob}</script></body></html>`;
}

describe("page snapshot sources", () => {
  it("reads the live search page (__NEXT_DATA__)", async () => {
    const snap = await readPageSnapshot(new DomCDP(fixture("recherche.html"), { url: "https://www.leboncoin.fr/recherche?text=x" }) as never);
    const found = searchFromSnapshot(snap);
    expect(found?.source).toBe("next-data");
    expect(found?.payload.ads.length).toBeGreaterThan(0);
    expect(snap.buildId).toBeTruthy();
  });

  it("falls back to inline JSON when there is no __NEXT_DATA__", async () => {
    const snap = await readPageSnapshot(new DomCDP(appRouterPage([1000001, 1000002])) as never);
    const found = searchFromSnapshot(snap);
    expect(found?.source).toBe("json-script");
    expect(found?.payload.total).toBe(70);
  });

  it("falls back to captured network JSON, then to /ad/ links", () => {
    const empty = { url: "", jsonScripts: [], adLinks: [] };
    expect(searchFromSnapshot(empty, [{ ads: [ad(1234567)], total: 1 }])?.source).toBe("network");
    const links = searchFromSnapshot({ ...empty, adLinks: [{ href: "https://www.leboncoin.fr/ad/x/3276210930", text: "MacBook" }] });
    expect(links?.source).toBe("dom-links");
    expect(links?.payload.ads[0]?.list_id).toBe(3276210930);
    expect(searchFromSnapshot(empty)).toBeNull();
  });

  it("adsFromLinks de-duplicates and ignores non-ad links", () => {
    expect(
      adsFromLinks([
        { href: "https://www.leboncoin.fr/ad/x/1234567", text: "A" },
        { href: "https://www.leboncoin.fr/ad/x/1234567?o=1", text: "A again" },
        { href: "https://www.leboncoin.fr/ad/x/abc", text: "nope" },
      ]).map((a) => a.list_id),
    ).toEqual([1234567]);
  });
});

describe("JsonSniffer", () => {
  it("keeps the JSON bodies the page downloads (passively)", async () => {
    const handlers: Record<string, (p: any) => void> = {};
    const cdp = {
      send: async (m: string) => (m === "Network.getResponseBody" ? { body: JSON.stringify({ ads: [ad(7654321)], total: 1 }) } : {}),
      on: (e: string, h: (p: any) => void) => (handlers[e] = h),
    };
    const s = new JsonSniffer(cdp as never);
    await s.start();
    handlers["Network.responseReceived"]?.({ requestId: "1", response: { mimeType: "application/json" } });
    handlers["Network.responseReceived"]?.({ requestId: "2", response: { mimeType: "text/html" } });
    handlers["Network.loadingFinished"]?.({ requestId: "1" });
    handlers["Network.loadingFinished"]?.({ requestId: "2" });
    await new Promise((r) => setTimeout(r, 0));
    expect(s.bodies).toHaveLength(1);
  });
});

describe("scrapeAllSearchPages", () => {
  it("paginates by real navigation when the /_next/data route is unavailable", async () => {
    const navigated: string[] = [];
    const cdp = new DomCDP(fixture("recherche.html"), {
      url: "https://www.leboncoin.fr/recherche?text=macbook",
      onNavigate: (url) => {
        navigated.push(url);
        return fixture("recherche.html");
      },
    });
    config.scraping.maxPages = 2;
    const r = await scrapeAllSearchPages(cdp as never, normalizeSearchInput("macbook", "https://www.leboncoin.fr"));
    expect(r.source).toBe("next-data");
    expect(navigated[0]).toContain("text=macbook");
    expect(navigated[0]).toContain("page=2");
    expect(r.ads.length).toBe(2 * r.rawFirstPage.ads.length);
  });

  it("still scrapes a page without __NEXT_DATA__ (inline JSON), paginating by navigation", async () => {
    const cdp = new DomCDP(appRouterPage([1000001, 1000002, 1000003], 100), {
      url: "https://www.leboncoin.fr/recherche?text=x",
      onNavigate: () => appRouterPage([2000001, 2000002, 2000003], 100),
    });
    config.scraping.maxPages = 2;
    const r = await scrapeAllSearchPages(cdp as never, normalizeSearchInput("x", "https://www.leboncoin.fr"));
    expect(r.source).toBe("json-script");
    expect(r.buildId).toBe("");
    expect(r.ads.map((a) => a.list_id)).toEqual([1000001, 1000002, 1000003, 2000001, 2000002, 2000003]);
  });
});
