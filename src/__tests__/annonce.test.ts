import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runList, runNew } from "../annonce";
import { parseAnnonce } from "../markdown";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "lbc-ann-"));
}

describe("runNew", () => {
  it("scaffolds a draft with title/category and the placeholder body by default", () => {
    const root = scratch();
    const r = runNew(root, "macbook", { title: "MacBook", category: "Informatique" });
    expect(r.slug).toBe("macbook");
    const a = parseAnnonce(r.dir);
    expect(a.title).toBe("MacBook");
    expect(a.category).toBe("Informatique");
    expect(a.status).toBe("draft");
  });

  it("seeds the body from --notes and prefills price/zipcode/condition/attributes", () => {
    const root = scratch();
    const r = runNew(root, "mbp", {
      notes: "MacBook M1, très bon état, 256 Go, batterie 92%.",
      price: 650,
      zipcode: "75012",
      condition: "Très bon état",
      attributes: { brand: "Apple", model: "MacBook Air M1" },
    });
    const a = parseAnnonce(r.dir);
    expect(a.description).toContain("MacBook M1");
    expect(a.price).toBe(650);
    expect(a.zipcode).toBe("75012");
    expect(a.condition).toBe("Très bon état");
    expect(a.attributes).toEqual({ brand: "Apple", model: "MacBook Air M1" });
  });

  it("rejects an invalid slug", () => {
    expect(() => runNew(scratch(), "../evil")).toThrow(/invalid slug/);
  });

  it("refuses to overwrite without force", () => {
    const root = scratch();
    runNew(root, "dup");
    expect(() => runNew(root, "dup")).toThrow(/already exists/);
    expect(() => runNew(root, "dup", { force: true })).not.toThrow();
  });
});

describe("runList", () => {
  it("lists annonces and filters by status", () => {
    const root = scratch();
    runNew(root, "a", { title: "A" });
    runNew(root, "b", { title: "B" });
    const all = runList(root);
    expect(all.map((x) => x.slug).sort()).toEqual(["a", "b"]);
    expect(all.every((x) => x.status === "draft")).toBe(true);
    expect(runList(root, "published")).toEqual([]);
  });
});
