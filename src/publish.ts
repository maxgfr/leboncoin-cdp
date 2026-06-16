/**
 * The CDP publish engine. Opens the deposit form on the logged-in stealth
 * profile, fills every field + uploads photos, captures a screenshot the agent
 * can review, then (semi-auto, the default) waits for the user to review and
 * click « Déposer mon annonce » — which also clears DataDome at submit. `--yes`
 * clicks publish automatically. On success it captures the new ad's list_id/URL
 * and writes them back to the annonce.
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
import { clickButton, currentUrl, firstAdLink, pickSuggestion, resolveSelector, setInputValue, uploadPhotos } from "./deposit-form";
import { type FormMap, introspectForm, writeFormMap } from "./form-introspect";
import { logger } from "./logger";
import { parseAnnonce, resolvePhotoPaths, writeAnnonce } from "./markdown";
import { type PushReadiness, buildReadiness, readFormError, writeReadiness } from "./readiness";
import { ShotLog, type ShotRef, captureElement, captureScreenshot, savePageHtml } from "./screenshot";
import { DEPOSIT, ELEMENT_TARGETS } from "./selectors";
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
  /** Capture the full checkpoint set (00-initial/10-after-category/20-prefilled + element crops). */
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

export interface FillReport {
  fields: FieldFill[];
  /** Required fields the agent should ask the user about (empty in the annonce, or the form field wasn't found). */
  missing: string[];
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
  /** Live form map (every field + required + options) + where it was written. */
  formMap?: FormMap;
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

/** Fill the entire deposit form from the annonce (best-effort, never throws). Returns a FillReport. */
export async function fillForm(cdp: CDPClient, a: Annonce, photos: string[], shotLog?: ShotLog): Promise<FillReport> {
  const fields: FieldFill[] = [];

  // 1. Category first — choosing it mutates the rest of the form, so later
  //    selectors must be resolved AFTER this step.
  let categoryFilled = false;
  if (a.category) {
    const catSel = await resolveSelector(cdp, DEPOSIT.categoryInput);
    if (catSel) {
      categoryFilled = await setInputValue(cdp, DEPOSIT.categoryInput, a.category);
      await delay(1_200);
      await pickSuggestion(cdp, DEPOSIT.suggestionOption, a.category);
      await delay(1_500);
    } else {
      logger.warn("Category field not found — pick the category manually in the browser.");
    }
  }
  fields.push({ field: "category", required: true, hasValue: !!a.category, filled: categoryFilled });
  // Choosing the category mutates the rest of the form — snapshot that state.
  await shotLog?.shot(cdp, "10-after-category");

  // 2. Core text fields.
  const fillText = async (field: string, required: boolean, value: string, candidates: string[]): Promise<void> => {
    if (!value) {
      fields.push({ field, required, hasValue: false, filled: false });
      return;
    }
    const filled = await setInputValue(cdp, candidates, value);
    if (!filled) logger.warn(`Could not fill the ${field} field.`);
    fields.push({ field, required, hasValue: true, filled });
  };

  await fillText("title", true, a.title, DEPOSIT.titleInput);
  await fillText("description", true, a.description, DEPOSIT.descTextarea);
  await fillText("price", true, a.price > 0 ? String(a.price) : "", DEPOSIT.priceInput);

  // 3. Location (zipcode → pick the city suggestion).
  let zipFilled = false;
  if (a.zipcode) {
    zipFilled = await setInputValue(cdp, DEPOSIT.zipcodeInput, a.zipcode);
    if (zipFilled) {
      await delay(1_200);
      await pickSuggestion(cdp, DEPOSIT.suggestionOption, a.city ?? a.zipcode);
    }
  }
  fields.push({ field: "zipcode", required: true, hasValue: !!a.zipcode, filled: zipFilled });

  // 4. Condition + category-specific attributes (optional; unknown keys logged, never fatal).
  if (a.condition) await setInputValue(cdp, DEPOSIT.attrByKey("condition"), a.condition);
  for (const [key, value] of Object.entries(a.attributes ?? {})) {
    const ok = await setInputValue(cdp, DEPOSIT.attrByKey(key), String(value));
    if (!ok) logger.warn(`Attribute "${key}" could not be set automatically — set it manually if needed.`);
  }

  // Shipping / delivery toggle (only when explicitly requested in the annonce).
  if (a.shipping === true) {
    const ok = await clickButton(cdp, DEPOSIT.shippingToggle);
    if (!ok) logger.warn("Could not toggle shipping/delivery — enable it manually if needed.");
  }

  // 5. Photos (the one CDP DOM-domain operation).
  let uploaded = await uploadPhotos(cdp, DEPOSIT.photoFileInput, photos);
  if (uploaded < photos.length) {
    await clickButton(cdp, DEPOSIT.photoAddButton);
    await delay(800);
    uploaded = await uploadPhotos(cdp, DEPOSIT.photoFileInput, photos);
  }
  if (uploaded === 0) logger.warn("Could not upload photos automatically — add them manually in the browser.");
  else logger.info(`Uploaded ${uploaded}/${photos.length} photo(s).`);
  await delay(1_500); // let thumbnails render

  const missing: string[] = [];
  for (const f of fields) {
    if (!f.required) continue;
    if (!f.hasValue) missing.push(`${f.field} (missing in annonce)`);
    else if (!f.filled) missing.push(`${f.field} (form field not found)`);
  }
  if (uploaded < photos.length) missing.push(`photos (${uploaded}/${photos.length} uploaded)`);

  return { fields, missing, uploadedPhotos: uploaded, expectedPhotos: photos.length };
}

function logFillReport(r: FillReport): void {
  logger.info("Field resolution:");
  for (const f of r.fields) {
    const mark = f.filled ? "✓" : f.hasValue ? "✗" : "—";
    const note = !f.hasValue ? " [no value in annonce]" : !f.filled ? " [form field not found]" : "";
    logger.info(`  ${mark} ${f.field}${f.required ? "" : " (optional)"}${note}`);
  }
  logger.info(`  ${r.uploadedPhotos === r.expectedPhotos ? "✓" : "✗"} photos: ${r.uploadedPhotos}/${r.expectedPhotos}`);
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

    // Read-only form map: discover the live fields (incl. category-specific ones)
    // and fold any required-but-empty field into missing[] ADDITIVELY — never a
    // replacement, so the hardcoded core-required set can't silently drop out.
    const formMap = await introspectForm(cdp);
    report.formMap = formMap;
    const formMapPath = path.join(dir, "form-map.json");
    if (writeFormMap(formMapPath, formMap)) report.formMapPath = formMapPath;
    for (const f of formMap.fields) {
      if (!f.required || f.type === "file") continue;
      const filledIn = String(f.value ?? "").trim() !== "" || f.checked === true;
      if (filledIn) continue;
      const label = f.label || f.key;
      if (report.missing.some((m) => m.toLowerCase().includes(label.toLowerCase()))) continue;
      report.fields.push({ field: label, required: true, hasValue: false, filled: false });
      report.missing.push(`${label} (required on the live form — ${f.requiredSource ?? "required"})`);
    }

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
      logger.info("Auto-submitting (--yes)…");
      if (!(await clickButton(cdp, DEPOSIT.publishButton))) {
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
      logger.warn("Form prefilled. Review it in the browser and click « Déposer mon annonce » yourself.");
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
