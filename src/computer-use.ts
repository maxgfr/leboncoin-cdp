/**
 * Computer-use mode: everything an agent needs to fill (or finish) the Leboncoin
 * deposit wizard by screenshots / clicks / typing instead of CDP.
 *
 *   - `cu-sheet <slug>` → annonces/<slug>/computer-use.md (+ JSON): the deposit URL,
 *     every value to type in form order, absolute photo paths, the labels each
 *     wizard step shows (from form-map.json, if any), a resume block (from
 *     handoff.json, if any) and the safety rules.
 *   - `open [<slug>]` → launch/reuse the scraper browser on a page and leave the
 *     window open; prints the CDP port so another driver can attach.
 *   - handoff.json → written by `publish` when a CDP run ends not-ok for a reason a
 *     human/agent can finish by hand in the same window (see HANDOFF_REASONS).
 *   - `record <slug> --url <ad url>` → write back what was done by computer use.
 *
 * No config/browser import at module level: the browser is reached through
 * injectable deps so tests run with no browser and no profile side effects.
 */
import fs from "node:fs";
import path from "node:path";
import type { CDPClient } from "./cdp";
import { logicalValue } from "./field-match";
import { logger } from "./logger";
import { parseAnnonce, resolvePhotoPaths, writeAnnonce } from "./markdown";
import type { FillReport, PublishResult } from "./publish";
import { writeReadiness } from "./readiness";
import { DEPOSIT, type LogicalFieldName } from "./selectors";
import type { Annonce, AnnonceStatus } from "./types";
import { type ValidationResult, validateAnnonce } from "./validate";

export const HANDOFF_FILENAME = "handoff.json";
export const CU_SHEET_FILENAME = "computer-use.md";
const FORM_MAP_FILENAME = "form-map.json";

/** The deposit wizard's entry URL (the same one `publish`/`inspect` open). */
export const DEPOSIT_URL = DEPOSIT.startUrl;

/**
 * Publish outcomes a human/agent can finish by hand in the still-open window:
 * `incomplete` (--strict refused: required fields missing), `form-error` (--yes
 * stopped before the final step, the submit control was not found, or the site
 * rejected the form) and `not-published` (semi-auto timed out — the wizard got
 * stuck / stopped early, photos failed, or nobody submitted). Not handed off:
 * `login-required` (log in and re-run), and `diagnostic` / `dry-run`, which are
 * intentionally non-submitting.
 */
export const HANDOFF_REASONS = ["incomplete", "form-error", "not-published"] as const;

export const SAFETY_RULES = [
  "Fill ONLY the values in this sheet (they come from annonce.md); never invent content.",
  "Stop on the final review step (« Avant de publier » / « Je confirme l'exactitude… »): do NOT click the final « Continuer » / « Déposer mon annonce » unless the user explicitly asked for full-auto.",
  "A DataDome captcha / « Vérification » page is solved by the human, never by the agent: pause and ask.",
  "Verify every step with a screenshot before moving on.",
  "Once the ad is live, run `leboncoin record <slug> --url <ad url>` so annonce.md is updated.",
];

/* ─────────────────────────────── handoff ─────────────────────────────── */

export interface HandoffField {
  /** Report name (title, zipcode…), attribute key, or the form's own label. */
  field: string;
  required: boolean;
  /** The annonce value to put in it (null = not in annonce.md — ask the user). */
  value: string | null;
  note?: string;
}

export interface Handoff {
  reason: string;
  error?: string;
  /** How the wizard ended (final / missing-required / stuck / no-next / …). */
  wizard_stop?: string;
  /** The last wizard step reached (1-based), if known. */
  step: { index: number; title: string } | null;
  missing: HandoffField[];
  /** The publish run's verbatim "missing" lines (incl. stuck/no-next messages). */
  blockers: string[];
  /** Absolute paths of the photos not uploaded yet (empty when all went through). */
  remaining_photos: string[];
  preview_png: string | null;
  cdp_port: number | null;
  created_at: string;
}

