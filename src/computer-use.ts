/**
 * Computer-use mode: everything an agent needs to perform an account action on
 * Leboncoin by screenshots / clicks / typing in the user's OWN, already logged-in
 * browser, instead of CDP.
 *
 *   - `cu-sheet <slug> [--action <a>]` → annonces/<slug>/computer-use.md (+ JSON).
 *     publish (default): the deposit URL, every value to type in form order, absolute
 *     photo paths + the OS file-dialog recipe, the labels each wizard step shows (from
 *     form-map.json, if any), a resume block (from handoff.json, if any) and the safety
 *     rules. edit / delete / renew / mark-sold / deactivate / reactivate: an ordered
 *     playbook (start URL, how to find the ad, the controls to click, the proof of
 *     success, the stop rule and the `record` command to run afterwards).
 *   - `open [<slug>] --real [--action <a>]` → open the target page in the user's own
 *     browser through the OS (`open -a <App>` / `xdg-open`): no CDP, no scraper profile.
 *   - `open [<slug>]` (advanced, CDP engine) → launch/reuse the scraper browser on a page
 *     and leave the window open; prints the CDP port so another driver can attach.
 *   - handoff.json → written by `publish` when a CDP run ends not-ok for a reason a
 *     human/agent can finish by hand in the same window (see HANDOFF_REASONS).
 *   - `record <slug> --url <ad url>` → write back what was done by computer use.
 *
 * Drivers for the user's own browser, in order: the Claude in Chrome extension (Chrome or
 * Brave; its own tab, refs, `file_upload` for photos), else desktop computer use (pixels) on
 * the window `open --real` opened. dev-browser (optional, never a dependency) only applies to
 * the CDP engine: it attaches with `dev-browser --connect <port>` to the scraper window. The
 * user's real browser exposes no CDP port.
 *
 * No config/browser/child_process import at module level: the browser and the OS
 * opener are reached through injectable deps so tests run with no browser and no
 * profile side effects.
 */
import fs from "node:fs";
import path from "node:path";
import type { CDPClient } from "./cdp";
import { logicalValue } from "./field-match";
import { logger } from "./logger";
import { PHOTOS_DIRNAME, parseAnnonce, resolvePhotoPaths, writeAnnonce } from "./markdown";
import type { FillReport, PublishResult } from "./publish";
import { writeReadiness } from "./readiness";
import { type ButtonSelector, DEPOSIT, type LogicalFieldName, MANAGE } from "./selectors";
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

const CLAUDE_IN_CHROME_RULE =
  "Claude in Chrome: work in a new tab and close it at the end; never trigger a native alert/confirm dialog (it freezes the extension) — if one appears, ask the user to dismiss it.";

export const SAFETY_RULES = [
  "Fill ONLY the values in this sheet (they come from annonce.md); never invent content.",
  "Stop on the final review step (« Avant de publier » / « Je confirme l'exactitude… »): do NOT click the final « Continuer » / « Déposer mon annonce » unless the user explicitly asked for full-auto.",
  "A DataDome captcha / « Vérification » page is solved by the human, never by the agent: pause and ask.",
  "Work in the user's own browser (`leboncoin open <slug> --real`), where they are already logged in: never type their password, never log in for them.",
  "Take a screenshot before every step and check it before moving on.",
  CLAUDE_IN_CHROME_RULE,
  "Advanced CDP engine only: dev-browser must stay attached to the scraper window (`dev-browser --connect <port>`): never let it launch its own browser (not logged in, automation flags).",
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
  /** Ready-to-run attach command for the recommended driver (only when cdp_port is known). */
  driver_hint?: string;
  created_at: string;
}

/* ───────────────────────────── dev-browser ───────────────────────────── */

export const DEV_BROWSER_BIN = "dev-browser";
export const DEV_BROWSER_INSTALL_HINT = "optional: npm i -g dev-browser for snapshot/ref driving";

/** The attach command for the scraper window on `port` (never a launch). */
export function devBrowserCommand(port: number | string): string {
  return `${DEV_BROWSER_BIN} --connect ${port}`;
}

