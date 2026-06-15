import { describe, expect, it } from "vitest";
import { buildQueryFromAnnonce, digest } from "../comparables-format";
import type { Ad, Annonce } from "../types";

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
