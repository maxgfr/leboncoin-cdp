# CLI reference

Run the committed, zero-dependency bundle with plain `node`:

```
node scripts/leboncoin.mjs <command> [options]
```

Global options (any command): `--annonces-dir <dir>` (default `./annonces`),
`--json` (machine-readable stdout), `-h`/`--help`, `-v`/`--version`.

Browser options (every live command): `--browser <chrome|brave|chromium|opera>` and
`--chrome-path <bin>` pick the browser whose session is used — **remembered** in
`~/.lbc-scraper/browser` for later runs (also `$LBC_BROWSER`, `$CHROME_PATH`). Each browser
gets its own **fresh, isolated** scraper profile (`~/.lbc-scraper/profile` for Chrome,
`profile-brave`…), created once and reused as-is: reads (`scrape`, `comparables`) work in it
without any login, on any browser (e.g. Chrome); writes need it logged in once by hand (`login`
waits for you in that window), which gives it its own session, independent of your real
browser. `--reset-profile` deletes and re-creates it. `--copy-profile` (opt-in) seeds a *new*
profile from the real browser profile instead — it prints a warning: two browsers then share the
same Leboncoin session tokens and Leboncoin may log your real browser out. `--port <n>` reuses a
browser already listening for CDP. Every live command first applies `~/.lbc-scraper/site.json` (site-drift
overrides, see `deposit-form-mapping.md`).

## `doctor [<slug>]`  *(CDP, read-only)*
Health check against the live site: `login` (session recognised), `search` (results found, and
from which source — `next-data` / `json-script` / `network` / `dom-links`), `ad-detail`, and
`deposit` (walks the wizard like `publish`, stops on the final review **without submitting**;
without a slug it uses a throw-away probe annonce and stops at the photo step). Writes
`~/.lbc-scraper/doctor-report.json` with per-field resolution (`selector` / `semantic` /
`unresolved` / `not-reached`) and the steps seen.
- `--query <q>` — search used by the search/ad checks (default `iphone`); `--out <path>`.
- Exit 0 when every check passes; 2 otherwise.

## `login` (alias `auth`)  *(CDP)*
Open the account page and **actively verify** the session — a PASSIVE in-page probe (account/logout
DOM markers + visible text + URL-not-on-login; never a synthetic authenticated XHR). Saves a
login-state screenshot (`~/.lbc-scraper/auth-state.png` by default) to Read.
- `--cookies-file <path>` — attach cookies from an exported `cookies.json` (a bare array or
  `{ cookies: [...] }`) via CDP `Network.setCookie`, scoped to `.leboncoin.fr`. **Best-effort
  escape hatch only**: always re-verified afterwards, and the result reflects the *probe*, not the
  set-count — DataDome device-binding + server-side token validation usually defeat injected
  cookies, so a manual login in the scraper window remains the reliable path.
- `--out <path>` — where to write the screenshot.
- `--reset-profile` — delete and re-create the scraper profile (fresh, or copied with `--copy-profile`).
- `--copy-profile` — opt-in: seed a new scraper profile from the real browser profile (may log the
  real browser out of Leboncoin; prefer logging in once by hand).
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
- `--browser <brave|chrome|opera|chromium>` / `-b`, `--chrome-path <p>`, `--port <n>` / `-p`,
  `--copy-profile`. No login needed.
- Writes `comparables.json` and `comparables.md`. `--json` prints `{count,jsonPath,mdPath}`.

## `validate <slug>`
Structural gate (pure, no CDP). Checks: title (≥5), category, price (>0), zipcode
(`\d{5}`), ≥1 photo in `photos/`, listed photos exist, non-placeholder description
(≥20 chars), `status: draft`.
- `--json` prints `{ok, slug, issues[]}`.
- **Exit 0 if valid, non-zero if not** — gate publishing on this.

## `inspect <slug>`  *(CDP, read-only)*
Open the live deposit form and enumerate the controls of the wizard's **first step** into
`annonces/<slug>/form-map.json` (`{ steps: [FormMap] }`: label + surrounding labels, name / id /
data-qa-id / react-hook-form name, type, value, options, **`required` + `requiredSource`**), plus
`initial.png` + `initial.html`. **Types and submits nothing**, so the later steps (photos,
attributes, review) stay hidden — `publish --diagnostic` walks them all.
- `--json` returns the `FormMap` (`{ url, step, fields: FieldDescriptor[] }`).
- Exit 0; 2 if `login-required`.

