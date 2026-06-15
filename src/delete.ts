/**
 * The CDP delete engine. Navigates to the published ad (using its stored
 * leboncoin_id/url), clicks the delete control + confirmation, and marks the
 * annonce deleted locally. Confirms on the terminal unless `--yes`.
 *
 * Like publish, the connection and the y/N prompt are injectable so tests run
 * with a fake CDP client, no browser, no stdin.
 */
import path from "node:path";
import readline from "node:readline";
import type { CDPClient } from "./cdp";
import { isOnCaptcha, waitForCaptchaResolution } from "./captcha";
import { clickButton, pageHasText } from "./deposit-form";
import { logger } from "./logger";
import { parseAnnonce, writeAnnonce } from "./markdown";
import { MANAGE } from "./selectors";
import { delay } from "./utils";

export interface DeleteOptions {
  yes?: boolean;
}

export interface DeleteDeps {
  connect: (url: string) => Promise<CDPClient>;
  confirm: (question: string) => Promise<boolean>;
}

export interface DeleteResult {
  ok: boolean;
  reason?: "aborted" | "not-published";
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

    const clickedDelete = await clickButton(cdp, MANAGE.deleteButton);
    if (!clickedDelete) {
      logger.warn("Delete control not found on the ad page — open mes-annonces and delete it manually.");
    }
    await delay(1_500);
    await clickButton(cdp, MANAGE.confirmButton);
    await delay(2_500);

    const confirmed = await pageHasText(cdp, MANAGE.deletedMarkers);
    if (confirmed) logger.success(`Leboncoin confirmed the deletion of "${slug}".`);

    a.status = "deleted";
    a.deleted_at = new Date().toISOString();
    writeAnnonce(dir, a);
    logger.success(`Marked "${slug}" as deleted locally.`);
    return { ok: true };
  } finally {
    cdp.disconnect();
  }
}
