/**
 * The deposit-wizard driver: fills a multi-step form step by step, by MEANING.
 *
 * Live (2026-11) « Déposer une annonce » is a wizard — title + category, then
 * photos + category attributes (prefilled by Leboncoin from the title), then a
 * final review (description, price, address, delivery) whose « Continuer »
 * PUBLISHES the ad. Each loop iteration:
 *   1. waits for the page, clears a captcha, checks the session;
 *   2. introspects the live controls (form-introspect.ts), matches them to the
 *      annonce (field-match.ts) and fills each one by type (deposit-form.ts) —
 *      a control already showing the annonce value is left as "prefilled", a
 *      different value is overwritten; uploads the photos when a file input
 *      shows up, then fills the controls that render afterwards; picks the
 *      category card when the site offers them (it then advances on its own);
 *   3. re-reads the step and rewrites a value the site changed behind us;
 *      records the step (form map + fills) and a `shots/step-NN.png`;
 *   4. STOPS on the final step — recognised by its content (finalStepFields,
 *      finalStepMarkers, an explicit publish button), never by the button label
 *      alone — and NEVER clicks past it (clickNextStep refuses): submitting stays
 *      the human's (or --yes's) decision;
 *   5. STOPS when a required control is still empty (→ `missing[]`, "ask the user");
 *   6. otherwise clicks « Continuer » and verifies the step fingerprint changed
 *      (else reads the form error and stops as `stuck`).
 * Bounded by `maxSteps`.
 */
import { isOnCaptcha, waitForCaptchaResolution } from "./captcha";
import type { CDPClient } from "./cdp";
import { clickButton, countElements, currentUrl, fillField, hasButton, pageHasText, uploadPhotos } from "./deposit-form";
import { ADDRESS_MIN_OVERLAP, type MatchVia, isFieldFilled, matchFields, pickCategoryCard, pickOption, valueAlreadySet } from "./field-match";
import { type FieldDescriptor, type FormMap, introspectForm } from "./form-introspect";
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
  /** "prefilled" when the control already held the value (Leboncoin's own prefill, or ours). */
  detail?: string;
  reason?: string;
  /** The control's per-page handle (data-lbc-ref), to re-check it after the step settles. */
  ref?: string;
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
  /** Values the site prefilled in controls the annonce says nothing about (« Type » = « Portable »): tell the user. */
  prefilled: string[];
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
async function chooseCategory(cdp: CDPClient, wanted: string, needed: boolean): Promise<{ picked: string; family?: string; guessed: boolean } | null> {
  let cards = await readCategoryCards(cdp);
  // Suggestions are computed server-side from the title and render a few seconds
  // after it is typed (≈2–3 s live): when the step needs a category, wait for them.
  for (let i = 0; needed && cards.length === 0 && i < 12; i++) {
    await delay(750);
    cards = await readCategoryCards(cdp);
  }
  if (cards.length === 0 && needed && (await clickButton(cdp, DEPOSIT.categoryTreeButton))) {
    await delay(800);
    cards = await readCategoryCards(cdp);
  }
  if (cards.length === 0) return null;
  const pick = pickCategoryCard(cards, wanted);
  const card = cards[pick.index];
  if (!card || !(await clickRef(cdp, card.ref))) return null;
  return { picked: card.name, family: card.family, guessed: pick.guessed || !wanted };
}

/** A placeholder annonce with every core value set: used to ask "which core fields are on this step?". */
const PROBE_ANNONCE: Annonce = {
  slug: "probe",
  title: "x",
  category: "x",
  price: 1,
  zipcode: "75001",
  address: "1 rue x",
  attributes: {},
  photos: [],
  status: "draft",
  description: "x",
};

/**
 * Structural final-step guard, independent of any wording: only the last step
 * (the review whose « Continuer » PUBLISHES) shows the description, the price or
 * the address (DEPOSIT.finalStepFields) — earlier steps ask for the title, the
 * category, the photos and the attributes. ANY one of them on a step = final, so
 * the wizard still stops if the site rewords its « avant de publier » text.
 * Returns the logical fields that gave it away ([] = not final).
 */
export function finalReviewSignals(map: FormMap, fields: string[] = DEPOSIT.finalStepFields): string[] {
  const core = new Set(fields);
  const onStep = matchFields(map, PROBE_ANNONCE)
    .matches.map((m) => (m.target.kind === "logical" ? m.target.name : ""))
    .filter((n) => core.has(n));
  return [...new Set(onStep)];
}

export function looksLikeFinalReview(map: FormMap): boolean {
  return finalReviewSignals(map).length > 0;
}

