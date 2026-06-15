/**
 * CDP-based artifacts for reviewing/diagnosing the deposit form:
 *  - a PNG screenshot of the prefilled form (so the agent can *see* it and the
 *    human can review before submitting — "avec le CDP tu peux screenshot"),
 *  - the page HTML, for authoring/tightening selectors offline.
 * Both reuse the existing CDPClient — no new dependency.
 */
import { writeFileSync } from "node:fs";
import type { CDPClient } from "./cdp";

/**
 * Capture a full-page PNG of the current page and write it to absPath.
 * `captureBeyondViewport` grabs the whole (tall) form, not just the viewport.
 * Returns true on success.
 */
export async function captureScreenshot(cdp: CDPClient, absPath: string): Promise<boolean> {
  try {
    await cdp.send("Page.enable").catch(() => {});
    const res = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    const data = res?.data;
    if (typeof data !== "string" || !data) return false;
    writeFileSync(absPath, Buffer.from(data, "base64"));
    return true;
  } catch {
    return false;
  }
}

/** Save the current page's full HTML to absPath (for offline selector authoring). */
export async function savePageHtml(cdp: CDPClient, absPath: string): Promise<boolean> {
  try {
    const html = await cdp.evaluate<string>("document.documentElement.outerHTML", false);
    if (typeof html !== "string" || !html) return false;
    writeFileSync(absPath, html);
    return true;
  } catch {
    return false;
  }
}
