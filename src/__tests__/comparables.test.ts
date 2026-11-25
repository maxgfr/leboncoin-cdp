import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildQueryFromAnnonce, digest } from "../comparables-format";
import { importComparables, NOISY_ATTRIBUTES, OWN_BROWSER_SNIPPET, ownBrowserComparables, renderOwnBrowserPlan } from "../comparables-own";
import { findSearchPayload, processSearchData } from "../exploit";
import { parseAnnonce } from "../markdown";
import type { Ad, Annonce } from "../types";
import { getNextJsProps } from "../utils";

const annonce: Annonce = {
  slug: "x",
  title: "MacBook Air M1",
  category: "Informatique",
  price: 0,
  zipcode: "75012",
  attributes: {},
  photos: [],
  status: "draft",
  description: "",
};

function ad(over: Partial<Ad>): Ad {
  return {
    list_id: "1",
    title: "t",
    description: "",
    url: "u",
    price: 0,
    date: new Date(0),
    city: "",
    user_id: "",
    has_phone: false,
    attributes: {},
    ...over,
  };
}

describe("buildQueryFromAnnonce", () => {
  it("builds text + locations params", () => {
    const q = new URLSearchParams(buildQueryFromAnnonce(annonce));
    expect(q.get("text")).toBe("MacBook Air M1");
    expect(q.get("locations")).toBe("75012");
  });

  it("returns empty when there's no title or zipcode", () => {
    expect(buildQueryFromAnnonce({ ...annonce, title: "", zipcode: "" })).toBe("");
  });
});

describe("digest", () => {
  it("computes min/median/max and a table row per ad", () => {
    const ads = [ad({ price: 600, title: "A", city: "Paris", attributes: { brand: "Apple" } }), ad({ price: 700, title: "B" }), ad({ price: 500, title: "C" })];
    const md = digest(annonce, ads);
    expect(md).toContain("min **500 €**");
    expect(md).toContain("median **600 €**");
    expect(md).toContain("max **700 €**");
    expect(md).toContain("| 1 | A |");
    expect(md).toContain("brand=Apple");
  });

  it("escapes pipes in titles", () => {
    const md = digest(annonce, [ad({ title: "A | B" })]);
    expect(md).toContain("A \\| B");
  });

  it("handles zero comparables", () => {
    const md = digest(annonce, []);
    expect(md).toContain("Found 0 comparable");
    expect(md).toContain("min **0 €**");
  });
});

