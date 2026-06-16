import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runList, runNew } from "./annonce";
import type { BrowserType } from "./config";
import { formatValidationReport, validateAnnonce } from "./validate";
import { VERSION } from "./types";

const HELP = `leboncoin v${VERSION}
Manage your Leboncoin listings from local markdown + photos, then publish/delete
them on your own account via the Chrome DevTools Protocol. Markdown is the source
of truth; you (or the agent) write the copy, the engine just drives the browser.

Usage:
  leboncoin login [--cookies-file <path>] [--out <path>] [--timeout-login <ms>]
  leboncoin new <slug> [--title "<t>"] [--category "<c>"] [--notes "<texte libre>"]
                       [--price <n>] [--zipcode <cp>] [--condition "<c>"] [--attributes "k=v,k2=v2"] [--force]
  leboncoin comparables <slug> [--query "<lbc query>"] [--max-pages <n>] [--with-details]
  leboncoin validate <slug>
  leboncoin inspect <slug>
  leboncoin publish <slug> [--diagnostic] [--strict] [--shots] [--no-screenshot] [--yes] [--dry-run] [--timeout-submit <ms>]
  leboncoin delete <slug> [--yes]
  leboncoin edit <slug> [--no-screenshot] [--yes]
  leboncoin renew|mark-sold|deactivate|reactivate <slug> [--yes]
  leboncoin list [--status draft|published|deleted|sold|paused]
  leboncoin scrape --query "<query|url>" [scraper options]

Commands:
  login/auth    Open the account page, actively verify you're logged in (DOM probe, not just a
                redirect), and save an auth-state screenshot. --cookies-file attaches an exported
                cookies.json (best-effort escape hatch; always re-verified). If logged out, it
                waits while you log in once in the browser. Run this before publish/delete.
  new           Scaffold annonces/<slug>/annonce.md + photos/ (a draft). --notes seeds the body.
  comparables   Scrape similar live listings into the folder (price/keyword grounding).
  validate      Structural gate: required fields, >=1 photo, real description, draft status.
  inspect       READ-ONLY: open the live deposit form and write form-map.json (every field +
                required/optional + select options) + initial.png/html. Submits nothing. Read it
                to discover category-specific required fields, then fill annonce.md and publish.
  publish       Open the deposit form, fill it + upload photos via CDP, save a preview
                screenshot (read it to verify). Semi-auto by default: review and click
                « Déposer mon annonce » yourself. --diagnostic = fill + screenshot + HTML +
                field report, no submit. --strict = refuse to submit while fields are missing.
                --yes = auto-submit. --shots = capture checkpoint + element + post-submit screenshots
                into shots/. --no-screenshot to skip the capture. Writes push-readiness.json.
  delete        Remove a published ad (confirms unless --yes).
  edit          Re-open the published ad's modify form, re-fill it from annonce.md, screenshot;
                review and save « Enregistrer » yourself (or --yes to submit).
  renew         Bump / "remettre en avant" a published ad (no status change).
  mark-sold     Mark a published/paused ad as sold (status → sold).
  deactivate    Pause a published ad without deleting it (status → paused).
  reactivate    Put a paused ad back online (status → published).
  list/status   Show local annonces and their published state.
  scrape        The original read-only scraper (search results + ad details).

Common options:
  --annonces-dir <dir>   Root of the local store            (default: ./annonces)
  --json                 Machine-readable output
  -h, --help             Show this help
  -v, --version          Show version

Publish/delete safety:
  Semi-auto is the default — the engine never clicks the final publish for you unless
  you pass --yes. A DataDome captcha at submit always needs a human, so --yes is not
  fully headless. These actions hit your real account; see SKILL.md.
`;

export const COMMANDS = new Set([
  "new",
  "comparables",
  "validate",
  "publish",
  "delete",
  "list",
  "status",
  "scrape",
  "login",
  "auth",
  "inspect",
  "edit",
  "renew",
  "mark-sold",
  "deactivate",
  "reactivate",
]);

const VALUE_FLAGS = new Set([
  "query",
  "output",
  "config",
  "browser",
  "chrome-path",
  "port",
  "timeout",
  "annonces-dir",
  "max-pages",
  "rate-limit",
  "retries",
  "output-dir",
  "title",
  "category",
  "notes",
  "price",
  "zipcode",
  "condition",
  "attributes",
  "status",
  "timeout-submit",
  "cookies-file",
  "out",
  "timeout-login",
]);

