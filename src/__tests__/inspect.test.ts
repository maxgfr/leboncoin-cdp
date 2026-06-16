import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../utils", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, delay: () => Promise.resolve() };
});

import { runInspect } from "../inspect";

class FakeCDP {
  constructor(private opts: { url?: string; loggedIn?: boolean; fields?: unknown[] } = {}) {}
  async evaluate(expr: string): Promise<unknown> {
    if (expr.includes("introspect-form")) return { url: this.opts.url ?? "https://www.leboncoin.fr/deposer-une-annonce", fields: this.opts.fields ?? [] };
    if (expr.includes("location.href")) return this.opts.url ?? "https://www.leboncoin.fr/deposer-une-annonce";
    if (expr.includes("geo.captcha-delivery")) return expr.includes("hostname");
    if (expr.startsWith("!!document.querySelector")) return this.opts.loggedIn ?? true;
    if (expr.includes("documentElement.outerHTML")) return "<html></html>";
    if (expr.includes("body.innerText")) return false;
    return null;
  }
  async send(method: string): Promise<unknown> {
    if (method === "Page.captureScreenshot") return { data: "iVBORw0KGgo=" };
    return {};
  }
  on(): void {}
  once(): Promise<unknown> {
    return Promise.resolve({});
  }
  disconnect(): void {}
}

function setup(): { dir: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "lbc-inspect-"));
  return { dir: join(root, "ad"), root };
}

describe("runInspect", () => {
  it("writes form-map.json + initial.png/html and returns the map", async () => {
    const { dir, root } = setup();
    const cdp = new FakeCDP({
      fields: [
        { label: "Titre", type: "text", value: "", required: true, requiredSource: "required-attr", name: "subject", selector: 'input[name="subject"]' },
      ],
    });
    const res = await runInspect(root, "ad", {}, { connect: async () => cdp as never });
    expect(res.ok).toBe(true);
    expect(res.formMap?.fields).toHaveLength(1);
    expect(existsSync(join(dir, "form-map.json"))).toBe(true);
    expect(existsSync(join(dir, "initial.png"))).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, "form-map.json"), "utf8")).fields[0].key).toBe("subject");
  });

  it("returns login-required when logged out (and writes nothing)", async () => {
    const { dir, root } = setup();
    const cdp = new FakeCDP({ url: "https://www.leboncoin.fr/connexion" });
    const res = await runInspect(root, "ad", {}, { connect: async () => cdp as never });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("login-required");
    expect(existsSync(join(dir, "form-map.json"))).toBe(false);
  });
});