export interface FinalStepOptions {
  finalMarkers?: string[];
  finalButtons?: ButtonSelector[];
}

/**
 * THE final-step test, read fresh from the page: the final-review fields
 * (structural), OR a final-step text (« Un dernier aperçu avant de publier », the
 * « je confirme l'exactitude » footer — accent/case/apostrophe-insensitive), OR an
 * explicit publish button. Any doubt = final: stopping early is safe, publishing
 * is not.
 */
export async function isOnFinalStep(cdp: CDPClient, opts: FinalStepOptions = {}, map?: FormMap): Promise<boolean> {
  const markers = opts.finalMarkers ?? DEPOSIT.finalStepMarkers;
  const buttons = opts.finalButtons ?? [DEPOSIT.publishButton];
  if (looksLikeFinalReview(map ?? (await introspectForm(cdp)))) return true;
  if (markers.length && (await pageHasText(cdp, markers))) return true;
  for (const b of buttons) if (await hasButton(cdp, b)) return true;
  return false;
}

/**
 * Click the wizard's « Continuer » to go to the NEXT step — refused (returns
 * "final") when the page is the final step, whatever mode is running: that
 * « Continuer » publishes the ad, and only `publish --yes` may click it (through
 * its own final-step check). The ONLY place the wizard clicks « Continuer ».
 */
export async function clickNextStep(cdp: CDPClient, next: ButtonSelector, opts: FinalStepOptions = {}): Promise<"clicked" | "final" | "no-next"> {
  if (await isOnFinalStep(cdp, opts)) return "final";
  return (await clickButton(cdp, next)) ? "clicked" : "no-next";
}

/** A paid upsell (« Pack Photos 5,70 € », « Remonter 2,99 € »…): never required, never ticked. */
export function isPaidOption(f: FormMap["fields"][number]): boolean {
  return [f.label, ...(f.altLabels ?? [])].some((l) => /\d\s*(?:[,.]\d{1,2})?\s*€|€\s*\d/.test(l ?? ""));
}

/**
 * Does this empty control block the step? An unchecked checkbox/switch is a
 * valid answer, so it only blocks with an explicit required / aria-required (an
 * asterisk can be a price footnote); a paid option never blocks.
 */
export function blocksStep(f: FormMap["fields"][number]): boolean {
  if (!f.required || isPaidOption(f)) return false;
  if ((f.type === "checkbox" || f.type === "switch") && f.requiredSource === "asterisk") return false;
  return true;
}

function describe(f: FormMap["fields"][number]): string {
  return f.label || f.altLabels?.[0] || f.key;
}

/** Does the control show the annonce value? An address counts when it is the picked suggestion for it. */
function holds(f: FieldDescriptor, target: string, value: string): boolean {
  if (target === "location") return !!String(f.value ?? "").trim() && pickOption([f.value], value, { minOverlap: ADDRESS_MIN_OVERLAP }) === 0;
  return valueAlreadySet(f, value);
}

/** A label without the form's required asterisk (« État* » → « État »). */
function bare(label: string): string {
  return label.replace(/\s*\*\s*$/, "").trim();
}

/** Fields a step shows with a value nobody asked for (Leboncoin prefills them from the title / photos). */
function prefilledUnasked(map: FormMap, matchedRefs: Set<string>): string[] {
  return map.fields
    .filter((f) => f.type !== "file" && !(f.ref && matchedRefs.has(f.ref)) && !isPaidOption(f))
    .filter((f) => (f.type === "checkbox" || f.type === "switch" ? f.checked === true : String(f.value ?? "").trim() !== ""))
    .map((f) => `« ${bare(describe(f))} » = « ${f.type === "checkbox" || f.type === "switch" ? "oui" : String(f.value).trim()} »`);
}

interface StepState {
  fills: StepFill[];
  /** Refs of the controls the annonce targeted on this step. */
  matchedRefs: Set<string>;
  written: Set<string>;
  failed: Set<string>;
}

/**
 * One fill pass over the current controls: each control the annonce targets is
 * left alone when it already shows the value ("prefilled" — Leboncoin prefills
 * attributes from the title), else written by type (a mismatch is overwritten).
 * A target already handled on this step is skipped, so the pass can be re-run
 * when the step renders more controls (attributes appear after the photo upload).
 */
