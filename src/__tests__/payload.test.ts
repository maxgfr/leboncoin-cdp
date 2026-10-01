import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { findAdPayload, findSearchPayload, parseSearchResults, processAdData, processSearchData } from "../exploit";
import { getNextJsProps } from "../utils";

const ad = (id: number, extra: Record<string, unknown> = {}) => ({ list_id: id, subject: `Ad ${id}`, url: `https://www.leboncoin.fr/ad/x/${id}`, ...extra });

describe("findSearchPayload (shape-agnostic)", () => {
  it("finds the live shape (props.pageProps.searchData)", () => {
    const nd = getNextJsProps(fs.readFileSync("src/__mocks__/recherche.html", "utf8"));
    const p = findSearchPayload(nd);
    expect(p?.ads.length).toBeGreaterThan(0);
    expect(p?.total).toBe(nd.props.pageProps.searchData.total);
  });

  it("finds ads under a renamed / deeper key (e.g. an App Router payload)", () => {
    const payload = { state: { queries: [{ data: { listing: { results: [ad(1), ad(2)], total_count: 42, max_pages: 3 } } }] } };
    const p = findSearchPayload(payload);
    expect(p?.ads.map((a) => a.list_id)).toEqual([1, 2]);
    expect(p?.total).toBe(42);
    expect(p?.max_pages).toBe(3);
  });

  it("prefers the largest ad list (main results over a small 'similar' carousel)", () => {
    const payload = { similar: [ad(9)], searchData: { ads: [ad(1), ad(2), ad(3)], total: 3 } };
    expect(findSearchPayload(payload)?.ads).toHaveLength(3);
  });

  it("falls back to the list length when no total is exposed", () => {
    expect(findSearchPayload({ items: [ad(1), ad(2)] })?.total).toBe(2);
  });

  it("returns null when there is no ad list anywhere", () => {
    expect(findSearchPayload({ props: { pageProps: { foo: [1, 2] } } })).toBeNull();
    expect(findSearchPayload(null)).toBeNull();
  });

  it("survives cyclic structures", () => {
    const o: Record<string, unknown> = { ads: [ad(1)] };
    o.self = o;
    expect(findSearchPayload(o)?.ads).toHaveLength(1);
  });
});

describe("findAdPayload", () => {
  it("finds pageProps.ad and nested renamed variants", () => {
    expect(findAdPayload({ props: { pageProps: { ad: ad(5) } } })?.list_id).toBe(5);
    expect(findAdPayload({ data: { listing: { item: ad(6, { body: "x" }) } } })?.list_id).toBe(6);
    expect(findAdPayload({ nothing: true })).toBeNull();
  });
});

describe("mapAd is defensive", () => {
  it("does not crash when location / owner / attributes / price / index_date are missing", () => {
    const r = processAdData(ad(7) as never);
    expect(r.list_id).toBe(7);
    expect(r.city).toBe("");
    expect(r.user_id).toBe("");
    expect(r.price).toBe(0);
    expect(r.attributes).toEqual({});
    expect(Number.isNaN(r.date.getTime())).toBe(false);
  });

  it("accepts a scalar price and price_cents", () => {
    expect(processAdData(ad(8, { price: 120 }) as never).price).toBe(120);
    expect(processAdData(ad(9, { price_cents: 4500 }) as never).price).toBe(45);
  });

  it("processSearchData tolerates a payload without ads", () => {
    expect(processSearchData({ total: 0 } as never).results).toEqual([]);
  });

  it("parseSearchResults still parses the captured page", () => {
    expect(parseSearchResults(fs.readFileSync("src/__mocks__/recherche.html", "utf8")).results.length).toBeGreaterThan(0);
  });
});
