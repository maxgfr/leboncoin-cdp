/**
 * The CDP publish engine. Opens the deposit wizard on the logged-in stealth
 * profile and drives it step by step (deposit-wizard.ts): fills every step by
 * meaning, uploads photos, clicks « Continuer » between steps and STOPS on the
 * final review without submitting. It captures a screenshot the agent can
 * review, then (semi-auto, the default) waits for the user to review and submit
 * — which also clears DataDome at submit. `--yes` submits automatically, and only
 * from the recognised final step. On success it captures the new ad's
 * list_id/URL and writes them back to the annonce.
 *
 * fillForm returns a FillReport (which fields resolved/were filled, and what is
 * missing) so the agent can ask the user for the gaps. `--diagnostic` saves the
 * screenshot + page HTML + prints the report without submitting; `--strict`
 * refuses to submit while required fields are unresolved/missing.
 *
 * The browser connection is injected via `deps.connect` so tests exercise the
 * full flow against a fake CDP client with no browser and no config side effects
 * (importing ./browser, hence ./config, is deferred to the default path only).
 */
import path from "node:path";
import { ensureLoggedIn } from "./auth";
import type { CDPClient } from "./cdp";
import { isOnCaptcha, waitForCaptchaResolution } from "./captcha";
import { clickButton, currentUrl, firstAdLink, hasButton } from "./deposit-form";
import { type StepFill, type WizardOptions, type WizardStop, runWizard } from "./deposit-wizard";
import { logicalValue } from "./field-match";
import { type FormMap, writeFormMap } from "./form-introspect";
import { logger } from "./logger";
import { parseAnnonce, resolvePhotoPaths, writeAnnonce } from "./markdown";
import { type PushReadiness, buildReadiness, readFormError, writeReadiness } from "./readiness";
import { ShotLog, type ShotRef, captureElement, captureScreenshot, savePageHtml } from "./screenshot";
import { DEPOSIT, ELEMENT_TARGETS, type LogicalFieldName } from "./selectors";
import type { Annonce } from "./types";
import { delay } from "./utils";

export interface PublishOptions {
  /** Fill AND click publish without the manual review pause. */
  yes?: boolean;
  /** Fill the form but submit nothing (debug the field mapping). */
  dryRun?: boolean;
  /** Fill + screenshot + save HTML + print the field report; submit nothing. */
  diagnostic?: boolean;
  /** Refuse to submit while any required field is unresolved/missing. */
  strict?: boolean;
  /** Capture a preview screenshot after filling (default true). */
  screenshot?: boolean;
  /** Capture the full checkpoint set (00-initial / step-NN per wizard step / 20-prefilled + element crops). */
  shots?: boolean;
  /** Max wait for the published ad to appear (default 15 min). */
  timeoutSubmitMs?: number;
}

export interface PublishDeps {
  connect: (url: string) => Promise<CDPClient>;
}

export interface FieldFill {
  field: string;
  required: boolean;
  /** The annonce provided a value for this field. */
  hasValue: boolean;
  /** The value was successfully placed into the form. */
  filled: boolean;
}

/** One wizard step as written to form-map.json. */
export type StepMap = FormMap & { fills: StepFill[]; unresolvedRequired: string[]; final: boolean };

export interface FillReport {
  fields: FieldFill[];
  /** Required fields the agent should ask the user about (empty in the annonce, or the form field wasn't found). */
  missing: string[];
  /** Non-blocking issues worth telling the user (guessed category, unmatched attributes…). */
  warnings?: string[];
  /** How the wizard ended: `final` = parked on the last step, ready for the human to submit. */
  wizard?: { stop: WizardStop; error?: string; steps: number; category?: { picked: string; family?: string; guessed: boolean } };
  uploadedPhotos: number;
  expectedPhotos: number;
  /** Where the preview screenshot/HTML were saved (if any). */
  previewPng?: string;
  previewHtml?: string;
  /** Machine-readable "can we push?" verdict + where it was written. */
  readiness?: PushReadiness;
  readinessPath?: string;
  /** Checkpoint/element screenshots captured during the run. */
  shots?: ShotRef[];
  /** Live form map of the last step reached (every field + required + options). */
  formMap?: FormMap;
  /** Every step the wizard went through (written to form-map.json as `{ steps }`). */
  formMapSteps?: StepMap[];
  formMapPath?: string;
}

