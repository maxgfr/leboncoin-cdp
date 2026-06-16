/**
 * Login / session verification + cookie attach.
 *
 * Auth is verified with a PASSIVE in-page probe (DOM account markers + visible
 * text + URL-not-on-login) — the same low-detection footprint as captcha.ts, so
 * it is indistinguishable from the site's own JavaScript. We never fire a
 * synthetic authenticated XHR.
 *
 * The reliable way to be logged in is the once-copied real browser profile
 * (~/.lbc-scraper) — see config.ts. Cookie attach (Network.setCookie from an
 * exported cookies.json) is a BEST-EFFORT escape hatch only: DataDome binds the
 * session to the device fingerprint and validates the token server-side, so an
 * injected cookie may set yet still bounce to /connexion. `runAuth` therefore
 * ALWAYS re-probes after attaching and reports the PROBE result, never the
 * set-count.
 *
 * The browser connection is injected via `deps.connect` so tests exercise the
 * whole flow against a fake CDP client with no browser and no config side effects.
 */
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { isOnCaptcha, waitForCaptchaResolution } from "./captcha";
import type { CDPClient } from "./cdp";
import { currentUrl, pageHasText, probeLoggedIn } from "./deposit-form";
import { logger } from "./logger";
import { captureScreenshot } from "./screenshot";
import { AUTH, DEPOSIT } from "./selectors";
import { delay } from "./utils";

export interface AuthState {
  /** A positive logged-in signal was found (account DOM marker or text). */
  loggedIn: boolean;
  /**
   * We are CONFIDENT the session is logged out (on the login page, or a
   * login-required marker is visible). Distinct from `!loggedIn`: the absence of
   * a positive signal is "inconclusive", not "logged out" — so the publish/delete
   * pre-flight only blocks on `loggedOut`, never on mere inconclusiveness.
   */
  loggedOut: boolean;
  /** Which signals fired (e.g. `dom:<selector>`, `text`, `url:login`). */
  signals: string[];
  url: string;
}

export interface AuthResult {
  ok: boolean;
  loggedIn: boolean;
  reason?: "login-required";
  /** Where the auth-state screenshot landed, if captured. */
  screenshot?: string;
  /** Cookies applied via the escape hatch (best-effort; not a success signal). */
  cookiesAttached?: number;
}

export interface AuthOptions {
  /** Attach session cookies from this exported cookies.json before re-checking. */
  cookiesFile?: string;
  /** Where to write the login-state screenshot (default ~/.lbc-scraper/auth-state.png). */
  out?: string;
  /** How long to poll for the user to complete a manual login (default 5 min). */
  timeoutMs?: number;
}

export interface AuthDeps {
  connect: (url: string) => Promise<CDPClient>;
}

/** A cookie to inject (Network.setCookie shape; sensible Leboncoin defaults). */
export interface CookieInput {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  expires?: number;
  sameSite?: "Strict" | "Lax" | "None";
}

const DEFAULT_LOGIN_TIMEOUT_MS = 5 * 60 * 1_000;
const POLL_INTERVAL_MS = 3_000;
const REPROBE_DELAY_MS = 1_500;

async function defaultConnect(url: string): Promise<CDPClient> {
  const { connectAndNavigate } = await import("./browser");
  return connectAndNavigate(url);
}

/**
 * Passively determine whether the current page is a logged-in Leboncoin session.
 * A redirect to the login page is authoritative for "logged out"; otherwise the
 * DOM/text probe decides. Re-probes once after a short hydration delay to avoid a
 * false negative while the account menu is still rendering.
 */
export async function checkLogin(cdp: CDPClient): Promise<AuthState> {
  const url = await currentUrl(cdp);
  if (DEPOSIT.loginUrlPattern.test(url)) return { loggedIn: false, loggedOut: true, signals: ["url:login"], url };

  let probe = await probeLoggedIn(cdp, AUTH);
  if (!probe.loggedIn) {
    await delay(REPROBE_DELAY_MS); // let the account header hydrate before deciding
    probe = await probeLoggedIn(cdp, AUTH);
  }
  if (probe.loggedIn) return { loggedIn: true, loggedOut: false, signals: probe.signals, url };

  // No positive signal: only call it "logged out" if a login-required marker is
  // visible; otherwise it is inconclusive (the pre-flight will allow it through).
  const loggedOut = await pageHasText(cdp, AUTH.loginRequiredTextMarkers);
  return { loggedIn: false, loggedOut, signals: loggedOut ? ["text:login"] : [], url };
}

/**
 * Shared pre-flight used by publish / delete / manage. Blocks ONLY when we are
 * confident the session is logged out — an inconclusive probe is allowed through
 * (the human review gate is the final guard), preserving the prior behavior where
 * only an explicit login redirect stopped the flow.
 */