async function fillPass(cdp: CDPClient, a: Annonce, map: FormMap, st: StepState): Promise<string[]> {
  const { matches, unmatchedAttributes } = matchFields(map, a);
  for (const m of matches) {
    const target = m.target.kind === "logical" ? m.target.name : `attr:${m.target.key}`;
    if (target === "photos") continue;
    if (m.field.ref) st.matchedRefs.add(m.field.ref);
    if (st.fills.some((f) => f.target === target && f.ok)) continue;
    if (isPaidOption(m.field)) {
      logger.warn(`Skipped « ${describe(m.field)} »: a paid option is never set automatically.`);
      continue;
    }
    const label = describe(m.field);
    const prior = st.fills.findIndex((f) => f.target === target);
    if (prior >= 0) st.fills.splice(prior, 1);
    if (holds(m.field, target, m.value)) {
      st.fills.push({ target, field: label, value: m.value, ok: true, via: m.via, detail: "prefilled", ref: m.field.ref });
      st.written.add(target);
      st.failed.delete(target);
      continue;
    }
    const r = await fillField(cdp, m.field, m.value, m.hint, { address: target === "location" });
    st.fills.push({ target, field: label, value: m.value, ok: r.ok, via: m.via, detail: r.detail, reason: r.reason, ref: m.field.ref });
    if (r.ok) {
      st.written.add(target);
      st.failed.delete(target);
    } else if (!st.written.has(target)) {
      st.failed.add(target);
      logger.warn(`Could not set « ${label} » to "${m.value}"${r.reason ? ` (${r.reason}${r.detail ? `: ${r.detail}` : ""})` : ""}.`);
    }
    await delay(300);
  }
  return unmatchedAttributes;
}

/**
 * Re-read the step after the fills: a value the site replaced afterwards (a late
 * AI description, a prefill landing after ours) is written once more; still
 * wrong = failed. Returns the fresh map.
 */
async function verifyPass(cdp: CDPClient, st: StepState, settleMs: number): Promise<FormMap> {
  await delay(Math.min(settleMs, 1_000));
  let map = await introspectForm(cdp);
  const drifted = st.fills.filter((f) => {
    if (!f.ok || !f.ref || f.target === "photos" || f.target === "category") return false;
    const now = map.fields.find((x) => x.ref === f.ref);
    return !!now && !holds(now, f.target, f.value);
  });
  if (!drifted.length) return map;
  for (const f of drifted) {
    const now = map.fields.find((x) => x.ref === f.ref);
    if (!now) continue;
    const r = await fillField(cdp, now, f.value, undefined, { address: f.target === "location" });
    f.detail = r.ok ? `rewritten (the site had changed it)${r.detail ? `: ${r.detail}` : ""}` : r.detail;
    f.ok = r.ok;
    f.reason = r.reason;
  }
  await delay(Math.min(settleMs, 1_000));
  map = await introspectForm(cdp);
  for (const f of drifted) {
    const now = map.fields.find((x) => x.ref === f.ref);
    if (now && !holds(now, f.target, f.value)) {
      f.ok = false;
      f.reason = "not-applied";
      f.detail = `the form keeps « ${String(now.value).slice(0, 60)} »`;
    }
    if (f.ok) continue;
    st.written.delete(f.target);
    st.failed.add(f.target);
    logger.warn(`« ${f.field} » did not keep "${f.value.slice(0, 60)}" (${f.detail ?? "changed by the site"}).`);
  }
  return map;
}

/**
 * Wait until the step stops rendering new controls (2 identical reads; ≤ ~8 s).
 * A step showing nothing but the photo input right after an upload is still
 * loading its category attributes (Leboncoin predicts them from the title +
 * photos, seen live 2–10 s): keep waiting for them (≤ ~20 s).
 */
async function settleForm(cdp: CDPClient, before: FormMap, pollMs: number, expectMore = false): Promise<FormMap> {
  let prev = before.step?.fingerprint;
  let map = before;
  let stable = 0;
  const onlyFile = (m: FormMap) => m.fields.every((f) => f.type === "file");
  for (let i = 0; i < 26; i++) {
    const waiting = expectMore && onlyFile(map);
    if ((stable >= 2 && !waiting) || (i >= 10 && !waiting)) break;
    await delay(pollMs);
    map = await introspectForm(cdp);
    stable = map.step?.fingerprint === prev ? stable + 1 : 0;
    prev = map.step?.fingerprint;
  }
  return map;
}

