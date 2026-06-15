import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ANNONCE_FILENAME,
  listAnnonces,
  listPhotoFiles,
  parseAnnonce,
  PLACEHOLDER_BODY,
  resolvePhotoPaths,
  scaffoldAnnonce,
  serializeAnnonce,
  writeAnnonce,
} from "../markdown";
import type { Annonce } from "../types";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "lbc-md-"));
}

const sample: Annonce = {
  slug: "macbook-air-m1",
  title: "MacBook Air M1 2020 256 Go",
  category: "Informatique",
  price: 650,
  zipcode: "75012",
  city: "Paris",
  condition: "Très bon état",
  shipping: true,
  attributes: { brand: "Apple", model: "MacBook Air M1", storage: "256 Go" },
  photos: ["1.jpg", "2.jpg"],
  status: "draft",
  description: "MacBook Air M1 en très bon état, batterie 92%, vendu avec chargeur d'origine.",
};

describe("serializeAnnonce / parseAnnonce", () => {
  it("round-trips a full annonce", () => {
    const dir = join(scratch(), sample.slug);
    mkdirSync(dir, { recursive: true });
    writeAnnonce(dir, sample);
    const parsed = parseAnnonce(dir);
    expect(parsed).toEqual(sample);
  });

  it("round-trips empty attributes and photos as {} / []", () => {
    const dir = join(scratch(), "empty");
    mkdirSync(dir, { recursive: true });
    const a: Annonce = { ...sample, slug: "empty", attributes: {}, photos: [], city: undefined, condition: undefined, shipping: undefined };
    writeAnnonce(dir, a);
    const text = readFileSync(join(dir, ANNONCE_FILENAME), "utf8");
    expect(text).toContain("attributes: {}");
    expect(text).toContain("photos: []");
    expect(text).not.toContain("city:");
    const parsed = parseAnnonce(dir);
    expect(parsed.attributes).toEqual({});
    expect(parsed.photos).toEqual([]);
    expect(parsed.city).toBeUndefined();
  });

  it("preserves a published status transition with leboncoin ids", () => {
    const dir = join(scratch(), "pub");
    mkdirSync(dir, { recursive: true });
    const a: Annonce = {
      ...sample,
      slug: "pub",
      status: "published",
      leboncoin_id: "3138258318",
      leboncoin_url: "https://www.leboncoin.fr/ad/informatique/3138258318",
      published_at: "2026-06-15T10:00:00.000Z",
    };
    writeAnnonce(dir, a);
    const parsed = parseAnnonce(dir);
    expect(parsed.status).toBe("published");
    expect(parsed.leboncoin_id).toBe("3138258318");
    expect(parsed.leboncoin_url).toBe("https://www.leboncoin.fr/ad/informatique/3138258318");
    expect(parsed.published_at).toBe("2026-06-15T10:00:00.000Z");
  });

  it("escapes quotes and backslashes in strings", () => {
    const dir = join(scratch(), "q");
    mkdirSync(dir, { recursive: true });
    const a: Annonce = { ...sample, slug: "q", title: 'Disque 1To "neuf" \\ scellé', attributes: { note: 'a "b" c' } };
    writeAnnonce(dir, a);
    const parsed = parseAnnonce(dir);
    expect(parsed.title).toBe('Disque 1To "neuf" \\ scellé');
    expect(parsed.attributes.note).toBe('a "b" c');
  });

  it("throws on a file with no frontmatter", () => {
    const dir = join(scratch(), "bad");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ANNONCE_FILENAME), "just text, no frontmatter");
    expect(() => parseAnnonce(dir)).toThrow(/frontmatter/);
  });
});

describe("scaffoldAnnonce", () => {
  it("creates the folder, photos/ dir and a draft stub", () => {
    const dir = join(scratch(), "new-one");
    const a = scaffoldAnnonce(dir, { title: "Vélo", category: "Vélos" });
    expect(existsSync(join(dir, ANNONCE_FILENAME))).toBe(true);
    expect(existsSync(join(dir, "photos"))).toBe(true);
    expect(a.status).toBe("draft");
    const parsed = parseAnnonce(dir);
    expect(parsed.title).toBe("Vélo");
    expect(parsed.category).toBe("Vélos");
    expect(parsed.description).toBe(PLACEHOLDER_BODY);
  });

  it("refuses to overwrite without force", () => {
    const dir = join(scratch(), "dupe");
    scaffoldAnnonce(dir);
    expect(() => scaffoldAnnonce(dir)).toThrow(/already exists/);
    expect(() => scaffoldAnnonce(dir, {}, { force: true })).not.toThrow();
  });
});

describe("photos", () => {
  it("listPhotoFiles returns only image files, sorted", () => {
    const dir = join(scratch(), "p");
    const pdir = join(dir, "photos");
    mkdirSync(pdir, { recursive: true });
    writeFileSync(join(pdir, "b.jpg"), "");
    writeFileSync(join(pdir, "a.png"), "");
    writeFileSync(join(pdir, "notes.txt"), "");
    expect(listPhotoFiles(dir)).toEqual(["a.png", "b.jpg"]);
  });

  it("resolvePhotoPaths honors the frontmatter order, else falls back to disk", () => {
    const dir = join(scratch(), "po");
    const pdir = join(dir, "photos");
    mkdirSync(pdir, { recursive: true });
    writeFileSync(join(pdir, "1.jpg"), "");
    writeFileSync(join(pdir, "2.jpg"), "");
    const ordered = resolvePhotoPaths(dir, { ...sample, photos: ["2.jpg", "1.jpg"] });
    expect(ordered.map((p) => p.split("/").pop())).toEqual(["2.jpg", "1.jpg"]);
    const fallback = resolvePhotoPaths(dir, { ...sample, photos: [] });
    expect(fallback.map((p) => p.split("/").pop())).toEqual(["1.jpg", "2.jpg"]);
  });
});

describe("listAnnonces", () => {
  it("returns annonces sorted by folder name and skips non-annonce dirs", () => {
    const root = scratch();
    scaffoldAnnonce(join(root, "b-ad"), { title: "Second" });
    scaffoldAnnonce(join(root, "a-ad"), { title: "First" });
    mkdirSync(join(root, "not-an-annonce"), { recursive: true });
    const all = listAnnonces(root);
    expect(all.map((a) => a.slug)).toEqual(["a-ad", "b-ad"]);
  });

  it("returns [] for a missing root", () => {
    expect(listAnnonces(join(tmpdir(), "does-not-exist-xyz"))).toEqual([]);
  });
});