export async function ensureLoggedIn(cdp: CDPClient): Promise<{ ok: boolean; reason?: "login-required"; state: AuthState }> {
  const state = await checkLogin(cdp);
  return state.loggedOut ? { ok: false, reason: "login-required", state } : { ok: true, state };
}

/** Parse an exported cookies.json (a bare array or `{ cookies: [...] }`). */
export function loadCookiesJson(absPath: string): CookieInput[] {
  const data = JSON.parse(readFileSync(absPath, "utf8"));
  const arr: unknown[] = Array.isArray(data) ? data : Array.isArray((data as { cookies?: unknown[] })?.cookies) ? (data as { cookies: unknown[] }).cookies : [];
  return arr
    .filter(
      (c): c is Record<string, unknown> =>
        !!c && typeof c === "object" && typeof (c as { name?: unknown }).name === "string" && typeof (c as { value?: unknown }).value === "string",
    )
    .map((c) => ({
      name: c.name as string,
      value: c.value as string,
      domain: typeof c.domain === "string" ? c.domain : undefined,
      path: typeof c.path === "string" ? c.path : undefined,
      secure: typeof c.secure === "boolean" ? c.secure : undefined,
      httpOnly: typeof c.httpOnly === "boolean" ? c.httpOnly : undefined,
      expires: typeof c.expires === "number" ? c.expires : typeof c.expirationDate === "number" ? (c.expirationDate as number) : undefined,
      sameSite: c.sameSite === "Strict" || c.sameSite === "Lax" || c.sameSite === "None" ? c.sameSite : undefined,
    }));
}

/**
 * Inject cookies via CDP Network.setCookie (best-effort escape hatch). Returns
 * the count applied — which is NOT a login signal; always re-probe afterwards.
 */
export async function attachCookies(cdp: CDPClient, cookies: CookieInput[]): Promise<number> {
  await cdp.send("Network.enable").catch(() => {});
  let applied = 0;
  for (const c of cookies) {
    const params: Record<string, unknown> = {
      name: c.name,
      value: c.value,
      domain: c.domain ?? ".leboncoin.fr",
      path: c.path ?? "/",
      secure: c.secure ?? true,
      httpOnly: c.httpOnly ?? false,
    };
    if (typeof c.expires === "number") params.expires = c.expires;
    if (c.sameSite) params.sameSite = c.sameSite;
    const res = (await cdp.send("Network.setCookie", params).catch(() => null)) as { success?: boolean } | null;
    if (res?.success === true) applied++;
  }
  return applied;
}

/**
 * The `login` / `auth` command: open the account page, optionally attach cookies,
 * actively verify the session, capture a screenshot the human/agent can read, and
 * — if still logged out — poll while the user logs in manually in the browser.
 */
export async function runAuth(opts: AuthOptions = {}, deps: Partial<AuthDeps> = {}): Promise<AuthResult> {
  const connect = deps.connect ?? defaultConnect;
  const cdp = await connect(AUTH.accountUrl);
  try {
    if (await isOnCaptcha(cdp)) await waitForCaptchaResolution(cdp);

    let cookiesAttached: number | undefined;
    if (opts.cookiesFile) {
      const cookies = loadCookiesJson(opts.cookiesFile);
      cookiesAttached = await attachCookies(cdp, cookies);
      logger.warn(`Attached ${cookiesAttached}/${cookies.length} cookie(s) — best-effort only; DataDome may still reject. Re-checking…`);
      await cdp.send("Page.navigate", { url: AUTH.accountUrl }).catch(() => {});
      await delay(REPROBE_DELAY_MS);
    }

    let state = await checkLogin(cdp);

    if (!state.loggedIn) {
      logger.warn("Not logged in to Leboncoin — log in once in the opened browser window.");
      const timeout = opts.timeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS;
      const start = Date.now();
      while (Date.now() - start < timeout) {
        await delay(POLL_INTERVAL_MS);
        state = await checkLogin(cdp);
        if (state.loggedIn) break;
      }
    }

    let outPath = opts.out;
    if (!outPath) {
      // Defer the config import (it copies the real browser profile on first run)
      // to the default path only — keeps unit tests free of that side effect.
      const { getAuthStatePath } = await import("./config");
      outPath = getAuthStatePath();
    }
    mkdirSync(path.dirname(outPath), { recursive: true });
    const screenshot = (await captureScreenshot(cdp, outPath)) ? outPath : undefined;

    if (state.loggedIn) {
      logger.success(`Logged in to Leboncoin${state.signals.length ? ` (${state.signals.join(", ")})` : ""}.`);
      if (screenshot) logger.info(`Auth-state screenshot → ${screenshot} (read it to confirm the account is shown).`);
    } else {
      logger.error("Still not logged in. Log in once in the browser, then retry.");
    }

    return {
      ok: state.loggedIn,
      loggedIn: state.loggedIn,
      reason: state.loggedIn ? undefined : "login-required",
      screenshot,
      cookiesAttached,
    };
  } finally {
    cdp.disconnect();
  }
}
