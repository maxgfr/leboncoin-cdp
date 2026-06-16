# CLI reference

Run the committed, zero-dependency bundle with plain `node`:

```
node scripts/leboncoin.mjs <command> [options]
```

Global options (any command): `--annonces-dir <dir>` (default `./annonces`),
`--json` (machine-readable stdout), `-h`/`--help`, `-v`/`--version`.

## `login` (alias `auth`)  *(CDP)*
Open the account page and **actively verify** the session — a PASSIVE in-page probe (account/logout
DOM markers + visible text + URL-not-on-login; never a synthetic authenticated XHR). Saves a
login-state screenshot (`~/.lbc-scraper/auth-state.png` by default) to Read.
- `--cookies-file <path>` — attach cookies from an exported `cookies.json` (a bare array or
  `{ cookies: [...] }`) via CDP `Network.setCookie`, scoped to `.leboncoin.fr`. **Best-effort
  escape hatch only**: always re-verified afterwards, and the result reflects the *probe*, not the
  set-count — DataDome device-binding + server-side token validation usually defeat injected
  cookies, so the once-copied real profile remains the reliable path.
- `--out <path>` — where to write the screenshot.
- `--timeout-login <ms>` — how long to wait/poll while you log in manually (default 300000 = 5 min).
- Exit 0 if confirmed logged-in; 2 if still logged-out after the timeout.

## `new <slug>`
Scaffold `annonces/<slug>/annonce.md` (draft) + `photos/`.
- `--title "<t>"`, `--category "<c>"` — prefill those fields.
- `--notes "<texte libre>"` — seed the description body with the user's rough notes (else a placeholder).
- `--price <n>`, `--zipcode <cp>`, `--condition "<c>"` — prefill structured fields.
- `--attributes "brand=Apple,model=MacBook Air M1"` — comma-separated `k=v` pairs into `attributes`.
- `--force` — overwrite an existing annonce.md.
- Exit 0 on success; 1 if it already exists (without `--force`) or the slug is invalid.

## `comparables <slug>`  *(CDP, read-only)*
Scrape similar live listings into the folder for grounding.
- `--query "<q>"` / `-q` — raw Leboncoin query or full URL. If omitted, built from the
  annonce's `title` + `zipcode`.
- `--max-pages <n>` — pages to scrape (default 1).
- `--with-details` / `-d` — also fetch each ad's detail page.
- `--browser <brave|chrome|opera|chromium>` / `-b`, `--chrome-path <p>`, `--port <n>` / `-p`.
- Writes `comparables.json` and `comparables.md`. `--json` prints `{count,jsonPath,mdPath}`.

## `validate <slug>`
Structural gate (pure, no CDP). Checks: title (≥5), category, price (>0), zipcode
(`\d{5}`), ≥1 photo in `photos/`, listed photos exist, non-placeholder description
(≥20 chars), `status: draft`.
- `--json` prints `{ok, slug, issues[]}`.
- **Exit 0 if valid, non-zero if not** — gate publishing on this.

## `inspect <slug>`  *(CDP, read-only)*
Open the live deposit form and enumerate every visible field into `annonces/<slug>/form-map.json`
(label, name/id/data-qa-id, type, current value, select options, and **`required` + `requiredSource`**),
plus `initial.png` + `initial.html`. **Submits nothing.** Read the map to discover category-specific
required fields before filling `annonce.md`.
- `--json` returns the `FormMap` (`{ url, fields: FieldDescriptor[] }`).
- Exit 0; 2 if `login-required`.

## `publish <slug>`  *(CDP, write)*
Open the deposit form, fill every field, upload photos, and write `annonces/<slug>/`:
`publish-preview.png` (Read it to verify), `form-map.json` (the live field map — Read it to find
mandatory, often category-specific, fields), and `push-readiness.json` (the machine-readable verdict
`{ ready, checks[], blockers[] }` — **Read it first**). Then:
- **default (semi-auto)**: pause for the user to review and click « Déposer mon annonce ».
- `--diagnostic` — fill + screenshot + save the form HTML (`publish-preview.html`) + print a
  field-by-field resolution report; **submit nothing**. `--json` returns the `FillReport`
  (`{ fields, missing, uploadedPhotos, expectedPhotos }`). Use it to author/tighten selectors
  and to see which fields to ask the user about.
