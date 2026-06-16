import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FillReport } from "../publish";
import { buildReadiness, writeReadiness } from "../readiness";

/** A fake CDP answering only the two live readiness probes. */
class FakeCDP {
  constructor(private opts: { submitEnabled?: boolean; formError?: string | null } = {}) {}
  async evaluate(expr: string): Promise<unknown> {
    if (expr.includes("submit-enabled")) return this.opts.submitEnabled ?? true;
    if (expr.includes('role="alert"')) return this.opts.formError ?? null;
    return null;
  }
  async send(): Promise<unknown> {
    return {};
  }
  on(): void {}
  once(): Promise<unknown> {
    return Promise.resolve({});
  }
  disconnect(): void {}
}

const HREF = "https://www.leboncoin.fr/deposer-une-annonce";

function report(over: Partial<FillReport> = {}): FillReport {
  return {
    fields: [
      { field: "category", required: true, hasValue: true, filled: true },
      { field: "title", required: true, hasValue: true, filled: true },
      { field: "price", required: true, hasValue: true, filled: true },
    ],
    missing: [],
    uploadedPhotos: 2,
    expectedPhotos: 2,
    ...over,
  };
}

describe("buildReadiness", () => {
  it("is ready when every check passes", async () => {
    const r = await buildReadiness(new FakeCDP() as never, report(), HREF);
    expect(r.ready).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it("blocks on a missing required field", async () => {
    const r = await buildReadiness(new FakeCDP() as never, report({ fields: [{ field: "zipcode", required: true, hasValue: false, filled: false }] }), HREF);
    expect(r.ready).toBe(false);
    expect(r.blockers.join(" ")).toContain("required-fields");
  });

  it("blocks when photos are under-uploaded", async () => {
    const r = await buildReadiness(new FakeCDP() as never, report({ uploadedPhotos: 1, expectedPhotos: 3 }), HREF);
    expect(r.ready).toBe(false);
    expect(r.blockers.join(" ")).toContain("photos");
  });

  it("blocks when the submit button is disabled", async () => {
    const r = await buildReadiness(new FakeCDP({ submitEnabled: false }) as never, report(), HREF);
    expect(r.ready).toBe(false);
    expect(r.blockers.join(" ")).toContain("submit-enabled");
  });

  it("blocks on a visible form error", async () => {
    const r = await buildReadiness(new FakeCDP({ formError: "Le prix est invalide" }) as never, report(), HREF);
    expect(r.ready).toBe(false);
    expect(r.blockers.join(" ")).toContain("no-form-error");
  });

  it("blocks when the URL is the login page", async () => {
    const r = await buildReadiness(new FakeCDP() as never, report(), "https://www.leboncoin.fr/connexion");
    expect(r.ready).toBe(false);
    expect(r.blockers.join(" ")).toContain("login");
  });
});

describe("writeReadiness", () => {
  it("writes the readiness JSON to disk", async () => {
    const p = join(mkdtempSync(join(tmpdir(), "lbc-ready-")), "push-readiness.json");
    const r = await buildReadiness(new FakeCDP() as never, report(), HREF);
    expect(writeReadiness(p, r)).toBe(true);
    expect(existsSync(p)).toBe(true);
  });
});
