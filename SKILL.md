---
name: leboncoin
description: Prepare and manage Leboncoin listings and research comparable ads through the logged-in browser. Use only when the user explicitly asks for leboncoin or a Leboncoin listing or ad-research task.
license: MIT
metadata:
  version: 1.7.0
---

# leboncoin — manage your listings from markdown

Markdown + photos in a folder are the **source of truth**. You help write the copy and fill the
structured fields; then **every account action** (publish, edit, delete, renew, mark-sold,
deactivate, reactivate) is done by **computer use in the user's own, already logged-in
browser**: the CLI writes a step-by-step sheet and opens the right page there, and you act by
screenshots, clicks and typing. Read-only research (`scrape`, `comparables`) uses the project's
zero-bot-detection CDP engine, which needs no login — or, for `comparables`, the user's own
browser too (`--own-browser` → `--import`).

## The core rule

- **Never put content on Leboncoin that is not in `annonce.md`.** Only transfer what the
  markdown says — title, description, price, attributes, photos.
- **The user is already logged in, in their own browser.** Never ask them to log in anywhere
  else, never type their password, never ask for remote-debugging flags. A login page or a
  DataDome captcha → stop and let the human handle it.
- **Screenshot before every step**, check it, then act. Act only on the ad the sheet describes.
- **The human owns the final / irreversible click.** Publish: stop on the final review (its
  button reads « Continuer »); the user submits unless they explicitly asked for full-auto.
  Delete / mark-sold: get the user's explicit go-ahead in the chat before the click. Edit: stop
  before « Enregistrer » unless asked. Never pay for an option.
- **No proof, no record.** Run `record` only when the page shows the proof the sheet names.

## The script (zero install — just `node`)

```
node scripts/leboncoin.mjs <command> [options]
```

| Command | What it does |
|---|---|
| `new <slug>` | Scaffold `annonces/<slug>/annonce.md` + `photos/`. `--notes`/`--price`/`--zipcode`/`--address`/`--condition`/`--attributes` prefill it. |
| `comparables <slug>` | Scrape similar live listings → `comparables.json` + `comparables.md` (price/keyword/attribute grounding). No login. `--own-browser`: no browser launched, prints the steps for the user's browser (search URL, a `javascript_tool` snippet that writes the JSON into the page, `get_page_text` to read it); save it to a file, then `--import <file>` writes the same two files. |
| `validate <slug>` | Structural gate: required fields, ≥1 photo, real description, `status: draft`. Exit ≠ 0 if invalid (warnings are advisory). |
| `cu-sheet <slug> [--action <a>]` | The computer-use sheet → `computer-use.md` (`--json`). `publish` (default): deposit URL, the live 3-step wizard with each value, absolute photo paths + the file-dialog recipe, per-step labels (`form-map.json`), resume block (`handoff.json`). `edit`/`delete`/`renew`/`mark-sold`/`deactivate`/`reactivate`: start URL, how to find the ad, the controls to click, the proof of success, the stop rule, the `record` command. |
| `open [<slug>] --real [--action <a>]` | Open the action's start page (`--url` wins) in the user's **own** browser through the OS (`open -a "<App>"` / `xdg-open`) — no CDP, no scraper profile. `--browser brave` once picks the app. |
| `record <slug> --url <u> [--status <s>]` | After a computer-use action: write back `leboncoin_url`/`_id`, `status` (`published` default, `sold`, `paused`, `deleted`, `renewed` = stays published + `renewed_at`), timestamp; removes `handoff.json`. |
| `list` / `status` | Show local annonces and their state (`draft`/`published`/`sold`/`paused`/`deleted`). |
| `scrape` | The original read-only scraper (search results + ad details). No login. |
| `doctor [<slug>]` | **Read-only** health check of the live site (search, ad page, deposit wizard walk without submitting). Run first when anything breaks. |

Common flags: `--annonces-dir <dir>` (default `./annonces`), `--browser <chrome|brave|chromium|opera>`
(remembered), `--json`, `-h`, `-v`. Full reference: `references/cli.md`.