const BOOL_FLAGS = new Set([
  "json",
  "with-details",
  "details-only",
  "search-only",
  "save-raw",
  "reset-profile",
  "yes",
  "dry-run",
  "diagnostic",
  "strict",
  "no-screenshot",
  "shots",
  "force",
]);

const SHORT: Record<string, string> = {
  q: "query",
  o: "output",
  c: "config",
  d: "with-details",
  b: "browser",
  p: "port",
};

function fail(message: string): never {
  process.stderr.write(`leboncoin: ${message}\n`);
  process.exit(1);
}

export interface Parsed {
  command: string;
  positional: string[];
  values: Record<string, string>;
  bools: Set<string>;
}

export function parseArgs(argv: string[]): Parsed {
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    process.stdout.write(HELP);
    process.exit(0);
  }
  if (argv[0] === "-v" || argv[0] === "--version") {
    process.stdout.write(VERSION + "\n");
    process.exit(0);
  }

  const command = argv[0] as string;
  if (!COMMANDS.has(command)) fail(`unknown command: ${command} (run --help for usage)`);

  const values: Record<string, string> = {};
  const bools = new Set<string>();
  const positional: string[] = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(HELP);
      process.exit(0);
    }
    if (arg === "-v" || arg === "--version") {
      process.stdout.write(VERSION + "\n");
      process.exit(0);
    }

    let key: string;
    let inlineVal: string | undefined;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      key = eq !== -1 ? arg.slice(2, eq) : arg.slice(2);
      if (eq !== -1) inlineVal = arg.slice(eq + 1);
    } else if (arg.startsWith("-") && arg.length > 1) {
      const mapped = SHORT[arg.slice(1)];
      if (!mapped) fail(`unknown flag: ${arg} (run --help for the supported options)`);
      key = mapped;
    } else {
      positional.push(arg);
      continue;
    }

    if (BOOL_FLAGS.has(key)) {
      if (inlineVal !== undefined) fail(`--${key} is a boolean flag and does not take a value`);
      bools.add(key);
      continue;
    }
    if (!VALUE_FLAGS.has(key)) fail(`unknown flag: --${key} (run --help for the supported options)`);

    let value: string;
    if (inlineVal !== undefined) {
      value = inlineVal;
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) fail(`missing value for --${key}`);
      value = next;
      i++;
    }
    values[key] = value;
  }

  return { command, positional, values, bools };
}

function annoncesDirOf(p: Parsed): string {
  return resolve(p.values["annonces-dir"] ?? "./annonces");
}