const REPORT_TO_LOGICAL: Record<string, LogicalFieldName> = {
  title: "title",
  category: "category",
  description: "description",
  price: "price",
  zipcode: "location",
  condition: "condition",
  shipping: "shipping",
};

const fold = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s*\*$/, "") // the form's required asterisk (« État* »)
    .trim();

/** The annonce value for a fill-report field name (`title`, `attr:brand`, or a form label). */
export function annonceValue(a: Annonce, field: string): string | null {
  const logical = REPORT_TO_LOGICAL[field];
  if (logical) return logicalValue(a, logical)?.value ?? null;
  const key = field.startsWith("attr:") ? field.slice(5) : field;
  const attrs = a.attributes ?? {};
  if (key in attrs) return String(attrs[key]);
  const hit = Object.keys(attrs).find((k) => fold(k) === fold(key));
  return hit ? String(attrs[hit]) : null;
}

export function buildHandoff(
  a: Annonce,
  photos: string[],
  report: FillReport,
  result: Pick<PublishResult, "reason" | "error">,
  cdpPort: number | null,
): Handoff {
  const missing: HandoffField[] = report.fields
    .filter((f) => !f.filled)
    .map((f) => {
      const value = annonceValue(a, f.field);
      return {
        field: (f.field.startsWith("attr:") ? f.field.slice(5) : f.field).replace(/\s*\*$/, ""),
        required: f.required,
        value,
        ...(value === null ? { note: "not in annonce.md — ask the user" } : {}),
      };
    });
  const steps = report.formMapSteps ?? [];
  const last = steps.at(-1);
  return {
    reason: result.reason ?? "unknown",
    ...(result.error ? { error: result.error } : {}),
    wizard_stop: report.wizard?.stop,
    step: steps.length ? { index: steps.length, title: last?.step?.title ?? "" } : null,
    missing,
    blockers: report.missing,
    remaining_photos: report.uploadedPhotos < photos.length ? photos.slice(report.uploadedPhotos) : [],
    preview_png: report.previewPng ?? null,
    cdp_port: cdpPort,
    created_at: new Date().toISOString(),
  };
}

export function handoffPath(dir: string): string {
  return path.join(dir, HANDOFF_FILENAME);
}

export function readHandoff(dir: string): Handoff | null {
  try {
    return JSON.parse(fs.readFileSync(handoffPath(dir), "utf8")) as Handoff;
  } catch {
    return null;
  }
}

/** Remove handoff.json (true if one was there). */
export function clearHandoff(dir: string): boolean {
  try {
    fs.unlinkSync(handoffPath(dir));
    return true;
  } catch {
    return false;
  }
}

/**
 * End-of-run bookkeeping for `publish`: on success drop a stale handoff.json; on a
 * HANDOFF_REASONS failure write one (and point push-readiness.json at it). Other
 * outcomes (login-required, diagnostic, dry-run) leave handoff.json untouched.
 */
export function settleHandoff(dir: string, a: Annonce, photos: string[], r: PublishResult, cdpPort: number | null): PublishResult {
  if (r.ok) {
    if (clearHandoff(dir)) logger.info(`Removed the stale ${HANDOFF_FILENAME}`);
    return r;
  }
  if (!r.report || !(HANDOFF_REASONS as readonly string[]).includes(r.reason ?? "")) return r;
  const h = buildHandoff(a, photos, r.report, r, cdpPort);
  const file = handoffPath(dir);
  try {
    fs.writeFileSync(file, JSON.stringify(h, null, 2));
  } catch {
    return r;
  }
  r.handoff = file;
  if (r.report.readiness && r.report.readinessPath) {
    r.report.readiness.handoff = file;
    writeReadiness(r.report.readinessPath, r.report.readiness);
  }
  logger.warn(`handoff → computer use: read annonces/${a.slug}/${HANDOFF_FILENAME}, then finish in the open browser window (leboncoin cu-sheet ${a.slug})`);
  return r;
}

