/**
 * Low-level DOM driving for the deposit form, built on the raw CDPClient.
 *
 * Almost everything runs through cdp.evaluate (in-page JS) — the same
 * low-detection footprint the scraper relies on. The single exception is photo
 * upload: a file <input> cannot be populated from page JS for security reasons,
 * so it uses the CDP DOM domain (DOM.setFileInputFiles), the one operation that
 * genuinely needs a node handle.
 *
 * Every helper takes the ORDERED candidate lists from selectors.ts (or a field
 * descriptor from form-introspect.ts) and resolves the first that matches; none
 * contains a literal Leboncoin selector.
 */
import type { CDPClient } from "./cdp";
import type { FieldDescriptor } from "./form-introspect";
import type { ButtonSelector } from "./selectors";
import { delay } from "./utils";

/** In-page text normalizer, identical to field-match.ts normalizeText. */
const NORM_JS = `(s) => String(s == null ? '' : s).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()`;
/** In-page visibility test (layout box present, not aria-hidden). */
const VISIBLE_JS = `(el) => !!el && el.getAttribute('aria-hidden') !== 'true' && !!(el.offsetParent !== null || (el.getClientRects && el.getClientRects().length))`;
/** In-page option picker, identical tiers to field-match.ts pickOption. */
const PICK_JS = `(labels, wanted) => {
  const n = ${NORM_JS};
  const w = n(wanted);
  if (!w || !labels.length) return -1;
  const L = labels.map(n);
  const tiers = [(o) => o === w, (o) => o.startsWith(w) || (o.length > 2 && w.startsWith(o)), (o) => o.includes(w) || (o.length > 2 && w.includes(o))];
  for (const t of tiers) { const i = L.findIndex((o) => o && t(o)); if (i >= 0) return i; }
  const wt = new Set(w.split(' ').filter((x) => x.length > 1));
  let best = -1, bs = 0;
  L.forEach((o, i) => { const s = Array.from(new Set(o.split(' '))).filter((x) => wt.has(x)).length; if (s > bs || (s === bs && s > 0 && o.length < L[best].length)) { best = i; bs = s; } });
  return best;
}`;

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

/** Click the first VISIBLE, enabled element matching one of the CSS candidates. */
export async function clickSelector(cdp: CDPClient, candidates: string[], opts: { dryRun?: boolean } = {}): Promise<boolean> {
  return cdp
    .evaluate<boolean>(
      `(() => {
        const visible = ${VISIBLE_JS};
        for (const sel of ${JSON.stringify(candidates)}) {
          let els = [];
          try { els = Array.from(document.querySelectorAll(sel)); } catch (e) { continue; }
          const el = els.find((e) => visible(e) && !e.disabled && e.getAttribute('aria-disabled') !== 'true');
          if (el) { if (!${opts.dryRun === true}) el.click(); return true; }
        }
        return false;
      })()`,
      false,
    )
    .catch(() => false);
}

export interface ClickOptions {
  /** Only report whether a matching control exists (and is enabled) — never click. */
  dryRun?: boolean;
}

/**
 * Click a button/link/role=button whose visible text OR accessible name matches
 * one of `texts`. STRICT: only visible + enabled controls; ranked exact > prefix
 * > contains (contains only for 4+ letter candidates, on short labels); earlier
 * candidates win ties; a control inside an open dialog, then inside the form /
 * main content, is preferred. Falls back to the CSS candidates (visible only).
 */