export interface PublishResult {
  ok: boolean;
  leboncoin_id?: string;
  leboncoin_url?: string;
  reason?: "login-required" | "dry-run" | "diagnostic" | "incomplete" | "not-published" | "form-error";
  /** Required fields still missing/unresolved (so the agent can ask the user). */
  missing?: string[];
  report?: FillReport;
  error?: string;
}

const DEFAULT_SUBMIT_TIMEOUT_MS = 15 * 60 * 1_000;

async function defaultConnect(url: string): Promise<CDPClient> {
  const { connectAndNavigate } = await import("./browser");
  return connectAndNavigate(url);
}

/** Logical fields reported on, in form order: [logical name, report name, required]. */
const REPORTED_FIELDS: [LogicalFieldName, string, boolean][] = [
  ["category", "category", true],
  ["title", "title", true],
  ["description", "description", true],
  ["price", "price", true],
  ["location", "zipcode", true],
  ["condition", "condition", false],
  ["shipping", "shipping", false],
];

/**
 * Fill the deposit wizard from the annonce (best-effort, never throws): every
 * step is filled by meaning and the wizard advances with « Continuer » until the
 * FINAL step, where it stops without submitting. Returns a FillReport.
 */
export async function fillForm(cdp: CDPClient, a: Annonce, photos: string[], shotLog?: ShotLog, wizardOpts: Partial<WizardOptions> = {}): Promise<FillReport> {
  const wizard = await runWizard(cdp, a, { photos, shotLog, ...wizardOpts });
  const written = new Set(wizard.written);
  const reached = wizard.stop === "final";
  const fields: FieldFill[] = [];
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const [logical, name, required] of REPORTED_FIELDS) {
    const hasValue = logical === "category" ? !!a.category : logicalValue(a, logical) !== null;
    if (!required && !hasValue) continue;
    const filled = written.has(logical);
    fields.push({ field: name, required, hasValue, filled });
    if (!required) {
      if (hasValue && !filled) warnings.push(`${name}: could not be set — set it in the browser if the form offers it`);
      continue;
    }
    if (!hasValue) missing.push(`${name} (missing in annonce)`);
    else if (!filled) missing.push(reached ? `${name} (form field not found)` : `${name} (not reached — wizard stopped: ${wizard.stop})`);
  }
  for (const key of Object.keys(a.attributes ?? {})) {
    fields.push({ field: `attr:${key}`, required: false, hasValue: true, filled: written.has(`attr:${key}`) });
  }

  const last = wizard.steps.at(-1);
  for (const u of last?.unresolvedRequired ?? []) {
    const label = u.split(" (")[0]?.toLowerCase() ?? u;
    if (missing.some((m) => m.toLowerCase().includes(label))) continue;
    fields.push({ field: u.split(" (")[0] ?? u, required: true, hasValue: false, filled: false });
    missing.push(u);
  }
  if (wizard.uploadedPhotos < photos.length) missing.push(`photos (${wizard.uploadedPhotos}/${photos.length} uploaded)`);
  if (wizard.stop === "stuck") missing.push(`step « ${last?.title ?? "?"} » refused to continue: ${wizard.error ?? "unknown error"}`);
  if (wizard.stop === "no-next") missing.push(`step « ${last?.title ?? "?"} »: no « Continuer » button found`);

  if (wizard.category?.guessed)
    warnings.push(`category: « ${a.category || "(none)"} » not offered — the site's suggestion « ${wizard.category.picked} » was picked; check it`);
  for (const k of wizard.unmatchedAttributes) warnings.push(`attribute « ${k} »: no matching field on the form (use a label from form-map.json)`);
  for (const t of wizard.failed) if (t.startsWith("attr:")) warnings.push(`attribute « ${t.slice(5)} »: value not accepted by the form`);

  if (wizard.uploadedPhotos === 0 && photos.length) logger.warn("Could not upload photos automatically — add them manually in the browser.");
  else if (photos.length) logger.info(`Uploaded ${wizard.uploadedPhotos}/${photos.length} photo(s).`);

  return {
    fields,
    missing,
    warnings,
    uploadedPhotos: wizard.uploadedPhotos,
    expectedPhotos: photos.length,
    wizard: { stop: wizard.stop, error: wizard.error, steps: wizard.steps.length, category: wizard.category },
    formMap: last?.formMap,
    formMapSteps: wizard.steps.map((st) => ({ ...st.formMap, fills: st.fills, unresolvedRequired: st.unresolvedRequired, final: st.final })),
  };
}

