import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { writeAnnonce } from "../markdown";
import type { Annonce } from "../types";
import { validateAnnonce } from "../validate";

const base: Annonce = {
  slug: "ad",
  title: "MacBook Air M1 2020",
  category: "Informatique",
  price: 650,
  zipcode: "75012",
  attributes: {},
  photos: [],
  status: "draft",
  description: "MacBook Air M1 très bon état, chargeur inclus, batterie 92%.",
};

function setup(over: Partial<Annonce>): string {
  const dir = join(mkdtempSync(join(tmpdir(), "lbc-caps-")), "ad");
  mkdirSync(join(dir, "photos"), { recursive: true });
  writeFileSync(join(dir, "photos", "1.jpg"), "");
  writeAnnonce(dir, { ...base, ...over });
  return dir;
}

describe("validate caps (warnings, non-failing)", () => {
  it("warns but stays ok on a too-long title", () => {
    const r = validateAnnonce(setup({ title: "X".repeat(120) }));
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.field === "title")).toBe(true);
  });

  it("warns but stays ok on a too-long description", () => {
    const r = validateAnnonce(setup({ description: "y ".repeat(2500) }));
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.field === "description")).toBe(true);
  });

  it("emits no warnings for a normal annonce", () => {
    const r = validateAnnonce(setup({}));
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([]);
  });
});
