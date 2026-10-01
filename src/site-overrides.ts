/**
 * Site-drift overrides WITHOUT a rebuild.
 *
 * `~/.lbc-scraper/site.json` (or the file named by $LBC_SITE_OVERRIDES) is merged
 * into selectors.ts at startup, so the agent can adapt to a Leboncoin change by
 * editing JSON instead of patching and re-bundling the engine:
 *
 *   {
 *     "DEPOSIT": {
 *       "nextButton": { "textCandidates": ["Étape suivante"] },
 *       "finalStepMarkers": ["vérifiez votre annonce"],
 *       "priceInput": ["input[name=\"amount\"]"],
 *       "publishedUrlPattern": ["/annonce/(\\d+)"]
 *     },
 *     "AUTH": { "loggedInSelectors": ["a[href^=\"/mon-espace\"]"] },
 *     "MANAGE": { "listingUrl": "https://www.leboncoin.fr/mes-annonces-v2" },
 *     "LOGICAL_FIELDS": { "price": { "labels": ["montant"] } }
 *   }
 *
 * Merge rules: candidate lists are PREPENDED (tried first, de-duplicated) and
 * mutated in place (LOGICAL_FIELDS shares DEPOSIT's arrays); a button merges its
 * `textCandidates` / `css`; a URL string is replaced; a regex (list) accepts
 * pattern strings (case-insensitive). Anything invalid or unknown is skipped
 * with a warning — a bad override never breaks the engine.
 */
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "./logger";
import { AUTH, DEPOSIT, LOGICAL_FIELDS, MANAGE } from "./selectors";

type Warn = (message: string) => void;

const SECTIONS: Record<string, Record<string, unknown>> = {
  DEPOSIT: DEPOSIT as unknown as Record<string, unknown>,
  AUTH: AUTH as unknown as Record<string, unknown>,
  MANAGE: MANAGE as unknown as Record<string, unknown>,
  LOGICAL_FIELDS: LOGICAL_FIELDS as unknown as Record<string, unknown>,
};

/** Where the overrides live: $LBC_SITE_OVERRIDES, else <scraper home>/site.json. */
export function siteOverridesPath(): string {
  if (process.env.LBC_SITE_OVERRIDES) return process.env.LBC_SITE_OVERRIDES;
  const home = process.env.LBC_SCRAPER_HOME || path.join(os.homedir(), ".lbc-scraper");
  return path.join(home, "site.json");
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof RegExp);

/** Prepend `patch` to `target` in place, without duplicates. */
function prependInPlace<T>(target: T[], patch: T[]): void {
  const merged = [...patch, ...target.filter((t) => !patch.some((p) => String(p) === String(t)))];
  target.splice(0, target.length, ...merged);
}

function toRegExp(s: string, where: string, warn: Warn): RegExp | null {
  try {
    return new RegExp(s, "i");
  } catch {
    warn(`site overrides: ${where}: invalid regex "${s}" — skipped`);
    return null;
  }
}

/** Merge one value into `obj[key]` following the rules above. Returns true when applied. */
function mergeValue(obj: Record<string, unknown>, key: string, patch: unknown, where: string, warn: Warn): boolean {
  const current = obj[key];
  if (typeof current === "function") {
    warn(`site overrides: ${where} is computed and cannot be overridden — skipped`);
    return false;
  }
  if (current instanceof RegExp) {
    if (typeof patch !== "string") return warnType(where, "a regex string", warn);
    const re = toRegExp(patch, where, warn);
    if (!re) return false;
    obj[key] = re;
    return true;
  }
  if (Array.isArray(current)) {
    if (current.length > 0 && current.every((c) => c instanceof RegExp)) {
      if (!isStringArray(patch)) return warnType(where, "an array of regex strings", warn);
      const res = patch.map((p) => toRegExp(p, where, warn)).filter((r): r is RegExp => !!r);
      prependInPlace(current as RegExp[], res);
      return res.length > 0;
    }
    if (!isStringArray(patch)) return warnType(where, "an array of strings", warn);
    prependInPlace(current as string[], patch);
    return true;
  }
  if (typeof current === "string") {
    if (typeof patch !== "string") return warnType(where, "a string", warn);
    obj[key] = patch;
    return true;
  }
  if (typeof current === "boolean") {
    if (typeof patch !== "boolean") return warnType(where, "a boolean", warn);
    obj[key] = patch;
    return true;
  }
  if (isPlainObject(current)) {
    if (!isPlainObject(patch)) return warnType(where, "an object", warn);
    let any = false;
    for (const [k, v] of Object.entries(patch)) {
      if (k.startsWith("$")) continue;
      if (!(k in current)) {
        warn(`site overrides: unknown key ${where}.${k} — skipped`);
        continue;
      }
      any = mergeValue(current, k, v, `${where}.${k}`, warn) || any;
    }
    return any;
  }
  warn(`site overrides: ${where} is not overridable — skipped`);
  return false;
}

function warnType(where: string, expected: string, warn: Warn): false {
  warn(`site overrides: ${where} must be ${expected} — skipped`);
  return false;
}

/**
 * Merge a parsed overrides object into the live selector tables. Pure apart from
 * the in-place mutation; returns the dotted paths that were applied.
 */
export function mergeOverrides(patch: unknown, warn: Warn = (m) => logger.warn(m), sections: Record<string, Record<string, unknown>> = SECTIONS): string[] {
  if (!isPlainObject(patch)) {
    warn("site overrides: the file must contain a JSON object — ignored");
    return [];
  }
  const applied: string[] = [];
  for (const [section, value] of Object.entries(patch)) {
    if (section.startsWith("$")) continue;
    const target = sections[section];
    if (!target) {
      warn(`site overrides: unknown section "${section}" (expected ${Object.keys(sections).join(", ")}) — skipped`);
      continue;
    }
    if (!isPlainObject(value)) {
      warnType(section, "an object", warn);
      continue;
    }
    for (const [key, v] of Object.entries(value)) {
      if (key.startsWith("$")) continue;
      if (!(key in target)) {
        warn(`site overrides: unknown key ${section}.${key} — skipped`);
        continue;
      }
      if (mergeValue(target, key, v, `${section}.${key}`, warn)) applied.push(`${section}.${key}`);
    }
  }
  return applied;
}

let loaded: { path: string; applied: string[] } | null | undefined;

/**
 * Load and apply the overrides file once per process (no-op when absent).
 * A malformed file is reported and ignored.
 */
export function applySiteOverrides(file = siteOverridesPath(), warn: Warn = (m) => logger.warn(m)): { path: string; applied: string[] } | null {
  if (loaded !== undefined) return loaded;
  loaded = null;
  if (!existsSync(file)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    warn(`site overrides: ${file} is not valid JSON (${(e as Error).message}) — ignored`);
    return null;
  }
  const applied = mergeOverrides(parsed, warn);
  if (applied.length) logger.info(`Site overrides from ${file}: ${applied.join(", ")}`);
  loaded = { path: file, applied };
  return loaded;
}
