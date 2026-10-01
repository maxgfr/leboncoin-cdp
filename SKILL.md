---
name: leboncoin
description: Prepare and manage Leboncoin listings and research comparable ads through the logged-in browser.
license: MIT
metadata:
  version: 1.3.0
  opencode/autoinvoke: 'false'
disable-model-invocation: true
---

# leboncoin — manage your listings, publish/delete via CDP

Markdown + photos in a folder are the **source of truth**. You help write the copy
and fill the structured fields; the skill drives Chrome (via the Chrome DevTools
Protocol, on the user's real logged-in profile) to **publish** and **delete** ads.
It reuses the project's zero-bot-detection CDP core, so there are no automation
flags and DataDome sees a normal browser.

## The core rule

- **Never publish content that is not in `annonce.md`.** The CLI only mechanically
  transfers what the markdown says — title, description, price, attributes, photos.
- **Semi-auto is the default.** `publish` walks the deposit wizard step by step,
  fills it and uploads the photos, then *stops on the final review* for the human to
  check in the browser and submit themselves (on that step the button reads
  « Continuer »). Only pass `--yes` if the user explicitly asks for full-auto. The
  human owns the final click; that click also clears the DataDome captcha at submit.
- **These actions hit the user's real account.** Confirm intent before publishing or
  deleting. `delete` asks for a y/N confirmation unless `--yes`.
- **Verify with the screenshot; ask when unsure.** `publish` saves
  `annonces/<slug>/publish-preview.png` of the prefilled form — **Read that PNG** to confirm
  visually before the human submits. If required info is missing (the CLI prints
  `ask the user about → …`), ask the user and fix `annonce.md` rather than publishing a blank.

## The script (zero install — just `node`)

```
node scripts/leboncoin.mjs <command> [options]
```

| Command | What it does |
|---|---|
| `login` (alias `auth`) | Open the account page, **actively verify** you're logged in (DOM probe, not just a redirect), save `auth-state.png`. `--browser brave` uses the user's Brave session (remembered for every later command); `--reset-profile` re-copies it. `--cookies-file <p>` is a best-effort escape hatch. **Run before publish/delete.** |
| `doctor [<slug>]` | **Read-only** health check: login, a search page, an ad page, and a walk of the deposit wizard that stops on the final review **without submitting**. Writes `~/.lbc-scraper/doctor-report.json` (per field: `selector` / `semantic` / `unresolved`). **Run first when anything breaks.** |
| `new <slug>` | Scaffold `annonces/<slug>/annonce.md` + `photos/`. `--notes`/`--price`/`--zipcode`/`--condition`/`--attributes` prefill it. |
| `comparables <slug>` | Scrape similar live listings → `comparables.json` + `comparables.md` (price/keyword/attribute grounding). |
| `validate <slug>` | Structural gate: required fields, ≥1 photo, real description, `status: draft`. Exit ≠ 0 if invalid (warnings are advisory). |
| `inspect <slug>` | **Read-only**: write `form-map.json` for the wizard's **first** step + `initial.png`/`html`. Types nothing, so later steps stay hidden — use `publish --diagnostic` to see them all. |
| `publish <slug>` | Walk the deposit wizard: fill each step by field meaning, upload photos, « Continuer », **stop on the final review**. Writes `form-map.json` (every step) + `push-readiness.json` + a preview. Semi-auto; `--diagnostic` (walk + report + HTML, never submits), `--strict`, `--shots` (one shot per step + post-submit), `--yes` (submits, only from the final step), `--no-screenshot`. |
| `edit <slug>` | Re-open the published ad's modify form, re-fill from `annonce.md`, screenshot; review and click « Enregistrer » yourself (`--yes` submits). |
| `renew` / `mark-sold` / `deactivate` / `reactivate` `<slug>` | Bump / mark sold (→ `sold`) / pause (→ `paused`) / put back online (→ `published`). Confirm unless `--yes`. The status changes only when Leboncoin **proves** it; otherwise `unconfirmed` + a screenshot. |
| `delete <slug>` | Remove a published ad (confirms unless `--yes`); marked `deleted` only with proof (message, or the ad page gone). |
| `list` / `status` | Show local annonces and their state (`draft`/`published`/`sold`/`paused`/`deleted`). |
| `scrape` | The original read-only scraper (search results + ad details). |

Common flags: `--annonces-dir <dir>` (default `./annonces`), `--browser <chrome|brave|chromium|opera>`
(remembered), `--json`, `-h`, `-v`.
Full reference: `references/cli.md`.

## Workflow

0. **Check login** — `login` opens the account page, verifies the session (it Reads an account
   marker, not just the URL), and saves `~/.lbc-scraper/auth-state.png`. **Read that PNG** to
   confirm the account is shown before publishing/deleting. If the user is logged in to
   Leboncoin in **Brave** (or another browser than Chrome), run `login --browser brave` once:
   the choice is remembered. If logged out, log in once in the opened browser (the command
   waits), then continue. `publish`/`delete`/`edit`/… also pre-flight this and stop early with
   `login-required` if the session is dead.
1. **Create** — `new <slug> --title "<t>" --category "<c>" --notes "<rough description>"`.
   `--notes` seeds the body; you can also pass `--price`, `--zipcode`, `--condition`,
   `--attributes "k=v,k2=v2"`. Drop the user's photos into `annonces/<slug>/photos/`.
2. **Write the copy** — the user gives rough notes + photos. You improve the description
   into the markdown body (honest, specific). This is *your* judgment, not the CLI's.
3. **Ask for what's missing** — if the annonce lacks required facts (zipcode, exact
   model/year, condition, price), **ask the user** and write the answers into `annonce.md`.
   Never publish blanks. See `references/enrichment-playbook.md`.
