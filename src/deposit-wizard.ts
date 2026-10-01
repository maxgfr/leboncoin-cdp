/**
 * The deposit-wizard driver: fills a multi-step form step by step, by MEANING.
 *
 * Live (2026-10) « Déposer une annonce » is a wizard — title + category, then
 * photos + category attributes, then a final review whose « Continuer » SUBMITS
 * the ad. Each loop iteration:
 *   1. waits for the page, clears a captcha, checks the session;
 *   2. introspects the live controls (form-introspect.ts), matches them to the
 *      annonce (field-match.ts) and fills each one by type (deposit-form.ts);
 *      uploads the photos when a file input shows up; picks the category card
 *      when the site offers them (it then advances on its own);
 *   3. records the step (form map + fills) and a `shots/step-NN.png`;
 *   4. STOPS on the final step — recognised by its content (finalStepMarkers /
 *      an explicit publish button), never by the button label alone — and NEVER
 *      clicks past it: submitting stays the human's (or --yes's) decision;
 *   5. STOPS when a required control is still empty (→ `missing[]`, "ask the user");
 *   6. otherwise clicks « Continuer » and verifies the step fingerprint changed
 *      (else reads the form error and stops as `stuck`).
 * Bounded by `maxSteps`.
 */
import { isOnCaptcha, waitForCaptchaResolution } from "./captcha";
import type { CDPClient } from "./cdp";
import { clickButton, countElements, currentUrl, fillField, hasButton, pageHasText, uploadPhotos } from "./deposit-form";
import { type MatchVia, isFieldFilled, matchFields, pickCategoryCard, valueAlreadySet } from "./field-match";
import { type FormMap, introspectForm } from "./form-introspect";
import { logger } from "./logger";
import { readFormError } from "./readiness";
import type { ShotLog } from "./screenshot";
import { type ButtonSelector, DEPOSIT } from "./selectors";
import type { Annonce } from "./types";
import { delay } from "./utils";

export interface WizardOptions {
  /** Absolute photo paths to upload when a file input appears ([] = never upload, e.g. edit). */
  photos: string[];
  maxSteps?: number;
  shotLog?: ShotLog;
  /** Visible text that marks the last step (default DEPOSIT.finalStepMarkers). */
  finalMarkers?: string[];
  /** Buttons whose presence marks the last step (default DEPOSIT.publishButton). */
  finalButtons?: ButtonSelector[];
  /** The "next step" control (default DEPOSIT.nextButton). */
  nextButton?: ButtonSelector;
  /** Pause after each navigation so the SPA settles (ms). */
  settleMs?: number;
}

export interface StepFill {
  /** Logical field name or `attr:<key>`. */
  target: string;
  /** The control's label (or key). */
  field: string;
  value: string;
  ok: boolean;
  via: MatchVia | "category";
  /** "already" when the control already held the value. */
  detail?: string;
  reason?: string;
}

export interface StepRecord {
  index: number;
  title: string;
  url: string;
  fills: StepFill[];
  /** Required controls still empty after filling (label + why). */
  unresolvedRequired: string[];
  final: boolean;
  formMap: FormMap;
}

export type WizardStop = "final" | "missing-required" | "no-next" | "stuck" | "max-steps" | "login-required" | "captcha";

export interface WizardResult {
  steps: StepRecord[];
  stop: WizardStop;
  error?: string;
  uploadedPhotos: number;
  expectedPhotos: number;
  category?: { picked: string; family?: string; guessed: boolean };
  /** Logical fields / attributes successfully written (or already in place), across all steps. */
  written: string[];
  /** Logical fields / attributes a control was found for but the write failed. */
  failed: string[];
  /** annonce attributes no control matched on any step. */
  unmatchedAttributes: string[];
}

interface CategoryCard {
  name: string;
  family?: string;
  ref: string;
}

/** Read the visible category cards (suggestions or tree leaves), tagging each with a ref. */
async function readCategoryCards(cdp: CDPClient): Promise<CategoryCard[]> {
  const cards = await cdp
    .evaluate<CategoryCard[]>(
      `(() => {
        /* category-cards */
        const re = new RegExp(${JSON.stringify(DEPOSIT.categoryAriaPattern.source)}, 'i');
        const visible = (el) => !!(el.offsetParent !== null || (el.getClientRects && el.getClientRects().length));
        const out = [];
        const seen = new Set();
        window.__lbcRefSeq = window.__lbcRefSeq || 0;
        for (const sel of ${JSON.stringify(DEPOSIT.categoryCards)}) {
          let els = [];
          try { els = Array.from(document.querySelectorAll(sel)); } catch (e) { continue; }
          for (const el of els) {
            if (seen.has(el) || !visible(el)) continue;
            seen.add(el);
            const m = (el.getAttribute('aria-label') || '').match(re);
            if (!m) continue;
            let ref = el.getAttribute('data-lbc-ref');
            if (!ref) { ref = 'c' + (++window.__lbcRefSeq); el.setAttribute('data-lbc-ref', ref); }
            out.push({ name: m[1].trim(), family: m[2].trim(), ref });
          }
        }
        return out;
      })()`,
      false,
    )
    .catch(() => []);
  return Array.isArray(cards) ? cards : [];
}