## Workflow

1. **Create** — `new <slug> --title "<t>" --category "<c>" --notes "<rough description>"`
   (also `--price`, `--zipcode`, `--address`, `--condition`, `--attributes "k=v,k2=v2"`). Drop the user's
   photos into `annonces/<slug>/photos/`.
2. **Write the copy** — improve the user's notes into the markdown body (honest, specific). This
   is *your* judgment, not the CLI's.
3. **Ask for what's missing** — zipcode, the **full street address** (`address`: the deposit form
   requires it; private, not shown on the ad), exact model/year, condition, price: **ask the user**
   and write the answers into `annonce.md`. Never invent them, never publish blanks. See
   `references/enrichment-playbook.md`.
4. **Ground it** — `comparables <slug>`; read `comparables.md`, then set `price`/`category`/`attributes`.
   In the user's own browser instead: `comparables <slug> --own-browser` prints the steps —
   `tabs_create_mcp` → `navigate` to the URL → run the snippet with `javascript_tool` (it replaces
   the page with the JSON and returns only `OK <n> ads…`; reload to see the page again) →
   `get_page_text` → save the JSON after the `---` line to the printed path →
   `comparables <slug> --import <file>` → close the tab.
5. **Validate** — `validate <slug>` until it passes (warnings are advisory).
6. **Act** — the same loop for every account action (`<a>` = `publish` by default, or `edit`,
   `delete`, `renew`, `mark-sold`, `deactivate`, `reactivate`):
   1. `cu-sheet <slug> --action <a>` → **Read** `annonces/<slug>/computer-use.md`.
   2. `open <slug> --real --action <a>` → the start page opens in the user's own browser
      (optional with Claude in Chrome, which navigates its own tab).
   3. Perform it by computer use, following the sheet in order: screenshot before each step;
      the human solves captchas and logins; stop at the sheet's **stop rule** for the
      final/irreversible click (the user's explicit consent, or the user clicks).
   4. With the sheet's proof of success on screen, run the `record` command the sheet prints.

   **Driver order** (the sheet's "How to drive"):
   1. **Claude in Chrome**, if its `mcp__claude-in-chrome__*` tools are in the session (it runs
      in Chrome and Brave, in the user's logged-in profile): `tabs_context_mcp` →
      `tabs_create_mcp` (your own new tab; close it at the end) → `navigate`; look with
      `read_page` (`filter: "interactive"`) or `find` → act by ref (`computer` to click; text:
      click the field, then type — Leboncoin's React inputs; `form_input` only as a fallback) →
      verify: read every value back. Photos: `file_upload` on the file input's ref with the
      sheet's absolute paths (never click the input; needs the photos folder shared with the
      session, ≤ 10 MB per call), else the file-dialog recipe. Screenshot before each
      irreversible step. Never trigger a native alert/confirm (it freezes the extension): if one
      shows, ask the user to dismiss it. `javascript_tool` truncates its return value at ~1,000
      chars: never return large data from it (write it into the page, read it with `get_page_text`).
   2. **Desktop computer use** (screenshots, clicks) on the window `open --real` opened.
   3. dev-browser — only for the advanced CDP scraper window (below).

   Publish = a 3-step wizard (the sheet follows it): **1** title → click the suggested category;
   **2** photos, then **check every attribute Leboncoin auto-prefilled** from the title against
   `annonce.md` and fix mismatches, « État », « Continuer »; **3** (final review) **replace the
   AI-generated description Leboncoin prefilled** with the `annonce.md` body verbatim and verify
   it, « Je vends » + price, the **full address** (`address`; missing → stop and ask the user;
   pick the matching suggestion; never « Géolocaliser »), then **stop**: its « Continuer »
   publishes. Relay « Prix recommandé entre X € et Y € » to the user; don't act on it. To abort:
   « Quitter » → « Quitter sans enregistrer ». With desktop computer use, photos go through the
   OS file dialog (`Cmd+Shift+G` → paste the photos folder → `Cmd+A` → « Ouvrir »; Linux
   `Ctrl+L`). If `annonce.md` has no `leboncoin_url` for a later action, the sheet says to find
   the ad in « Mes annonces » by title and price. Playbook: `references/computer-use.md`.

### Advanced: CDP engine (needs the isolated scraper profile logged in once)

The original write engine drives a **separate** browser window over CDP, on its own fresh
scraper profile (`~/.lbc-scraper/profile`, `profile-brave` with `--browser brave`) — not the
user's browser. Use it only if the user asks for it and accepts logging in once in that window.

- `login` (alias `auth`) — verify the session (DOM probe) + `auth-state.png`; if logged out, the
  user logs in once by hand there. `--reset-profile` re-creates it; `--copy-profile` (opt-in,
  may log the real browser out) seeds it from the real one; `--cookies-file` is best-effort only.
- `inspect <slug>` — read-only: `form-map.json` for the wizard's first step.
- `publish <slug>` — walk the wizard, fill by field meaning, upload photos, **stop on the final
  review**; writes `push-readiness.json`, `publish-preview.png` (**Read them**), `form-map.json`.
  `--diagnostic` never submits; `--yes` submits (only with explicit consent); `--strict`, `--shots`.
  When it ends `incomplete` / `form-error` / `not-published` it writes `handoff.json` and leaves
  the window open: finish only what remains there (`cu-sheet` puts it on top), then `record`.
- `edit` / `renew` / `mark-sold` / `deactivate` / `reactivate` / `delete <slug>` — confirm unless
  `--yes`; the local status changes only when Leboncoin **proves** it, else `unconfirmed` + a
  screenshot.
- `open <slug> [--deposit]` (without `--real`) — the scraper window on the page, left open, with
  its CDP port. Only there can [dev-browser](https://github.com/sawyerhood/dev-browser) help
  (optional): `dev-browser --connect <port>` — snapshot → act by ref → verify, photos via
  `uploadFile`; never let it launch its own browser. The user's own browser has no CDP port.

## When Leboncoin changes

Start with `doctor`, then follow `references/deposit-form-mapping.md` (the site-drift runbook).
For computer use, the sheet's labels come from the same tables: if a label moved, look for the
closest one on screen and tell the user.

## Markdown schema

One folder per annonce; frontmatter holds structured fields, the body is the description.
Minimal valid draft:

```markdown
---
title: "MacBook Air M1 2020 — 256 Go"
category: "Ordinateurs"   # the site's own category name
price: 650
zipcode: "75012"
address: "12 rue de Charenton, 75012 Paris"
attributes:
  brand: "Apple"          # technical key, or the label shown in form-map.json
  État: "Très bon état"
photos: []          # empty = use every image in photos/, sorted
status: draft
---
The description body the agent writes/enriches.
```

`record` (or the CDP `publish`) adds `leboncoin_id`, `leboncoin_url`, `published_at`, sets
`status: published`. Full contract + state machine: `references/markdown-schema.md`.

## Safety & captcha

- **DataDome** is solved by the human in the browser, never by the agent.
- **Consent**: the final publish, delete and mark-sold clicks need the user's explicit go-ahead
  (or the user clicks). Never `--yes` on the CDP engine without it.
- **ToS**: acting on a real account by automation may breach Leboncoin's terms — pace actions,
  never mass-post. Details: `references/captcha-and-safety.md`.

## References

- `references/computer-use.md` — the per-action playbooks: labels, category picker, photo file dialog, final step, proofs, `record`.
- `references/markdown-schema.md` — frontmatter contract, folder layout, status state machine, attribute vocabulary.
- `references/cli.md` — every command, flag, exit code, and the offline `demo`.
- `references/enrichment-playbook.md` — how to write the copy, infer category, and price from `comparables.md`.
- `references/deposit-form-mapping.md` — how fields are found (selectors → meaning → `site.json`), the live wizard, and the **site-drift runbook**.
- `references/captcha-and-safety.md` — semi-auto vs `--yes`, DataDome behavior, the stealth profile, ToS notes.
