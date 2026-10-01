/**
 * Read-only DOM introspection of the live deposit form.
 *
 * A single in-page `cdp.evaluate` walks every visible form control and returns a
 * structured "form map": each field's label (plus the labels around it), its
 * identifiers (name / id / data-qa-id / react-hook-form name), type, current
 * value, options (select, ARIA combobox listbox, radio group), and whether it is
 * REQUIRED (with the signal source). Controls are found by ROLE and SEMANTICS —
 * never by hashed class names — so the map survives a restyle.
 *
 * Each control is tagged in-page with `data-lbc-ref` so the filler can target it
 * even when it has no name/id. That attribute is the only thing this module
 * writes; it never sets a value or clicks. The wizard (deposit-wizard.ts)
 * matches the map to the annonce (field-match.ts) and does the filling.
 */
import { writeFileSync } from "node:fs";
import type { CDPClient } from "./cdp";
import { DEPOSIT, LOGICAL_FIELDS } from "./selectors";

export type FieldType = "text" | "textarea" | "select" | "combobox" | "radio" | "radiogroup" | "checkbox" | "file" | "switch" | "other";

export interface FieldOption {
  label: string;
  value: string;
}

export interface FieldDescriptor {
  /** Stable key: data-qa-id > name > react-hook-form name > stable id > slugified label. */
  key: string;
  label: string;
  /** Other human labels found around the control (container label, legend). */
  altLabels?: string[];
  name?: string;
  id?: string;
  dataQaId?: string;
  /** The react-hook-form field name of the enclosing `[data-rhf-name]` container. */
  rhfName?: string;
  type: FieldType;
  placeholder?: string;
  value: string;
  checked?: boolean;
  options?: FieldOption[];
  required: boolean;
  /** Which signal marked it required (required-attr/aria-required/asterisk/aria-invalid). */
  requiredSource?: string;
  /** Best-effort CSS selector for the field (falls back to the data-lbc-ref handle). */
  selector: string;
  /** Per-page handle (`[data-lbc-ref="…"]`) the filler uses — works without name/id, never a hashed class. */
  ref?: string;
  /** Logical fields (LOGICAL_FIELDS keys) whose legacy selectors.ts candidates match this control. */
  cssHits?: string[];
}

export interface StepInfo {
  /** The step heading (`#step-title`, else the first h2/h1). */
  title: string;
  /** Title + field keys: changes when the wizard moves to another step. */
  fingerprint: string;
}

export interface FormMap {
  url: string;
  fields: FieldDescriptor[];
  step?: StepInfo;
}

/** Lowercased, dash-separated, accent-stripped slug for a label fallback key. */
function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Framework-generated ids (React useId `:r1:`, `_r_0_`, base-ui/radix) change on every render. */
function isGeneratedId(id: string): boolean {
  return /^:|_r_|^base-ui|^radix|^react-/i.test(id);
}

/** Stable key for a field: data-qa-id > name > react-hook-form name > stable id > slugified label. */
export function buildFieldKey(d: { dataQaId?: string; name?: string; rhfName?: string; id?: string; label?: string }): string {
  const stableId = d.id && !isGeneratedId(d.id) ? d.id : "";
  return d.dataQaId || d.name || d.rhfName || stableId || (d.label ? slugify(d.label) : "") || d.id || "field";
}

/** A one-line summary for logs. */
export function summarizeFormMap(map: FormMap): string {
  const required = map.fields.filter((f) => f.required).length;
  const step = map.step?.title ? ` on « ${map.step.title} »` : "";
  return `${map.fields.length} field(s), ${required} required${step}`;
}

/** Persist a form map (or the multi-step `{ steps }` record) to `form-map.json` (best-effort). */
export function writeFormMap(absPath: string, map: FormMap | { steps: FormMap[] }): boolean {
  try {
    writeFileSync(absPath, JSON.stringify(map, null, 2));
    return true;
  } catch {
    return false;
  }
}

/** Legacy fast-path probes: which LOGICAL_FIELDS css candidates match each control. */
function defaultProbes(): { name: string; css: string[] }[] {
  return Object.entries(LOGICAL_FIELDS)
    .filter(([, spec]) => spec.css.length > 0)
    .map(([name, spec]) => ({ name, css: spec.css }));
}

