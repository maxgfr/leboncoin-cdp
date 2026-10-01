/**
 * Semantic field matching — PURE functions, no DOM, no CDP.
 *
 * Given the live form map (form-introspect.ts) and the annonce, decide which
 * control receives which value by MEANING: a legacy selectors.ts hit first, then
 * the control's technical identity (name / id / data-qa-id / react-hook-form
 * container name), then the words of its visible label / accessible name /
 * placeholder. A renamed `name=`, a new hashed class or a re-ordered step
 * therefore keeps working as long as the label still says what the field is.
 *
 * Attributes (`attributes:` in annonce.md) match by technical key
 * (`mileage`), by react-hook-form suffix (`brand` → `computer_brand`) or by
 * visible label (`Kilométrage`), so the agent can copy labels straight from
 * form-map.json.
 */
import type { FieldDescriptor, FormMap } from "./form-introspect";
import { LOGICAL_FIELDS, type LogicalField, type LogicalFieldName } from "./selectors";
import type { Annonce } from "./types";

export type MatchTarget = { kind: "logical"; name: LogicalFieldName } | { kind: "attribute"; key: string };

export type MatchVia = "selector" | "name" | "suffix" | "label" | "placeholder" | "type";

export interface FieldMatch {
  field: FieldDescriptor;
  target: MatchTarget;
  /** The value to write (booleans as "true"/"false"). */
  value: string;
  /** Secondary hint (e.g. the city to pick among location suggestions). */
  hint?: string;
  confidence: number;
  via: MatchVia;
}

export interface MatchResult {
  matches: FieldMatch[];
  /** annonce attributes no control on this form matched. */
  unmatchedAttributes: string[];
}