/** Drive the wizard from the current page. Never throws for site reasons; see WizardResult.stop. */
export async function runWizard(cdp: CDPClient, a: Annonce, opts: WizardOptions): Promise<WizardResult> {
  const maxSteps = opts.maxSteps ?? 15;
  const settle = opts.settleMs ?? 1_500;
  const finalOpts: FinalStepOptions = { finalMarkers: opts.finalMarkers, finalButtons: opts.finalButtons };
  const nextButton = opts.nextButton ?? DEPOSIT.nextButton;

  const result: WizardResult = {
    steps: [],
    stop: "max-steps",
    uploadedPhotos: 0,
    expectedPhotos: opts.photos.length,
    written: [],
    failed: [],
    unmatchedAttributes: Object.keys(a.attributes ?? {}),
    prefilled: [],
  };
  const written = new Set<string>();
  const failed = new Set<string>();
  const prefilled = new Set<string>();
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
    const st: StepState = { fills: [], matchedRefs: new Set(), written, failed };
    let map = await introspectForm(cdp);
    const finalAtEntry = await isOnFinalStep(cdp, finalOpts, map);
    const unmatched = (u: string[]) => {
      result.unmatchedAttributes = result.unmatchedAttributes.filter((k) => u.includes(k));
    };
    unmatched(await fillPass(cdp, a, map, st));

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
      st.fills.push({
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

    // The step can keep rendering controls (live 2026-11: the category attributes,
    // prefilled from the title, appear once the photos are in): fill those too.
    const settled = await settleForm(cdp, map, Math.min(settle, 750), result.uploadedPhotos > 0 && st.fills.some((f) => f.target === "photos"));
    if (settled.step?.fingerprint !== map.step?.fingerprint) {
      map = settled;
      unmatched(await fillPass(cdp, a, map, st));
    }

    // Category cards (the site advances by itself once one is clicked) — never on the final step.
    if (categoryAttempts < 2 && !finalAtEntry) {
      // Waits for suggestions / opens the tree only when no category is set yet and the step cannot go on without one.
      const allowTree = !written.has("category") && written.has("title") && !(await hasButton(cdp, nextButton));
      const chosen = await chooseCategory(cdp, a.category, allowTree);
      if (chosen) {
        categoryAttempts++;
        result.category = chosen;
        written.add("category");
        st.fills.push({
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
          result.steps.push({ index, title: map.step?.title ?? "", url, fills: st.fills, unresolvedRequired: [], final: false, formMap: map });
          await opts.shotLog?.shot(cdp, `step-${String(index).padStart(2, "0")}`);
          continue; // auto-advanced to the next step
        }
      }
    }

    // ── verify + record the step ──
    const filledMap = await verifyPass(cdp, st, settle);
    for (const p of prefilledUnasked(filledMap, st.matchedRefs)) prefilled.add(p);
    // A required photo input is satisfied by thumbnails on the page (ours, or the ad's existing ones on edit).
    const photosOk = result.uploadedPhotos > 0 || (await countElements(cdp, DEPOSIT.photoThumbnails)) > 0;
    const unresolvedRequired = filledMap.fields
      .filter((f) => blocksStep(f) && !(f.type === "file" ? photosOk : isFieldFilled(f)))
      .map((f) => `${describe(f)} (required on the live form — ${f.requiredSource ?? "required"})`);
    const final = finalAtEntry || (await isOnFinalStep(cdp, finalOpts, filledMap));
    result.steps.push({ index, title: filledMap.step?.title ?? "", url, fills: st.fills, unresolvedRequired, final, formMap: filledMap });
    await opts.shotLog?.shot(cdp, `step-${String(index).padStart(2, "0")}`);

    if (final) {
      result.stop = "final";
      break;
    }
    if (unresolvedRequired.length) {
      result.stop = "missing-required";
      break;
    }

    // ── next ── (clickNextStep re-checks the page and refuses on the final step)
    const next = await clickNextStep(cdp, nextButton, finalOpts);
    if (next === "final") {
      result.stop = "final";
      result.steps[result.steps.length - 1]!.final = true;
      break;
    }
    if (next === "no-next") {
      result.stop = "no-next";
      break;
    }
    // The next step can take a few seconds to render: give it up to 3 settle periods.
    let moved = filledMap;
    for (let t = 0; t < 3 && moved.step?.fingerprint === filledMap.step?.fingerprint; t++) {
      await delay(settle);
      moved = await introspectForm(cdp);
    }
    if (moved.step?.fingerprint === filledMap.step?.fingerprint && (await currentUrl(cdp)) === url) {
      result.stop = "stuck";
      result.error = (await readFormError(cdp)) ?? "the form did not move to the next step";
      break;
    }
  }

  result.written = [...written];
  result.failed = [...failed].filter((t) => !written.has(t));
  result.prefilled = [...prefilled];
  return result;
}
