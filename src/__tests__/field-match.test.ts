import { describe, expect, it } from "vitest";
import { isFieldFilled, matchFields, normalizeText, pickCategoryCard, pickOption, valueAlreadySet } from "../field-match";
import type { FieldDescriptor, FormMap } from "../form-introspect";
import type { Annonce } from "../types";

const annonce: Annonce = {
  slug: "ad",
  title: "MacBook Air M1 2020",
  category: "Ordinateurs",
  price: 650,
  zipcode: "75012",
  city: "Paris",
  condition: "Très bon état",
  shipping: true,
  attributes: { brand: "Apple", "Taille d'écran": "12 à 14”", Kilométrage: "120000" },
  photos: [],
  status: "draft",
  description: "Très bon état, batterie 92 %.",
};

function f(over: Partial<FieldDescriptor>): FieldDescriptor {
  return { key: over.name ?? over.label ?? "k", label: "", type: "text", value: "", required: false, selector: "", ...over };
}

const map = (fields: FieldDescriptor[]): FormMap => ({ url: "u", fields });

function targetOf(m: ReturnType<typeof matchFields>, key: string): string | undefined {
  const hit = m.matches.find((x) => x.field.key === key);
  if (!hit) return undefined;
  return hit.target.kind === "logical" ? hit.target.name : `attr:${hit.target.key}`;
}

describe("normalizeText", () => {
  it("strips accents, case, typographic apostrophes, asterisks and punctuation", () => {
    expect(normalizeText("  Quel est le titre de l’annonce ?* ")).toBe("quel est le titre de l annonce");
    expect(normalizeText("État*")).toBe("etat");
  });
});

describe("matchFields — by meaning, not by selector", () => {
  it("matches the live step-3 controls (labels as captured on 2026-10-01)", () => {
    const m = matchFields(
      map([
        f({ key: "subject", name: "subject", label: "Titre de l'annonce*", required: true }),
        f({ key: "body", name: "body", type: "textarea", label: "Description de l'annonce*", required: true }),
        f({ key: "price_cents", name: "price_cents", label: "Prix de vente souhaité*", required: true }),
        f({ key: "location", name: "location", type: "combobox", label: "Location", altLabels: ["À quelle adresse se trouve le bien ?*"], required: true }),
      ]),
      annonce,
    );
    expect(targetOf(m, "subject")).toBe("title");
    expect(targetOf(m, "body")).toBe("description");
    expect(targetOf(m, "price_cents")).toBe("price");
    expect(targetOf(m, "location")).toBe("location");
    expect(m.matches.find((x) => x.field.key === "price_cents")?.value).toBe("650");
    const loc = m.matches.find((x) => x.field.key === "location");
    expect(loc?.value).toBe("75012");
    expect(loc?.hint).toBe("Paris");
  });

  it("still resolves when every name= is renamed and only the visible label is left", () => {
    const m = matchFields(
      map([
        f({ key: "a1", name: "x_9f3", label: "Quel est le titre de l’annonce ?*" }),
        f({ key: "a2", name: "x_7c1", type: "textarea", label: "Décrivez votre article", placeholder: "Description" }),
        f({ key: "a3", label: "", placeholder: "Prix en €", type: "text" }),
      ]),
      annonce,
    );
    expect(targetOf(m, "a1")).toBe("title");
    expect(m.matches.find((x) => x.field.key === "a1")?.via).toBe("label");
    expect(targetOf(m, "a2")).toBe("description");
    expect(targetOf(m, "a3")).toBe("price");
  });

  it("prefers a legacy selectors.ts hit (fast path) and reports it", () => {
    const m = matchFields(map([f({ key: "t", label: "zzz", cssHits: ["title"] })]), annonce);
    expect(m.matches[0]?.via).toBe("selector");
  });

  it("maps attributes by technical key, by react-hook-form suffix and by visible label", () => {
    const m = matchFields(
      map([
        f({ key: "computer_brand", rhfName: "computer_brand", type: "combobox", label: "Marque" }),
        f({ key: "screen", rhfName: "computer_screen_size", type: "combobox", label: "Taille d'écran" }),
        f({ key: "km", name: "mileage", label: "Kilométrage*", required: true }),
      ]),
      annonce,
    );
    expect(targetOf(m, "computer_brand")).toBe("attr:brand");
    expect(targetOf(m, "screen")).toBe("attr:Taille d'écran");
    expect(targetOf(m, "km")).toBe("attr:Kilométrage");
  });

  it("maps condition (État) and shipping by meaning", () => {
    const m = matchFields(
      map([f({ key: "cond", type: "combobox", label: "État*", rhfName: "condition" }), f({ key: "ship", type: "checkbox", rhfName: "shipping", label: "" })]),
      annonce,
    );
    expect(targetOf(m, "cond")).toBe("condition");
    expect(targetOf(m, "ship")).toBe("shipping");
    expect(m.matches.find((x) => x.field.key === "ship")?.value).toBe("true");
  });

  it("never writes text into an incompatible control and never reuses a field", () => {
    const m = matchFields(map([f({ key: "file", type: "file", label: "Titre" }), f({ key: "t", name: "subject", label: "Titre" })]), annonce);
    expect(targetOf(m, "file")).toBe("photos");
    expect(m.matches.filter((x) => x.target.kind === "logical" && x.target.name === "title")).toHaveLength(1);
  });

  it("does not match the « Guide des états » noise or unrelated fields", () => {
    const m = matchFields(map([f({ key: "year", name: "electronic_year", label: "Année de fabrication", placeholder: "AAAA" })]), annonce);
    expect(m.matches).toHaveLength(0);
  });

  it("lists attributes with no matching control (so the agent can tell the user)", () => {
    const m = matchFields(map([]), { ...annonce, attributes: { storage: "256 Go" } });
    expect(m.unmatchedAttributes).toEqual(["storage"]);
  });

  it("skips logical fields with no value in the annonce", () => {
    const m = matchFields(map([f({ key: "p", name: "price_cents", label: "Prix" })]), { ...annonce, price: 0 });
    expect(m.matches).toHaveLength(0);
  });
});