describe("comparables from the user's own browser (--own-browser / --import)", () => {
  const EXAMPLE = resolve(__dirname, "../../assets/example-annonce");
  function setup(): { root: string; dir: string } {
    const root = mkdtempSync(join(tmpdir(), "lbc-cmp-"));
    const dir = join(root, "ex");
    cpSync(EXAMPLE, dir, { recursive: true });
    return { root, dir };
  }
  /** Run the snippet as javascript_tool would, on a page whose __NEXT_DATA__ is `nextData`: its status + what it wrote into the page. */
  function runSnippet(nextData: unknown): { status: string; title: string; pre: { id?: string; textContent?: string } | null } {
    const body: { children: { id?: string; textContent?: string }[]; replaceChildren: (...c: { id?: string; textContent?: string }[]) => void } = {
      children: [],
      replaceChildren: (...c) => {
        body.children = c;
      },
    };
    const doc = {
      title: "recherche",
      body,
      createElement: () => ({}),
      getElementById: (id: string) => (id === "__NEXT_DATA__" && nextData !== undefined ? { textContent: JSON.stringify(nextData) } : null),
    };
    const status = new Function("document", `return ${OWN_BROWSER_SNIPPET}`)(doc) as string;
    return { status, title: doc.title, pre: body.children[0] ?? null };
  }
  const nextData = getNextJsProps(readFileSync(resolve(__dirname, "../__mocks__/recherche.html"), "utf8"));

  it("--own-browser: the same search URL as the CDP run, the snippet, where to save, the import command", () => {
    const { root, dir } = setup();
    const p = ownBrowserComparables(root, "ex");
    expect(p.url).toBe(`https://www.leboncoin.fr/recherche?${buildQueryFromAnnonce(parseAnnonce(dir))}`);
    expect(ownBrowserComparables(root, "ex", "text=macbook").url).toBe("https://www.leboncoin.fr/recherche?text=macbook");
    expect(p.snippet).toBe(OWN_BROWSER_SNIPPET);
    expect(p.save_to).toBe(join(dir, "comparables-browser.json"));
    expect(p.import).toBe(`leboncoin comparables ex --import ${join(dir, "comparables-browser.json")}`);
    const txt = renderOwnBrowserPlan(p);
    const steps = ["tabs_create_mcp", p.url, "run this with javascript_tool", OWN_BROWSER_SNIPPET, "4. get_page_text", p.save_to, p.import, "tabs_close_mcp"];
    const at = steps.map((t) => txt.indexOf(t));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(txt).toContain("truncates its return value at ~1,000 chars");
    expect(txt).toContain("reload the URL if you need the page again");
    expect(OWN_BROWSER_SNIPPET).not.toContain("\n");
    expect(OWN_BROWSER_SNIPPET.length).toBeLessThan(1500);
  });

  it("the snippet writes the JSON into the page and returns only a short status", () => {
    const r = runSnippet(nextData);
    expect(r.status).toMatch(/^OK \d+ ads, \d+ chars — read it with get_page_text$/);
    expect(r.status.length).toBeLessThan(100);
    expect(r.title).toBe("lbc-export");
    expect(r.pre?.id).toBe("lbc-export");
    const parsed = JSON.parse(r.pre?.textContent ?? "") as { ads: { attributes: { key: string }[] }[] };
    expect(r.status).toContain(`OK ${parsed.ads.length} ads, ${r.pre?.textContent?.length} chars`);
    const keys = parsed.ads.flatMap((a) => a.attributes.map((x) => x.key));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((k) => NOISY_ATTRIBUTES.test(k))).toEqual([]);
    expect(runSnippet({ props: {} }).status).toBe("NO_ADS");
    expect(runSnippet(undefined).status).toBe("NO_NEXT_DATA");
  });

  it("--import accepts exactly what the snippet exports (raw, after a get_page_text header, or a raw __NEXT_DATA__) → comparables.json + .md", () => {
    const { root, dir } = setup();
    const out = runSnippet(nextData).pre?.textContent ?? "";
    const parsed = JSON.parse(out) as { total: number; ads: unknown[] };
    expect(parsed.ads.length).toBeGreaterThan(0);
    expect(parsed.ads.length).toBeLessThanOrEqual(40);
    const file = join(root, "captured.json");
    writeFileSync(file, out);
    const r = importComparables(root, "ex", file);
    expect(r.count).toBe(parsed.ads.length);
    expect(r.mdPath).toBe(join(dir, "comparables.md"));
    const ads = JSON.parse(readFileSync(r.jsonPath, "utf8")) as Ad[];
    const payload = findSearchPayload(nextData);
    expect(payload).not.toBeNull();
    const expected = processSearchData(payload ?? { ads: [] }).results.slice(0, 40);
    expect(ads.map((x) => [x.list_id, x.title, x.price, x.city])).toEqual(expected.map((x) => [x.list_id, x.title, x.price, x.city]));
    const kept = Object.fromEntries(Object.entries(expected[0]?.attributes ?? {}).filter(([k]) => !NOISY_ATTRIBUTES.test(k)));
    expect(ads[0]?.attributes).toEqual(kept);
    expect(readFileSync(r.mdPath, "utf8")).toContain(`Found ${r.count} comparable listing(s).`);

    // A pasted get_page_text block (header, then ---), a JSON string (double-encoded) and a whole __NEXT_DATA__ work too.
    writeFileSync(file, `Title: lbc-export\nURL: https://www.leboncoin.fr/recherche?text=macbook\nSource element: <pre>\n---\n${out}\n`);
    expect(importComparables(root, "ex", file).count).toBe(parsed.ads.length);
    writeFileSync(file, JSON.stringify(out));
    expect(importComparables(root, "ex", file).count).toBe(parsed.ads.length);
    writeFileSync(file, JSON.stringify(nextData));
    expect(importComparables(root, "ex", file).count).toBe(payload?.ads.length);
  });

  it("--import fails clearly on a wrong shape and writes nothing", () => {
    const { root, dir } = setup();
    const file = join(root, "bad.json");
    writeFileSync(file, JSON.stringify({ results: [{ id: 1, title: "x" }] }));
    expect(() => importComparables(root, "ex", file)).toThrow(/no ad list found — expected the --own-browser snippet's output/);
    writeFileSync(file, "<html>not json</html>");
    expect(() => importComparables(root, "ex", file)).toThrow(/not valid JSON/);
    writeFileSync(file, "NO_ADS");
    expect(() => importComparables(root, "ex", file)).toThrow(/found no ads/);
    expect(() => importComparables(root, "ex", join(root, "missing.json"))).toThrow(/cannot read/);
    expect(existsSync(join(dir, "comparables.json"))).toBe(false);
  });
});