/* ─────────────────────────────── cu-sheet ─────────────────────────────── */

export interface CuStep {
  index: number;
  title: string;
  /** Labels of the required controls on that step. */
  required: string[];
  /** Every visible label on that step (required ones included). */
  labels: string[];
}

export interface CuSheet {
  slug: string;
  deposit_url: string;
  handoff: Handoff | null;
  values: {
    title: string;
    category: string;
    description: string;
    price: number;
    zipcode: string;
    city?: string;
    condition?: string;
    shipping?: boolean;
    attributes: Record<string, string>;
    photos: string[];
  };
  /** Per-step labels from form-map.json (null when it does not exist yet). */
  form_steps: CuStep[] | null;
  safety: string[];
}

export interface CuSheetResult {
  ok: boolean;
  validation: ValidationResult;
  sheet?: CuSheet;
  /** Where computer-use.md was written. */
  path?: string;
}

interface RawField {
  label?: string;
  altLabels?: string[];
  key?: string;
  required?: boolean;
}
interface RawStep {
  step?: { title?: string };
  fields?: RawField[];
}

/** Per-step visible labels + required ones, from form-map.json (`{ steps }` or a single map). */
export function readFormSteps(dir: string): CuStep[] | null {
  let raw: { steps?: RawStep[] } & RawStep;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(dir, FORM_MAP_FILENAME), "utf8"));
  } catch {
    return null;
  }
  const steps: RawStep[] = Array.isArray(raw.steps) ? raw.steps : Array.isArray(raw.fields) ? [raw] : [];
  return steps.map((s, i) => {
    const labels: string[] = [];
    const required: string[] = [];
    for (const f of s.fields ?? []) {
      const label = (f.label || f.altLabels?.[0] || f.key || "").trim();
      if (!label) continue;
      if (!labels.includes(label)) labels.push(label);
      if (f.required && !required.includes(label)) required.push(label);
    }
    return { index: i + 1, title: s.step?.title ?? "", required, labels };
  });
}

export function buildCuSheet(dir: string, a: Annonce): CuSheet {
  return {
    slug: a.slug,
    deposit_url: DEPOSIT_URL,
    handoff: readHandoff(dir),
    values: {
      title: a.title,
      category: a.category,
      description: a.description,
      price: a.price,
      zipcode: a.zipcode,
      ...(a.city ? { city: a.city } : {}),
      ...(a.condition ? { condition: a.condition } : {}),
      ...(a.shipping !== undefined ? { shipping: a.shipping } : {}),
      attributes: { ...a.attributes },
      photos: resolvePhotoPaths(dir, a),
    },
    form_steps: readFormSteps(dir),
    safety: SAFETY_RULES,
  };
}

