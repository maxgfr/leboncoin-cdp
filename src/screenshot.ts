/**
 * CDP-based artifacts for reviewing/diagnosing the deposit form and verifying the
 * push end-to-end:
 *  - full-page PNG screenshots (so the agent can *see* the form and the human can
 *    review before submitting — "avec le CDP tu peux screenshot"),
 *  - element-level crops (price field, photo grid, submit button) for cheap,
 *    targeted verification,
 *  - timestamped checkpoint screenshots (ShotLog) across the publish lifecycle,
 *  - the page HTML, for authoring/tightening selectors offline.
 * All reuse the existing CDPClient — no new dependency.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CDPClient } from "./cdp";
import { resolveSelector } from "./deposit-form";

/** A clip rectangle in page coordinates (Page.captureScreenshot `clip`). */
export interface ClipRect {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export interface ShotRef {
  name: string;
  path: string;
}

/**
 * Capture a PNG of the current page and write it to absPath. By default grabs the
 * whole (tall) form via captureBeyondViewport; pass `clip` for an element crop.
 * Returns true on success.
 */
export async function captureScreenshot(cdp: CDPClient, absPath: string, opts: { clip?: ClipRect } = {}): Promise<boolean> {
  try {
    await cdp.send("Page.enable").catch(() => {});
    const params: Record<string, unknown> = { format: "png", captureBeyondViewport: true };
    if (opts.clip) params.clip = opts.clip;
    const res = await cdp.send("Page.captureScreenshot", params);
    const data = res?.data;
    if (typeof data !== "string" || !data) return false;
    writeFileSync(absPath, Buffer.from(data, "base64"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Capture just one element (first matching candidate) by deriving a clip rect from
 * its border box via DOM.getBoxModel. BEST-EFFORT: a missing element or an empty
 * box (off-screen / display:none) returns false rather than throwing — callers
 * degrade to the full-page shot. Reuses the DOM.getDocument→querySelector pattern
 * proven by uploadPhotos.
 */
export async function captureElement(cdp: CDPClient, candidates: string[], absPath: string): Promise<boolean> {
  try {
    const sel = await resolveSelector(cdp, candidates);
    if (!sel) return false;

    await cdp.send("DOM.enable").catch(() => {});
    const doc = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
    const rootId = doc?.root?.nodeId;
    if (!rootId) return false;
    const found = await cdp.send("DOM.querySelector", { nodeId: rootId, selector: sel }).catch(() => null);
    const nodeId = found?.nodeId;
    if (!nodeId) return false;

    const box = await cdp.send("DOM.getBoxModel", { nodeId }).catch(() => null);
    const quad = box?.model?.border as number[] | undefined;
    if (!quad || quad.length < 8) return false;

    const xs = [quad[0], quad[2], quad[4], quad[6]];
    const ys = [quad[1], quad[3], quad[5], quad[7]];
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;
    if (width <= 0 || height <= 0) return false;

    return captureScreenshot(cdp, absPath, { clip: { x, y, width, height, scale: 1 } });
  } catch {
    return false;
  }
}

/**
 * Accumulates named, full-page checkpoint screenshots under `<slugDir>/shots/`
 * (00-initial, 10-after-category, 20-prefilled, 30-confirmation…). Best-effort:
 * a failed capture is simply not recorded.
 */
export class ShotLog {
  private shots: ShotRef[] = [];
  constructor(private slugDir: string) {}

  async shot(cdp: CDPClient, name: string): Promise<void> {
    const dir = join(this.slugDir, "shots");
    mkdirSync(dir, { recursive: true });
    const p = join(dir, `${name}.png`);
    if (await captureScreenshot(cdp, p)) this.shots.push({ name, path: p });
  }

  entries(): ShotRef[] {
    return this.shots;
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