4. **Ground it** — `comparables <slug>`; read `annonces/<slug>/comparables.md`, then set
   `price`/`category`/`attributes` from what comparable ads show.
5. **Validate** — `validate <slug>` until it passes (warnings are advisory).
6. **Preview & publish** — `publish <slug>` (or `--diagnostic` first to check without any
   risk). The engine walks the wizard (title + category, then photos + attributes, then the
   final review), fills by field meaning, uploads the photos, and stops on the final review.
   It writes next to the annonce:
   - `push-readiness.json` — the *can-we-push?* verdict (`ready`, `blockers[]`, incl.
     `final-step`). **Read it first.**
   - `publish-preview.png` (+ `shots/step-NN.png` with `--shots`) — **Read it** to verify.
   - `form-map.json` — `{ steps: [...] }`: every live control per step with its label,
     **required** status (and why), options, and what was filled. **Read it** to find mandatory
     fields the annonce didn't cover — often **category-specific** (e.g. `Kilométrage`).
   The CLI prints `ask the user about → …` (blocking) and `note → …` (e.g. a guessed category,
   an attribute with no matching field). **Ask the user**, write the answer into `annonce.md` —
   attribute keys may be the **labels shown in `form-map.json`** — and retry. Then tell the
   user: *review the final step in the browser and submit it yourself*. Use `--yes` only if they
   asked for full-auto.
   On success the ad id/URL are written back, `status` becomes `published`, and (with `--shots`)
   `shots/30-confirmation.png` is the visual proof it went live.
7. **Manage** — `edit` (fix a typo / change the price; same wizard, photos are not re-uploaded;
   review + save), `renew` (bump), `mark-sold`, `deactivate`/`reactivate` (pause/resume),
   `delete` (uses the stored id). All pre-flight the login check and confirm unless `--yes`. An
   `unconfirmed` result means Leboncoin showed no proof: Read the saved screenshot and check
   « mes annonces » with the user before retrying.

## When Leboncoin changes

Start with `doctor`, then follow `references/deposit-form-mapping.md` (the site-drift
runbook). Most drift needs nothing (fields are matched by meaning); the rest is usually a
one-line fix in `~/.lbc-scraper/site.json` — **no rebuild**. Fix the annonce, not the engine,
when a field is simply missing from `annonce.md`.

## Markdown schema

One folder per annonce; frontmatter holds structured fields, the body is the
description. Minimal valid draft:

```markdown
---
title: "MacBook Air M1 2020 — 256 Go"
category: "Ordinateurs"   # the site's own category name
price: 650
zipcode: "75012"
attributes:
  brand: "Apple"          # technical key, or the label shown in form-map.json
  État: "Très bon état"
photos: []          # empty = use every image in photos/, sorted
status: draft
---
The description body the agent writes/enriches.
```

`publish` adds `leboncoin_id`, `leboncoin_url`, `published_at`, sets `status: published`.
Full contract + state machine: `references/markdown-schema.md`.

## Safety & captcha

- **Never `--yes` without explicit user consent.** Default semi-auto is the guardrail.
- **DataDome** is solved by the human in the browser; the engine waits up to 5 min.
  A captcha at submit means `--yes` still needs a human there.
- **Login**: publish/delete/edit/manage need the scraper profile (`~/.lbc-scraper/profile`, or
  `profile-brave` with `--browser brave`) already logged in.
  Run `login` first to **verify** (it Reads an account marker and saves `auth-state.png`); every
  write action also pre-flights it and stops early with `login-required`. The reliable session is
  the once-copied real-browser profile. `--cookies-file` (attach an exported `cookies.json`) is a
  **best-effort escape hatch only** — DataDome binds the session to the device fingerprint and
  validates the token server-side, so injected cookies often set yet still bounce to login; the
  command always re-verifies and reports the *probe* result, never the set-count.
- **ToS**: automating posts/deletes on a real account may violate Leboncoin's terms and
  risks account action. The semi-auto default + explicit `--yes` opt-in are deliberate.
  Details: `references/captcha-and-safety.md`.

## Scrape & comparables (read-only)

`scrape` and `comparables` use the original CDP scraper (real first navigation +
Next.js data routes, with fallbacks to inline JSON, captured network JSON and page
navigation if the site changes). `--query macbook` is a text search. Use them to research
the market before pricing. `comparables` is the grounding step that makes the enriched
description and price defensible.

## References

- `references/markdown-schema.md` — frontmatter contract, folder layout, status state machine, attribute vocabulary.
- `references/cli.md` — every command, flag, exit code, and the offline `demo`.
- `references/enrichment-playbook.md` — how to write the copy, infer category, and price from `comparables.md`.
- `references/deposit-form-mapping.md` — how fields are found (selectors → meaning → `site.json`), the live wizard, and the **site-drift runbook**.
- `references/captcha-and-safety.md` — semi-auto vs `--yes`, DataDome behavior, the stealth profile, ToS notes.