// In-page DOM walk. Self-contained, JSON-serializable result, never throws.
// The `introspect-form` marker lets test fakes recognize this exact probe.
function introspectScript(probes: { name: string; css: string[] }[], stepTitle: string[]): string {
  return `(() => {
  /* introspect-form */
  const PROBES = ${JSON.stringify(probes)};
  const STEP_TITLE = ${JSON.stringify(stepTitle)};
  const MAX = 120;
  const attr = (el, n) => (el && el.getAttribute && el.getAttribute(n)) || '';
  const visible = (el) => !!(el.offsetParent !== null || (el.getClientRects && el.getClientRects().length));
  const text = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\\s+/g, ' ').trim();
  const byIds = (ids) => ids.split(/\\s+/).map((id) => text(document.getElementById(id))).join(' ').trim();
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/([^\\w-])/g, '\\\\$1'));
  function labelFor(el) {
    const al = attr(el, 'aria-label'); if (al) return al.trim();
    const lb = attr(el, 'aria-labelledby'); if (lb) { const t = byIds(lb); if (t) return t; }
    if (el.id) { try { const l = document.querySelector('label[for="' + esc(el.id) + '"]'); if (l && text(l)) return text(l); } catch (e) {} }
    const wrap = el.closest && el.closest('label'); if (wrap && text(wrap)) return text(wrap);
    if (el.placeholder) return el.placeholder.trim();
    return attr(el, 'name') || el.id || '';
  }
  function altLabelsFor(el, main) {
    const box = el.closest('[data-rhf-name]') || el.closest('fieldset') || el.parentElement;
    if (!box) return [];
    const out = [];
    for (const l of Array.from(box.querySelectorAll('label, legend')).slice(0, 6)) {
      if (l.contains(el)) continue;
      const t = text(l).slice(0, 120);
      if (t && t !== main && out.indexOf(t) < 0) out.push(t);
      if (out.length >= 3) break;
    }
    return out;
  }
  function requiredOf(el, labels) {
    if (el.required) return 'required-attr';
    if (attr(el, 'aria-required') === 'true') return 'aria-required';
    if (labels.some((l) => l && l.indexOf('*') >= 0)) return 'asterisk';
    if (attr(el, 'aria-invalid') === 'true') return 'aria-invalid';
    return null;
  }
  function typeOf(el) {
    const tag = el.tagName.toLowerCase();
    const role = attr(el, 'role');
    if (role === 'radiogroup') return 'radiogroup';
    if (role === 'combobox' || role === 'listbox') return 'combobox';
    if (role === 'switch') return 'switch';
    if (role === 'checkbox') return 'checkbox';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'select') return 'select';
    const t = (el.type || '').toLowerCase();
    if (t === 'checkbox') return 'checkbox';
    if (t === 'radio') return 'radio';
    if (t === 'file') return 'file';
    if (tag === 'input') return 'text';
    return 'other';
  }
  function optionLabel(o) {
    const lb = attr(o, 'aria-labelledby');
    const viaFor = o.id ? document.querySelector('label[for="' + esc(o.id) + '"]') : null;
    return (attr(o, 'aria-label') || (lb && byIds(lb)) || text(o) || text(viaFor) || o.value || '').slice(0, 120);
  }
  function optionsOf(el, type) {
    if (type === 'select') return Array.from(el.options).slice(0, 80).map((o) => ({ label: text(o), value: o.value }));
    if (type === 'combobox') {
      const lb = document.getElementById(attr(el, 'aria-controls')) || (attr(el, 'role') === 'listbox' ? el : null);
      if (!lb) return undefined;
      return Array.from(lb.querySelectorAll('[role="option"]')).slice(0, 80).map((o) => ({ label: text(o).slice(0, 120), value: attr(o, 'data-value') || attr(o, 'value') || text(o).slice(0, 120) }));
    }
    if (type === 'radiogroup') {
      return Array.from(el.querySelectorAll('[role="radio"], input[type="radio"]'))
        .filter((o) => attr(o, 'aria-hidden') !== 'true')
        .slice(0, 40)
        .map((o) => ({ label: optionLabel(o), value: o.value || attr(o, 'value') || optionLabel(o) }));
    }
    return undefined;
  }
  function valueOf(el, type) {
    if (type === 'switch' || type === 'checkbox') return attr(el, 'role') ? attr(el, 'aria-checked') : (el.checked ? 'true' : 'false');
    if (type === 'radiogroup') {
      const on = Array.from(el.querySelectorAll('[role="radio"], input[type="radio"]')).find((o) => attr(o, 'aria-checked') === 'true' || o.checked);
      return on ? optionLabel(on) : '';
    }
    if (attr(el, 'contenteditable') === 'true') return text(el);
    return el.value != null ? String(el.value) : '';
  }
  function cssOf(el, ref) {
    const qa = attr(el, 'data-qa-id'); if (qa) return '[data-qa-id="' + qa + '"]';
    const name = attr(el, 'name');
    if (name && document.querySelectorAll('[name="' + name + '"]').length === 1) return el.tagName.toLowerCase() + '[name="' + name + '"]';
    return '[data-lbc-ref="' + ref + '"]';
  }
  const ROLE_TOGGLES = '[role="switch"], [role="checkbox"], [role="radio"]';
  const sel = 'input, textarea, select, [role="combobox"], [role="listbox"], [role="radiogroup"], [role="switch"], [role="checkbox"], [contenteditable="true"]';
  const out = [];
  const seen = new Set();
  window.__lbcRefSeq = window.__lbcRefSeq || 0;
  for (const el of Array.from(document.querySelectorAll(sel))) {
    if (out.length >= MAX) break;
    if (seen.has(el)) continue;
    seen.add(el);
    const t = (el.type || '').toLowerCase();
    const role = attr(el, 'role');
    if (t === 'hidden' || (el.tagName === 'INPUT' && (t === 'submit' || t === 'button'))) continue;
    if (t !== 'file' && !visible(el)) continue;
    if (t !== 'file' && attr(el, 'aria-hidden') === 'true') continue;
    // A radio inside a group is an OPTION of that group, not a field.
    if ((t === 'radio' || role === 'radio') && el.closest('[role="radiogroup"]')) continue;
    // A listbox driven by a combobox is that combobox's option list.
    if (role === 'listbox' && el.id && document.querySelector('[aria-controls="' + esc(el.id) + '"]')) continue;
    // A native checkbox shadowed by an ARIA switch/checkbox in the same container is a duplicate.
    if ((t === 'checkbox' || t === 'radio') && !role) {
      const box = el.closest('[data-rhf-name]') || el.parentElement;
      if (box && box.querySelector(ROLE_TOGGLES)) continue;
    }
    const type = typeOf(el);
    const label = labelFor(el);
    const altLabels = altLabelsFor(el, label);
    const reqSrc = requiredOf(el, [label].concat(altLabels));
    const rhfBox = el.closest('[data-rhf-name]');
    let ref = attr(el, 'data-lbc-ref');
    if (!ref) { ref = 'r' + (++window.__lbcRefSeq); el.setAttribute('data-lbc-ref', ref); }
    const cssHits = [];
    for (const p of PROBES) { if (p.css.some((s) => { try { return el.matches(s); } catch (e) { return false; } })) cssHits.push(p.name); }
    const value = valueOf(el, type);
    out.push({
      label: (label || '').slice(0, 120),
      altLabels: altLabels.length ? altLabels : undefined,
      name: attr(el, 'name') || (rhfBox && (type === 'switch' || type === 'checkbox') ? attr(rhfBox, 'data-rhf-name') : '') || undefined,
      id: el.id || undefined,
      dataQaId: attr(el, 'data-qa-id') || undefined,
      rhfName: rhfBox ? attr(rhfBox, 'data-rhf-name') : undefined,
      type,
      placeholder: el.placeholder || undefined,
      value: type === 'switch' || type === 'checkbox' ? '' : String(value).slice(0, 200),
      checked: type === 'switch' || type === 'checkbox' || type === 'radio' ? value === 'true' || !!el.checked : undefined,
      options: optionsOf(el, type),
      required: !!reqSrc,
      requiredSource: reqSrc || undefined,
      selector: cssOf(el, ref),
      ref,
      cssHits: cssHits.length ? cssHits : undefined,
    });
  }
  let stepTitle = '';
  for (const s of STEP_TITLE) { const h = document.querySelector(s); if (h && text(h)) { stepTitle = text(h).slice(0, 160); break; } }
  return { url: location.href, fields: out, stepTitle };
})()`;
}

