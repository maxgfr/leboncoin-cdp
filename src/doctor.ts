/**
 * `doctor` — a repeatable health check of everything the engine relies on, run
 * against the live site. It NEVER publishes anything:
 *   1. login       — is the profile's session recognised?
 *   2. search      — does a search page expose results, and from which source?
 *   3. ad-detail   — does an ad page expose the ad?
 *   4. deposit     — walks the deposit wizard the way publish does (fills by
 *                    meaning, « Continuer » between steps) and stops ON the final
 *                    review without submitting; reports, per logical field,
 *                    whether it was found by `selector` (selectors.ts fast path),
 *                    `semantic` (label/name matching), or not at all.
 * Without a slug the deposit check uses the bundled example annonce (and its
 * photo); with `doctor <slug>` it uses that annonce (and its photos). Either way
 * it must reach the final review — and stop there, submitting nothing.
 *
 * The report is written to <scraper home>/doctor-report.json — the first file to
 * read when something breaks (see SKILL.md, "When Leboncoin changes").
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkLogin } from "./auth";
import { isOnCaptcha, waitForCaptchaResolution } from "./captcha";
import type { CDPClient } from "./cdp";
import { type WizardResult, runWizard } from "./deposit-wizard";
import { logicalValue } from "./field-match";
import { logger } from "./logger";
import { navigate } from "./manage-actions";
import { parseAnnonce, resolvePhotoPaths } from "./markdown";
import { adFromSnapshot, readPageSnapshot, searchFromSnapshot } from "./page-payload";
import { AUTH, BASE_URL, DEPOSIT, LOGICAL_FIELDS, type LogicalFieldName } from "./selectors";
import { applySiteOverrides } from "./site-overrides";
import type { Annonce } from "./types";

/** `no-value`: the annonce has nothing to write there (e.g. no `address`), so nothing was looked for. */
export type FieldResolution = "selector" | "semantic" | "unresolved" | "not-reached" | "no-value";

export interface DoctorCheck {
  name: "login" | "search" | "ad-detail" | "deposit";
  ok: boolean;
  detail: string;
}

export interface DoctorReport {
  at: string;
  ok: boolean;
  checks: DoctorCheck[];
  /** Per logical deposit field: how it was resolved on the live form. */
  fields: Partial<Record<LogicalFieldName, FieldResolution>>;
  /** The wizard steps seen (title + number of controls + what stopped it). */
  deposit?: { stop: string; error?: string; steps: { title: string; fields: number; final: boolean; unresolvedRequired: string[] }[] };
  siteOverrides?: { path: string; applied: string[] } | null;
  reportPath?: string;
}

export interface DoctorOptions {
  /** Use this annonce (and its photos) for the deposit walk instead of the probe. */
  slug?: string;
  annoncesDir?: string;
  /** Search used for the search/ad checks. */
  query?: string;
  /** Where to write the report (default <scraper home>/doctor-report.json). */
  out?: string;
}

export interface DoctorDeps {
  connect: (url: string) => Promise<CDPClient>;
}

async function defaultConnect(url: string): Promise<CDPClient> {
  const { connectAndNavigate } = await import("./browser");
  return connectAndNavigate(url);
}

/**
 * The bundled example annonce (assets/example-annonce: a MacBook, one photo) —
 * the deposit walk without a slug uses it, so it gets past the photo step and the
 * category attributes up to the final review. It is never submitted. Resolved
 * from this module: src/doctor.ts and the scripts/leboncoin.mjs bundle both sit
 * one level below the package root.
 */
export function bundledExampleDir(): string {
  return fileURLToPath(new URL("../assets/example-annonce", import.meta.url));
}

function annonceAt(dir: string): { a: Annonce; photos: string[] } {
  const a = parseAnnonce(dir);
  return { a, photos: resolvePhotoPaths(dir, a) };
}

/** The probe annonce + photos for a slug-less deposit walk (a minimal photo-less probe if the example is missing). */
function probeAnnonce(): { a: Annonce; photos: string[] } {
  try {
    return annonceAt(bundledExampleDir());
  } catch {
    return {
      a: {
        slug: "doctor-probe",
        title: "Test de diagnostic — ne pas publier",
        category: "",
        price: 1,
        zipcode: "75001",
        attributes: {},
        photos: [],
        status: "draft",
        description: "Test.",
      },
      photos: [],
    };
  }
}