function logFillReport(r: FillReport): void {
  logger.info("Field resolution:");
  for (const f of r.fields) {
    const mark = f.filled ? "✓" : f.hasValue ? "✗" : "—";
    const note = !f.hasValue ? " [no value in annonce]" : !f.filled ? " [form field not found]" : "";
    logger.info(`  ${mark} ${f.field}${f.required ? "" : " (optional)"}${note}`);
  }
  logger.info(`  ${r.uploadedPhotos === r.expectedPhotos ? "✓" : "✗"} photos: ${r.uploadedPhotos}/${r.expectedPhotos}`);
  if (r.wizard) logger.info(`Wizard: ${r.wizard.steps} step(s), stopped: ${r.wizard.stop}${r.wizard.error ? ` (${r.wizard.error})` : ""}`);
  for (const w of r.warnings ?? []) logger.warn(w);
  if (r.missing.length) logger.warn(`Ask the user about: ${r.missing.join(", ")}`);
}

/** Poll the page until a published-ad URL appears (or timeout). */
async function waitForPublished(cdp: CDPClient, timeoutMs: number): Promise<{ url: string; id: string } | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await delay(2_000);
    if (await isOnCaptcha(cdp)) {
      await waitForCaptchaResolution(cdp);
      continue;
    }
    const href = await currentUrl(cdp);
    for (const re of DEPOSIT.publishedUrlPattern) {
      const m = href.match(re);
      if (m?.[1]) return { url: href, id: m[1] };
    }
    for (const re of DEPOSIT.confirmedUrlPattern) {
      if (re.test(href)) {
        const adHref = await firstAdLink(cdp);
        let id = "";
        for (const r2 of DEPOSIT.publishedUrlPattern) {
          const m = (adHref || href).match(r2);
          if (m?.[1]) {
            id = m[1];
            break;
          }
        }
        return { url: adHref || href, id };
      }
    }
  }
  return null;
}