async function clickRef(cdp: CDPClient, ref: string): Promise<boolean> {
  return cdp
    .evaluate<boolean>(`(() => { const el = document.querySelector('[data-lbc-ref="${ref}"]'); if (!el) return false; el.click(); return true; })()`, false)
    .catch(() => false);
}

/**
 * When the page offers category cards, click the one matching the annonce's
 * category (else the site's first suggestion, flagged `guessed`). With no
 * suggestion on screen, `allowTree` opens the category tree and picks a leaf the
 * same way. Returns the choice, or null when no category UI is shown.
 */
async function chooseCategory(cdp: CDPClient, wanted: string, allowTree: boolean): Promise<{ picked: string; family?: string; guessed: boolean } | null> {
  let cards = await readCategoryCards(cdp);
  if (cards.length === 0 && allowTree && (await clickButton(cdp, DEPOSIT.categoryTreeButton))) {
    await delay(800);
    cards = await readCategoryCards(cdp);
  }
  if (cards.length === 0) return null;
  const pick = pickCategoryCard(cards, wanted);
  const card = cards[pick.index];
  if (!card || !(await clickRef(cdp, card.ref))) return null;
  return { picked: card.name, family: card.family, guessed: pick.guessed || !wanted };
}

async function isFinalStep(cdp: CDPClient, markers: string[], buttons: ButtonSelector[]): Promise<boolean> {
  if (markers.length && (await pageHasText(cdp, markers))) return true;
  for (const b of buttons) if (await hasButton(cdp, b)) return true;
  return false;
}

/** A placeholder annonce with every core value set: used to ask "which core fields are on this step?". */
const PROBE_ANNONCE: Annonce = {
  slug: "probe",
  title: "x",
  category: "x",
  price: 1,
  zipcode: "75001",
  attributes: {},
  photos: [],
  status: "draft",
  description: "x",
};

/**
 * Structural final-step guard, independent of any wording: the last step is a
 * review that shows the core fields TOGETHER (title, description, price,
 * address), while earlier steps show one or two of them. Three or more on one
 * step = final review — so the wizard still stops if the site rewords its
 * « avant de publier » text.
 */
export function looksLikeFinalReview(map: FormMap): boolean {
  const core = new Set(["title", "description", "price", "location"]);
  const onStep = matchFields(map, PROBE_ANNONCE)
    .matches.map((m) => (m.target.kind === "logical" ? m.target.name : ""))
    .filter((n) => core.has(n));
  return new Set(onStep).size >= 3;
}

function describe(f: FormMap["fields"][number]): string {
  return f.label || f.altLabels?.[0] || f.key;
}

