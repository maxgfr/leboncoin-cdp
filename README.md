# leboncoin-cdp

Manage your Leboncoin listings from **local markdown + photos**, then publish, edit and
delete them on your own account — by **computer use in your own, already logged-in browser**
by default, or via the **Chrome DevTools Protocol** — built on the original zero-bot-detection
CDP scraper. Shipped as a [skills.sh](https://skills.sh) agent
skill (a thick `SKILL.md` playbook + a single zero-dependency CLI bundle).

```bash
npx skills add maxgfr/leboncoin-cdp
```

Markdown is the source of truth. You (or your agent) write and enrich the description —
grounded by comparable live listings. Then every account action (publish, edit, delete, renew,
mark-sold, deactivate, reactivate) goes through **computer use in your everyday browser**, where
you are already logged in: `cu-sheet <slug> --action <a>` writes a step-by-step sheet (values,
labels to click, proof of success, stop rule), `open <slug> --real --action <a>` opens the right
page in your browser, the agent acts by screenshots, clicks and typing, and `record` writes the
result back. The preferred driver is the Claude in Chrome extension (Chrome or Brave: its own
tab, page refs, photo upload without the file dialog); else desktop computer use on the window
`open --real` opened. No second login, no remote-debugging flag. **Safe by default:** the agent stops
before the final publish and asks before any irreversible click (delete, mark-sold); a human
solves captchas.

The CDP write engine (`publish`, `edit`, `delete`, …) remains as an advanced alternative: it
drives a separate browser window on its own scraper profile, which you log in to once. When
Leboncoin changes something, `doctor` says what broke.

## Why CDP (and why it isn't detected)

Instead of Puppeteer (flagged by DataDome), everything runs through a **raw WebSocket CDP**
client attached to a normal browser: real first navigation sets the cookies, and all
interaction runs as in-page JavaScript (`Runtime.evaluate`) — indistinguishable from the
site's own frontend. The skill launches a **separate** browser instance on its own fresh,
isolated profile (`~/.lbc-scraper`) and **never touches your running browser**. Reads (`scrape`,
`comparables`) need no login, on any browser. The CDP write engine (advanced) needs that window
logged in once by hand (`login` waits) — it keeps its own session, so your real browser stays
logged in.
`--copy-profile` seeds it from your real profile instead (opt-in: the shared session tokens may
log your real browser out of Leboncoin).

## The skill workflow

```bash
node scripts/leboncoin.mjs new macbook-air-m1 --title "MacBook Air M1" --category "Ordinateurs"
# → drop photos into annonces/macbook-air-m1/photos/, write the description in annonce.md

node scripts/leboncoin.mjs comparables macbook-air-m1      # scrape similar ads → comparables.md (no login)
# → set price / category / attributes from the comparables

node scripts/leboncoin.mjs validate macbook-air-m1         # structural gate (exit≠0 if invalid)

# Publish by computer use, in your own logged-in browser:
node scripts/leboncoin.mjs cu-sheet macbook-air-m1         # → computer-use.md: values, photos, file-dialog recipe
node scripts/leboncoin.mjs open macbook-air-m1 --real      # the deposit form, in your browser (--browser brave once)
# → the agent fills it by screenshots/clicks/typing and stops on the final review; you submit
node scripts/leboncoin.mjs record macbook-air-m1 --url https://www.leboncoin.fr/ad/ordinateurs/1234567890

# Any later action, same loop (edit, delete, renew, mark-sold, deactivate, reactivate):
node scripts/leboncoin.mjs cu-sheet macbook-air-m1 --action mark-sold
node scripts/leboncoin.mjs open macbook-air-m1 --real --action mark-sold
node scripts/leboncoin.mjs record macbook-air-m1 --url <ad url> --status sold

node scripts/leboncoin.mjs list                            # see local annonces + their state
node scripts/leboncoin.mjs doctor                          # read-only health check when something breaks
```

| Command | What it does |
|---|---|
| `new <slug>` | Scaffold `annonces/<slug>/annonce.md` + `photos/` (a draft). |
| `comparables <slug>` | Scrape similar live listings → `comparables.json` + `comparables.md` (grounding). |
| `validate <slug>` | Required fields, ≥1 photo, real description, `status: draft`. |
| `cu-sheet <slug> [--action <a>]` | Computer-use sheet (`computer-use.md`, `--json`). Publish: values in form order, photo paths + file-dialog recipe, step labels, handoff resume. Other actions: start URL, how to find the ad, controls, proof of success, stop rule, `record` command. |
| `open [<slug>] --real [--action <a>]` | Open the action's page in **your own** browser through the OS (`open -a` / `xdg-open`) — no CDP. |
| `record <slug> --url <u> [--status <s>]` | Write back an action done by computer use (id, URL, status: `published`, `sold`, `paused`, `deleted`, `renewed`). |
| `publish <slug>` | Advanced, CDP: fill the deposit form + upload photos in the scraper window. Semi-auto; `--yes` auto-submits. |
| `edit` / `delete` / `renew` / `mark-sold` / `deactivate` / `reactivate` `<slug>` | Advanced, CDP: the same actions in the scraper window (confirm unless `--yes`). |
| `login` / `open [<slug>]` | Advanced, CDP: log in the scraper window once / open it on a page and print its CDP port (+ `dev-browser --connect <port>` if installed). |
| `list` / `status` | Show local annonces and their published state. |
| `scrape` | The original read-only scraper (search results + ad details). |

See `SKILL.md` and `references/` for the full playbook, the markdown schema, the deposit-form
selector map, and the safety/captcha notes.

### Markdown schema (source of truth)

```markdown
---
title: "MacBook Air M1 2020 — 256 Go"
category: "Informatique"
price: 650
zipcode: "75012"
attributes:
  brand: "Apple"
  model: "MacBook Air M1"
photos: []          # empty = every image in photos/, sorted
status: draft
---
The description body you write / enrich.
```

`publish` writes back `leboncoin_id`, `leboncoin_url`, `published_at` and flips
`status: published`. Full contract: `references/markdown-schema.md`.

## The scraper (read-only)

The original scraper lives on as the `scrape` subcommand — raw CDP + Next.js data routes,
zero detection, all categories, macOS + Linux, Brave/Chrome/Opera/Chromium.

```bash
node scripts/leboncoin.mjs scrape --query "category=2&locations=Lyon&price=0-10000" --with-details
node scripts/leboncoin.mjs scrape --query "https://www.leboncoin.fr/recherche?category=9" -o paris
```

Flags: `--query/-q`, `--output/-o`, `--config/-c`, `--with-details/-d`, `--details-only`,
`--max-pages`, `--rate-limit`, `--retries`, `--output-dir`, `--save-raw`, `--browser/-b`,
`--chrome-path`, `--port/-p`, `--timeout`, `--reset-profile`, `--copy-profile`. Output JSON goes to
`--output-dir` (default `./assets`). Env vars: `CHROME_PATH`, `PAGE_TIMEOUT`, `MAX_RETRIES`,
`RATE_LIMIT`, `MAX_PAGES`, `OUTPUT_DIR`, `SAVE_RAW`, `LBC_SCRAPER_HOME`.

> **Breaking change (3.0):** the old `pnpm start -- --query …` is now
> `node scripts/leboncoin.mjs scrape --query …`.

## Safety

- **Semi-auto by default** — the engine never clicks the final publish for you unless you
  pass `--yes` (which is still not headless: a captcha at submit needs a human).
- **DataDome** challenges are detected and wait up to 5 min for you to solve them.
- **Your account, your terms** — automating posts/deletes may violate Leboncoin's ToS and
  risks account action. See `references/captcha-and-safety.md`.

## Development

Zero **runtime** dependencies: the TypeScript in `src/` is bundled by tsup into a single
committed ESM file, `scripts/leboncoin.mjs` (`ws` is inlined), runnable on Node ≥ 18 with no
install.

```bash
pnpm install
pnpm run build       # tsup → scripts/leboncoin.mjs
pnpm test            # vitest
pnpm run typecheck
pnpm run check:build # rebuild and assert the committed bundle is reproducible
pnpm run demo        # offline smoke: validate the example annonce
```

Releases are automated with **semantic-release** on push to `main` (Conventional Commits):
it syncs the version across `package.json` / `src/types.ts` / `SKILL.md`, rebuilds the
bundle, and publishes a GitHub release with the tarball. No npm-registry publish.

## License

MIT

## Skill invocation: on request or explicit-only

The `leboncoin` skill ships **model-invocable, on request**: its description restricts it to explicit requests, so the agent calls it when you ask for it, not on its own. Invoking it by name always works: `$leboncoin` in Codex or `/leboncoin` in Claude Code and OpenCode.

Making it explicit-only, so that only its name runs it, is one frontmatter setting, applied to the installed copy:

| Host | Shipped, on request | Explicit-only |
| --- | --- | --- |
| Claude Code, OpenCode | no `disable-model-invocation` in `SKILL.md` | add `disable-model-invocation: true` |

Claude Code can do it without touching the file: `"skillOverrides": { "leboncoin": "user-invocable-only" }` in `settings.json` leaves `/leboncoin` working while hiding the skill from the model. Updating or reinstalling restores the shipped default, so reapply the change afterwards.
