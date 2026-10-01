# Deposit wizard & site-drift runbook

Leboncoin changes its pages often. The engine is built so that most changes need **no code
change**, a few need a JSON edit, and only a real redesign needs code. Read this when `doctor`
fails, `publish` stops early, or a report says `unresolved`.

## How the engine finds things (most to least specific)

1. **Fast path — `src/selectors.ts`.** Ordered candidate lists per logical field
   (`DEPOSIT.titleInput = ['input[name="subject"]', …]`), buttons as
   `{ textCandidates, css }`, URL regexes. Fine while the site keeps its names.
2. **By meaning — `field-match.ts` + `LOGICAL_FIELDS`.** Every control is discovered from the
   live DOM by **role** (`form-introspect.ts`: inputs, ARIA comboboxes with their listbox
   options, radio groups, switches, file inputs) and matched to the annonce by, in order: a
   fast-path hit → its `name` / `id` / `data-qa-id` / react-hook-form container name
   (`[data-rhf-name]`) → the words of its label, accessible name, container label or
   placeholder (accent- and case-insensitive). A renamed `name=` or a restyle keeps working as
   long as the label still says « Prix », « Titre », « adresse »…
3. **Overrides — `~/.lbc-scraper/site.json`** (or `$LBC_SITE_OVERRIDES`): extends 1 and 2
   without a rebuild (see below).

Attributes in `annonce.md` match by technical key (`mileage`), by rhf suffix (`brand` →
`computer_brand`) or by **visible label** — so a label copied from `form-map.json`
(`Kilométrage: 120000`, `Taille d'écran: …`) always works. Option values (État, Marque…) are
matched to the offered options tolerantly (exact > prefix > contains > shared words).

## The wizard (as captured live on 2026-10-01)

« Déposer une annonce » is a **multi-step wizard** (`deposit-wizard.ts`):

| Step | Heading | Content |
|---|---|---|
| 1 | « Commençons par l'essentiel ! » | title; after ~2–3 s, **suggested category cards** (`role=button`, aria-label « Choix 1 : catégorie Ordinateurs dans la famille Électronique ») — clicking one advances; « Choisissez » opens the two-level tree; then « Type d'annonce » (Offre) |
| 2 | « Dites-nous en plus sur votre article » | photos (`input[type=file]`, no name), category attributes as ARIA comboboxes (Type, Marque, État…), switches; some categories add **paid upsells** (« Pack Photos 5,70 € ») |
| 3 | « Un dernier aperçu avant de publier votre annonce ! » | title, description, price (`price_cents`, in euros), sell/give radio group, address (combobox, async suggestions), delivery. **Its « Continuer » submits the ad.** |

Per step the wizard fills by meaning, uploads photos when a file input appears, picks the
category card, records the step in `form-map.json` (`{ steps: [...] }`, with what was filled),
takes `shots/step-NN.png`, then:

- **stops on the final step** — recognised by its content: `DEPOSIT.finalStepMarkers`
  (« avant de publier », « je confirme l'exactitude »…), an explicit publish button, or
  structurally (title + description + price/address on one step). It never clicks past it; only
  `publish --yes` submits, and only from there;
- **stops on a required control it cannot fill** (`missing-required` → « ask the user about »).
  Paid options never block and are never ticked; an unchecked checkbox blocks only with an
  explicit `required`;
- otherwise clicks « Continuer » and checks the step fingerprint changed (else `stuck`, with
  the visible form error).

Live gotchas the engine already handles: React clears `input.files` after reading it (upload
is verified by **thumbnails**); the address list first shows a **stale** suggestion (the
engine types « <zip> <city> » and waits for a matching option); « Continuer » is a
`button[type=submit]` on **every** step (so no generic submit fallback for « Déposer »).

## Runbook — something broke

1. `leboncoin doctor` (read-only; walks the wizard and stops before submitting). Read
   `~/.lbc-scraper/doctor-report.json`:
   - `login` ✗ → see `captcha-and-safety.md` (session) or add a marker to
     `AUTH.loggedInSelectors` / `loggedOutSelectors`.
   - `search` / `ad-detail` ✗ or source ≠ `next-data` → the front-end moved; the scraper already
     falls back (inline JSON → captured network JSON → `/ad/` links). Save a payload with
     `scrape --save-raw` and check `findSearchPayload` still finds the ads.
   - `deposit` ✗ → read `deposit.steps` (where it stopped and why) and `fields`
     (`selector` / `semantic` / `unresolved` / `not-reached`).
2. For the deposit, run `publish <slug> --diagnostic --shots`: read `form-map.json` (every step,
   every control, its label/options, what was filled) and `shots/step-NN.png`.
3. Fix with the **lightest** tool:
   - a required field the annonce does not cover → ask the user, add it to `annonce.md`
     (attribute key = the label shown in `form-map.json`);
   - a field the engine does not recognise → add its label word to `LOGICAL_FIELDS` in
     `site.json`;
   - a renamed button / new final-step wording / moved URL → `site.json`;
   - a new kind of control or flow → code: `form-introspect.ts` (discovery), `deposit-form.ts`
     (`fillField`), `deposit-wizard.ts` (flow). Re-capture fixtures (below) first.
4. Re-run `doctor` until it is green.

## `site.json` overrides (no rebuild)

```json
{
  "DEPOSIT": {
    "nextButton": { "textCandidates": ["Étape suivante"] },
    "finalStepMarkers": ["vérifiez votre annonce"],
    "priceInput": ["input[name=\"amount\"]"],
    "publishedUrlPattern": ["/annonce/(\\d+)"]
  },
  "AUTH": { "loggedInSelectors": ["a[href^=\"/mon-espace\"]"] },
  "MANAGE": { "listingUrl": "https://www.leboncoin.fr/mes-annonces-v2", "pausedMarkers": ["annonce en sommeil"] },
  "LOGICAL_FIELDS": { "price": { "labels": ["montant"] } }
}
```

Lists are **prepended** (tried first), buttons merge `textCandidates`/`css`, URL strings are
replaced, regexes accept pattern strings (case-insensitive). Unknown or invalid entries are
skipped with a warning; computed entries (`attrByKey`) cannot be overridden. Every live command
applies the file at start-up and logs what it applied.

## Management actions (delete / pause / sold…)

Controls are looked up on the ad page, then behind a « … » / `aria-haspopup` menu, then in
**the ad's own card** on « mes annonces » (`MANAGE.listingUrl`, `/compte/part/mes-annonces`
since 2026-10 — never a page-wide click there). The local status changes only with **proof**:
a confirmation sentence (`MANAGE.*Markers`), the opposite control appearing (pause →
« Réactiver »), or — for delete — the ad page reloaded and gone. Otherwise the result is
`unconfirmed`, `annonce.md` is untouched and `manage-unconfirmed.png` / `delete-unconfirmed.png`
shows the page. New confirmation wording → add it to the markers in `site.json`.

## Re-capturing fixtures

Tests run the real in-page code (jsdom) against anonymized live captures in
`src/__mocks__/deposit-*.html`. To refresh them: walk the wizard by hand in the scraper browser,
save each step's `main` (classes/styles stripped), and **anonymize** before committing — the
review step carries hidden `email`, `phone` and the account address. Then `pnpm test` shows
what changed.

## Element clips — `screenshot.ts`

`captureElement` crops one control (`DOM.getBoxModel` → `Page.captureScreenshot{clip}`),
best-effort: a hidden element returns `false` and the full-page shot remains the proof. Named
targets live in `ELEMENT_TARGETS`.