export async function clickByText(cdp: CDPClient, texts: string[], cssFallback: string[] = [], opts: ClickOptions = {}): Promise<boolean> {
  const ok = await cdp
    .evaluate<boolean>(
      `(() => {
        /* click-by-text */
        const norm = ${NORM_JS};
        const visible = ${VISIBLE_JS};
        const wanted = ${JSON.stringify(texts)}.map(norm).filter(Boolean);
        const els = Array.from(document.querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="tab"], input[type="submit"], input[type="button"]'));
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]')).filter(visible);
        let best = null, bestScore = 0;
        for (const el of els) {
          if (!visible(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
          const names = [norm(el.innerText || el.textContent || el.value || ''), norm(el.getAttribute('aria-label'))].filter(Boolean);
          let score = 0;
          wanted.forEach((w, wi) => {
            for (const t of names) {
              let tier = 0;
              if (t === w) tier = 3;
              else if (t.startsWith(w + ' ')) tier = 2;
              else if (w.length >= 4 && t.length <= w.length * 3 + 20 && (' ' + t + ' ').includes(' ' + w + ' ')) tier = 1;
              if (tier) score = Math.max(score, tier * 1000 - wi * 10);
            }
          });
          if (!score) continue;
          if (dialogs.some((d) => d.contains(el))) score += 500;
          else if (el.closest('form, main, [role="main"]')) score += 5;
          if (score > bestScore) { best = el; bestScore = score; }
        }
        if (!best) return false;
        if (!${opts.dryRun === true}) best.click();
        return true;
      })()`,
      false,
    )
    .catch(() => false);
  if (ok) return true;
  return cssFallback.length ? clickSelector(cdp, cssFallback, opts) : false;
}

/** Convenience: click a ButtonSelector (text first, then css). */
export async function clickButton(cdp: CDPClient, button: ButtonSelector, opts: ClickOptions = {}): Promise<boolean> {
  return clickByText(cdp, button.textCandidates, button.css, opts);
}

/** True when a matching, visible, enabled control is on the page (never clicks). */
export async function hasButton(cdp: CDPClient, button: ButtonSelector): Promise<boolean> {
  return clickButton(cdp, button, { dryRun: true });
}

/**
 * Click `button`; if it is not visible, open an overflow menu (« … », « Plus
 * d'actions », any `aria-haspopup` trigger) and try again. Per-ad management
 * controls often hide in such menus.
 */
export async function clickButtonOrMenu(cdp: CDPClient, button: ButtonSelector, menu: ButtonSelector, waitMs = 600): Promise<boolean> {
  if (await clickButton(cdp, button)) return true;
  if (!(await clickButton(cdp, menu))) return false;
  await delay(waitMs);
  return clickButton(cdp, button);
}

/**
 * Pick an option from an open autocomplete dropdown — the best match for
 * `label`, else the first option. Used for zipcode→city on legacy forms.
 */
export async function pickSuggestion(cdp: CDPClient, candidates: string[], label?: string): Promise<boolean> {
  const sel = await resolveSelector(cdp, candidates);
  if (!sel) return false;
  return cdp
    .evaluate<boolean>(
      `(() => {
        const pick = ${PICK_JS};
        const visible = ${VISIBLE_JS};
        const opts = Array.from(document.querySelectorAll(${JSON.stringify(sel)})).filter(visible);
        if (!opts.length) return false;
        const i = ${label ? `pick(opts.map((o) => o.innerText || o.textContent || ''), ${JSON.stringify(label)})` : "-1"};
        (opts[i >= 0 ? i : 0]).click();
        return true;
      })()`,
      false,
    )
    .catch(() => false);
}

export interface FillResult {
  ok: boolean;
  /** What actually ended up in the control (option label, text…). */
  detail?: string;
  reason?: "gone" | "no-option" | "not-applied" | "unsupported" | "error";
}

/**
 * Write `value` into one introspected control, dispatching on its type:
 * text/textarea (native setter + events), select (option by label), ARIA
 * combobox (type, wait for the listbox, click the best option — `hint` breaks
 * ties, e.g. the city for an address), radio group (click the matching
 * option), checkbox/switch (click only if the state differs), contenteditable.
 * Targets the `data-lbc-ref` handle, so no name/id is needed.
 */
