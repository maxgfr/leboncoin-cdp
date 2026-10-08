# leboncoin-cdp

Manage your Leboncoin listings from **local markdown + photos**, then **publish and
delete** them on your own account via the **Chrome DevTools Protocol** — built on the
original zero-bot-detection CDP scraper. Shipped as a [skills.sh](https://skills.sh) agent
skill (a thick `SKILL.md` playbook + a single zero-dependency CLI bundle).

```bash
npx skills add maxgfr/leboncoin-cdp
```

Markdown is the source of truth. You (or your agent) write and enrich the description —
grounded by comparable live listings — then the skill drives the « déposer une annonce »
form on your real, logged-in browser to publish. **Semi-automatic and safe by default:** it
walks the deposit wizard, fills every step by field meaning and uploads the photos, then stops
on the final review: you check it on screen and submit it yourself. Logged in with Brave?
`login --browser brave` once. When Leboncoin changes something, `doctor` says what broke.

## Why CDP (and why it isn't detected)

Instead of Puppeteer (flagged by DataDome), everything runs through a **raw WebSocket CDP**
client attached to your *real* browser profile: real first navigation sets the cookies, and
all interaction runs as in-page JavaScript (`Runtime.evaluate`) — indistinguishable from the
site's own frontend. The skill launches a **separate** browser instance against a one-time
copy of your profile (`~/.lbc-scraper`) and **never touches your running browser**.

## The skill workflow

```bash
node scripts/leboncoin.mjs login --browser brave             # once: use (and remember) your Brave session
node scripts/leboncoin.mjs new macbook-air-m1 --title "MacBook Air M1" --category "Ordinateurs"
# → drop photos into annonces/macbook-air-m1/photos/, write the description in annonce.md

node scripts/leboncoin.mjs comparables macbook-air-m1      # scrape similar ads → comparables.md
# → set price / category / attributes from the comparables

node scripts/leboncoin.mjs validate macbook-air-m1         # structural gate (exit≠0 if invalid)
node scripts/leboncoin.mjs publish  macbook-air-m1 --diagnostic   # walk the wizard, never submits
node scripts/leboncoin.mjs publish  macbook-air-m1         # same, then you submit the final step
node scripts/leboncoin.mjs doctor                          # read-only health check when something breaks
node scripts/leboncoin.mjs list                            # see local annonces + their state
node scripts/leboncoin.mjs delete  macbook-air-m1          # remove a published ad
```

| Command | What it does |
|---|---|
| `new <slug>` | Scaffold `annonces/<slug>/annonce.md` + `photos/` (a draft). |
| `comparables <slug>` | Scrape similar live listings → `comparables.json` + `comparables.md` (grounding). |
| `validate <slug>` | Required fields, ≥1 photo, real description, `status: draft`. |
| `publish <slug>` | Fill the deposit form + upload photos via CDP. Semi-auto; `--yes` auto-submits; `--dry-run` fills only. |
| `delete <slug>` | Remove a published ad (confirms unless `--yes`). |
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
`--chrome-path`, `--port/-p`, `--timeout`, `--reset-profile`. Output JSON goes to
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

The `leboncoin` skill ships **model-invocable, on request**: its description restricts it to explicit requests, so the agent calls it when you ask for it, not on its own. Invoking it by name always works: `$leboncoin` in Codex or `/leboncoin` in Claude Code and OpenCode (with the plugin namespace when installed as a Claude plugin).

Making it explicit-only, so that only its name runs it, is one setting per host, applied to the installed copy:

| Host | Shipped, on request | Explicit-only |
| --- | --- | --- |
| Claude Code | no `disable-model-invocation` in `SKILL.md` | add `disable-model-invocation: true` |
| Codex | `allow_implicit_invocation: true` under `policy:` in `agents/openai.yaml` | set it to `false` |
| OpenCode | `metadata.opencode/autoinvoke: 'true'` in `SKILL.md` | set it to `'false'` |

Claude Code can do it without touching the file: `"skillOverrides": { "leboncoin": "user-invocable-only" }` in `settings.json` leaves `/leboncoin` working while hiding the skill from the model. Updating or reinstalling restores the shipped default, so reapply the change afterwards.

OpenCode V1 reads no `autoinvoke` metadata; `permission.skill` in `~/.config/opencode/opencode.json` or the project configuration is how you force explicit-only there. Retain unrelated permissions:

```json
{
  "permission": {
    "skill": {
      "leboncoin": "deny"
    }
  }
}
```

On OpenCode 1.18.30, that rule hides the skill from the agent and rejects skill-tool loading, while the explicit `/leboncoin` command remains available. Installation with `skills add` does not apply this OpenCode V1 configuration.