## `publish <slug>`  *(CDP, write)*
Drive the deposit **wizard** step by step: fill each step by field meaning, pick the category
card, upload photos, click « Continuer », and **stop on the final review** (recognised by its
content, never clicked past). Writes `annonces/<slug>/`: `publish-preview.png` (Read it),
`form-map.json` (`{ steps: [...] }` — every control per step, required + why, options, and the
`fills` made), and `push-readiness.json` (`{ ready, checks[], blockers[], handoff }`, incl.
`final-step` — **Read it first**). Then:
- **default (semi-auto)**: wait for the user to review the final step and submit it.
- `--diagnostic` — walk + screenshot + save the HTML (`publish-preview.html`) + print the field
  report; **never submits**. `--json` returns the `FillReport` (`{ fields, missing, warnings,
  wizard: { stop, steps }, uploadedPhotos, expectedPhotos, formMapSteps }`).
- `--strict` — refuse to submit while anything is in `missing[]`.
- `--shots` — into `annonces/<slug>/shots/`: `00-initial.png`, `step-NN.png` (one per wizard
  step), `20-prefilled.png`, element crops (`elem-price/photos/submit.png`), and — on success —
  `30-confirmation.png`. The confirmation shot is captured whenever screenshots are on.
- `--no-screenshot` — skip all captures.
- `--yes` — submit, **only** when the wizard stopped on the recognised final step (else
  `reason: "form-error"`); still pauses for a captcha; detects a form error.
- `--dry-run` — fill only, print the report, submit nothing.
- `--timeout-submit <ms>` — max wait for the published ad to appear (default 900000 = 15 min).
- On success: writes `leboncoin_id`/`leboncoin_url`/`published_at`, `status: published`.
- The result carries `missing[]` (blocking: required fields empty in the annonce, unresolved on
  the form, or where the wizard stopped) and `report.warnings[]` (non-blocking: guessed
  category, attributes with no matching field). In non-JSON mode the CLI prints
  `leboncoin: ask the user about → …` and `leboncoin: note → …`.
- **Computer-use handoff**: when the run ends with `reason` `incomplete`, `form-error` or
  `not-published` (wizard stuck / stopped early, photos not uploaded, required fields
  unresolved, form rejected, or nobody submitted before the timeout), it writes
  `annonces/<slug>/handoff.json` — `{ reason, error?, wizard_stop, step: { index, title },
  missing: [{ field, required, value, note? }], blockers[], remaining_photos[], preview_png,
  cdp_port, driver_hint?, created_at }` (`driver_hint` = `dev-browser --connect <port>` when the
  port is known) — sets `push-readiness.json`'s `handoff` to its path, leaves the
  browser window open and logs `handoff → computer use: read annonces/<slug>/handoff.json, then
  finish in the open browser window (leboncoin cu-sheet <slug>)`. `login-required`,
  `--diagnostic` and `--dry-run` (intentionally non-submitting) never write or remove it. A
  successful publish deletes a stale one.
- Exit 0 published / diagnostic / dry-run; 2 if `login-required` / `not-published` /
  `incomplete` / `form-error`; 1 on a fatal error.

## `delete <slug>`  *(CDP, write)*
Navigate to the published ad (by stored `leboncoin_id`/`leboncoin_url`), find « Supprimer »
(ad page → « … » menu → the ad's card on « mes annonces »), confirm, and set `status: deleted`
**only with proof** (a deletion message, or the ad page reloaded and gone); otherwise
`reason: "unconfirmed"`, status unchanged, `delete-unconfirmed.png` saved.
- Prompts `y/N` unless `--yes`. Now pre-flights the login check (returns `login-required` instead
  of silently failing to find the delete control).
- Exit 0 deleted; 2 if aborted / login-required / control-not-found / unconfirmed; 1 on a fatal error.

## `edit` / `renew` / `mark-sold` / `deactivate` / `reactivate` `<slug>`  *(CDP, write)*
Manage an existing ad. All pre-flight the login check; all confirm `y/N` unless `--yes`.
Controls are found on the ad page, in its « … » menu, then in its card on « mes annonces »;
`mark-sold` / `deactivate` / `reactivate` change the local status **only with proof** (a
confirmation sentence, or the opposite control appearing), else `unconfirmed` +
`manage-unconfirmed.png`.
- `edit` — re-open the ad's modify form and fill it with the same wizard as `publish` (photos are
  not re-uploaded), save `edit-preview.png`; semi-auto (review + click « Enregistrer » yourself,
  or `--yes` to submit). `--no-screenshot` to skip. Status unchanged. From `published`/`paused`.