describe("pickOption", () => {
  const opts = ["État neuf", "Très bon état", "Bon état", "État satisfaisant - fonctionnel", "Pour pièces"];
  it("exact (normalized) beats prefix beats contains beats token overlap", () => {
    expect(pickOption(opts, "tres bon etat")).toBe(1);
    expect(pickOption(opts, "Bon état")).toBe(2);
    expect(pickOption(opts, "satisfaisant")).toBe(3);
    expect(pickOption(["Fixe", "Portable", "Unité centrale (seule)"], "unite centrale")).toBe(2);
  });
  it("returns -1 when nothing is close", () => {
    expect(pickOption(opts, "Cassé")).toBe(-1);
    expect(pickOption([], "x")).toBe(-1);
  });
});

describe("pickCategoryCard", () => {
  const cards = [
    { name: "Ordinateurs", family: "Électronique" },
    { name: "Tablettes & Liseuses", family: "Électronique" },
    { name: "Vélos", family: "Loisirs" },
  ];
  it("matches the category name, then the family", () => {
    expect(pickCategoryCard(cards, "ordinateurs")).toEqual({ index: 0, guessed: false });
    expect(pickCategoryCard(cards, "Vélo")).toEqual({ index: 2, guessed: false });
    expect(pickCategoryCard(cards, "Loisirs")).toEqual({ index: 2, guessed: false });
  });
  it("falls back to the site's first suggestion, flagged as guessed", () => {
    expect(pickCategoryCard(cards, "Informatique")).toEqual({ index: 0, guessed: true });
    expect(pickCategoryCard([], "x")).toEqual({ index: -1, guessed: true });
  });
});

describe("isFieldFilled / valueAlreadySet", () => {
  it("reads text, checkbox and radiogroup state", () => {
    expect(isFieldFilled(f({ value: " " }))).toBe(false);
    expect(isFieldFilled(f({ value: "x" }))).toBe(true);
    expect(isFieldFilled(f({ type: "checkbox", checked: true }))).toBe(true);
    expect(isFieldFilled(f({ type: "switch", checked: false }))).toBe(false);
  });
  it("detects a value that is already in place (no retyping)", () => {
    expect(valueAlreadySet(f({ value: "MacBook Air M1 2020" }), "macbook air m1 2020")).toBe(true);
    expect(valueAlreadySet(f({ value: "45" }), "650")).toBe(false);
    expect(valueAlreadySet(f({ type: "checkbox", checked: true }), "true")).toBe(true);
    expect(valueAlreadySet(f({ type: "combobox", value: "Très bon état" }), "Très bon état")).toBe(true);
  });
});
