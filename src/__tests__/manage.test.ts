import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../utils", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, delay: () => Promise.resolve() };
});

import { runDeactivate, runEdit, runMarkSold, runReactivate, runRenew } from "../manage";
import { parseAnnonce, writeAnnonce } from "../markdown";
import type { Annonce } from "../types";

class FakeCDP {
  calls: { method: string }[] = [];
  clicks = 0;
  filesSet: string[] = [];
  constructor(private opts: { url?: string; clickFails?: boolean } = {}) {}
  async evaluate(expr: string): Promise<unknown> {
    if (expr.includes("location.href")) return this.opts.url ?? "https://www.leboncoin.fr/ad/123";
    if (expr.includes("geo.captcha-delivery")) return expr.includes("hostname");
    if (expr.includes("querySelectorAll('button")) {
      if (this.opts.clickFails) return false; // simulate a control that isn't found
      this.clicks++;
      return true;
    }
    if (expr.startsWith("!!document.querySelector")) return !this.opts.clickFails;
    if (expr.includes("opts[0]")) return true;
    if (expr.includes("dispatchEvent")) return true;
    if (expr.includes("files")) return this.filesSet.length;
    if (expr.includes("body.innerText")) return false;
    return null;
  }
  async send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    this.calls.push({ method });
    if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
    if (method === "DOM.querySelector") return { nodeId: 2 };
    if (method === "DOM.setFileInputFiles") {
      this.filesSet = (params.files as string[]) ?? [];
      return {};
    }
    if (method === "Page.captureScreenshot") return { data: "iVBORw0KGgo=" };
    return {};
  }
  on(): void {}
  once(): Promise<unknown> {
    return Promise.resolve({});
  }
  disconnect(): void {}
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
  const root = mkdtempSync(join(tmpdir(), "lbc-manage-"));
  const dir = join(root, "ad");
  mkdirSync(dir, { recursive: true });
  writeAnnonce(dir, { ...published, ...over });
  return { dir, root };
}

describe("runMarkSold", () => {
  it("clicks the sold flow and transitions published → sold", async () => {
    const { dir, root } = setup();
    const cdp = new FakeCDP();
    const res = await runMarkSold(root, "ad", { yes: true }, { connect: async () => cdp as never });
    expect(res.ok).toBe(true);
    expect(cdp.clicks).toBeGreaterThanOrEqual(1);
    const after = parseAnnonce(dir);
    expect(after.status).toBe("sold");
    expect(after.sold_at).toBeTruthy();
  });

  it("aborts (and changes nothing) when the user declines", async () => {
    const { dir, root } = setup();
    const cdp = new FakeCDP();
    const res = await runMarkSold(root, "ad", {}, { connect: async () => cdp as never, confirm: async () => false });
    expect(res.reason).toBe("aborted");
    expect(parseAnnonce(dir).status).toBe("published");
  });

  it("returns login-required (no change) when logged out", async () => {
    const { dir, root } = setup();
    const cdp = new FakeCDP({ url: "https://www.leboncoin.fr/connexion" });
    const res = await runMarkSold(root, "ad", { yes: true }, { connect: async () => cdp as never });
    expect(res.reason).toBe("login-required");
    expect(parseAnnonce(dir).status).toBe("published");
  });

  it("returns action-failed and does NOT change status when the control isn't found", async () => {
    const { dir, root } = setup();
    const cdp = new FakeCDP({ clickFails: true });
    const res = await runMarkSold(root, "ad", { yes: true }, { connect: async () => cdp as never });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("action-failed");
    expect(parseAnnonce(dir).status).toBe("published"); // local state not corrupted
  });
});

describe("runDeactivate / runReactivate", () => {
  it("pauses a published ad, then reactivates it", async () => {
    const { dir, root } = setup();
    const off = await runDeactivate(root, "ad", { yes: true }, { connect: async () => new FakeCDP() as never });
    expect(off.ok).toBe(true);
    expect(parseAnnonce(dir).status).toBe("paused");
    expect(parseAnnonce(dir).paused_at).toBeTruthy();

    const on = await runReactivate(root, "ad", { yes: true }, { connect: async () => new FakeCDP() as never });
    expect(on.ok).toBe(true);
    expect(parseAnnonce(dir).status).toBe("published");
  });

  it("refuses to reactivate an ad that is not paused", async () => {
    const { root } = setup(); // status published
    await expect(runReactivate(root, "ad", { yes: true }, { connect: async () => new FakeCDP() as never })).rejects.toThrow(/expected paused/);
  });
});

describe("runRenew", () => {
  it("bumps a published ad without changing its status", async () => {
    const { dir, root } = setup();
    const res = await runRenew(root, "ad", { yes: true }, { connect: async () => new FakeCDP() as never });
    expect(res.ok).toBe(true);
    expect(parseAnnonce(dir).status).toBe("published");
  });
});

describe("runEdit", () => {
  it("opens the edit form, re-fills it, screenshots, and submits with --yes", async () => {
    const { dir, root } = setup();
    const cdp = new FakeCDP();
    const res = await runEdit(root, "ad", { yes: true }, { connect: async () => cdp as never });
    expect(res.ok).toBe(true);
    expect(cdp.clicks).toBeGreaterThanOrEqual(2); // open edit + save
    expect(existsSync(join(dir, "edit-preview.png"))).toBe(true);
    expect(parseAnnonce(dir).status).toBe("published"); // edit keeps it published
  });

  it("returns action-failed when the modify form never opens (does not fill the wrong page)", async () => {
    const { root } = setup();
    const cdp = new FakeCDP({ clickFails: true });
    const res = await runEdit(root, "ad", { yes: true }, { connect: async () => cdp as never });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("action-failed");
  });
});
