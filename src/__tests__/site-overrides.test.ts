import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { matchFields } from "../field-match";
import { mergeOverrides, siteOverridesPath } from "../site-overrides";
import type { Annonce } from "../types";

/** Fresh, isolated copies of the tables so tests never mutate the real ones. */
function tables() {
  const titleInput = ['input[name="subject"]'];
  const DEPOSIT: Record<string, unknown> = {
    startUrl: "https://www.leboncoin.fr/deposer-une-annonce",
    titleInput,
    nextButton: { textCandidates: ["Continuer"], css: ['form button[type="submit"]'] },
    loginUrlPattern: /\/connexion/i,
    publishedUrlPattern: [/\/ad\/[^/]+\/(\d{4,})/],
    attrByKey: (k: string) => [k],
  };
  const LOGICAL_FIELDS: Record<string, unknown> = {
    title: { names: ["subject"], labels: ["titre"], css: titleInput, types: ["text"], required: true },
    price: { names: ["price"], labels: ["prix"], css: [], types: ["text"], required: true },
  };
  return { DEPOSIT, LOGICAL_FIELDS, AUTH: { loggedInSelectors: ["a"] } as Record<string, unknown> };
}

describe("mergeOverrides", () => {
  it("prepends candidate lists in place (shared arrays stay shared)", () => {
    const t = tables();
    const applied = mergeOverrides({ DEPOSIT: { titleInput: ['input[name="titre"]'] } }, () => {}, t);
    expect(applied).toEqual(["DEPOSIT.titleInput"]);
    expect(t.DEPOSIT.titleInput).toEqual(['input[name="titre"]', 'input[name="subject"]']);
    expect((t.LOGICAL_FIELDS.title as { css: string[] }).css[0]).toBe('input[name="titre"]');
  });

  it("merges a button's text and css candidates, de-duplicated", () => {
    const t = tables();
    mergeOverrides({ DEPOSIT: { nextButton: { textCandidates: ["Étape suivante", "Continuer"] } } }, () => {}, t);
    expect((t.DEPOSIT.nextButton as { textCandidates: string[] }).textCandidates).toEqual(["Étape suivante", "Continuer"]);
  });

  it("replaces URLs and turns regex strings into case-insensitive RegExps", () => {
    const t = tables();
    mergeOverrides(
      { DEPOSIT: { startUrl: "https://www.leboncoin.fr/deposer", loginUrlPattern: "/se-connecter", publishedUrlPattern: ["/annonce/(\\d+)"] } },
      () => {},
      t,
    );
    expect(t.DEPOSIT.startUrl).toBe("https://www.leboncoin.fr/deposer");
    expect((t.DEPOSIT.loginUrlPattern as RegExp).test("https://x/SE-CONNECTER")).toBe(true);
    expect((t.DEPOSIT.publishedUrlPattern as RegExp[])[0]?.exec("/annonce/42")?.[1]).toBe("42");
  });

  it("skips invalid / unknown / computed entries with a warning, keeping the rest", () => {
    const t = tables();
    const warnings: string[] = [];
    const applied = mergeOverrides(
      {
        DEPOSIT: { titleInput: "not-an-array", nope: [], attrByKey: ["x"], loginUrlPattern: "([" },
        NOPE: {},
        AUTH: { loggedInSelectors: ["a.account"] },
      },
      (m) => warnings.push(m),
      t,
    );
    expect(applied).toEqual(["AUTH.loggedInSelectors"]);
    expect(warnings.join("\n")).toMatch(/titleInput must be an array/);
    expect(warnings.join("\n")).toMatch(/unknown key DEPOSIT.nope/);
    expect(warnings.join("\n")).toMatch(/attrByKey is computed/);
    expect(warnings.join("\n")).toMatch(/invalid regex/);
    expect(warnings.join("\n")).toMatch(/unknown section "NOPE"/);
    expect(t.DEPOSIT.titleInput).toEqual(['input[name="subject"]']);
  });

  it("a LOGICAL_FIELDS label override makes a reworded field match without a rebuild", () => {
    const t = tables();
    const a: Annonce = { slug: "x", title: "", category: "", price: 10, zipcode: "", attributes: {}, photos: [], status: "draft", description: "" };
    const map = { url: "", fields: [{ key: "m", label: "Montant demandé", type: "text" as const, value: "", required: true, selector: "" }] };
    expect(matchFields(map, a, t.LOGICAL_FIELDS as never).matches).toHaveLength(0);
    mergeOverrides({ LOGICAL_FIELDS: { price: { labels: ["montant"] } } }, () => {}, t);
    expect(matchFields(map, a, t.LOGICAL_FIELDS as never).matches[0]?.target).toEqual({ kind: "logical", name: "price" });
  });

  it("rejects a non-object file content", () => {
    const warnings: string[] = [];
    expect(mergeOverrides([1, 2], (m) => warnings.push(m), tables())).toEqual([]);
    expect(warnings).toHaveLength(1);
  });
});

describe("siteOverridesPath", () => {
  it("honours $LBC_SITE_OVERRIDES, then $LBC_SCRAPER_HOME/site.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "lbc-ov-"));
    const file = join(dir, "x.json");
    writeFileSync(file, "{}");
    const prev = { o: process.env.LBC_SITE_OVERRIDES, h: process.env.LBC_SCRAPER_HOME };
    try {
      process.env.LBC_SITE_OVERRIDES = file;
      expect(siteOverridesPath()).toBe(file);
      delete process.env.LBC_SITE_OVERRIDES;
      process.env.LBC_SCRAPER_HOME = dir;
      expect(siteOverridesPath()).toBe(join(dir, "site.json"));
    } finally {
      if (prev.o === undefined) delete process.env.LBC_SITE_OVERRIDES;
      else process.env.LBC_SITE_OVERRIDES = prev.o;
      if (prev.h === undefined) delete process.env.LBC_SCRAPER_HOME;
      else process.env.LBC_SCRAPER_HOME = prev.h;
    }
  });
});