export async function runPublish(annoncesDir: string, slug: string, opts: PublishOptions = {}, deps: Partial<PublishDeps> = {}): Promise<PublishResult> {
  const dir = path.join(annoncesDir, slug);
  const a = parseAnnonce(dir);
  if (a.status !== "draft") {
    throw new Error(`annonce "${slug}" is "${a.status}", not "draft" — only drafts can be published`);
  }
  const photos = resolvePhotoPaths(dir, a);
  if (photos.length === 0) throw new Error(`annonce "${slug}" has no photos in photos/ to upload`);

  const connect = deps.connect ?? defaultConnect;
  const cdp = await connect(DEPOSIT.startUrl);
  try {
    // Active pre-flight auth check (not just a URL match) so a dead session is an
    // explicit, early signal instead of a mid-flow surprise.
    const auth = await ensureLoggedIn(cdp);
    if (!auth.ok) {
      logger.error("Not logged in to Leboncoin — run `login` (or log in once in the opened browser), then retry.");
      if (opts.screenshot !== false) await captureScreenshot(cdp, path.join(dir, "auth-state.png"));
      return { ok: false, reason: "login-required" };
    }
    if (await isOnCaptcha(cdp)) await waitForCaptchaResolution(cdp);

    const shotLog = new ShotLog(dir);
    if (opts.shots) await shotLog.shot(cdp, "00-initial");

    const report = await fillForm(cdp, a, photos, opts.shots ? shotLog : undefined);
    if (report.wizard?.stop === "login-required") {
      logger.error("The session was logged out during the deposit — run `login`, then retry.");
      return { ok: false, reason: "login-required", report };
    }

    // Preview screenshot (default on) so the agent can SEE the prefilled form.
    if (opts.screenshot !== false) {
      const png = path.join(dir, "publish-preview.png");
      if (await captureScreenshot(cdp, png)) {
        report.previewPng = png;
        logger.info(`Saved form screenshot → ${png} (read it to verify before submitting)`);
      }
    }
    // Extra checkpoint + cheap element crops the agent can verify field-by-field.
    if (opts.shots) {
      await shotLog.shot(cdp, "20-prefilled");
      const shotsDir = path.join(dir, "shots");
      await captureElement(cdp, ELEMENT_TARGETS.price, path.join(shotsDir, "elem-price.png"));
      await captureElement(cdp, ELEMENT_TARGETS.photos, path.join(shotsDir, "elem-photos.png"));
      await captureElement(cdp, ELEMENT_TARGETS.submit, path.join(shotsDir, "elem-submit.png"));
    }

    // Every step's form map (fields, required, options, what was filled) — the
    // agent reads it to fill gaps in annonce.md (labels can be used as attribute keys).
    const formMapPath = path.join(dir, "form-map.json");
    if (writeFormMap(formMapPath, { steps: report.formMapSteps ?? [] })) report.formMapPath = formMapPath;

    // Push-readiness verdict — the machine-readable "can we push?" the agent reads first.
    const href = await currentUrl(cdp);
    const readiness = await buildReadiness(cdp, report, href);
    const readinessPath = path.join(dir, "push-readiness.json");
    if (writeReadiness(readinessPath, readiness)) {
      report.readiness = readiness;
      report.readinessPath = readinessPath;
    }
    logger.info(
      `Push-readiness: ${readiness.ready ? "READY" : "NOT READY"}${readiness.blockers.length ? ` — ${readiness.blockers.join("; ")}` : ""} → ${readinessPath}`,
    );

    if (opts.diagnostic) {
      const htmlPath = path.join(dir, "publish-preview.html");
      if (await savePageHtml(cdp, htmlPath)) report.previewHtml = htmlPath;
      logFillReport(report);
      logger.info("Diagnostic — nothing submitted.");
      return { ok: false, reason: "diagnostic", report, missing: report.missing };
    }

    if (opts.strict && report.missing.length) {
      logger.error(`Strict mode: ${report.missing.length} required field(s) unresolved/missing — not submitting:`);
      for (const m of report.missing) logger.error(`  - ${m}`);
      return { ok: false, reason: "incomplete", report, missing: report.missing };
    }

    if (opts.dryRun) {
      logFillReport(report);
      logger.info("Dry run — form filled, nothing submitted.");
      return { ok: false, reason: "dry-run", report, missing: report.missing };
    }

    if (opts.yes) {
      // Only ever submit from the wizard's FINAL step — never from a step whose
      // « Continuer » merely moves on (or from a page we did not recognise).
      if (report.wizard?.stop !== "final") {
        logger.error(
          `Not on the final step (wizard stopped: ${report.wizard?.stop ?? "unknown"}) — not submitting. Fix: ${report.missing.join(", ") || "see form-map.json"}`,
        );
        return { ok: false, reason: "form-error", error: `wizard stopped before the final step (${report.wizard?.stop})`, report, missing: report.missing };
      }
      logger.info("Auto-submitting (--yes)…");
      const submitControl = (await hasButton(cdp, DEPOSIT.publishButton)) ? DEPOSIT.publishButton : DEPOSIT.nextButton;
      if (!(await clickButton(cdp, submitControl))) {
        // Fail fast instead of waiting 15 min for an ad that was never submitted.
        logger.error("Could not find/click the publish button — review the form and click « Déposer mon annonce » yourself.");
        return { ok: false, reason: "form-error", error: "publish button not found", report, missing: report.missing };
      }
      await delay(1_500);
      const err = await readFormError(cdp);
      if (err) {
        logger.error(`Leboncoin rejected the form: ${err}`);
        return { ok: false, reason: "form-error", error: err, report, missing: report.missing };
      }
    } else {
      if (report.missing.length) logger.warn(`Before submitting, check: ${report.missing.join(", ")}`);
      logger.warn(
        report.wizard?.stop === "final"
          ? "Form prefilled up to the final review. Check it in the browser and submit it yourself (the last « Continuer » / « Déposer »)."
          : `Form prefilled up to « ${report.formMap?.step?.title ?? "the current step"} » — finish the remaining steps and submit in the browser yourself.`,
      );
      logger.info("Waiting for you to publish…");
    }

    const published = await waitForPublished(cdp, opts.timeoutSubmitMs ?? DEFAULT_SUBMIT_TIMEOUT_MS);
    if (!published) {
      logger.warn("Did not detect a published ad before the timeout.");
      report.shots = shotLog.entries();
      return { ok: false, reason: "not-published", report, missing: report.missing };
    }

    // Visual proof the ad is actually live (paired with the captured id/URL).
    if (opts.screenshot !== false) await shotLog.shot(cdp, "30-confirmation");
    report.shots = shotLog.entries();

    a.status = "published";
    a.leboncoin_url = published.url;
    if (published.id) a.leboncoin_id = published.id;
    a.published_at = new Date().toISOString();
    writeAnnonce(dir, a);
    logger.success(`Published: ${published.url}`);
    return { ok: true, leboncoin_id: published.id || undefined, leboncoin_url: published.url, report };
  } finally {
    cdp.disconnect();
  }
}