export async function fillField(cdp: CDPClient, d: FieldDescriptor, value: string, hint?: string, opts: { optionWaitMs?: number } = {}): Promise<FillResult> {
  const sel = d.ref ? `[data-lbc-ref="${d.ref}"]` : d.selector;
  if (!sel) return { ok: false, reason: "gone" };
  if (d.type === "file") return { ok: false, reason: "unsupported" };
  return cdp
    .evaluate<FillResult>(
      `(async () => {
        /* fill-field */
        const norm = ${NORM_JS};
        const pick = ${PICK_JS};
        const visible = ${VISIBLE_JS};
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const TYPE = ${JSON.stringify(d.type)}, VALUE = ${JSON.stringify(value)}, HINT = ${JSON.stringify(hint ?? "")};
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return { ok: false, reason: 'gone' };
        const txt = (e) => ((e && (e.innerText || e.textContent)) || '').replace(/\\s+/g, ' ').trim();
        const setVal = (input, v) => {
          const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const desc = Object.getOwnPropertyDescriptor(proto, 'value');
          if (desc && desc.set) desc.set.call(input, v); else input.value = v;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const truthy = /^(true|1|oui|yes|on)$/i.test(VALUE.trim());
        if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
        if (TYPE === 'text' || TYPE === 'textarea') {
          if (el.focus) el.focus();
          setVal(el, VALUE);
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          return norm(el.value) === norm(VALUE) ? { ok: true, detail: el.value } : { ok: false, reason: 'not-applied', detail: el.value };
        }
        if (TYPE === 'select') {
          const opts = Array.from(el.options);
          const i = pick(opts.map((o) => o.textContent || o.value), VALUE);
          if (i < 0) return { ok: false, reason: 'no-option' };
          el.value = opts[i].value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, detail: txt(opts[i]) };
        }
        if (TYPE === 'combobox') {
          const input = el.matches('input, textarea') ? el : (el.querySelector('input') || el);
          if (input.focus) input.focus();
          input.click();
          await sleep(150);
          if (input.matches('input, textarea')) setVal(input, VALUE);
          // Options can load asynchronously (address geocoding, ≈1–3 s live) and the
          // list first shows STALE entries: poll until an option MATCHES (~6 s max).
          let options = [], labels = [], i = -1;
          for (let t = 0; t < ${Math.max(1, Math.ceil((opts.optionWaitMs ?? 6_000) / 200))}; t++) {
            const lb = document.getElementById(input.getAttribute('aria-controls') || el.getAttribute('aria-controls') || '');
            options = Array.from((lb || document).querySelectorAll('[role="option"]')).filter((o) => visible(o) && o.getAttribute('aria-disabled') !== 'true');
            labels = options.map(txt);
            i = pick(labels, VALUE);
            if (i < 0 && HINT) i = pick(labels, HINT);
            if (i >= 0) break;
            await sleep(200);
          }
          if (!options.length) {
            // Free-text combobox: the typed value stands.
            return input.value ? { ok: true, detail: input.value } : { ok: false, reason: 'no-option' };
          }
          if (i < 0) return { ok: false, reason: 'no-option', detail: labels.slice(0, 8).join(' | ') };
          options[i].click();
          await sleep(300);
          return { ok: true, detail: labels[i] };
        }
        if (TYPE === 'radiogroup' || TYPE === 'radio') {
          const group = TYPE === 'radio' ? (el.closest('[role="radiogroup"]') || el.parentElement) : el;
          const radios = Array.from(group.querySelectorAll('[role="radio"], input[type="radio"]')).filter((o) => o.getAttribute('aria-hidden') !== 'true');
          const labelOf = (o) => {
            const lb = o.getAttribute('aria-labelledby');
            const viaFor = o.id ? document.querySelector('label[for="' + o.id.replace(/([^\\w-])/g, '\\\\$1') + '"]') : null;
            return o.getAttribute('aria-label') || (lb ? lb.split(/\\s+/).map((id) => txt(document.getElementById(id))).join(' ') : '') || txt(o) || txt(viaFor) || o.value || '';
          };
          const labels = radios.map(labelOf);
          const i = pick(labels, VALUE);
          if (i < 0) return { ok: false, reason: 'no-option', detail: labels.join(' | ') };
          radios[i].click();
          return { ok: true, detail: labels[i] };
        }
        if (TYPE === 'checkbox' || TYPE === 'switch') {
          const isOn = () => (el.getAttribute('role') ? el.getAttribute('aria-checked') === 'true' : !!el.checked);
          if (isOn() !== truthy) el.click();
          await sleep(150);
          return isOn() === truthy ? { ok: true, detail: String(truthy) } : { ok: false, reason: 'not-applied' };
        }
        if (el.getAttribute('contenteditable') === 'true') {
          el.focus();
          el.textContent = VALUE;
          el.dispatchEvent(new InputEvent('input', { bubbles: true }));
          return { ok: true, detail: VALUE };
        }
        return { ok: false, reason: 'unsupported' };
      })()`,
      true,
    )
    .then((r) => r ?? { ok: false, reason: "error" as const })
    .catch(() => ({ ok: false, reason: "error" as const }));
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
 * Passive session probe: positive DOM signals (`loggedInSelectors`), visible
 * text markers, and — when given — negative DOM signals (`loggedOutSelectors`,
 * e.g. the header's « Se connecter » button). Literals come from selectors.ts AUTH.
 */
export async function probeLoggedIn(
  cdp: CDPClient,
  opts: { loggedInSelectors: string[]; loggedInTextMarkers: string[]; loggedOutSelectors?: string[] },
): Promise<{ loggedIn: boolean; signals: string[]; loggedOutSignals: string[] }> {
  const signals: string[] = [];
  const domSel = await resolveSelector(cdp, opts.loggedInSelectors);
  if (domSel) signals.push(`dom:${domSel}`);
  if (await pageHasText(cdp, opts.loggedInTextMarkers)) signals.push("text");
  const loggedOutSignals: string[] = [];
  if (!signals.length && opts.loggedOutSelectors?.length) {
    const out = await resolveSelector(cdp, opts.loggedOutSelectors);
    if (out) loggedOutSignals.push(`dom:${out}`);
  }
  return { loggedIn: signals.length > 0, signals, loggedOutSignals };
}

/** True if any of `markers` appears in the visible page text (accent/case/punctuation-insensitive). */
export async function pageHasText(cdp: CDPClient, markers: string[]): Promise<boolean> {
  return cdp
    .evaluate<boolean>(
      `(() => { const n = ${NORM_JS}; const t = ' ' + n(document.body.innerText || document.body.textContent || '') + ' '; return ${JSON.stringify(markers)}.map(n).filter(Boolean).some((m) => t.includes(' ' + m + ' ')); })()`,
      false,
    )
    .catch(() => false);
}

/** Count the elements matching any of the candidates (e.g. photo thumbnails). */
export async function countElements(cdp: CDPClient, candidates: string[]): Promise<number> {
  return cdp
    .evaluate<number>(
      `(() => { const s = new Set(); for (const c of ${JSON.stringify(candidates)}) { try { document.querySelectorAll(c).forEach((e) => s.add(e)); } catch (e) {} } return s.size; })()`,
      false,
    )
    .catch(() => 0);
}

/**
 * Upload photos into a file input. THE one operation that needs the CDP DOM
 * domain — page JS cannot set a file input's files.
 *   DOM.getDocument → DOM.querySelector → DOM.setFileInputFiles(absolute paths)
 *
 * Verification: React reads the files and CLEARS the input, so `files.length`
 * is 0 even on success (seen live 2026-10). The proof is the number of new
 * thumbnails (`thumbnailCandidates`); `files.length` is kept as a second signal.
 * Returns how many photos landed (0 = failed).
 */
export async function uploadPhotos(cdp: CDPClient, fileInputCandidates: string[], absPaths: string[], thumbnailCandidates: string[] = []): Promise<number> {
  const sel = await resolveSelector(cdp, fileInputCandidates);
  if (!sel || absPaths.length === 0) return 0;
  const before = thumbnailCandidates.length ? await countElements(cdp, thumbnailCandidates) : 0;

  await cdp.send("DOM.enable").catch(() => {});
  const doc = await cdp.send("DOM.getDocument", { depth: -1, pierce: true }).catch(() => null);
  const rootId = doc?.root?.nodeId;
  if (!rootId) return 0;

  const found = await cdp.send("DOM.querySelector", { nodeId: rootId, selector: sel }).catch(() => null);
  const nodeId = found?.nodeId;
  if (!nodeId) return 0;

  await cdp.send("DOM.setFileInputFiles", { nodeId, files: absPaths }).catch(() => {});

  let landed = 0;
  for (let i = 0; i < 10; i++) {
    const inInput = await cdp
      .evaluate<number>(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el && el.files ? el.files.length : 0; })()`, false)
      .catch(() => 0);
    const thumbs = thumbnailCandidates.length ? (await countElements(cdp, thumbnailCandidates)) - before : 0;
    landed = Math.min(absPaths.length, Math.max(inInput, thumbs));
    if (landed >= absPaths.length) break;
    await delay(500);
  }
  return landed;
}