function intOf(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse `--attributes "brand=Apple,model=MacBook Air M1"` into a map. */
function parseAttributes(raw: string | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  const out: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function requireSlug(p: Parsed): string {
  const slug = p.positional[0];
  if (!slug) fail(`missing <slug> (e.g. leboncoin ${p.command} macbook-air-m1)`);
  return slug as string;
}

async function main(): Promise<void> {
  const p = parseArgs(process.argv.slice(2));
  const json = p.bools.has("json");

  switch (p.command) {
    case "new": {
      const slug = requireSlug(p);
      const r = runNew(annoncesDirOf(p), slug, {
        title: p.values.title,
        category: p.values.category,
        notes: p.values.notes,
        price: intOf(p.values.price),
        zipcode: p.values.zipcode,
        condition: p.values.condition,
        attributes: parseAttributes(p.values.attributes),
        force: p.bools.has("force"),
      });
      if (json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      else {
        process.stderr.write(`leboncoin: created ${r.markdown}\n`);
        process.stderr.write(`  add photos to ${r.dir}/photos/, write the description, then: leboncoin validate ${slug}\n`);
      }
      return;
    }

    case "list":
    case "status": {
      const rows = runList(annoncesDirOf(p), p.values.status);
      if (json) {
        process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
        return;
      }
      if (rows.length === 0) {
        process.stderr.write("leboncoin: no annonces found\n");
        return;
      }
      const out = rows.map((r) => `  ${r.status.padEnd(9)} ${r.slug.padEnd(28)} ${String(r.price).padStart(7)} €  ${r.title}`);
      process.stdout.write([`leboncoin: ${rows.length} annonce(s)`, ...out].join("\n") + "\n");
      return;
    }

    case "validate": {
      const slug = requireSlug(p);
      const r = validateAnnonce(resolve(annoncesDirOf(p), slug));
      if (json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      else process.stdout.write(formatValidationReport(r) + "\n");
      if (!r.ok) process.exit(1);
      return;
    }

    case "scrape": {
      const { runScrape } = await import("./scrape");
      await runScrape({
        query: p.values.query,
        output: p.values.output,
        configFile: p.values.config,
        detailsOnly: p.bools.has("details-only"),
        searchOnly: p.bools.has("search-only"),
        withDetails: p.bools.has("with-details"),
        resetProfile: p.bools.has("reset-profile"),
        browser: p.values.browser as BrowserType | undefined,
        chromePath: p.values["chrome-path"],
        debuggingPort: intOf(p.values.port),
        pageTimeout: intOf(p.values.timeout),
        maxRetries: intOf(p.values.retries),
        rateLimit: intOf(p.values["rate-limit"]),
        maxPages: intOf(p.values["max-pages"]),
        outputDir: p.values["output-dir"],
        saveRaw: p.bools.has("save-raw"),
      });
      return;
    }

    case "comparables": {
      const slug = requireSlug(p);
      const { runComparables } = await import("./comparables");
      const r = await runComparables(annoncesDirOf(p), slug, {
        query: p.values.query,
        maxPages: intOf(p.values["max-pages"]),
        withDetails: p.bools.has("with-details"),
        browser: p.values.browser as BrowserType | undefined,
        chromePath: p.values["chrome-path"],
        debuggingPort: intOf(p.values.port),
        pageTimeout: intOf(p.values.timeout),
      });
      if (json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      return;
    }

    case "inspect": {
      const slug = requireSlug(p);
      const { runInspect } = await import("./inspect");
      const r = await runInspect(annoncesDirOf(p), slug, {}, {});
      if (json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      if (!r.ok) process.exit(2);
      return;
    }

    case "publish": {
      const slug = requireSlug(p);
      const { runPublish } = await import("./publish");
      const r = await runPublish(annoncesDirOf(p), slug, {
        yes: p.bools.has("yes"),
        dryRun: p.bools.has("dry-run"),
        diagnostic: p.bools.has("diagnostic"),
        strict: p.bools.has("strict"),
        screenshot: !p.bools.has("no-screenshot"),
        shots: p.bools.has("shots"),
        timeoutSubmitMs: intOf(p.values["timeout-submit"]),
      });
      if (json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      else if (r.missing && r.missing.length) {
        process.stderr.write(`leboncoin: ask the user about → ${r.missing.join(", ")}\n`);
      }
      if (!r.ok && ["login-required", "not-published", "incomplete", "form-error"].includes(r.reason ?? "")) {
        process.exit(2);
      }
      return;
    }

    case "login":
    case "auth": {
      const { runAuth } = await import("./auth");
      const r = await runAuth({
        cookiesFile: p.values["cookies-file"],
        out: p.values.out,
        timeoutMs: intOf(p.values["timeout-login"]),
      });
      if (json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      if (!r.ok) process.exit(2);
      return;
    }

    case "delete": {
      const slug = requireSlug(p);
      const { runDelete } = await import("./delete");
      const r = await runDelete(annoncesDirOf(p), slug, { yes: p.bools.has("yes") });
      if (json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      if (!r.ok) process.exit(2);
      return;
    }

    case "edit":
    case "renew":
    case "mark-sold":
    case "deactivate":
    case "reactivate": {
      const slug = requireSlug(p);
      const m = await import("./manage");
      const actions = {
        edit: m.runEdit,
        renew: m.runRenew,
        "mark-sold": m.runMarkSold,
        deactivate: m.runDeactivate,
        reactivate: m.runReactivate,
      } as const;
      const r = await actions[p.command as keyof typeof actions](annoncesDirOf(p), slug, {
        yes: p.bools.has("yes"),
        screenshot: !p.bools.has("no-screenshot"),
      });
      if (json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      if (!r.ok) process.exit(2);
      return;
    }
  }
}

// Only run when invoked directly (node scripts/leboncoin.mjs), not when imported
// by tests. Realpath both sides so a symlinked path still matches.
function isInvokedDirectly(): boolean {
  const argv1 = process.argv[1];
  if (argv1 === undefined) return false;
  const modulePath = fileURLToPath(import.meta.url);
  try {
    if (realpathSync(argv1) === realpathSync(modulePath)) return true;
  } catch {
    /* a path may be virtual — fall through */
  }
  return import.meta.url === pathToFileURL(argv1).href;
}

if (isInvokedDirectly()) {
  main().catch((e) => fail((e as Error).message));
}
