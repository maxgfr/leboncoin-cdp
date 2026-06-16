/**
 * Listing-lifecycle engine: edit / renew (bump) / mark-sold / deactivate /
 * reactivate. Each is a thin CDP click-flow mirroring delete.ts — connect to the
 * ad, run the same pre-flight auth check, click the control + confirmation, then
 * transition the local status. `edit` re-opens the modify form and re-runs the
 * shared fillForm (introspection-aware), leaving the human to save.
 *
 * Connection + the y/N prompt are injectable so tests run with a fake CDP client,
 * no browser, no stdin. Every write action confirms (unless --yes) and logs a ToS
 * reminder — the deliberate, overridable guardrail against mass-posting.
 */
import path from "node:path";
import readline from "node:readline";
import { ensureLoggedIn } from "./auth";
import { isOnCaptcha, waitForCaptchaResolution } from "./captcha";
import type { CDPClient } from "./cdp";
import { clickButton } from "./deposit-form";
import { logger } from "./logger";
import { parseAnnonce, resolvePhotoPaths, writeAnnonce } from "./markdown";
import { fillForm } from "./publish";
import { captureScreenshot } from "./screenshot";
import { MANAGE } from "./selectors";
import type { Annonce, AnnonceStatus } from "./types";
import { delay } from "./utils";

const TOS_REMINDER = "Reminder: automating a real account may breach Leboncoin's ToS — pace your actions and don't mass-post.";

export interface ManageOptions {
  yes?: boolean;
  /** edit only: capture an edit-preview screenshot (default true). */
  screenshot?: boolean;
}

export interface ManageDeps {
  connect: (url: string) => Promise<CDPClient>;
  confirm: (question: string) => Promise<boolean>;
}

