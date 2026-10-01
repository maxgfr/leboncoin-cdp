/**
 * `inspect` — a READ-ONLY look at the live deposit form. Opens the form on the
 * logged-in profile, enumerates every field of the FIRST wizard step into
 * form-map.json (`{ steps: [ … ] }`: label, type, required + why, options), and
 * saves initial.png + initial.html. Types and submits nothing — so it cannot see
 * the later steps (they only appear once step 1 is filled); `publish --diagnostic`
 * walks every step and stops on the final review without submitting.
 *
 * Connection is injected via deps.connect so it is unit-testable with a fake CDP.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { ensureLoggedIn } from "./auth";
import { isOnCaptcha, waitForCaptchaResolution } from "./captcha";
import type { CDPClient } from "./cdp";
import { type FormMap, introspectForm, summarizeFormMap, writeFormMap } from "./form-introspect";
import { logger } from "./logger";
import { captureScreenshot, savePageHtml } from "./screenshot";
import { DEPOSIT } from "./selectors";

export interface InspectDeps {
  connect: (url: string) => Promise<CDPClient>;
}

export interface InspectResult {
  ok: boolean;
  reason?: "login-required";
  formMap?: FormMap;
  formMapPath?: string;
  previewPng?: string;
  previewHtml?: string;
}

async function defaultConnect(url: string): Promise<CDPClient> {
  const { connectAndNavigate } = await import("./browser");
  return connectAndNavigate(url);
}

export async function runInspect(
  annoncesDir: string,
  slug: string,
  _opts: Record<string, never> = {},
  deps: Partial<InspectDeps> = {},
): Promise<InspectResult> {
  const dir = path.join(annoncesDir, slug);
  const connect = deps.connect ?? defaultConnect;
  const cdp = await connect(DEPOSIT.startUrl);
  try {
    const auth = await ensureLoggedIn(cdp);
    if (!auth.ok) {
      logger.error("Not logged in to Leboncoin — run `login`, then retry.");
      return { ok: false, reason: "login-required" };
    }
    if (await isOnCaptcha(cdp)) await waitForCaptchaResolution(cdp);

    mkdirSync(dir, { recursive: true });
    const formMap = await introspectForm(cdp);
    const formMapPath = path.join(dir, "form-map.json");
    const written = writeFormMap(formMapPath, { steps: [formMap] });
    const previewPng = (await captureScreenshot(cdp, path.join(dir, "initial.png"))) ? path.join(dir, "initial.png") : undefined;
    const previewHtml = (await savePageHtml(cdp, path.join(dir, "initial.html"))) ? path.join(dir, "initial.html") : undefined;

    logger.success(`Live form: ${summarizeFormMap(formMap)}${written ? ` → ${formMapPath}` : ""}`);
    logger.info(
      "Read form-map.json + initial.png. Later steps (photos, attributes, review) only appear once step 1 is filled: run `publish <slug> --diagnostic` to walk them all without submitting.",
    );
    return { ok: true, formMap, formMapPath: written ? formMapPath : undefined, previewPng, previewHtml };
  } finally {
    cdp.disconnect();
  }
}
