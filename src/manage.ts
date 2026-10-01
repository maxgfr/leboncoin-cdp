/**
 * Listing-lifecycle engine: edit / renew (bump) / mark-sold / deactivate /
 * reactivate. Each is a thin CDP click-flow mirroring delete.ts — connect to the
 * ad, run the same pre-flight auth check, find the control (ad page, « … » menu,
 * or the ad's card on « mes annonces »), confirm if asked, then transition the
 * local status ONLY when the site proves it happened (confirmation text or the
 * opposite control appearing). Otherwise the result is `unconfirmed` and
 * annonce.md is left untouched, with a screenshot to look at.
 *
 * `edit` re-opens the modify form and drives it with the same wizard as publish
 * (deposit-wizard.ts), leaving the human to save unless --yes.
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
import { clickButton, clickButtonOrMenu, hasButton } from "./deposit-form";
import { logger } from "./logger";
import { type OutcomeProof, clickManageControl, confirmIfAsked, proveOutcome } from "./manage-actions";
import { parseAnnonce, writeAnnonce } from "./markdown";
import { fillForm } from "./publish";
import { captureScreenshot } from "./screenshot";
import { type ButtonSelector, DEPOSIT, MANAGE } from "./selectors";
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
  /** `unconfirmed`: the control was clicked but the site showed no proof — local status unchanged. */
  reason?: "aborted" | "login-required" | "action-failed" | "unconfirmed";
  /** How the outcome was proven (confirmation-text / control-flipped / ad-page-gone). */
  proof?: string;
  previewPng?: string;
  /** edit: required fields the agent should ask the user about. */
  missing?: string[];
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

/**
 * Click a lifecycle control, confirm if asked, then require PROOF. On proof,
 * `apply` updates the annonce and it is written; otherwise nothing changes.
 */
async function lifecycle(
  cdp: CDPClient,
  a: Annonce,
  dir: string,
  label: string,
  button: ButtonSelector,
  proof: OutcomeProof,
  apply: (a: Annonce) => void,
): Promise<ManageResult> {
  // Never transition local status when the control wasn't found — that would
  // desync local state from a still-published ad.
  if (!(await clickManageControl(cdp, a.leboncoin_id as string, button))) {
    logger.error(`${label} control not found — do it manually in « mes annonces » (${MANAGE.listingUrl}).`);
    return { ok: false, reason: "action-failed" };
  }
  await confirmIfAsked(cdp, MANAGE.manageConfirmButton);
  const how = await proveOutcome(cdp, proof);
  if (!how) {
    const png = path.join(dir, "manage-unconfirmed.png");
    const previewPng = (await captureScreenshot(cdp, png)) ? png : undefined;
    logger.warn(`${label}: clicked, but Leboncoin showed no confirmation — local status left as "${a.status}". Check ${previewPng ?? "the browser"}.`);
    return { ok: false, reason: "unconfirmed", previewPng };
  }
  apply(a);
  writeAnnonce(dir, a);
  logger.success(`${label}: confirmed by Leboncoin (${how}).`);
  return { ok: true, proof: how };
}

export async function runMarkSold(annoncesDir: string, slug: string, opts: ManageOptions = {}, deps: Partial<ManageDeps> = {}): Promise<ManageResult> {
  return withAd(
    annoncesDir,
    slug,
    opts,
    deps,
    { allow: ["published", "paused"], confirm: (a) => `Mark "${a.title}" as sold on Leboncoin? [y/N] ` },
    (cdp, a, dir) =>
      lifecycle(cdp, a, dir, "Mark-sold", MANAGE.markSoldButton, { markers: MANAGE.soldMarkers }, (x) => {
        x.status = "sold";
        x.sold_at = new Date().toISOString();
      }),
  );
}

