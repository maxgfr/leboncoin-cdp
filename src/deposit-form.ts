/**
 * Low-level DOM driving for the deposit form, built on the raw CDPClient.
 *
 * Almost everything runs through cdp.evaluate (in-page JS) — the same
 * low-detection footprint the scraper relies on. The single exception is photo
 * upload: a file <input> cannot be populated from page JS for security reasons,
 * so it uses the CDP DOM domain (DOM.setFileInputFiles), the one operation that
 * genuinely needs a node handle.
 *
 * Every helper takes the ORDERED candidate lists from selectors.ts and resolves
 * the first that matches; none contains a literal selector.
 */
import type { CDPClient } from "./cdp";
import type { ButtonSelector } from "./selectors";

/** Return the first candidate selector that matches an element, else null. */
export async function resolveSelector(cdp: CDPClient, candidates: string[]): Promise<string | null> {
  for (const sel of candidates) {
    const found = await cdp.evaluate<boolean>(`!!document.querySelector(${JSON.stringify(sel)})`, false).catch(() => false);
    if (found) return sel;
  }
  return null;
}

/**
 * Set an input/textarea value the way React expects: use the native value
 * setter, then dispatch input/change/blur so controlled components register it.
 */
export async function setInputValue(cdp: CDPClient, candidates: string[], value: string): Promise<boolean> {
  const sel = await resolveSelector(cdp, candidates);
  if (!sel) return false;
  return cdp
    .evaluate<boolean>(
      `(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return false;
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(el, ${JSON.stringify(value)});
        else el.value = ${JSON.stringify(value)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      })()`,
      false,
    )
    .catch(() => false);
}

/** Click the first matching element by CSS selector. */
export async function clickSelector(cdp: CDPClient, candidates: string[]): Promise<boolean> {
  const sel = await resolveSelector(cdp, candidates);
  if (!sel) return false;
  return cdp
    .evaluate<boolean>(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`, false)
    .catch(() => false);
}

/**
 * Click a button/link/role=button whose visible text matches one of `texts`
 * (case-insensitive, exact-or-contains). Falls back to the CSS candidates.
 */
export async function clickByText(cdp: CDPClient, texts: string[], cssFallback: string[] = []): Promise<boolean> {
  const wanted = JSON.stringify(texts.map((t) => t.toLowerCase()));
  const ok = await cdp
    .evaluate<boolean>(
      `(() => {
        const wanted = ${wanted};
        const els = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"]'));
        for (const el of els) {
          if (el.disabled) continue;
          const txt = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();
          if (txt && wanted.some((w) => txt === w || txt.includes(w))) { el.click(); return true; }
        }
        return false;
      })()`,
      false,
    )
    .catch(() => false);
  if (ok) return true;
  return cssFallback.length ? clickSelector(cdp, cssFallback) : false;
}

/** Convenience: click a ButtonSelector (text first, then css). */
export async function clickButton(cdp: CDPClient, button: ButtonSelector): Promise<boolean> {
  return clickByText(cdp, button.textCandidates, button.css);
}

/**
 * Pick an option from an open autocomplete dropdown — the one whose text
 * contains `label`, else the first option. Used for category and zipcode→city.
 */
export async function pickSuggestion(cdp: CDPClient, candidates: string[], label?: string): Promise<boolean> {
  const sel = await resolveSelector(cdp, candidates);
  if (!sel) return false;
  const wanted = label ? JSON.stringify(label.toLowerCase()) : "null";
  return cdp
    .evaluate<boolean>(
      `(() => {
        const opts = Array.from(document.querySelectorAll(${JSON.stringify(sel)}));
        if (!opts.length) return false;
        const w = ${wanted};
        let target = opts[0];
        if (w) {
          const hit = opts.find((o) => (o.innerText || o.textContent || '').trim().toLowerCase().includes(w));
          if (hit) target = hit;
        }
        target.click();
        return true;
      })()`,
      false,
    )
    .catch(() => false);
}

/** Read the current page URL. */
export async function currentUrl(cdp: CDPClient): Promise<string> {
  return cdp.evaluate<string>("location.href", false).catch(() => "");
}

/** Read the first /ad/ link href on the page (used to recover a new ad URL). */
export async function firstAdLink(cdp: CDPClient): Promise<string> {
  return cdp.evaluate<string>(`(() => { const a = document.querySelector('a[href*="/ad/"]'); return a ? a.href : ''; })()`, false).catch(() => "");
}

/**
 * Passive logged-in probe: a DOM signal (one of `loggedInSelectors` resolves) OR
 * a visible text marker. Literals are passed in (from selectors.ts AUTH.*), so
 * this file stays free of hard-coded selectors. Returns the matched signals.
 */
export async function probeLoggedIn(
  cdp: CDPClient,
  opts: { loggedInSelectors: string[]; loggedInTextMarkers: string[] },
): Promise<{ loggedIn: boolean; signals: string[] }> {
  const signals: string[] = [];
  const domSel = await resolveSelector(cdp, opts.loggedInSelectors);
  if (domSel) signals.push(`dom:${domSel}`);
  if (await pageHasText(cdp, opts.loggedInTextMarkers)) signals.push("text");
  return { loggedIn: signals.length > 0, signals };
}

/** True if any of `markers` appears in the page text (delete confirmation). */
export async function pageHasText(cdp: CDPClient, markers: string[]): Promise<boolean> {
  const arr = JSON.stringify(markers.map((m) => m.toLowerCase()));
  return cdp
    .evaluate<boolean>(`(() => { const t = (document.body.innerText || '').toLowerCase(); return ${arr}.some((m) => t.includes(m)); })()`, false)
    .catch(() => false);
}

/**
 * Upload photos into a file input. THE one operation that needs the CDP DOM
 * domain — page JS cannot set a file input's files.
 *   DOM.getDocument → DOM.querySelector → DOM.setFileInputFiles(absolute paths)
 * Returns the number of files the input ended up holding (0 = failed).
 */
export async function uploadPhotos(cdp: CDPClient, fileInputCandidates: string[], absPaths: string[]): Promise<number> {
  const sel = await resolveSelector(cdp, fileInputCandidates);
  if (!sel) return 0;

  await cdp.send("DOM.enable").catch(() => {});
  const doc = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  const rootId = doc?.root?.nodeId;
  if (!rootId) return 0;

  const found = await cdp.send("DOM.querySelector", { nodeId: rootId, selector: sel }).catch(() => null);
  const nodeId = found?.nodeId;
  if (!nodeId) return 0;

  await cdp.send("DOM.setFileInputFiles", { nodeId, files: absPaths }).catch(() => {});

  // Verify what the input actually accepted.
  const count = await cdp
    .evaluate<number>(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el && el.files ? el.files.length : 0; })()`, false)
    .catch(() => 0);
  return count;
}