/** Drive the wizard from the current page. Never throws for site reasons; see WizardResult.stop. */
export async function runWizard(cdp: CDPClient, a: Annonce, opts: WizardOptions): Promise<WizardResult> {
  const maxSteps = opts.maxSteps ?? 15;
  const settle = opts.settleMs ?? 1_500;
  const finalMarkers = opts.finalMarkers ?? DEPOSIT.finalStepMarkers;
  const finalButtons = opts.finalButtons ?? [DEPOSIT.publishButton];
  const nextButton = opts.nextButton ?? DEPOSIT.nextButton;

  const result: WizardResult = {
    steps: [],
    stop: "max-steps",
    uploadedPhotos: 0,
    expectedPhotos: opts.photos.length,
    written: [],
    failed: [],
    unmatchedAttributes: Object.keys(a.attributes ?? {}),
  };
  const written = new Set<string>();
  const failed = new Set<string>();
  let categoryAttempts = 0;

  for (let index = 1; index <= maxSteps; index++) {
    await delay(settle);
    if (await isOnCaptcha(cdp)) {
      if (!(await waitForCaptchaResolution(cdp))) {
        result.stop = "captcha";
        break;
      }
    }
    const url = await currentUrl(cdp);
    if (url && DEPOSIT.loginUrlPattern.test(url)) {
      result.stop = "login-required";
      break;
    }

    // ── fill pass ──
    const fills: StepFill[] = [];
    const map = await introspectForm(cdp);
    const { matches, unmatchedAttributes } = matchFields(map, a);
    result.unmatchedAttributes = result.unmatchedAttributes.filter((k) => unmatchedAttributes.includes(k));
    for (const m of matches) {
      const target = m.target.kind === "logical" ? m.target.name : `attr:${m.target.key}`;
      if (target === "photos") continue;
      const label = describe(m.field);
      if (valueAlreadySet(m.field, m.value)) {
        fills.push({ target, field: label, value: m.value, ok: true, via: m.via, detail: "already" });
        written.add(target);
        continue;
      }
      const r = await fillField(cdp, m.field, m.value, m.hint);
      fills.push({ target, field: label, value: m.value, ok: r.ok, via: m.via, detail: r.detail, reason: r.reason });
      if (r.ok) {
        written.add(target);
        failed.delete(target);
      } else if (!written.has(target)) {
        failed.add(target);
        logger.warn(`Could not set « ${label} » to "${m.value}"${r.reason ? ` (${r.reason}${r.detail ? `: ${r.detail}` : ""})` : ""}.`);
      }
      await delay(300);
    }

    // Photos: once, as soon as a file input exists.
    if (opts.photos.length && result.uploadedPhotos === 0 && map.fields.some((f) => f.type === "file")) {
      result.uploadedPhotos = await uploadPhotos(cdp, DEPOSIT.photoFileInput, opts.photos, DEPOSIT.photoThumbnails);
      if (result.uploadedPhotos < opts.photos.length) {
        // Some flows mount the input only after « Ajouter des photos ».
        if (await clickButton(cdp, DEPOSIT.photoAddButton)) {
          await delay(800);
          result.uploadedPhotos = Math.max(result.uploadedPhotos, await uploadPhotos(cdp, DEPOSIT.photoFileInput, opts.photos, DEPOSIT.photoThumbnails));
        }
      }
      fills.push({
        target: "photos",
        field: "photos",
        value: `${opts.photos.length} file(s)`,
        ok: result.uploadedPhotos >= opts.photos.length,
        via: "type",
        detail: `${result.uploadedPhotos}/${opts.photos.length}`,
      });
      if (result.uploadedPhotos > 0) written.add("photos");
      await delay(1_500); // let thumbnails render
    }

    // Category cards (the site advances by itself once one is clicked).
    if (categoryAttempts < 2) {
      // The tree is only opened when no category is set yet and the step cannot go on without one.
      const allowTree = !written.has("category") && written.has("title") && !(await hasButton(cdp, nextButton));
      const chosen = await chooseCategory(cdp, a.category, allowTree);
      if (chosen) {
        categoryAttempts++;
        result.category = chosen;
        written.add("category");
        fills.push({
          target: "category",
          field: "catégorie",
          value: a.category,
          ok: true,
          via: "category",
          detail: `${chosen.family ?? ""} › ${chosen.picked}`,
        });
        if (chosen.guessed) logger.warn(`Category « ${a.category || "(none)"} » not offered — picked the site's suggestion « ${chosen.picked} ». Check it.`);
        await delay(settle);
        const after = await introspectForm(cdp);
        if (after.step?.fingerprint !== map.step?.fingerprint) {
          result.steps.push({ index, title: map.step?.title ?? "", url, fills, unresolvedRequired: [], final: false, formMap: map });
          await opts.shotLog?.shot(cdp, `step-${String(index).padStart(2, "0")}`);
          continue; // auto-advanced to the next step
        }
      }
    }

    // ── record the step ──
    const filledMap = await introspectForm(cdp);
    // A required photo input is satisfied by thumbnails on the page (ours, or the ad's existing ones on edit).
    const photosOk = result.uploadedPhotos > 0 || (await countElements(cdp, DEPOSIT.photoThumbnails)) > 0;
    const unresolvedRequired = filledMap.fields
      .filter((f) => f.required && !(f.type === "file" ? photosOk : isFieldFilled(f)))
      .map((f) => `${describe(f)} (required on the live form — ${f.requiredSource ?? "required"})`);
    const final = looksLikeFinalReview(filledMap) || (await isFinalStep(cdp, finalMarkers, finalButtons));
    result.steps.push({ index, title: filledMap.step?.title ?? "", url, fills, unresolvedRequired, final, formMap: filledMap });
    await opts.shotLog?.shot(cdp, `step-${String(index).padStart(2, "0")}`);

    if (final) {
      result.stop = "final";
      break;
    }
    if (unresolvedRequired.length) {
      result.stop = "missing-required";
      break;
    }

    // ── next ──
    // Re-check right before clicking: never click « Continuer » on the final step.
    if (await isFinalStep(cdp, finalMarkers, finalButtons)) {
      result.stop = "final";
      result.steps[result.steps.length - 1]!.final = true;
      break;
    }
    if (!(await clickButton(cdp, nextButton))) {
      result.stop = "no-next";
      break;
    }
    await delay(settle);
    const moved = await introspectForm(cdp);
    if (moved.step?.fingerprint === filledMap.step?.fingerprint && (await currentUrl(cdp)) === url) {
      result.stop = "stuck";
      result.error = (await readFormError(cdp)) ?? "the form did not move to the next step";
      break;
    }
  }

  result.written = [...written];
  result.failed = [...failed].filter((t) => !written.has(t));
  return result;
}