- `renew` — bump / « remettre en avant » (no status change). From `published`.
- `mark-sold` — → `status: sold` + `sold_at`. From `published`/`paused`.
- `deactivate` — pause → `status: paused` + `paused_at`. From `published`.
- `reactivate` — back online → `status: published`. From `paused`.
- Exit 0 on success; 2 if `aborted` / `login-required` / `action-failed` / `unconfirmed`; 1 (throws) on a wrong
  starting status or a never-published ad.

## `cu-sheet <slug>`  *(pure, no CDP)*
Build a fill sheet for an agent that fills the deposit wizard by **computer use** (screenshots,
clicks, typing) instead of CDP. Writes `annonces/<slug>/computer-use.md`: the deposit URL, then
in form order title, category, the full description, price, zipcode/city, condition/shipping,
every attribute (key → value) and the absolute photo paths; per step, the visible labels and
which are required (when `form-map.json` exists — run `inspect` or `publish --diagnostic`
first); a resume block at the top when `handoff.json` exists; and the safety rules.
- `--json` prints the sheet (`{ slug, deposit_url, handoff, values, form_steps, safety }`).
- Exit 0; 1 (prints the validation report) if `validate` fails. Playbook:
  `references/computer-use.md`.

## `open [<slug>]`  *(CDP, read-only)*
Launch (or reuse) the scraper browser and navigate to `--url <u>`, else the slug's
`leboncoin_url` when it is `published`/`paused` (unless `--deposit`), else the deposit form.
Drives nothing else; disconnects and **leaves the window open**. Prints the CDP port and
`http://127.0.0.1:<port>`, then `driver → dev-browser --connect <port>` when `dev-browser` is on
`PATH` (the recommended driver — optional, not a dependency; never let it launch its own browser),
else an install hint (`npm i -g dev-browser`); computer use on that window is the last resort.
- Takes the browser options (`--browser`, `--chrome-path`, `--port`, `--reset-profile`,
  `--copy-profile`). `--json` prints `{ url, port, endpoint, devBrowser: { available, command } }`.

## `record <slug> --url <ad url>`  *(pure, no CDP)*
Write back an action done by computer use: `leboncoin_url`, `leboncoin_id` (parsed from
`https://www.leboncoin.fr/ad/<category>/<id>` or `…/<id>.htm`, the same patterns `publish`
uses), `status` and its timestamp (`published_at` only when it becomes `published` and is not
set yet; `sold_at` / `paused_at` / `deleted_at` likewise). Removes `handoff.json`.
- `--status <published|sold|paused|deleted>` (default `published`).
- Exit 0; 1 if `--url` is missing or not a leboncoin.fr ad URL.

## `list` (alias `status`)
List local annonces with status, price and title.
- `--status <draft|published|deleted|sold|paused>` — filter.
- `--json` prints the array.

## `scrape`  *(CDP, read-only — the original scraper)*
Preserves the original flags: `--query`/`-q`, `--output`/`-o`, `--config`/`-c`,
`--with-details`/`-d`, `--details-only`, `--search-only`, `--max-pages`, `--rate-limit`,
`--retries`, `--output-dir`, `--save-raw`, `--browser`/`-b`, `--chrome-path`,
`--port`/`-p`, `--timeout`, `--reset-profile`, `--copy-profile`. No login needed. Writes JSON to `--output-dir` (default
`./assets`). A bare `--query macbook` is a **text search** (`text=macbook`). Results are read from
`__NEXT_DATA__`, else inline JSON, else the JSON the page downloads, else the `/ad/` links;
pagination uses the `/_next/data` route and falls back to real `&page=N` navigation.
`--save-raw` also writes the raw first-page payload (`raw_<name>.json`).

> Note: the old top-level invocation `pnpm start -- --query …` is now
> `node scripts/leboncoin.mjs scrape --query …` (a breaking change in 3.0).

## Offline demo
`pnpm run demo` = `validate example-annonce --annonces-dir assets` — runs the committed
bundle with no CDP and must exit 0.