/** Accent/case-insensitive, punctuation-free, single-spaced text. */
export function normalizeText(s: string | undefined | null): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasWord(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

function tokens(s: string): string[] {
  return normalizeText(s)
    .split(" ")
    .filter((t) => t.length > 1);
}

/**
 * Index of the option that best matches `wanted`: exact > prefix (either way) >
 * contains (either way) > best token overlap. -1 when nothing is close.
 */
export function pickOption(options: string[], wanted: string): number {
  const w = normalizeText(wanted);
  if (!w || options.length === 0) return -1;
  const norm = options.map(normalizeText);
  const tiers: ((o: string) => boolean)[] = [
    (o) => o === w,
    (o) => o.startsWith(w) || (o.length > 2 && w.startsWith(o)),
    (o) => o.includes(w) || (o.length > 2 && w.includes(o)),
  ];
  for (const tier of tiers) {
    const i = norm.findIndex((o) => o && tier(o));
    if (i >= 0) return i;
  }
  const wt = new Set(tokens(wanted));
  let best = -1;
  let bestScore = 0;
  norm.forEach((o, i) => {
    const score = tokens(o).filter((t) => wt.has(t)).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

/**
 * Pick a category card (suggestion or tree leaf) for the annonce's category:
 * by category name, then by family. Falls back to the site's own first
 * suggestion (it is computed from the title) — flagged `guessed` so the report
 * tells the user to double-check it.
 */
export function pickCategoryCard(cards: { name: string; family?: string }[], wanted: string): { index: number; guessed: boolean } {
  if (cards.length === 0) return { index: -1, guessed: true };
  const byName = pickOption(
    cards.map((c) => c.name),
    wanted,
  );
  if (byName >= 0) return { index: byName, guessed: false };
  const byFamily = pickOption(
    cards.map((c) => c.family ?? ""),
    wanted,
  );
  if (byFamily >= 0) return { index: byFamily, guessed: false };
  return { index: 0, guessed: true };
}

/** True when the control already holds a value (text, checked box, selected radio). */
export function isFieldFilled(f: FieldDescriptor): boolean {
  if (f.type === "checkbox" || f.type === "switch" || f.type === "radio") return f.checked === true;
  return String(f.value ?? "").trim() !== "";
}

export function truthy(v: string): boolean {
  return /^(true|1|oui|yes|on)$/i.test(v.trim());
}

/** True when the control already shows `wanted` — the wizard then leaves it alone. */
export function valueAlreadySet(f: FieldDescriptor, wanted: string): boolean {
  if (f.type === "checkbox" || f.type === "switch") return (f.checked === true) === truthy(wanted);
  return normalizeText(f.value) !== "" && normalizeText(f.value) === normalizeText(wanted);
}

/** The annonce value behind a logical field (null = nothing to write). */
export function logicalValue(a: Annonce, name: LogicalFieldName): { value: string; hint?: string } | null {
  switch (name) {
    case "title":
      return a.title ? { value: a.title } : null;
    case "description":
      return a.description ? { value: a.description } : null;
    case "price":
      return a.price > 0 ? { value: String(a.price) } : null;
    case "location":
      return a.zipcode ? { value: a.zipcode, hint: a.city || a.zipcode } : a.city ? { value: a.city } : null;
    case "category":
      return a.category ? { value: a.category } : null;
    case "condition":
      return a.condition ? { value: a.condition } : null;
    case "shipping":
      return typeof a.shipping === "boolean" ? { value: String(a.shipping) } : null;
    case "photos":
      return null; // uploaded through the file input, not typed
  }
}

function identities(f: FieldDescriptor): string[] {
  return [f.name, f.rhfName, f.dataQaId, f.id].map(normalizeText).filter(Boolean);
}

function labelTexts(f: FieldDescriptor): string[] {
  return [f.label, ...(f.altLabels ?? [])].map(normalizeText).filter(Boolean);
}

function scoreLogical(f: FieldDescriptor, name: LogicalFieldName, spec: LogicalField): { confidence: number; via: MatchVia } | null {
  if (!spec.types.includes(f.type)) return null;
  if (f.cssHits?.includes(name)) return { confidence: 1, via: "selector" };
  const ids = identities(f);
  if (spec.names.some((n) => ids.includes(normalizeText(n)))) return { confidence: 0.95, via: "name" };
  const labels = labelTexts(f);
  if (spec.labels.some((l) => labels.some((t) => hasWord(t, normalizeText(l))))) return { confidence: 0.8, via: "label" };
  const ph = normalizeText(f.placeholder);
  if (spec.labels.some((l) => hasWord(ph, normalizeText(l)))) return { confidence: 0.6, via: "placeholder" };
  // A type only one logical field can take (a file input → photos) needs no label.
  if (spec.types.length === 1 && spec.types[0] === f.type && f.type === "file") return { confidence: 0.5, via: "type" };
  return null;
}

function scoreAttribute(f: FieldDescriptor, key: string): { confidence: number; via: MatchVia } | null {
  if (f.type === "file") return null;
  const k = normalizeText(key);
  if (!k) return null;
  const ids = identities(f);
  if (ids.includes(k)) return { confidence: 0.95, via: "name" };
  const kSnake = k.replace(/ /g, "_");
  const rawIds = [f.name, f.rhfName, f.dataQaId].filter(Boolean).map((s) => String(s).toLowerCase());
  if (rawIds.some((id) => id.endsWith(`_${kSnake}`))) return { confidence: 0.85, via: "suffix" };
  const labels = labelTexts(f);
  if (labels.some((t) => t === k || t.startsWith(`${k} `))) return { confidence: 0.8, via: "label" };
  if (normalizeText(f.placeholder) === k) return { confidence: 0.6, via: "placeholder" };
  return null;
}

/**
 * Assign annonce values to live controls. Greedy by confidence: each control
 * receives at most one value and each logical field / attribute is written at
 * most once. Logical fields win ties over attributes.
 */
export function matchFields(map: FormMap, a: Annonce, logical: Record<LogicalFieldName, LogicalField> = LOGICAL_FIELDS): MatchResult {
  type Candidate = FieldMatch & { order: number };
  const candidates: Candidate[] = [];
  let order = 0;

  for (const name of Object.keys(logical) as LogicalFieldName[]) {
    const value = name === "photos" ? { value: "" } : logicalValue(a, name);
    if (!value) continue;
    for (const field of map.fields) {
      const s = scoreLogical(field, name, logical[name]);
      if (s) candidates.push({ field, target: { kind: "logical", name }, ...value, ...s, order: order++ });
    }
  }
  const attrs = Object.entries(a.attributes ?? {});
  for (const [key, raw] of attrs) {
    const value = String(raw ?? "");
    if (!value) continue;
    for (const field of map.fields) {
      const s = scoreAttribute(field, key);
      if (s) candidates.push({ field, target: { kind: "attribute", key }, value, ...s, confidence: s.confidence - 0.01, order: order++ });
    }
  }

  candidates.sort((x, y) => y.confidence - x.confidence || x.order - y.order);
  const usedFields = new Set<FieldDescriptor>();
  const usedTargets = new Set<string>();
  const matches: FieldMatch[] = [];
  for (const c of candidates) {
    const t = c.target.kind === "logical" ? `l:${c.target.name}` : `a:${c.target.key}`;
    if (usedFields.has(c.field) || usedTargets.has(t)) continue;
    usedFields.add(c.field);
    usedTargets.add(t);
    const { order: _o, ...m } = c;
    matches.push(m);
  }
  const unmatchedAttributes = attrs.map(([k]) => k).filter((k) => !usedTargets.has(`a:${k}`));
  return { matches, unmatchedAttributes };
}
