import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scaffoldAnnonce, writeAnnonce } from "../markdown";
import type { Annonce } from "../types";
import { validateAnnonce } from "../validate";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "lbc-val-"));
}

function makeDir(): string {
  const dir = join(scratch(), "ad");
  scaffoldAnnonce(dir);
  return dir;
}

function withPhoto(dir: string, name = "1.jpg"): void {
  writeFileSync(join(dir, "photos", name), "");
}

const valid: Annonce = {
  slug: "ad",
  title: "MacBook Air M1 2020",
  category: "Informatique",
  price: 650,
  zipcode: "75012",
  attributes: { brand: "Apple" },
  photos: [],
  status: "draft",
  description: "MacBook Air M1, très bon état, vendu avec chargeur d'origine, batterie 92%.",
};

describe("validateAnnonce", () => {
  it("passes a complete draft with a photo", () => {
    const dir = makeDir();
    writeAnnonce(dir, valid);
    withPhoto(dir);
    const r = validateAnnonce(dir);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("flags a missing/zero price", () => {
    const dir = makeDir();
    writeAnnonce(dir, { ...valid, price: 0 });
    withPhoto(dir);
    const r = validateAnnonce(dir);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.field === "price")).toBe(true);
  });

  it("flags no photos", () => {
    const dir = makeDir();
    writeAnnonce(dir, valid);
    const r = validateAnnonce(dir);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.field === "photos")).toBe(true);
  });

  it("flags a placeholder/empty body", () => {
    const dir = makeDir(); // scaffold leaves the placeholder body
    withPhoto(dir);
    writeAnnonce(dir, { ...valid, description: "" });
    withPhoto(dir);
    const r = validateAnnonce(dir);
    expect(r.issues.some((i) => i.field === "description")).toBe(true);
  });

  it("flags a non-draft status", () => {
    const dir = makeDir();
    writeAnnonce(dir, { ...valid, status: "published", leboncoin_id: "123" });
    withPhoto(dir);
    const r = validateAnnonce(dir);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.field === "status")).toBe(true);
  });

  it("flags a malformed zipcode", () => {
    const dir = makeDir();
    writeAnnonce(dir, { ...valid, zipcode: "ABC" });
    withPhoto(dir);
    const r = validateAnnonce(dir);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.field === "zipcode")).toBe(true);
  });

  it("flags a listed photo that is not on disk", () => {
    const dir = makeDir();
    writeAnnonce(dir, { ...valid, photos: ["missing.jpg"] });
    withPhoto(dir, "1.jpg");
    const r = validateAnnonce(dir);
    expect(r.issues.some((i) => i.field === "photos" && /not found/.test(i.message))).toBe(true);
  });
});