- `--strict` — refuse to submit while any required field is unresolved/missing. Live required
  signals from `form-map.json` are folded into `missing[]` **additively** (never replacing the
  hardcoded core), so genuinely category-specific required fields surface here.
- `--shots` — capture the full checkpoint set into `annonces/<slug>/shots/`:
  `00-initial.png`, `10-after-category.png`, `20-prefilled.png`, element crops
  (`elem-price/photos/submit.png`), and — on success — `30-confirmation.png` (visual proof the ad
  is live). The confirmation shot is captured whenever screenshots are on; the rest need `--shots`.
- `--no-screenshot` — skip all captures.
- `--yes` — fill **and** click publish (still pauses for a captcha; detects a form error and
  returns `reason: "form-error"`).
- `--dry-run` — fill only, print the report, submit nothing.
- `--timeout-submit <ms>` — max wait for the published ad to appear (default 900000 = 15 min).
- On success: writes `leboncoin_id`/`leboncoin_url`/`published_at`, `status: published`.
- The result carries `missing[]` (required fields empty in the annonce or unresolved on the
  form) — the agent asks the user about these. In non-JSON mode the CLI prints
  `leboncoin: ask the user about → …`.
- Exit 0 published / diagnostic / dry-run; 2 if `login-required` / `not-published` /
  `incomplete` / `form-error`; 1 on a fatal error.

## `delete <slug>`  *(CDP, write)*
Navigate to the published ad (by stored `leboncoin_id`/`leboncoin_url`), click delete +
confirm, set `status: deleted`.
- Prompts `y/N` unless `--yes`. Now pre-flights the login check (returns `login-required` instead
  of silently failing to find the delete control).
- Exit 0 deleted; 2 if aborted / login-required; 1 on a fatal error.

## `edit` / `renew` / `mark-sold` / `deactivate` / `reactivate` `<slug>`  *(CDP, write)*
Manage an existing ad. All pre-flight the login check; all confirm `y/N` unless `--yes`.
- `edit` — re-open the ad's modify form, re-fill from `annonce.md`, save `edit-preview.png`;
  semi-auto (review + click « Enregistrer » yourself, or `--yes` to submit). `--no-screenshot` to
  skip. Status unchanged. Allowed from `published`/`paused`.
- `renew` — bump / « remettre en avant » (no status change). From `published`.
- `mark-sold` — → `status: sold` + `sold_at`. From `published`/`paused`.
- `deactivate` — pause → `status: paused` + `paused_at`. From `published`.
- `reactivate` — back online → `status: published`. From `paused`.
- Exit 0 on success; 2 if `aborted` / `login-required` / `action-failed`; 1 (throws) on a wrong
  starting status or a never-published ad.

## `list` (alias `status`)
List local annonces with status, price and title.
- `--status <draft|published|deleted|sold|paused>` — filter.
- `--json` prints the array.

## `scrape`  *(CDP, read-only — the original scraper)*
Preserves the original flags: `--query`/`-q`, `--output`/`-o`, `--config`/`-c`,
`--with-details`/`-d`, `--details-only`, `--search-only`, `--max-pages`, `--rate-limit`,
`--retries`, `--output-dir`, `--save-raw`, `--browser`/`-b`, `--chrome-path`,
`--port`/`-p`, `--timeout`, `--reset-profile`. Writes JSON to `--output-dir` (default
`./assets`).

> Note: the old top-level invocation `pnpm start -- --query …` is now
> `node scripts/leboncoin.mjs scrape --query …` (a breaking change in 3.0).

## Offline demo
`pnpm run demo` = `validate example-annonce --annonces-dir assets` — runs the committed
bundle with no CDP and must exit 0.
