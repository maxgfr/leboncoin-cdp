import { describe, expect, it } from "vitest";
import { matchFields } from "../field-match";
import { introspectForm } from "../form-introspect";
import type { Annonce } from "../types";
import { DomCDP, fixture } from "./helpers/dom-cdp";

/**
 * The real in-page introspection, run against the deposit wizard as captured
 * live on 2026-10-01 (anonymized). If Leboncoin's markup drifts, re-capture
 * these fixtures (see references/deposit-form-mapping.md) and these tests show
 * exactly what changed.
 */

const annonce: Annonce = {
  slug: "ad",
  title: "MacBook Air M1 2020 256 Go",
  category: "Ordinateurs",
  price: 650,
  zipcode: "75012",
  city: "Paris",
  condition: "Très bon état",
  shipping: true,
  attributes: { brand: "Apple", Type: "Portable" },
  photos: [],
  status: "draft",
  description: "MacBook Air M1, très bon état.",
};

describe("introspectForm on the live step 1 (title + suggested categories)", () => {
  it("finds the title (required) and tags it with a data-lbc-ref handle", async () => {
    const cdp = new DomCDP(fixture("deposit-step-1-suggest.html"));
    const map = await introspectForm(cdp as never);
    const title = map.fields.find((f) => f.name === "subject");
    expect(title?.required).toBe(true);
    expect(title?.label).toContain("titre");
    expect(title?.cssHits).toContain("title");
    expect(title?.ref).toBeTruthy();
    expect(cdp.document.querySelector(`[data-lbc-ref="${title?.ref}"]`)).not.toBeNull();
    // hidden aria-hidden radios of the suggestion cards are NOT reported as fields
    expect(map.fields.filter((f) => f.type === "radio")).toHaveLength(0);
    expect(map.step?.title).toBe("Commençons par l’essentiel !");
  });

  it("reports the « Type d'annonce » radio group with its options once a category is chosen", async () => {
    const map = await introspectForm(new DomCDP(fixture("deposit-step-1-category.html")) as never);
    const group = map.fields.find((f) => f.type === "radiogroup");
    expect(group?.required).toBe(true);
    expect(group?.value).toContain("Offre");
    expect(group?.options?.length).toBeGreaterThan(0);
  });
});

describe("introspectForm on the live step 2 (photos + category attributes)", () => {
  it("reports comboboxes with their aria-labelledby label, options and rhf name — not their listboxes", async () => {
    const map = await introspectForm(new DomCDP(fixture("deposit-step-2.html")) as never);
    const etat = map.fields.find((f) => f.rhfName === "condition");
    expect(etat?.type).toBe("combobox");
    expect(etat?.label).toMatch(/^État/);
    expect(etat?.required).toBe(true);
    expect(etat?.options?.map((o) => o.label)).toContain("Très bon état");
    expect(map.fields.find((f) => f.rhfName === "computer_brand")?.options?.map((o) => o.label)).toContain("Apple");
    expect(map.fields.some((f) => f.type === "combobox" && f.id?.endsWith("-menu"))).toBe(false);
  });

  it("reports the (hidden) photo input and the switches once each", async () => {
    const map = await introspectForm(new DomCDP(fixture("deposit-step-2.html")) as never);
    expect(map.fields.filter((f) => f.type === "file")).toHaveLength(1);
    const serial = map.fields.filter((f) => f.rhfName === "has_serial_number");
    expect(serial).toHaveLength(1);
    expect(serial[0]?.type).toBe("switch");
  });

  it("is fully matched to the annonce by meaning", async () => {
    const map = await introspectForm(new DomCDP(fixture("deposit-step-2.html")) as never);
    const m = matchFields(map, annonce);
    const by = (rhf: string) => m.matches.find((x) => x.field.rhfName === rhf)?.target;
    expect(by("condition")).toEqual({ kind: "logical", name: "condition" });
    expect(by("computer_brand")).toEqual({ kind: "attribute", key: "brand" });
    expect(by("computer_type")).toEqual({ kind: "attribute", key: "Type" });
    expect(by("images")).toEqual({ kind: "logical", name: "photos" });
  });
});

describe("introspectForm on the live step 3 (final review)", () => {
  it("finds title / description / price / address / sell-or-give / shipping", async () => {
    const map = await introspectForm(new DomCDP(fixture("deposit-step-3-review.html")) as never);
    const m = matchFields(map, annonce);
    const target = (name: string) => m.matches.find((x) => x.target.kind === "logical" && x.target.name === name)?.field;
    expect(target("title")?.name).toBe("subject");
    expect(target("description")?.name).toBe("body");
    expect(target("price")?.name).toBe("price_cents");
    expect(target("location")?.type).toBe("combobox");
    expect(target("shipping")?.rhfName).toBe("shipping");
    expect(map.fields.find((f) => f.type === "radiogroup")?.options?.map((o) => o.label)).toEqual(["Je vends", "Je donne"]);
    expect(map.step?.title).toContain("avant de publier");
  });

  it("step fingerprints differ between steps", async () => {
    const s1 = await introspectForm(new DomCDP(fixture("deposit-step-1-category.html")) as never);
    const s3 = await introspectForm(new DomCDP(fixture("deposit-step-3-review.html")) as never);
    expect(s1.step?.fingerprint).not.toBe(s3.step?.fingerprint);
  });
});
