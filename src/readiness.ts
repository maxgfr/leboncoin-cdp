/**
 * "Can we push everything?" — a consolidated, machine-readable verdict the agent
 * reads FIRST, instead of parsing the screenshot pixels.
 *
 * It combines the already-built FillReport (required fields + photo count) with a
 * couple of live in-page probes (submit button present & enabled, any visible form
 * error, session not bounced to login). `ready` is ADVISORY — the semi-auto human
 * review gate remains the real guard before « Déposer mon annonce ».
 */
import { writeFileSync } from "node:fs";
import type { CDPClient } from "./cdp";
import type { FillReport } from "./publish";
import { DEPOSIT } from "./selectors";

export interface ReadinessCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface PushReadiness {
  ready: boolean;
  checks: ReadinessCheck[];
  blockers: string[];
}

/**
 * Read a visible form-error message off the page, if any (best-effort). Shared by
 * publish.ts (post-submit) and the readiness probe — kept here so there is one copy.
 */
export async function readFormError(cdp: CDPClient): Promise<string | null> {
  return cdp
    .evaluate<string | null>(
      `(() => {
        const visible = (el) => !!(el.offsetParent !== null || (el.getClientRects && el.getClientRects().length));
        const els = Array.from(document.querySelectorAll('[role="alert"], [aria-live="assertive"], [class*="error" i], [data-qa-id*="error" i], [id$="-error"], [id*="error-message" i]'));
        for (const el of els) {
          const t = (el.innerText || el.textContent || '').trim();
          if (t && visible(el) && t.length < 200) return t;
        }
        return null;
      })()`,
      false,
    )
    .catch(() => null);
}

/**
 * True/false if the submit control resolves, null if it isn't on the page yet.
 * On the live final step the submit control is the wizard's « Continuer », so the
 * explicit publish labels AND the next-step labels are both accepted (exact or
 * word-prefix match only, visible controls only).
 */
async function isSubmitEnabled(cdp: CDPClient): Promise<boolean | null> {
  const norm = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const texts = JSON.stringify([...DEPOSIT.publishButton.textCandidates, ...DEPOSIT.nextButton.textCandidates].map(norm));
  const css = JSON.stringify([...DEPOSIT.publishButton.css, ...DEPOSIT.nextButton.css]);
  return cdp
    .evaluate<boolean | null>(
      `(() => {
        /* submit-enabled probe */
        const texts = ${texts}, css = ${css};
        let btn = null;
        const n = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const visible = (el) => !!(el.offsetParent !== null || (el.getClientRects && el.getClientRects().length));
        const all = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]')).filter(visible);
        for (const w of texts) {
          btn = all.find((el) => { const t = n(el.innerText || el.textContent || el.value); return t === w || t.startsWith(w + ' '); }) || null;
          if (btn) break;
        }
        if (!btn) { for (const sel of css) { const el = Array.from(document.querySelectorAll(sel)).find(visible); if (el) { btn = el; break; } } }
        if (!btn) return null;
        return !btn.disabled && btn.getAttribute('aria-disabled') !== 'true';
      })()`,
      false,
    )
    .catch(() => null);
}

/** Build the push-readiness verdict from the fill report + live page probes. */
export async function buildReadiness(cdp: CDPClient, report: FillReport, href: string): Promise<PushReadiness> {
  const checks: ReadinessCheck[] = [];

  const missingRequired = report.fields.filter((f) => f.required && (!f.hasValue || !f.filled)).map((f) => f.field);
  checks.push({
    name: "required-fields",
    ok: missingRequired.length === 0,
    detail: missingRequired.length ? `missing: ${missingRequired.join(", ")}` : "all required fields filled",
  });

  const photosOk = report.expectedPhotos > 0 && report.uploadedPhotos >= report.expectedPhotos;
  checks.push({ name: "photos", ok: photosOk, detail: `${report.uploadedPhotos}/${report.expectedPhotos} uploaded` });

  const loginOk = !DEPOSIT.loginUrlPattern.test(href);
  checks.push({ name: "login", ok: loginOk, detail: loginOk ? "session active" : "redirected to login" });

  const submit = await isSubmitEnabled(cdp);
  checks.push({
    name: "submit-enabled",
    ok: submit === true,
    detail: submit === null ? "submit button not found" : submit ? "enabled" : "disabled",
  });

  const err = await readFormError(cdp);
  checks.push({ name: "no-form-error", ok: !err, detail: err ? `form error: ${err}` : "no visible error" });

  if (report.wizard) {
    const final = report.wizard.stop === "final";
    checks.push({
      name: "final-step",
      ok: final,
      detail: final
        ? `reached the final review after ${report.wizard.steps} step(s)`
        : `wizard stopped early: ${report.wizard.stop}${report.wizard.error ? ` (${report.wizard.error})` : ""}`,
    });
  }

  const blockers = checks.filter((c) => !c.ok).map((c) => `${c.name} (${c.detail})`);
  return { ready: blockers.length === 0, checks, blockers };
}

/** Persist the readiness verdict to `push-readiness.json` (best-effort). */
export function writeReadiness(absPath: string, readiness: PushReadiness): boolean {
  try {
    writeFileSync(absPath, JSON.stringify(readiness, null, 2));
    return true;
  } catch {
    return false;
  }
}