/** Render the sheet as an ordered, human/agent-readable checklist. */
export function renderCuSheet(s: CuSheet): string {
  const v = s.values;
  const L: string[] = [`# Computer-use fill sheet — ${s.slug}`, ""];
  L.push("Generated by `leboncoin cu-sheet` from annonce.md. Fill ONLY these values, in this order, by finding each field by its visible label.");
  L.push("");

  const h = s.handoff;
  if (h) {
    L.push("## Resume from the CDP handoff", "");
    const at = h.step ? `step ${h.step.index}${h.step.title ? ` « ${h.step.title} »` : ""}` : "the current step";
    L.push(`The CDP run stopped (\`${h.reason}\`${h.wizard_stop ? `, wizard: ${h.wizard_stop}` : ""}${h.error ? ` — ${h.error}` : ""}) at ${at}.`);
    L.push(`Resume from ${at} in the window that is still open${h.cdp_port ? ` (CDP port ${h.cdp_port})` : ""}; do not restart the deposit.`);
    if (h.missing.length) {
      L.push("", "Remaining fields:");
      for (const m of h.missing) L.push(`- [ ] ${m.field}${m.required ? " (required)" : ""}: ${m.value ?? `— ${m.note ?? "ask the user"}`}`);
    }
    if (h.remaining_photos.length) {
      L.push("", "Remaining photos:");
      for (const p of h.remaining_photos) L.push(`- [ ] ${p}`);
    }
    if (h.blockers.length) {
      L.push("", "Reported by the run:");
      for (const b of h.blockers) L.push(`- ${b}`);
    }
    if (h.preview_png) L.push("", `Last screenshot: ${h.preview_png}`);
    L.push("");
  }

  L.push("## 1. Open the deposit form", "");
  L.push(`- URL: ${s.deposit_url}`);
  L.push(`- Or run \`leboncoin open ${s.slug} --deposit\`: it opens it in the logged-in scraper window and prints the CDP port.`);
  L.push("");

  L.push("## 2. Values, in form order", "");
  let n = 1;
  L.push(`${n++}. [ ] Title: ${v.title}`);
  L.push(`${n++}. [ ] Category: ${v.category} (pick it in the category picker; if it is not offered, pick the closest suggestion and tell the user)`);
  L.push(`${n++}. [ ] Description (type it verbatim):`, "", "````text", v.description, "````", "");
  L.push(`${n++}. [ ] Price: ${v.price} €`);
  L.push(`${n++}. [ ] Location: ${v.zipcode}${v.city ? ` ${v.city}` : ""} (type the zipcode, then pick the matching city suggestion)`);
  if (v.condition) L.push(`${n++}. [ ] Condition (État): ${v.condition}`);
  if (v.shipping !== undefined) L.push(`${n++}. [ ] Shipping / delivery: ${v.shipping ? "yes" : "no"}`);
  const attrs = Object.entries(v.attributes);
  if (attrs.length) {
    L.push(`${n++}. [ ] Attributes (field label → value):`);
    for (const [k, val] of attrs) L.push(`   - ${k} → ${val}`);
  }
  L.push(`${n++}. [ ] Photos (upload through the file dialog, in this order):`);
  for (const p of v.photos) L.push(`   - ${p}`);
  L.push("");

  if (s.form_steps?.length) {
    L.push("## 3. What each step shows (form-map.json)", "");
    for (const st of s.form_steps) {
      L.push(`### Step ${st.index}${st.title ? ` — « ${st.title} »` : ""}`, "");
      L.push(`- Required: ${st.required.length ? st.required.join(", ") : "(none detected)"}`);
      const other = st.labels.filter((l) => !st.required.includes(l));
      if (other.length) L.push(`- Other labels: ${other.join(", ")}`);
      L.push("");
    }
  }

  L.push("## Safety rules", "");
  for (const r of s.safety) L.push(`- ${r.replace("<slug>", s.slug)}`);
  L.push("");
  L.push("## When the ad is live", "");
  L.push(`\`leboncoin record ${s.slug} --url <ad url>\` (writes leboncoin_url / leboncoin_id / status back to annonce.md).`);
  L.push("");
  return L.join("\n");
}

/** `cu-sheet <slug>`: validate, then write computer-use.md. Refuses an invalid annonce. */
export function runCuSheet(annoncesDir: string, slug: string): CuSheetResult {
  const dir = path.join(annoncesDir, slug);
  const validation = validateAnnonce(dir);
  if (!validation.ok) return { ok: false, validation };
  const sheet = buildCuSheet(dir, parseAnnonce(dir));
  const file = path.join(dir, CU_SHEET_FILENAME);
  fs.writeFileSync(file, renderCuSheet(sheet));
  return { ok: true, validation, sheet, path: file };
}

/* ───────────────────────────────── open ───────────────────────────────── */

export interface OpenOptions {
  /** Navigate here (wins over everything else). */
  url?: string;
  /** Open the deposit form even if the annonce is already published. */
  deposit?: boolean;
}

export interface OpenDeps {
  connect: (url: string) => Promise<CDPClient>;
  /** The CDP port of the browser `connect` reached. */
  port: () => Promise<number>;
}

export interface OpenResult {
  url: string;
  port: number;
  endpoint: string;
}

