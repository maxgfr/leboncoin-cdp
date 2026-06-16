import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Make every delay() instant so the poll loop doesn't slow the suite.
vi.mock("../utils", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, delay: () => Promise.resolve() };
});

import { attachCookies, checkLogin, ensureLoggedIn, loadCookiesJson, runAuth } from "../auth";

/**
 * A fake CDPClient for the auth flow. `loggedIn` forces the DOM probe answer;
 * `loggedInAfter` flips the probe to true once `checkLogin` has been invoked
 * more than N times (each invocation reads location.href exactly once), so we
 * can exercise the "poll until the user logs in" loop deterministically.
 */
class FakeCDP {
  calls: { method: string; params: Record<string, unknown> }[] = [];
  hrefCalls = 0;
  constructor(private opts: { url?: string; loggedIn?: boolean; loggedInAfter?: number } = {}) {}

  async evaluate(expr: string): Promise<unknown> {
    if (expr.includes("location.href")) {
      this.hrefCalls++;
      return this.opts.url ?? "https://www.leboncoin.fr/mes-annonces";
    }
    if (expr.includes("geo.captcha-delivery")) return expr.includes("hostname"); // isOnCaptcha=false
    if (expr.startsWith("!!document.querySelector")) {
      if (typeof this.opts.loggedInAfter === "number") return this.hrefCalls > this.opts.loggedInAfter;
      return this.opts.loggedIn ?? false;
    }
    if (expr.includes("body.innerText")) return false; // pageHasText (text markers)
    return null;
  }

  async send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    this.calls.push({ method, params });
    if (method === "Page.captureScreenshot") return { data: "iVBORw0KGgo=" };
    if (method === "Network.setCookie") return { success: true };
    return {};
  }
  on(): void {}
  once(): Promise<unknown> {
    return Promise.resolve({});
  }
  disconnect(): void {}
}

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "lbc-auth-"));
}

describe("checkLogin", () => {
  it("reports logged-in when an account DOM signal is present", async () => {
    const cdp = new FakeCDP({ loggedIn: true });
    const state = await checkLogin(cdp as never);
    expect(state.loggedIn).toBe(true);
    expect(state.signals.length).toBeGreaterThan(0);
  });

  it("reports logged-out when the URL is the login page (URL is authoritative)", async () => {
    const cdp = new FakeCDP({ url: "https://www.leboncoin.fr/connexion", loggedIn: true });
    const state = await checkLogin(cdp as never);
    expect(state.loggedIn).toBe(false);
    expect(state.signals).toContain("url:login");
  });

  it("reports logged-out when no signal is present", async () => {
    const cdp = new FakeCDP({ loggedIn: false });
    const state = await checkLogin(cdp as never);
    expect(state.loggedIn).toBe(false);
  });
});

describe("ensureLoggedIn", () => {
  it("returns login-required when logged out", async () => {
    const cdp = new FakeCDP({ url: "https://www.leboncoin.fr/connexion" });
    const r = await ensureLoggedIn(cdp as never);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("login-required");
  });

  it("returns ok when logged in", async () => {
    const cdp = new FakeCDP({ loggedIn: true });
    const r = await ensureLoggedIn(cdp as never);
    expect(r.ok).toBe(true);
  });
});

describe("runAuth", () => {
  it("captures an auth-state screenshot and reports logged-in", async () => {
    const out = join(tmp(), "auth.png");
    const cdp = new FakeCDP({ loggedIn: true });
    const r = await runAuth({ out }, { connect: async () => cdp as never });
    expect(r.ok).toBe(true);
    expect(r.loggedIn).toBe(true);
    expect(existsSync(out)).toBe(true);
    expect(cdp.calls.some((c) => c.method === "Page.captureScreenshot")).toBe(true);
  });

  it("polls until the user logs in, then succeeds", async () => {
    const out = join(tmp(), "auth.png");
    const cdp = new FakeCDP({ loggedInAfter: 2 });
    const r = await runAuth({ out, timeoutMs: 10_000 }, { connect: async () => cdp as never });
    expect(r.ok).toBe(true);
  });

  it("reports login-required when still logged out after the timeout", async () => {
    const out = join(tmp(), "auth.png");
    const cdp = new FakeCDP({ loggedIn: false });
    const r = await runAuth({ out, timeoutMs: 0 }, { connect: async () => cdp as never });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("login-required");
  });

  it("attaches cookies from a cookies.json, then re-checks login (probe result, not set-count)", async () => {
    const dir = tmp();
    const out = join(dir, "auth.png");
    const cookiesFile = join(dir, "cookies.json");
    writeFileSync(
      cookiesFile,
      JSON.stringify([
        { name: "datadome", value: "abc" },
        { name: "lbc_session", value: "xyz" },
      ]),
    );
    const cdp = new FakeCDP({ loggedIn: true });
    const r = await runAuth({ out, cookiesFile }, { connect: async () => cdp as never });
    expect(r.cookiesAttached).toBe(2);
    expect(cdp.calls.filter((c) => c.method === "Network.setCookie").length).toBe(2);
  });
});

describe("attachCookies / loadCookiesJson", () => {
  it("issues one Network.setCookie per cookie, scoped to .leboncoin.fr by default", async () => {
    const cdp = new FakeCDP();
    const n = await attachCookies(cdp as never, [
      { name: "a", value: "1" },
      { name: "b", value: "2" },
    ]);
    expect(n).toBe(2);
    const setCalls = cdp.calls.filter((c) => c.method === "Network.setCookie");
    expect(setCalls.every((c) => c.params.domain === ".leboncoin.fr")).toBe(true);
    expect(setCalls.every((c) => c.params.path === "/")).toBe(true);
  });

  it("parses both a bare array and a { cookies: [...] } shape, dropping malformed entries", () => {
    const dir = tmp();
    const f1 = join(dir, "arr.json");
    writeFileSync(f1, JSON.stringify([{ name: "x", value: "1" }, { bad: true }]));
    const a = loadCookiesJson(f1);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ name: "x", value: "1" });

    const f2 = join(dir, "obj.json");
    writeFileSync(f2, JSON.stringify({ cookies: [{ name: "y", value: "2", expirationDate: 123 }] }));
    expect(loadCookiesJson(f2)[0]).toMatchObject({ name: "y", value: "2", expires: 123 });
  });
});
