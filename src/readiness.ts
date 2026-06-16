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
        const els = Array.from(document.querySelectorAll('[role="alert"], [class*="error" i], [data-qa-id*="error" i]'));
        for (const el of els) {
          const t = (el.innerText || el.textContent || '').trim();
          if (t && el.offsetParent !== null && t.length > 0 && t.length < 200) return t;
        }
        return null;
      })()`,
      false,
    )
    .catch(() => null);
}

/** True/false if the publish button resolves, null if it isn't on the page yet. */
async function isSubmitEnabled(cdp: CDPClient): Promise<boolean | null> {
  const texts = JSON.stringify(DEPOSIT.publishButton.textCandidates.map((t) => t.toLowerCase()));
  const css = JSON.stringify(DEPOSIT.publishButton.css);
  return cdp
    .evaluate<boolean | null>(
      `(() => {
        /* submit-enabled probe */
        const texts = ${texts}, css = ${css};
        let btn = null;
        const all = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]'));
        for (const el of all) {
          const t = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();
          if (t && texts.some((w) => t === w || t.includes(w))) { btn = el; break; }
        }
        if (!btn) { for (const sel of css) { const el = document.querySelector(sel); if (el) { btn = el; break; } } }
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