export async function runRenew(annoncesDir: string, slug: string, opts: ManageOptions = {}, deps: Partial<ManageDeps> = {}): Promise<ManageResult> {
  return withAd(annoncesDir, slug, opts, deps, { allow: ["published"], confirm: (a) => `Renew / bump "${a.title}" on Leboncoin? [y/N] ` }, async (cdp, a) => {
    if (!(await clickManageControl(cdp, a.leboncoin_id as string, MANAGE.renewButton))) {
      logger.warn("Renew control not found — bump it manually in « mes annonces ».");
      return { ok: false, reason: "action-failed" };
    }
    await confirmIfAsked(cdp, MANAGE.manageConfirmButton);
    logger.success(`Requested a bump for "${slug}" (status unchanged — a bump may lead to a paid option page: finish or cancel it in the browser).`);
    return { ok: true };
  });
}

export async function runDeactivate(annoncesDir: string, slug: string, opts: ManageOptions = {}, deps: Partial<ManageDeps> = {}): Promise<ManageResult> {
  return withAd(annoncesDir, slug, opts, deps, { allow: ["published"], confirm: (a) => `Deactivate (pause) "${a.title}"? [y/N] ` }, (cdp, a, dir) =>
    lifecycle(cdp, a, dir, "Deactivate", MANAGE.deactivateButton, { markers: MANAGE.pausedMarkers, flippedTo: MANAGE.reactivateButton }, (x) => {
      x.status = "paused";
      x.paused_at = new Date().toISOString();
    }),
  );
}

export async function runReactivate(annoncesDir: string, slug: string, opts: ManageOptions = {}, deps: Partial<ManageDeps> = {}): Promise<ManageResult> {
  return withAd(annoncesDir, slug, opts, deps, { allow: ["paused"], confirm: (a) => `Reactivate "${a.title}"? [y/N] ` }, (cdp, a, dir) =>
    lifecycle(cdp, a, dir, "Reactivate", MANAGE.reactivateButton, { markers: MANAGE.reactivatedMarkers, flippedTo: MANAGE.deactivateButton }, (x) => {
      x.status = "published";
      x.paused_at = undefined;
    }),
  );
}

export async function runEdit(annoncesDir: string, slug: string, opts: ManageOptions = {}, deps: Partial<ManageDeps> = {}): Promise<ManageResult> {
  // No confirm: semi-auto edit prefills the modify form and lets the human save.
  return withAd(annoncesDir, slug, opts, deps, { allow: ["published", "paused"] }, async (cdp, a, dir) => {
    // Bail before filling if the modify form never opened — otherwise we'd fill
    // the (still-showing) ad view page and falsely report success.
    if (!(await clickButtonOrMenu(cdp, MANAGE.editButton, MANAGE.overflowMenu))) {
      logger.error("Edit control not found — open the ad and click « Modifier » manually.");
      return { ok: false, reason: "action-failed" };
    }
    await delay(2_000);
    // Same wizard as publish; photos are NOT re-uploaded (they are already on the ad).
    const report = await fillForm(cdp, a, [], undefined, { finalButtons: [MANAGE.saveButton, DEPOSIT.publishButton] });

    let previewPng: string | undefined;
    if (opts.screenshot !== false) {
      const png = path.join(dir, "edit-preview.png");
      if (await captureScreenshot(cdp, png)) previewPng = png;
    }
    if (report.missing.length) logger.warn(`Check before saving: ${report.missing.join(", ")}`);
    for (const w of report.warnings ?? []) logger.warn(w);

    if (opts.yes) {
      if (report.wizard?.stop !== "final") {
        logger.error(`The edit form did not reach its last step (${report.wizard?.stop}) — review it and save yourself.`);
        return { ok: false, reason: "action-failed", previewPng, missing: report.missing };
      }
      const save = (await hasButton(cdp, MANAGE.saveButton)) ? MANAGE.saveButton : DEPOSIT.nextButton;
      if (!(await clickButton(cdp, save))) {
        logger.error("Save control not found — review the prefilled form and click « Enregistrer » yourself.");
        return { ok: false, reason: "action-failed", previewPng, missing: report.missing };
      }
      logger.success(`Submitted edits for "${slug}".`);
    } else {
      logger.warn("Edit form prefilled. Review it and click « Enregistrer » / « Mettre à jour » yourself.");
    }
    return { ok: true, previewPng, missing: report.missing };
  });
}