export interface ManageResult {
  ok: boolean;
  reason?: "aborted" | "login-required" | "action-failed";
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

interface ActionConfig {
  /** Statuses the annonce must be in for this action. */
  allow: AnnonceStatus[];
  /** Confirmation question (omit to skip the prompt — e.g. semi-auto edit). */
  confirm?: (a: Annonce) => string;
}

/** Shared preamble: parse, status guard, confirm, connect, captcha, auth → stage. */
async function withAd(
  annoncesDir: string,
  slug: string,
  opts: ManageOptions,
  deps: Partial<ManageDeps>,
  cfg: ActionConfig,
  stage: (cdp: CDPClient, a: Annonce, dir: string) => Promise<ManageResult>,
): Promise<ManageResult> {
  const dir = path.join(annoncesDir, slug);
  const a = parseAnnonce(dir);
  if (!a.leboncoin_id) throw new Error(`annonce "${slug}" has no leboncoin_id — it was never published`);
  if (!cfg.allow.includes(a.status)) throw new Error(`annonce "${slug}" is "${a.status}" — expected ${cfg.allow.join(" or ")}`);

  if (cfg.confirm && !opts.yes) {
    const ask = deps.confirm ?? promptYesNo;
    if (!(await ask(cfg.confirm(a)))) {
      logger.info("Aborted — nothing changed.");
      return { ok: false, reason: "aborted" };
    }
  }

  logger.warn(TOS_REMINDER);
  const connect = deps.connect ?? defaultConnect;
  const cdp = await connect(a.leboncoin_url || MANAGE.adUrl(a.leboncoin_id));
  try {
    if (await isOnCaptcha(cdp)) await waitForCaptchaResolution(cdp);
    const auth = await ensureLoggedIn(cdp);
    if (!auth.ok) {
      logger.error("Not logged in to Leboncoin — run `login`, then retry.");
      return { ok: false, reason: "login-required" };
    }
    return await stage(cdp, a, dir);
  } finally {
    cdp.disconnect();
  }
}

export async function runMarkSold(annoncesDir: string, slug: string, opts: ManageOptions = {}, deps: Partial<ManageDeps> = {}): Promise<ManageResult> {
  return withAd(
    annoncesDir,
    slug,
    opts,
    deps,
    { allow: ["published", "paused"], confirm: (a) => `Mark "${a.title}" as sold on Leboncoin? [y/N] ` },
    async (cdp, a, dir) => {
      // Never transition local status when the control wasn't found — that would
      // desync local state from a still-published ad.
      if (!(await clickButton(cdp, MANAGE.markSoldButton))) {
        logger.error("Mark-sold control not found — do it manually in mes-annonces.");
        return { ok: false, reason: "action-failed" };
      }
      await delay(1_500);
      await clickButton(cdp, MANAGE.manageConfirmButton);
      await delay(1_500);
      a.status = "sold";
      a.sold_at = new Date().toISOString();
      writeAnnonce(dir, a);
      logger.success(`Marked "${slug}" as sold.`);
      return { ok: true };
    },
  );
}

export async function runRenew(annoncesDir: string, slug: string, opts: ManageOptions = {}, deps: Partial<ManageDeps> = {}): Promise<ManageResult> {
  return withAd(annoncesDir, slug, opts, deps, { allow: ["published"], confirm: (a) => `Renew / bump "${a.title}" on Leboncoin? [y/N] ` }, async (cdp) => {
    if (!(await clickButton(cdp, MANAGE.renewButton))) {
      logger.warn("Renew control not found — bump it manually in mes-annonces.");
      return { ok: false, reason: "action-failed" };
    }
    await delay(1_500);
    await clickButton(cdp, MANAGE.manageConfirmButton);
    await delay(1_000);
    logger.success(`Requested a bump for "${slug}" (status unchanged).`);
    return { ok: true };
  });
}

export async function runDeactivate(annoncesDir: string, slug: string, opts: ManageOptions = {}, deps: Partial<ManageDeps> = {}): Promise<ManageResult> {
  return withAd(annoncesDir, slug, opts, deps, { allow: ["published"], confirm: (a) => `Deactivate (pause) "${a.title}"? [y/N] ` }, async (cdp, a, dir) => {
    if (!(await clickButton(cdp, MANAGE.deactivateButton))) {
      logger.error("Deactivate control not found — pause it manually in mes-annonces.");
      return { ok: false, reason: "action-failed" };
    }
    await delay(1_500);
    await clickButton(cdp, MANAGE.manageConfirmButton);
    await delay(1_000);
    a.status = "paused";
    a.paused_at = new Date().toISOString();
    writeAnnonce(dir, a);
    logger.success(`Paused "${slug}".`);
    return { ok: true };
  });
}

export async function runReactivate(annoncesDir: string, slug: string, opts: ManageOptions = {}, deps: Partial<ManageDeps> = {}): Promise<ManageResult> {
  return withAd(annoncesDir, slug, opts, deps, { allow: ["paused"], confirm: (a) => `Reactivate "${a.title}"? [y/N] ` }, async (cdp, a, dir) => {
    if (!(await clickButton(cdp, MANAGE.reactivateButton))) {
      logger.error("Reactivate control not found — reactivate it manually in mes-annonces.");
      return { ok: false, reason: "action-failed" };
    }
    await delay(1_500);
    await clickButton(cdp, MANAGE.manageConfirmButton);
    await delay(1_000);
    a.status = "published";
    a.paused_at = undefined;
    writeAnnonce(dir, a);
    logger.success(`Reactivated "${slug}".`);
    return { ok: true };
  });
}

export async function runEdit(annoncesDir: string, slug: string, opts: ManageOptions = {}, deps: Partial<ManageDeps> = {}): Promise<ManageResult> {
  // No confirm: semi-auto edit prefills the modify form and lets the human save.
  return withAd(annoncesDir, slug, opts, deps, { allow: ["published", "paused"] }, async (cdp, a, dir) => {
    // Bail before filling if the modify form never opened — otherwise we'd fill
    // the (still-showing) ad view page and falsely report success.
    if (!(await clickButton(cdp, MANAGE.editButton))) {
      logger.error("Edit control not found — open the ad and click « Modifier » manually.");
      return { ok: false, reason: "action-failed" };
    }
    await delay(2_000);
    const photos = resolvePhotoPaths(dir, a);
    const report = await fillForm(cdp, a, photos);

    let previewPng: string | undefined;
    if (opts.screenshot !== false) {
      const png = path.join(dir, "edit-preview.png");
      if (await captureScreenshot(cdp, png)) previewPng = png;
    }
    if (report.missing.length) logger.warn(`Check before saving: ${report.missing.join(", ")}`);

    if (opts.yes) {
      if (!(await clickButton(cdp, MANAGE.saveButton))) {
        logger.error("Save control not found — review the prefilled form and click « Enregistrer » yourself.");
        return { ok: false, reason: "action-failed", previewPng };
      }
      logger.success(`Submitted edits for "${slug}".`);
    } else {
      logger.warn("Edit form prefilled. Review it and click « Enregistrer » / « Mettre à jour » yourself.");
    }
    return { ok: true, previewPng };
  });
}
