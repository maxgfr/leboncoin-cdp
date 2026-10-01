/**
 * The CDP delete engine. Navigates to the published ad (using its stored
 * leboncoin_id/url), clicks the delete control (ad page, « … » menu, or the ad's
 * card on « mes annonces ») + confirmation, and marks the annonce deleted locally
 * ONLY with proof: a deletion message, or the ad page reloaded and gone. Without
 * proof the result is `unconfirmed` and annonce.md is left untouched.
 * Confirms on the terminal unless `--yes`.
 *
 * Like publish, the connection and the y/N prompt are injectable so tests run
 * with a fake CDP client, no browser, no stdin.
 */
import path from "node:path";
import readline from "node:readline";
import { ensureLoggedIn } from "./auth";
import type { CDPClient } from "./cdp";
import { isOnCaptcha, waitForCaptchaResolution } from "./captcha";
import { logger } from "./logger";
import { clickManageControl, confirmIfAsked, proveOutcome } from "./manage-actions";
import { parseAnnonce, writeAnnonce } from "./markdown";
import { captureScreenshot } from "./screenshot";
import { MANAGE } from "./selectors";

export interface DeleteOptions {
  yes?: boolean;
}

export interface DeleteDeps {
  connect: (url: string) => Promise<CDPClient>;
  confirm: (question: string) => Promise<boolean>;
}

export interface DeleteResult {
  ok: boolean;
  /** `unconfirmed`: clicked, but no proof the ad is gone — local status unchanged. */
  reason?: "aborted" | "not-published" | "login-required" | "control-not-found" | "unconfirmed";
  /** How the deletion was proven (confirmation-text / ad-page-gone). */
  proof?: string;
  previewPng?: string;
}

async function defaultConnect(url: string): Promise<CDPClient> {
  const { connectAndNavigate } = await import("./browser");
  return connectAndNavigate(url);
}

function promptYesNo(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

export async function runDelete(annoncesDir: string, slug: string, opts: DeleteOptions = {}, deps: Partial<DeleteDeps> = {}): Promise<DeleteResult> {
  const dir = path.join(annoncesDir, slug);
  const a = parseAnnonce(dir);
  if (a.status !== "published" || !a.leboncoin_id) {
    throw new Error(`annonce "${slug}" is not published (no leboncoin_id) — nothing to delete`);
  }

  if (!opts.yes) {
    const confirm = deps.confirm ?? promptYesNo;
    const yes = await confirm(`Delete "${a.title}" (${a.leboncoin_url ?? a.leboncoin_id}) from Leboncoin? [y/N] `);
    if (!yes) {
      logger.info("Aborted — nothing deleted.");
      return { ok: false, reason: "aborted" };
    }
  }

  const connect = deps.connect ?? defaultConnect;
  const target = a.leboncoin_url || MANAGE.adUrl(a.leboncoin_id);
  const cdp = await connect(target);
  try {
    if (await isOnCaptcha(cdp)) await waitForCaptchaResolution(cdp);

    // Pre-flight auth check (delete previously did none): a dead session would
    // otherwise just "fail to find the delete control" with no clear reason.
    const auth = await ensureLoggedIn(cdp);
    if (!auth.ok) {
      logger.error("Not logged in to Leboncoin — run `login`, then retry.");
      return { ok: false, reason: "login-required" };
    }

    if (!(await clickManageControl(cdp, a.leboncoin_id, MANAGE.deleteButton))) {
      // Don't mark the ad deleted locally when we never even found the control —
      // that would desync local state from a still-live ad.
      logger.error(`Delete control not found — open « mes annonces » (${MANAGE.listingUrl}) and delete it manually.`);
      return { ok: false, reason: "control-not-found" };
    }
    await confirmIfAsked(cdp, MANAGE.confirmButton);

    // Proof first: a deletion message, else re-open the ad page and require it to be gone.
    const proof = await proveOutcome(cdp, { markers: MANAGE.deletedMarkers, reloadUrl: target, goneMarkers: MANAGE.goneMarkers });
    if (!proof) {
      const png = path.join(dir, "delete-unconfirmed.png");
      const previewPng = (await captureScreenshot(cdp, png)) ? png : undefined;
      logger.warn(`Clicked delete, but Leboncoin showed no proof the ad is gone — "${slug}" stays "published" locally. Check ${previewPng ?? "the browser"}.`);
      return { ok: false, reason: "unconfirmed", previewPng };
    }

    a.status = "deleted";
    a.deleted_at = new Date().toISOString();
    writeAnnonce(dir, a);
    logger.success(`Leboncoin confirmed the deletion of "${slug}" (${proof}) — marked deleted locally.`);
    return { ok: true, proof };
  } finally {
    cdp.disconnect();
  }
}
