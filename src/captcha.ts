/**
 * DataDome / CAPTCHA handling, shared by the scraper and the publish/delete
 * write engine. Extracted from the (previously duplicated) loops in browser.ts
 * and scraper.ts so every CDP flow detects and waits on a challenge the same way.
 *
 * The probe runs in the page context via cdp.evaluate, so it is indistinguishable
 * from the site's own JavaScript — the whole point of the raw-CDP approach.
 */
import type { CDPClient } from "./cdp";
import { logger } from "./logger";
import { delay } from "./utils";

export const CAPTCHA_TIMEOUT_MS = 5 * 60 * 1_000;

/** True if the current page is showing a DataDome / captcha challenge. */
export async function isOnCaptcha(cdp: CDPClient): Promise<boolean> {
  return cdp
    .evaluate<boolean>(`document.body.innerHTML.includes('geo.captcha-delivery') || ` + `!!document.querySelector('iframe[src*="datadome"]')`, false)
    .catch(() => false);
}

/** True once the page is back on leboncoin.fr with no challenge iframe. */
async function isClear(cdp: CDPClient): Promise<boolean> {
  return cdp
    .evaluate<boolean>(
      `window.location.hostname.includes('leboncoin.fr') && ` +
        `!document.querySelector('iframe[src*="captcha"]') && ` +
        `!document.querySelector('iframe[src*="datadome"]') && ` +
        `!document.body.innerHTML.includes('geo.captcha-delivery')`,
      false,
    )
    .catch(() => false);
}

/**
 * Block until the user solves a DataDome challenge in the browser window, or the
 * timeout elapses. Returns true once cleared, false on timeout (callers decide
 * whether a timeout is fatal).
 */
export async function waitForCaptchaResolution(cdp: CDPClient, timeoutMs = CAPTCHA_TIMEOUT_MS): Promise<boolean> {
  logger.warn("CAPTCHA / bot challenge detected — solve it in the browser window");
  logger.info("Waiting up to 5 minutes…");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await delay(3_000);
    if (await isClear(cdp)) {
      logger.success("CAPTCHA resolved — resuming");
      await delay(1_500);
      return true;
    }
  }
  return false;
}