/** Summarise how each logical field was resolved across the wizard steps. */
export function fieldResolutions(w: WizardResult, a: Annonce): Partial<Record<LogicalFieldName, FieldResolution>> {
  const out: Partial<Record<LogicalFieldName, FieldResolution>> = {};
  for (const name of Object.keys(LOGICAL_FIELDS) as LogicalFieldName[]) {
    const fills = w.steps.flatMap((s) => s.fills).filter((f) => f.target === name);
    if (fills.some((f) => f.via === "selector")) out[name] = "selector";
    else if (fills.length) out[name] = "semantic";
    else if (name === "category" && w.category) out[name] = "semantic";
    else if (w.stop !== "final") out[name] = "not-reached";
    else if (name !== "category" && name !== "photos" && logicalValue(a, name) === null) out[name] = "no-value";
    else
      out[name] =
        LOGICAL_FIELDS[name].required || (name === "condition" ? !!a.condition : name === "shipping" ? typeof a.shipping === "boolean" : false)
          ? "unresolved"
          : "not-reached";
  }
  return out;
}

export async function runDoctor(opts: DoctorOptions = {}, deps: Partial<DoctorDeps> = {}): Promise<DoctorReport> {
  const siteOverrides = applySiteOverrides();
  const report: DoctorReport = { at: new Date().toISOString(), ok: false, checks: [], fields: {}, siteOverrides };
  const connect = deps.connect ?? defaultConnect;
  const cdp = await connect(AUTH.accountUrl);
  try {
    if (await isOnCaptcha(cdp)) await waitForCaptchaResolution(cdp);

    // 1. login
    const login = await checkLogin(cdp);
    report.checks.push({
      name: "login",
      ok: login.loggedIn,
      detail: login.loggedIn
        ? `logged in (${login.signals.join(", ")})`
        : login.loggedOut
          ? `logged out (${login.signals.join(", ") || login.url})`
          : "inconclusive — no account marker found",
    });

    // 2. search
    await navigate(cdp, `${BASE_URL}/recherche?text=${encodeURIComponent(opts.query ?? "iphone")}`);
    if (await isOnCaptcha(cdp)) await waitForCaptchaResolution(cdp);
    const searchSnap = await readPageSnapshot(cdp);
    const search = searchFromSnapshot(searchSnap);
    report.checks.push({
      name: "search",
      ok: !!search && search.source === "next-data",
      detail: search
        ? `${search.payload.ads.length} ads (total ${search.payload.total}) from ${search.source}${searchSnap.buildId ? `, buildId ${searchSnap.buildId}` : ", no buildId (pagination by navigation)"}`
        : "no results found on the search page",
    });

    // 3. ad detail
    const firstUrl = search?.payload.ads.find((x) => x.url)?.url;
    if (firstUrl) {
      await navigate(cdp, firstUrl);
      const adFound = adFromSnapshot(await readPageSnapshot(cdp));
      report.checks.push({
        name: "ad-detail",
        ok: !!adFound,
        detail: adFound ? `ad ${adFound.ad.list_id} from ${adFound.source}` : `no ad payload on ${firstUrl}`,
      });
    } else {
      report.checks.push({ name: "ad-detail", ok: false, detail: "skipped — no ad URL from the search check" });
    }

    // 4. deposit wizard (never submitted)
    if (login.loggedOut) {
      report.checks.push({ name: "deposit", ok: false, detail: "skipped — log in first (`leboncoin login`)" });
    } else {
      const { a, photos } = opts.slug ? annonceAt(path.join(opts.annoncesDir ?? "annonces", opts.slug)) : probeAnnonce();
      await navigate(cdp, DEPOSIT.startUrl);
      const w = await runWizard(cdp, a, { photos });
      report.fields = fieldResolutions(w, a);
      report.deposit = {
        stop: w.stop,
        error: w.error,
        steps: w.steps.map((s) => ({ title: s.title, fields: s.formMap.fields.length, final: s.final, unresolvedRequired: s.unresolvedRequired })),
      };
      // Reaching (and stopping on) the final review is the pass; a photo-less probe may only get to the photo step.
      const ok = w.stop === "final" || (photos.length === 0 && w.stop === "missing-required" && w.steps.length >= 2);
      report.checks.push({
        name: "deposit",
        ok,
        detail: `${w.steps.length} step(s): ${w.steps.map((s) => `« ${s.title || "?"} »`).join(" → ")}; photos ${w.uploadedPhotos}/${photos.length}; stopped: ${w.stop}${w.error ? ` (${w.error})` : ""} — nothing submitted`,
      });
      // Leave the half-filled form: nothing is submitted, and the page is discarded.
      await navigate(cdp, "about:blank", 300);
    }

    report.ok = report.checks.every((c) => c.ok);
    let out = opts.out;
    if (!out) {
      const { getScraperHome } = await import("./config");
      out = path.join(getScraperHome(), "doctor-report.json");
    }
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 2));
    report.reportPath = out;

    for (const c of report.checks) {
      if (c.ok) logger.success(`${c.name}: ${c.detail}`);
      else logger.warn(`${c.name}: ${c.detail}`);
    }
    const fields = Object.entries(report.fields).map(([k, v]) => `${k}=${v}`);
    if (fields.length) logger.info(`deposit fields: ${fields.join(", ")}`);
    logger.info(`Doctor report → ${out}`);
    return report;
  } finally {
    cdp.disconnect();
  }
}