/** Absolute path of an executable named `name` on PATH, or null. Sync, spawns nothing. */
export function findOnPath(name: string, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string | null {
  const exts = platform === "win32" ? ["", ...(env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)] : [""];
  const sep = platform === "win32" ? ";" : ":";
  for (const dir of (env.PATH ?? env.Path ?? "").split(sep)) {
    if (!dir) continue;
    for (const ext of exts) {
      const file = path.join(dir, name + ext);
      try {
        if (!fs.statSync(file).isFile()) continue;
        if (platform !== "win32") fs.accessSync(file, fs.constants.X_OK);
        return file;
      } catch {
        // not there / not executable
      }
    }
  }
  return null;
}

export interface DevBrowserInfo {
  available: boolean;
  /** The attach command (what to run once installed when not available). */
  command: string;
}

export function detectDevBrowser(port: number, which: (name: string) => string | null = findOnPath): DevBrowserInfo {
  return { available: which(DEV_BROWSER_BIN) !== null, command: devBrowserCommand(port) };
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
    ...(cdpPort ? { driver_hint: devBrowserCommand(cdpPort) } : {}),
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
  action: "publish";
  deposit_url: string;
  /** Same as deposit_url: the page `open <slug> --real` opens for this action. */
  start_url: string;
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
    /** Absolute path of the photos folder (what to paste in the OS file dialog). */
    photos_dir: string;
  };
  /** Per-step labels from form-map.json (null when it does not exist yet). */
  form_steps: CuStep[] | null;
  safety: string[];
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
    action: "publish",
    deposit_url: DEPOSIT_URL,
    start_url: DEPOSIT_URL,
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
      photos_dir: path.resolve(dir, PHOTOS_DIRNAME),
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
    L.push(
      `Resume from ${at} in the scraper window that is still open${h.cdp_port ? ` (CDP port ${h.cdp_port})` : ""}; do not restart the deposit. (This is the advanced CDP engine's window, not your own browser.)`,
    );
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
  L.push(`- Run \`leboncoin open ${s.slug} --real\`: it opens it in the user's own browser (already logged in) through the OS — no CDP, no scraper profile.`);
  L.push("- With Claude in Chrome, that is optional: navigate your own new tab to the URL.");
  L.push(
    `- Advanced (CDP engine): \`leboncoin open ${s.slug} --deposit\` opens it in the isolated scraper window (logged in once with \`leboncoin login\`) and prints the CDP port.`,
  );
  L.push("");

  const port = s.handoff?.cdp_port ?? "<port>";
  L.push("## How to drive", "");
  for (const line of ownBrowserDrivers(`leboncoin open ${s.slug} --real`, true)) L.push(line);
  L.push(
    `3. Advanced (CDP engine, scraper window only): dev-browser attached to it — \`${devBrowserCommand(port)}\` (port printed by \`leboncoin open --deposit\`; optional: \`npm i -g dev-browser\`). Never let it launch its own browser.`,
  );
  L.push('   Loop: look (`page.snapshot({ interactive: true })`) → act by ref (`page.click("ref/eN")`, `page.fill("ref/eN", …)`) → verify (snapshot again).');
  L.push("   Work in the tab `leboncoin open` already opened (`browser.listPages()` → `browser.getPage(id)`); do not restart the deposit.");
  L.push("   For the photos, call `uploadFile` on the file input with the absolute paths below — no OS file dialog.");
  L.push("", "Example (advanced; refs come from your own snapshot):", "");
  L.push("```bash");
  L.push(`${devBrowserCommand(port)} -t 30 <<'EOF'`);
  L.push('const tab = (await browser.listPages()).find((p) => p.url.includes("deposer-une-annonce"));');
  L.push("const page = await browser.getPage(tab.id);");
  L.push("console.log(await page.snapshot({ interactive: true }));");
  L.push(`await page.fill("ref/e7", ${JSON.stringify(v.title)}); // the title field's ref`);
  L.push(`await (await page.$("input[type=file]")).uploadFile(...${JSON.stringify(v.photos)});`);
  L.push("EOF");
  L.push("```", "");

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
  L.push(
    `${n++}. [ ] Photos (in this order — Claude in Chrome: file_upload with these paths; desktop computer use: the file dialog below; dev-browser: uploadFile with these paths):`,
  );
  for (const p of v.photos) L.push(`   - ${p}`);
  L.push("");

  L.push("## Photos via the file dialog", "");
  L.push(`Photos folder: ${v.photos_dir}`, "");
  for (const line of fileDialogRecipe(v.photos.length)) L.push(line);
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

/**
 * The two drivers for the user's own browser, in order of preference: the Claude in Chrome
 * extension (when its tools are in the session), else desktop computer use on the window
 * `openCmd` opened. `photos`: add each driver's photo-upload line.
 */
export function ownBrowserDrivers(openCmd: string, photos: boolean): string[] {
  const L = [
    "1. Preferred: the Claude in Chrome extension, if its tools (`mcp__claude-in-chrome__*`) are available in this session. It drives the user's real, logged-in Chrome or Brave, so `open --real` is optional.",
    "   - `tabs_context_mcp`, then `tabs_create_mcp`: work in a new tab of your own, `navigate` it to the start URL, and close it at the end.",
    '   - Loop: look (`read_page` with `filter: "interactive"`, or `find` by label) → act by ref (`form_input` for text fields, `computer` to click) → verify (`read_page` again).',
    "   - Take a `computer` screenshot before every irreversible step (the stop rule) and check it.",
    "   - Never trigger a native alert/confirm dialog (it freezes the extension); if one appears, ask the user to dismiss it. Leboncoin's confirmations are in-page modals: fine.",
  ];
  if (photos) {
    L.push(
      "   - For the photos, `file_upload` on the file input's ref with the absolute paths below; never click the file input. It needs the photos folder shared with the session (e.g. a connected folder), max 10 MB per call; otherwise use desktop computer use and the file-dialog recipe below.",
    );
  }
  L.push(`2. Else: desktop computer use (screenshots, clicks, typing) on the window \`${openCmd}\` opened. Loop: screenshot → act → screenshot to verify.`);
  if (photos) L.push("   For the photos, use the OS file dialog (recipe below).");
  return L;
}

/** The OS file-dialog steps to upload every photo of `dir` (macOS, then Linux/GTK). */
export function fileDialogRecipe(count: number): string[] {
  const add = DEPOSIT.photoAddButton.textCandidates.map(quote).join(" / ");
  return [
    `1. Click the add-photos control (${add}): the OS file dialog opens.`,
    "2. macOS: press Cmd+Shift+G, paste the photos folder path above, press Enter.",
    "   Linux (GTK): press Ctrl+L, type the photos folder path above, press Enter.",
    "3. Press Cmd+A (Linux: Ctrl+A) to select every photo of the folder — or Cmd/Ctrl-click only the files listed above if the folder holds others.",
    "4. Click « Ouvrir » / « Open ».",
    `5. Wait for the thumbnails, then check that ${count} thumbnail(s) show. Reorder them on the page if the order matters.`,
  ];
}

/* ───────────────────────────── action playbooks ───────────────────────────── */

/** Every account action `cu-sheet --action` and `open --action` know. */
export const CU_ACTIONS = ["publish", "edit", "delete", "renew", "mark-sold", "deactivate", "reactivate"] as const;
export type CuAction = (typeof CU_ACTIONS)[number];
export type CuManageAction = Exclude<CuAction, "publish">;

export function isCuAction(x: string): x is CuAction {
  return (CU_ACTIONS as readonly string[]).includes(x);
}

/** Parse `--action` (undefined → publish); throws on an unknown action. */
export function parseCuAction(raw: string | undefined): CuAction {
  if (raw === undefined) return "publish";
  if (!isCuAction(raw)) throw new Error(`--action must be one of ${CU_ACTIONS.join(", ")} (got "${raw}")`);
  return raw;
}

function quote(t: string): string {
  return `« ${t} »`;
}
function labels(b: ButtonSelector): string {
  return b.textCandidates.map(quote).join(" / ");
}
function anyOf(markers: string[]): string {
  return markers.map(quote).join(", ");
}

interface ActionPlan {
  /** Local statuses this action expects (same as the CDP engine; a mismatch is a note, not a refusal). */
  allow: AnnonceStatus[];
  /** What it does, one line. */
  summary: string;
  control: ButtonSelector;
  /** Confirmation dialog control (if the site asks). */
  confirm?: ButtonSelector;
  /** The proof the CDP engine requires before changing the local status. */
  proof: string[];
  /** The stop rule before the decisive click. */
  stop: string;
  /** `record --status` value (edit: the current status instead). */
  record: string;
  /** Start in « Mes annonces » even when the ad URL is known (a paused ad's page may be hidden). */
  listingFirst?: boolean;
}

const IRREVERSIBLE_STOP =
  "Irreversible: ask the user to confirm in the chat (this exact ad, by title and price) before the click and its confirmation. Their explicit go-ahead is the consent.";
const REVERSIBLE_STOP = "Reversible: the user's request is the consent. Still check the ad (title, price) on a screenshot before the click.";

const ACTION_PLANS: Record<CuManageAction, ActionPlan> = {
  edit: {
    allow: ["published", "paused"],
    summary: "Re-open the ad's modify form and make it match annonce.md (photos stay as they are).",
    control: MANAGE.editButton,
    proof: ["after saving, the ad page shows the new values (title, price, description)"],
    stop: `Stop before ${labels(MANAGE.saveButton)}: screenshot the filled form and let the user review and save it, unless they explicitly asked you to save.`,
    record: "published",
  },
  delete: {
    allow: ["published", "paused"],
    summary: "Remove the ad from Leboncoin. Irreversible.",
    control: MANAGE.deleteButton,
    confirm: MANAGE.confirmButton,
    proof: [`the page says one of: ${anyOf(MANAGE.deletedMarkers)}`, `or, reloading the ad URL, it shows one of: ${anyOf(MANAGE.goneMarkers)}`],
    stop: IRREVERSIBLE_STOP,
    record: "deleted",
  },
  renew: {
    allow: ["published"],
    summary: "Bump the ad (« Remettre en avant »); no status change.",
    control: MANAGE.renewButton,
    confirm: MANAGE.manageConfirmButton,
    proof: ["Leboncoin shows no reliable confirmation text for a bump: check that « Mes annonces » lists the ad as freshly put forward."],
    stop: "A bump may open a paid-option page (a price, « options », a payment form): stop there and ask the user. Never pay and never type payment details.",
    record: "renewed",
  },
  "mark-sold": {
    allow: ["published", "paused"],
    summary: "Mark the ad as sold (it leaves the search results). Irreversible.",
    control: MANAGE.markSoldButton,
    confirm: MANAGE.manageConfirmButton,
    proof: [`the page says one of: ${anyOf(MANAGE.soldMarkers)}`],
    stop: IRREVERSIBLE_STOP,
    record: "sold",
  },
  deactivate: {
    allow: ["published"],
    summary: "Pause the ad without deleting it (reversible with reactivate).",
    control: MANAGE.deactivateButton,
    confirm: MANAGE.manageConfirmButton,
    proof: [`the page says one of: ${anyOf(MANAGE.pausedMarkers)}`, `or the ad now offers ${labels(MANAGE.reactivateButton)}`],
    stop: REVERSIBLE_STOP,
    record: "paused",
  },
  reactivate: {
    allow: ["paused"],
    summary: "Put a paused ad back online.",
    control: MANAGE.reactivateButton,
    confirm: MANAGE.manageConfirmButton,
    proof: [`the page says one of: ${anyOf(MANAGE.reactivatedMarkers)}`, `or the ad now offers ${labels(MANAGE.deactivateButton)}`],
    stop: REVERSIBLE_STOP,
    record: "published",
    listingFirst: true,
  },
};

export const ACTION_SAFETY = [
  "Act only on the ad described in this sheet: check its title and price on a screenshot before any click.",
  "Work in the user's own browser (`leboncoin open <slug> --real --action <action>`), where they are already logged in: never type their password, never log in for them. A login page means: stop and ask the user to log in themselves.",
  "Take a screenshot before every step and check it before moving on.",
  CLAUDE_IN_CHROME_RULE,
  "A DataDome captcha / « Vérification » page is solved by the human, never by the agent: pause and ask.",
  "Never pay, never accept a paid option, never type payment details.",
  "No proof of success → do NOT run `record`: screenshot, tell the user, and let them check « Mes annonces ».",
];

/** Where an action starts: the deposit form (publish), the ad page when known (not for reactivate), else « Mes annonces ». */
export function actionStartUrl(a: Annonce | null, action: CuAction): string {
  if (action === "publish") return DEPOSIT_URL;
  if (!a?.leboncoin_url || ACTION_PLANS[action].listingFirst) return MANAGE.listingUrl;
  return a.leboncoin_url;
}

export interface CuActionSheet {
  slug: string;
  action: CuManageAction;
  summary: string;
  start_url: string;
  /** The ad as annonce.md knows it (what to look for on screen). */
  ad: { title: string; price: number; status: AnnonceStatus; leboncoin_id: string | null; leboncoin_url: string | null };
  /** Ordered steps, as rendered in computer-use.md. */
  steps: string[];
  /** edit only: the values the modify form must end up with (from annonce.md). */
  changes?: { field: string; value: string }[];
  proof: string[];
  stop_rule: string;
  /** The exact command to run once the proof is on screen. */
  record: string;
  /** Things to check first (status mismatch, unknown ad URL…). */
  notes: string[];
  safety: string[];
}

function editChanges(dir: string, a: Annonce): { field: string; value: string }[] {
  const c: { field: string; value: string }[] = [
    { field: "Title", value: a.title },
    { field: "Description", value: a.description },
    { field: "Price", value: `${a.price} €` },
    { field: "Location", value: `${a.zipcode}${a.city ? ` ${a.city}` : ""}` },
  ];
  if (a.condition) c.push({ field: "Condition (État)", value: a.condition });
  if (a.shipping !== undefined) c.push({ field: "Shipping / delivery", value: a.shipping ? "yes" : "no" });
  for (const [k, v] of Object.entries(a.attributes ?? {})) c.push({ field: k, value: String(v) });
  c.push({ field: "Photos", value: `leave them as they are unless the user asked (folder: ${path.resolve(dir, PHOTOS_DIRNAME)})` });
  return c;
}

export function buildActionSheet(dir: string, a: Annonce, action: CuManageAction): CuActionSheet {
  const plan = ACTION_PLANS[action];
  const start = actionStartUrl(a, action);
  const known = Boolean(a.leboncoin_url);
  const who = `title ${quote(a.title)}, price ${a.price} €${a.leboncoin_id ? `, id ${a.leboncoin_id}` : ""}`;
  const recordStatus = action === "edit" ? (a.status === "paused" ? "paused" : "published") : plan.record;
  const record = `leboncoin record ${a.slug} --url ${a.leboncoin_url ?? "<ad url>"} --status ${recordStatus}`;

  const notes: string[] = [];
  if (!plan.allow.includes(a.status)) {
    notes.push(
      `annonce.md says status "${a.status}" (this action expects ${plan.allow.join(" or ")}): check the ad's real state in « Mes annonces » first, and stop if the action does not apply.`,
    );
  }
  if (!known) {
    notes.push(
      "annonce.md has no leboncoin_url: find the ad in « Mes annonces » by its title and price, open it, and copy its URL from the address bar for the `record` command.",
    );
  }

  const steps: string[] = [
    `Open ${start}: with Claude in Chrome, navigate your own new tab there; else run \`leboncoin open ${a.slug} --real --action ${action}\` (the user's own browser). Screenshot it.`,
  ];
  steps.push("If a login page or a « Vérification » captcha shows: stop and ask the user to handle it, then screenshot again.");
  if (start === MANAGE.listingUrl) steps.push(`In « Mes annonces » (${MANAGE.listingUrl}), find the ad's card: ${who}.`);
  else steps.push(`The page is the ad itself: check it is ${who}. If it is gone, find its card in « Mes annonces » (${MANAGE.listingUrl}).`);
  steps.push(
    `Find the control ${labels(plan.control)}: on the ad page, else in its « … » menu (${labels(MANAGE.overflowMenu)}), else on the ad's card in « Mes annonces ».`,
  );
  if (action === "edit") {
    steps.push("Click it: the modify form opens (the same wizard as the deposit). Screenshot it.");
    steps.push(
      "Make every field match the values below, finding each by its visible label; the category usually cannot be changed. Move through the steps with « Continuer ».",
    );
    steps.push(`STOP RULE: ${plan.stop}`);
  } else {
    steps.push(`STOP RULE: ${plan.stop}`);
    steps.push("Click the control. Screenshot.");
    if (plan.confirm) steps.push(`If a confirmation dialog shows, click ${labels(plan.confirm)}. Screenshot.`);
  }
  steps.push(`Look for the proof of success: ${plan.proof.join("; ")}.`);
  steps.push(`Only with that proof, run \`${record}\`${known ? "" : " (replace <ad url> with the ad's URL)"}.`);

  return {
    slug: a.slug,
    action,
    summary: plan.summary,
    start_url: start,
    ad: { title: a.title, price: a.price, status: a.status, leboncoin_id: a.leboncoin_id ?? null, leboncoin_url: a.leboncoin_url ?? null },
    steps,
    ...(action === "edit" ? { changes: editChanges(dir, a) } : {}),
    proof: plan.proof,
    stop_rule: plan.stop,
    record,
    notes,
    safety: ACTION_SAFETY.map((r) => r.replace("<slug>", a.slug).replace("<action>", action)),
  };
}

export function renderActionSheet(s: CuActionSheet): string {
  const L: string[] = [`# Computer-use playbook — ${s.action} — ${s.slug}`, ""];
  L.push(`Generated by \`leboncoin cu-sheet ${s.slug} --action ${s.action}\` from annonce.md. ${s.summary}`);
  L.push("Done by computer use in the user's own, already logged-in browser.", "");
  L.push("## The ad", "");
  L.push(`- Title: ${s.ad.title}`, `- Price: ${s.ad.price} €`, `- Local status: ${s.ad.status}`);
  L.push(`- leboncoin_id: ${s.ad.leboncoin_id ?? "(unknown)"}`, `- leboncoin_url: ${s.ad.leboncoin_url ?? "(unknown: find it in « Mes annonces »)"}`);
  L.push(`- Start URL: ${s.start_url}`, "");
  if (s.notes.length) {
    L.push("## Check first", "");
    for (const n of s.notes) L.push(`- ${n}`);
    L.push("");
  }
  L.push("## How to drive", "");
  for (const line of ownBrowserDrivers(`leboncoin open ${s.slug} --real --action ${s.action}`, false)) L.push(line);
  L.push("");
  L.push("## Steps", "");
  s.steps.forEach((st, i) => L.push(`${i + 1}. [ ] ${st}`));
  L.push("");
  if (s.changes) {
    L.push("## Values the form must end up with (annonce.md)", "");
    for (const c of s.changes) {
      if (c.field === "Description") L.push("- Description (type it verbatim):", "", "````text", c.value, "````", "");
      else L.push(`- ${c.field}: ${c.value}`);
    }
    L.push("");
  }
  L.push("## Proof of success", "");
  for (const p of s.proof) L.push(`- ${p}`);
  L.push("", "## Stop rule", "", s.stop_rule, "");
  L.push("## Safety rules", "");
  for (const r of s.safety) L.push(`- ${r}`);
  L.push("", "## Afterwards", "", `\`${s.record}\``, "");
  return L.join("\n");
}

export interface CuSheetResult {
  ok: boolean;
  validation: ValidationResult;
  sheet?: CuSheet | CuActionSheet;
  /** Where computer-use.md was written. */
  path?: string;
  /** Why the sheet was refused, when it is not a validation failure. */
  error?: string;
}

/**
 * `cu-sheet <slug> [--action <a>]`: write computer-use.md.
 *  - publish: refuses an invalid annonce (the full validate gate).
 *  - edit: refuses invalid values (the same gate minus its `status: draft` rule).
 *  - other actions: no content gate. Only a `deleted` annonce is refused; a missing
 *    leboncoin_url or a status mismatch becomes a « Check first » note (find the ad in
 *    « Mes annonces » by title and price) instead of a refusal.
 */
export function runCuSheet(annoncesDir: string, slug: string, action: CuAction = "publish"): CuSheetResult {
  const dir = path.join(annoncesDir, slug);
  const full = validateAnnonce(dir);
  const gate = action === "publish" ? () => true : action === "edit" ? (f: string) => f !== "status" : (f: string) => f === "file";
  const issues = full.issues.filter((i) => gate(i.field));
  const validation: ValidationResult = { ...full, issues, ok: issues.length === 0 };
  if (!validation.ok) return { ok: false, validation };
  const a = parseAnnonce(dir);
  if (action !== "publish" && a.status === "deleted") {
    return { ok: false, validation, error: `annonce "${slug}" is "deleted": there is no ad left to ${action}` };
  }
  const file = path.join(dir, CU_SHEET_FILENAME);
  const sheet = action === "publish" ? buildCuSheet(dir, a) : buildActionSheet(dir, a, action);
  fs.writeFileSync(file, sheet.action === "publish" ? renderCuSheet(sheet) : renderActionSheet(sheet));
  return { ok: true, validation, sheet, path: file };
}

/* ───────────────────────────────── open ───────────────────────────────── */

export interface OpenOptions {
  /** Navigate here (wins over everything else). */
  url?: string;
  /** Open the deposit form even if the annonce is already published. */
  deposit?: boolean;
  /** Open the start page of this account action (see actionStartUrl). */
  action?: CuAction;
}

export interface OpenDeps {
  connect: (url: string) => Promise<CDPClient>;
  /** The CDP port of the browser `connect` reached. */
  port: () => Promise<number>;
  /** PATH lookup for the optional dev-browser driver (default: findOnPath). */
  which: (name: string) => string | null;
}

export interface OpenResult {
  url: string;
  port: number;
  endpoint: string;
  devBrowser: DevBrowserInfo;
}

/** --url > the action's start page (--action) > the slug's live ad (published/paused, unless --deposit) > the deposit form. */
export function resolveOpenUrl(annoncesDir: string, slug: string | undefined, opts: OpenOptions = {}): string {
  if (opts.url) {
    if (!/^https?:\/\//i.test(opts.url)) throw new Error(`--url must be an http(s) URL (got "${opts.url}")`);
    return opts.url;
  }
  if (opts.action) return actionStartUrl(slug ? parseAnnonce(path.join(annoncesDir, slug)) : null, opts.action);
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
  return { url, port, endpoint: `http://127.0.0.1:${port}`, devBrowser: detectDevBrowser(port, deps.which) };
}

/* ──────────────────────────── open --real ──────────────────────────── */

/** Runs an OS command (argument array, no shell) and resolves once it started. */
export type Opener = (cmd: string, args: string[]) => Promise<void>;

export interface RealOpenDeps {
  platform: NodeJS.Platform;
  /** The remembered / detected browser binary (null = unknown → the default browser). */
  browserPath: () => Promise<string | null>;
  opener: Opener;
}

export interface RealOpenResult {
  url: string;
  mode: "real";
  /** The macOS app it was opened with, or "default" (the OS default browser). */
  browser: string;
}

/** The macOS .app name of a browser binary (`/Applications/Brave Browser.app/Contents/MacOS/Brave Browser` → `Brave Browser`), or null. */
export function macAppName(binaryPath: string): string | null {
  const m = binaryPath.match(/([^/]+)\.app(?:\/|$)/);
  return m?.[1] ?? null;
}

/** The OS command that opens `url` in the user's own browser: macOS `open -a <App> <url>` (else `open <url>`), Linux `xdg-open <url>`. */
export function realOpenCommand(url: string, platform: NodeJS.Platform, browserPath: string | null): { cmd: string; args: string[]; browser: string } {
  if (platform === "darwin") {
    const app = browserPath ? macAppName(browserPath) : null;
    return app ? { cmd: "open", args: ["-a", app, url], browser: app } : { cmd: "open", args: [url], browser: "default" };
  }
  if (platform === "linux") return { cmd: "xdg-open", args: [url], browser: "default" };
  throw new Error(`open --real supports macOS and Linux only (this is ${platform}): open ${url} in your browser by hand`);
}

async function defaultBrowserPath(): Promise<string | null> {
  const { config } = await import("./config");
  return config.browser.chromePath || null;
}

/** Spawn detached with an argument array (no shell); resolves once the process started. */
async function defaultOpener(cmd: string, args: string[]): Promise<void> {
  const { spawn } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

/** `open --real`: open the page in the user's own (already logged-in) browser through the OS — no CDP, no scraper profile. */
export async function runOpenReal(
  annoncesDir: string,
  slug: string | undefined,
  opts: OpenOptions = {},
  deps: Partial<RealOpenDeps> = {},
): Promise<RealOpenResult> {
  const url = resolveOpenUrl(annoncesDir, slug, opts);
  const platform = deps.platform ?? process.platform;
  const bin = platform === "darwin" ? await (deps.browserPath ?? defaultBrowserPath)() : null;
  const { cmd, args, browser } = realOpenCommand(url, platform, bin);
  await (deps.opener ?? defaultOpener)(cmd, args);
  return { url, mode: "real", browser };
}

/* ──────────────────────────────── record ──────────────────────────────── */

/** `renewed` = a bump: the ad stays `published`, `renewed_at` is stamped. */
export const RECORD_STATUSES = ["published", "sold", "paused", "deleted", "renewed"] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

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
  renewed_at?: string;
  handoffRemoved: boolean;
}

/** `record`: write back an action done by computer use (ad URL/id, status, timestamps). */
export function runRecord(annoncesDir: string, slug: string, opts: RecordOptions): RecordResult {
  const given = (opts.status ?? "published") as RecordStatus;
  if (!RECORD_STATUSES.includes(given)) throw new Error(`--status must be one of ${RECORD_STATUSES.join(", ")} (got "${opts.status}")`);
  const status: AnnonceStatus = given === "renewed" ? "published" : given;
  const id = parseAdUrl(opts.url);
  const dir = path.join(annoncesDir, slug);
  const a = parseAnnonce(dir);
  const now = new Date().toISOString();
  const wasPaused = a.status === "paused";
  a.leboncoin_url = opts.url;
  a.leboncoin_id = id;
  a.status = status;
  if (status === "published" && !a.published_at) a.published_at = now;
  // Reactivated (paused → published): clear paused_at, like the CDP `reactivate`.
  if (status === "published" && wasPaused) a.paused_at = undefined;
  if (given === "renewed") a.renewed_at = now;
  if (status === "sold" && !a.sold_at) a.sold_at = now;
  if (status === "paused" && !a.paused_at) a.paused_at = now;
  if (status === "deleted" && !a.deleted_at) a.deleted_at = now;
  writeAnnonce(dir, a);
  const handoffRemoved = clearHandoff(dir);
  return {
    slug,
    status,
    leboncoin_id: id,
    leboncoin_url: opts.url,
    published_at: a.published_at,
    ...(a.renewed_at ? { renewed_at: a.renewed_at } : {}),
    handoffRemoved,
  };
}
