/**
 * Read-only DOM introspection of the live deposit form.
 *
 * A single in-page `cdp.evaluate` walks every visible form control and returns a
 * structured "form map": each field's label, identifiers, type, current value,
 * select/listbox options, and whether it is REQUIRED (with the signal source).
 * The agent reads this map alongside the screenshot to know exactly which fields
 * are mandatory — including category-specific attributes the engine never
 * hard-coded — and then writes the values into annonce.md (the source of truth).
 *
 * This module only READS. It never sets a value or clicks "next" (that would be
 * bot-like and risk an accidental submit); the existing static fillForm does the
 * filling, with the human review gate as the guard.
 */
import { writeFileSync } from "node:fs";
import type { CDPClient } from "./cdp";

export type FieldType = "text" | "textarea" | "select" | "combobox" | "radio" | "checkbox" | "file" | "switch" | "other";

export interface FieldOption {
  label: string;
  value: string;
}

export interface FieldDescriptor {
  /** Stable key: data-qa-id > name > id > slugified label. */
  key: string;
  label: string;
  name?: string;
  id?: string;
  dataQaId?: string;
  type: FieldType;
  placeholder?: string;
  value: string;
  checked?: boolean;
  options?: FieldOption[];
  required: boolean;
  /** Which signal marked it required (required-attr/aria-required/asterisk/aria-invalid). */
  requiredSource?: string;
  /** Best-effort stable CSS selector for the field. */
  selector: string;
}

export interface FormMap {
  url: string;
  fields: FieldDescriptor[];
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

/** Stable key for a field: data-qa-id > name > id > slugified label. */
export function buildFieldKey(d: { dataQaId?: string; name?: string; id?: string; label?: string }): string {
  return d.dataQaId || d.name || d.id || (d.label ? slugify(d.label) : "") || "field";
}

/** A one-line summary for logs. */
export function summarizeFormMap(map: FormMap): string {
  const required = map.fields.filter((f) => f.required).length;
  return `${map.fields.length} field(s), ${required} required`;
}

/** Persist the form map to `form-map.json` (best-effort). */
export function writeFormMap(absPath: string, map: FormMap): boolean {
  try {
    writeFileSync(absPath, JSON.stringify(map, null, 2));
    return true;
  } catch {
    return false;
  }
}

// In-page DOM walk. Self-contained, JSON-serializable result, never throws.
// The `introspect-form` marker lets test fakes recognize this exact probe.
const INTROSPECT_JS = `(() => {
  /* introspect-form */
  const MAX = 80;
  const visible = (el) => !!(el.offsetParent !== null || (el.getClientRects && el.getClientRects().length));
  const text = (el) => ((el && (el.innerText || el.textContent)) || '').trim();
  function labelFor(el) {
    const al = el.getAttribute && el.getAttribute('aria-label'); if (al) return al.trim();
    const lb = el.getAttribute && el.getAttribute('aria-labelledby');
    if (lb) { const t = lb.split(/\\s+/).map((id) => text(document.getElementById(id))).join(' ').trim(); if (t) return t; }
    if (el.id) { try { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) return text(l); } catch (e) {} }
    const wrap = el.closest && el.closest('label'); if (wrap) return text(wrap);
    if (el.placeholder) return el.placeholder.trim();
    return (el.getAttribute && (el.getAttribute('name') || el.getAttribute('id'))) || '';
  }
  function requiredOf(el, label) {
    if (el.required) return 'required-attr';
    if (el.getAttribute && el.getAttribute('aria-required') === 'true') return 'aria-required';
    if (label && label.indexOf('*') >= 0) return 'asterisk';
    if (el.getAttribute && el.getAttribute('aria-invalid') === 'true') return 'aria-invalid';
    return null;
  }
  function typeOf(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea') return 'textarea';
    if (tag === 'select') return 'select';
    const role = (el.getAttribute && el.getAttribute('role')) || '';
    if (role === 'combobox' || role === 'listbox') return 'combobox';
    if (role === 'switch') return 'switch';
    const t = (el.type || '').toLowerCase();
    if (t === 'checkbox') return 'checkbox';
    if (t === 'radio') return 'radio';
    if (t === 'file') return 'file';
    if (tag === 'input') return 'text';
    return 'other';
  }
  function cssOf(el) {
    const qa = el.getAttribute && el.getAttribute('data-qa-id'); if (qa) return '[data-qa-id="' + qa + '"]';
    if (el.name) return el.tagName.toLowerCase() + '[name="' + el.name + '"]';
    if (el.id) { try { return '#' + CSS.escape(el.id); } catch (e) {} }
    return '';
  }
  const selector = 'input, textarea, select, [role="combobox"], [role="listbox"], [role="radiogroup"], [role="switch"], [contenteditable="true"]';
  const out = [];
  for (const el of Array.from(document.querySelectorAll(selector))) {
    if (out.length >= MAX) break;
    const t = (el.type || '').toLowerCase();
    if (t === 'hidden') continue;
    if (!visible(el)) continue;
    const label = labelFor(el);
    const reqSrc = requiredOf(el, label);
    let options;
    if (el.tagName.toLowerCase() === 'select') options = Array.from(el.options).slice(0, 50).map((o) => ({ label: text(o), value: o.value }));
    out.push({
      label: (label || '').slice(0, 120),
      name: (el.getAttribute && el.getAttribute('name')) || undefined,
      id: el.id || undefined,
      dataQaId: (el.getAttribute && el.getAttribute('data-qa-id')) || undefined,
      type: typeOf(el),
      placeholder: el.placeholder || undefined,
      value: (el.value != null ? String(el.value) : '').slice(0, 200),
      checked: (t === 'checkbox' || t === 'radio') ? !!el.checked : undefined,
      options,
      required: !!reqSrc,
      requiredSource: reqSrc || undefined,
      selector: cssOf(el),
    });
  }
  return { url: location.href, fields: out };
})()`;

/** Walk the live form into a FormMap. Never throws — returns an empty map on failure. */
export async function introspectForm(cdp: CDPClient): Promise<FormMap> {
  try {
    const raw = await cdp.evaluate<{ url?: string; fields?: Omit<FieldDescriptor, "key">[] }>(INTROSPECT_JS, false);
    if (!raw || !Array.isArray(raw.fields)) return { url: typeof raw?.url === "string" ? raw.url : "", fields: [] };

    const seen = new Map<string, number>();
    const fields: FieldDescriptor[] = raw.fields.map((f) => {
      const base = buildFieldKey(f);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return { ...f, key: n === 0 ? base : `${base}-${n}` };
    });
    return { url: raw.url ?? "", fields };
  } catch {
    return { url: "", fields: [] };
  }
}
