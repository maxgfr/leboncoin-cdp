import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../utils", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, delay: () => Promise.resolve() };
});

import { runDelete } from "../delete";
import { parseAnnonce, writeAnnonce } from "../markdown";
import type { Annonce } from "../types";

class FakeCDP {
  calls: { method: string }[] = [];
  clicks = 0;
  constructor(private opts: { url?: string; clickFails?: boolean } = {}) {}
  async evaluate(expr: string): Promise<unknown> {
    if (expr.includes("location.href")) return this.opts.url ?? "https://www.leboncoin.fr/ad/123";
    if (expr.includes("geo.captcha-delivery")) return expr.includes("hostname");
    if (expr.includes("querySelectorAll('button")) {
      if (this.opts.clickFails) return false; // simulate a missing delete control
      this.clicks++;
      return true;
    }
    if (expr.startsWith("!!document.querySelector")) return !this.opts.clickFails;
    if (expr.includes("body.innerText")) return true; // deleted marker present
    return null;
  }
  async send(method: string): Promise<unknown> {
    this.calls.push({ method });
    return {};
  }
  on(): void {}
  once(): Promise<unknown> {
    return Promise.resolve({});
  }
  disconnect(): void {}
}

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "lbc-del-"));
}

const published: Annonce = {
  slug: "ad",
  title: "MacBook Air M1 2020",
  category: "Informatique",
  price: 650,
  zipcode: "75012",
  attributes: {},
  photos: [],
  status: "published",
  leboncoin_id: "123",
  leboncoin_url: "https://www.leboncoin.fr/ad/123",
  description: "MacBook Air M1, très bon état.",
};

function setup(over: Partial<Annonce> = {}): { dir: string; root: string } {
  const root = scratch();
  const dir = join(root, "ad");
  mkdirSync(dir, { recursive: true });
  writeAnnonce(dir, { ...published, ...over });
  return { dir, root };
}

describe("runDelete", () => {
  it("clicks delete + confirm and marks the annonce deleted", async () => {
    const { dir, root } = setup();
    const cdp = new FakeCDP();
    const res = await runDelete(root, "ad", {}, { connect: async () => cdp as never, confirm: async () => true });
    expect(res.ok).toBe(true);
    expect(cdp.clicks).toBeGreaterThanOrEqual(2); // delete + confirm
    const after = parseAnnonce(dir);
    expect(after.status).toBe("deleted");
    expect(after.deleted_at).toBeTruthy();
  });

  it("aborts when the user declines and leaves the annonce published", async () => {
    const { dir, root } = setup();
    const cdp = new FakeCDP();
    const res = await runDelete(root, "ad", {}, { connect: async () => cdp as never, confirm: async () => false });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("aborted");
    expect(parseAnnonce(dir).status).toBe("published");
  });

  it("skips the prompt with --yes", async () => {
    const { root } = setup();
    const cdp = new FakeCDP();
    const confirm = vi.fn(async () => true);
    const res = await runDelete(root, "ad", { yes: true }, { connect: async () => cdp as never, confirm });
    expect(res.ok).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("returns login-required (and deletes nothing) when the session is logged out", async () => {
    const { dir, root } = setup();
    const cdp = new FakeCDP({ url: "https://www.leboncoin.fr/connexion" });
    const res = await runDelete(root, "ad", { yes: true }, { connect: async () => cdp as never });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("login-required");
    expect(cdp.clicks).toBe(0);
    expect(parseAnnonce(dir).status).toBe("published");
  });

  it("returns control-not-found (and leaves it published) when the delete control is missing", async () => {
    const { dir, root } = setup();
    const cdp = new FakeCDP({ clickFails: true });
    const res = await runDelete(root, "ad", { yes: true }, { connect: async () => cdp as never });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("control-not-found");
    expect(parseAnnonce(dir).status).toBe("published"); // not corrupted to "deleted"
  });

  it("refuses to delete an annonce that was never published", async () => {
    const { root } = setup({ status: "draft", leboncoin_id: undefined, leboncoin_url: undefined });
    const cdp = new FakeCDP();
    await expect(runDelete(root, "ad", { yes: true }, { connect: async () => cdp as never })).rejects.toThrow(/not published/);
  });
});