/** --url > the slug's live ad (published/paused, unless --deposit) > the deposit form. */
export function resolveOpenUrl(annoncesDir: string, slug: string | undefined, opts: OpenOptions = {}): string {
  if (opts.url) {
    if (!/^https?:\/\//i.test(opts.url)) throw new Error(`--url must be an http(s) URL (got "${opts.url}")`);
    return opts.url;
  }
  if (slug && !opts.deposit) {
    const a = parseAnnonce(path.join(annoncesDir, slug));
    if (a.leboncoin_url && (a.status === "published" || a.status === "paused")) return a.leboncoin_url;
  }
  return DEPOSIT_URL;
}

async function defaultOpenConnect(url: string): Promise<CDPClient> {
  const { connectAndNavigate } = await import("./browser");
  return connectAndNavigate(url);
}

async function defaultOpenPort(): Promise<number> {
  const { config } = await import("./config");
  return config.browser.debuggingPort;
}

/** `open`: launch/reuse the scraper browser on the page, then let go of it (window stays open). */
export async function runOpen(annoncesDir: string, slug: string | undefined, opts: OpenOptions = {}, deps: Partial<OpenDeps> = {}): Promise<OpenResult> {
  const url = resolveOpenUrl(annoncesDir, slug, opts);
  const cdp = await (deps.connect ?? defaultOpenConnect)(url);
  cdp.disconnect();
  const port = await (deps.port ?? defaultOpenPort)();
  return { url, port, endpoint: `http://127.0.0.1:${port}` };
}

/* ──────────────────────────────── record ──────────────────────────────── */

const RECORD_STATUSES: AnnonceStatus[] = ["published", "sold", "paused", "deleted"];

/** The numeric list_id of a Leboncoin ad URL (same patterns `publish` uses), or null. */
export function adIdFromUrl(url: string): string | null {
  for (const re of DEPOSIT.publishedUrlPattern) {
    const m = url.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** A leboncoin.fr ad URL's id; throws on anything else. */
export function parseAdUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`not a URL: "${url}"`);
  }
  const host = u.hostname.toLowerCase();
  if (!/^https?:$/.test(u.protocol) || (host !== "leboncoin.fr" && !host.endsWith(".leboncoin.fr"))) {
    throw new Error(`not a leboncoin.fr URL: "${url}"`);
  }
  const id = adIdFromUrl(u.pathname + u.search);
  if (!id) throw new Error(`not a Leboncoin ad URL (expected https://www.leboncoin.fr/ad/<category>/<id>): "${url}"`);
  return id;
}

export interface RecordOptions {
  url: string;
  status?: string;
}

export interface RecordResult {
  slug: string;
  status: AnnonceStatus;
  leboncoin_id: string;
  leboncoin_url: string;
  published_at?: string;
  handoffRemoved: boolean;
}

/** `record`: write back an action done by computer use (ad URL/id, status, timestamps). */
export function runRecord(annoncesDir: string, slug: string, opts: RecordOptions): RecordResult {
  const status = (opts.status ?? "published") as AnnonceStatus;
  if (!RECORD_STATUSES.includes(status)) throw new Error(`--status must be one of ${RECORD_STATUSES.join(", ")} (got "${opts.status}")`);
  const id = parseAdUrl(opts.url);
  const dir = path.join(annoncesDir, slug);
  const a = parseAnnonce(dir);
  const now = new Date().toISOString();
  a.leboncoin_url = opts.url;
  a.leboncoin_id = id;
  a.status = status;
  if (status === "published" && !a.published_at) a.published_at = now;
  if (status === "sold" && !a.sold_at) a.sold_at = now;
  if (status === "paused" && !a.paused_at) a.paused_at = now;
  if (status === "deleted" && !a.deleted_at) a.deleted_at = now;
  writeAnnonce(dir, a);
  const handoffRemoved = clearHandoff(dir);
  return { slug, status, leboncoin_id: id, leboncoin_url: opts.url, published_at: a.published_at, handoffRemoved };
}
