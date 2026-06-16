---
name: leboncoin
description: "Use when the user wants to publish / déposer une annonce on Leboncoin, manage their classifieds listings, create or delete a Leboncoin ad, or scrape Leboncoin. Manages listings locally as markdown + photos (the source of truth): you (or the agent) write and enrich the description — grounded by comparable live listings — then the skill drives the « déposer une annonce » form via the Chrome DevTools Protocol on the user's own logged-in browser to publish, and deletes ads the same way. Triggers: 'publie mon annonce', 'déposer une annonce leboncoin', 'mets en ligne mon annonce', 'post my listing to leboncoin', 'create a leboncoin ad', 'supprime mon annonce', 'delete my leboncoin listing', 'gérer mes annonces leboncoin', 'manage my leboncoin listings', 'scrape leboncoin', 'prix comparables leboncoin', 'find comparable prices on leboncoin'. Semi-automatic and safe by default: it fills the form and uploads the photos via CDP, but you review on screen and click « Déposer mon annonce » yourself (a flag opts into full-auto). Built on the original zero-bot-detection CDP scraper."
license: MIT
metadata:
  version: 1.2.0
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
- **Semi-auto is the default.** `publish` fills every field and uploads the photos,
  then *pauses* for the human to review in the browser and click
  « Déposer mon annonce » themselves. Only pass `--yes` if the user explicitly asks
  for full-auto. The human owns the final click; that click also clears the DataDome
  captcha at submit.
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
| `login` (alias `auth`) | Open the account page, **actively verify** you're logged in (DOM probe, not just a redirect), save `auth-state.png`. `--cookies-file <p>` attaches an exported `cookies.json` (best-effort escape hatch, always re-verified); waits while you log in if needed. **Run before publish/delete.** |
| `new <slug>` | Scaffold `annonces/<slug>/annonce.md` + `photos/`. `--notes`/`--price`/`--zipcode`/`--condition`/`--attributes` prefill it. |
| `comparables <slug>` | Scrape similar live listings → `comparables.json` + `comparables.md` (price/keyword/attribute grounding). |
| `validate <slug>` | Structural gate: required fields, ≥1 photo, real description, `status: draft`. Exit ≠ 0 if invalid (warnings are advisory). |
| `inspect <slug>` | **Read-only**: open the live deposit form and write `form-map.json` (every field + required/optional + select options) + `initial.png`/`html`. Submits nothing. Use it to discover category-specific required fields. |
| `publish <slug>` | Fill the deposit form + upload photos via CDP, write `form-map.json` + `push-readiness.json` + a preview screenshot. Semi-auto; `--diagnostic` (field report + HTML, no submit), `--strict`, `--shots` (checkpoint + element + post-submit confirmation shots), `--yes`, `--no-screenshot`. |
| `edit <slug>` | Re-open the published ad's modify form, re-fill from `annonce.md`, screenshot; review and click « Enregistrer » yourself (`--yes` submits). |
| `renew` / `mark-sold` / `deactivate` / `reactivate` `<slug>` | Bump / mark sold (→ `sold`) / pause (→ `paused`) / put back online (→ `published`). Confirm unless `--yes`. |
| `delete <slug>` | Remove a published ad (confirms unless `--yes`). |
| `list` / `status` | Show local annonces and their state (`draft`/`published`/`sold`/`paused`/`deleted`). |
| `scrape` | The original read-only scraper (search results + ad details). |

Common flags: `--annonces-dir <dir>` (default `./annonces`), `--json`, `-h`, `-v`.
Full reference: `references/cli.md`.

## Workflow

0. **Check login** — `login` opens the account page, verifies the session (it Reads an account
   marker, not just the URL), and saves `~/.lbc-scraper/auth-state.png`. **Read that PNG** to
   confirm the account is shown before publishing/deleting. If logged out, log in once in the
   opened browser (the command waits), then continue. `publish`/`delete`/`edit`/… also pre-flight
   this and stop early with `login-required` if the session is dead.
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
6. **Preview & publish** — `publish <slug>`. The engine fills the form, uploads the photos,
   and writes three artifacts next to the annonce:
   - `publish-preview.png` — **Read it** to verify the form visually.
   - `form-map.json` — every live field with its **required/optional** status (and why) + select
     options. **Read it** to find mandatory fields the annonce didn't cover — often
     **category-specific** (e.g. `kilométrage`, `surface`). Live required fields are folded into
     the `missing[]` / `ask the user about → …` list.
   - `push-readiness.json` — the machine-readable *can-we-push?* verdict (`ready`, `blockers[]`).
     **Read it first.**
   For any required-but-empty field, **ask the user**, write the answer into `annonce.md`
   (durable), and retry. (`publish --diagnostic` fills + saves everything without submitting;
   `inspect <slug>` does the same read-only without filling.) Then tell the user: *review the
   prefilled form and click « Déposer mon annonce »*. Use `--yes` only if they asked for full-auto.
   On success the ad id/URL are written back, `status` becomes `published`, and (with `--shots`)
   `shots/30-confirmation.png` is the visual proof it went live.
7. **Manage** — `edit` (fix a typo / change price-photos; review + save), `renew` (bump),
   `mark-sold`, `deactivate`/`reactivate` (pause/resume), `delete` (uses the stored id). All
   pre-flight the login check and confirm unless `--yes`.

## Markdown schema

One folder per annonce; frontmatter holds structured fields, the body is the
description. Minimal valid draft:

```markdown
---
title: "MacBook Air M1 2020 — 256 Go"
category: "Informatique"
price: 650
zipcode: "75012"
attributes:
  brand: "Apple"
  model: "MacBook Air M1"
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
- **Login**: publish/delete/edit/manage need the `~/.lbc-scraper` profile already logged in.
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
Next.js data routes). Use them to research the market before pricing. `comparables`
is the grounding step that makes the enriched description and price defensible.

## References

- `references/markdown-schema.md` — frontmatter contract, folder layout, status state machine, attribute vocabulary.
- `references/cli.md` — every command, flag, exit code, and the offline `demo`.
- `references/enrichment-playbook.md` — how to write the copy, infer category, and price from `comparables.md`.
- `references/deposit-form-mapping.md` — the logical-field → `selectors.ts` map and the maintenance runbook when Leboncoin changes.
- `references/captcha-and-safety.md` — semi-auto vs `--yes`, DataDome behavior, the stealth profile, ToS notes.