/** Walk the live form into a FormMap. Never throws — returns an empty map on failure. */
export async function introspectForm(cdp: CDPClient, opts: { probes?: { name: string; css: string[] }[]; stepTitle?: string[] } = {}): Promise<FormMap> {
  try {
    const raw = await cdp.evaluate<{ url?: string; fields?: Omit<FieldDescriptor, "key">[]; stepTitle?: string }>(
      introspectScript(opts.probes ?? defaultProbes(), opts.stepTitle ?? DEPOSIT.stepTitle),
      false,
    );
    if (!raw || !Array.isArray(raw.fields)) return { url: typeof raw?.url === "string" ? raw.url : "", fields: [] };

    const seen = new Map<string, number>();
    const fields: FieldDescriptor[] = raw.fields.map((f) => {
      const base = buildFieldKey(f);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return { ...f, key: n === 0 ? base : `${base}-${n}` };
    });
    const map: FormMap = { url: raw.url ?? "", fields };
    if (typeof raw.stepTitle === "string") {
      map.step = { title: raw.stepTitle, fingerprint: stepFingerprint(raw.stepTitle, fields) };
    }
    return map;
  } catch {
    return { url: "", fields: [] };
  }
}

/** Title + sorted field keys: equal fingerprints mean "still on the same step". */
export function stepFingerprint(title: string, fields: Pick<FieldDescriptor, "key">[]): string {
  return `${title}|${fields
    .map((f) => f.key)
    .sort()
    .join(",")}`;
}
