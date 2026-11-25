# Computer use — filling the deposit wizard by screen

The CDP engine (`publish`) fills the wizard with in-page JavaScript. Computer use does the same
job with screenshots, clicks and typing, in the **same scraper window** and from the **same
values** (`annonce.md`). Use it when the user asks for it, or to finish a CDP run that handed off.

**Driver, in order of preference:** (1) [dev-browser](https://github.com/sawyerhood/dev-browser) attached to the scraper window —
accessibility snapshot + refs, see [Recommended driver: dev-browser](#recommended-driver-dev-browser);
(2) pixel computer use (sections 2–5 below) as the last resort. The rules and steps are the same.

Rules first (they override everything below):

- Type **only** the values from the sheet. Never invent a title, price, attribute or text.
- **Stop on the final review step.** Never click its « Continuer » / « Déposer mon annonce »
  unless the user explicitly asked for full-auto. The human submits.
- **DataDome** (« Vérification », a slider or puzzle, a `captcha-delivery` frame): stop and ask
  the human to solve it. Never try to solve it yourself.
- Take a screenshot after every action that changes the page, and check it before moving on.

## 1. Prepare

```
node scripts/leboncoin.mjs validate <slug>        # must pass
node scripts/leboncoin.mjs cu-sheet <slug>        # → annonces/<slug>/computer-use.md
node scripts/leboncoin.mjs open <slug> --deposit  # scraper window on the deposit form + CDP port
```

Read `computer-use.md`: it lists, in form order, title, category, the full description, price,
location, condition/shipping, every attribute (label → value) and the **absolute** photo paths.
If `form-map.json` exists (`inspect`, or better `publish --diagnostic`, which walks every step),
the sheet also lists per step the visible labels and which are **required** — that is what to
look for on screen. The window `open` launches uses the scraper profile, which must be logged
in (`login`; the user logs in once by hand there).

## 2. Find fields by their visible label

Leboncoin's class names are hashed and change; the labels do not. For each value, find the
control whose label, placeholder or heading matches (accents and case do not matter): « Titre de
l'annonce », « Description », « Prix », « Adresse » / « Localisation », « État », « Marque »…
An attribute key in the sheet may already be the label (`Taille d'écran`) or a technical key
(`brand` → « Marque »). A required field is marked with `*` or « obligatoire ».

- Text fields: click, select all, type the value. Paste the description verbatim (keep its line
  breaks); do not shorten it.
- Dropdowns / comboboxes (« État », « Marque »…): open, then click the option whose text matches
  the value; if none matches exactly, pick the closest one and tell the user.
- Location: type the zipcode (then the city if the sheet has one) and **click** the matching
  suggestion (« Paris (75012) »); a typed value without a picked suggestion is not accepted.
- Price: digits only.

## 3. Category picker

Step 1 asks for the title, then offers suggested categories (cards / radio choices). Click the one
whose name matches the sheet's category. If it is not suggested, open the category dialog
(« Choisir une catégorie » / « Toutes les catégories » / « Changer de catégorie »), find it by name (families first, e.g. « Électronique » →
« Ordinateurs »), and click it. If nothing matches, pick the closest and tell the user — never
guess silently.

## 4. Photos (OS file dialog)

Click the photo area (« Ajouter des photos »). The OS file dialog opens:

- macOS: press `Cmd+Shift+G`, type the **absolute** path from the sheet, Enter, then « Ouvrir ».
- Linux (GTK): press `Ctrl+L`, type the absolute path, Enter.

Upload in the sheet's order; several files of one folder can be selected together. Wait for each
thumbnail to appear, then compare the count with the sheet. In a handoff, upload only
`remaining_photos`.

## 5. Advance and recognise the final step

Click « Continuer » between steps and screenshot each new step. If a step refuses to continue,
read the red error under the field, fix that field from the sheet, or ask the user if the value is
not in it.

The **final step** is the review: it reads « Avant de publier » / « Je confirme l'exactitude… »,
or shows an explicit « Déposer mon annonce » / « Publier mon annonce » button, and typically
repeats title + description + price + address on one page (the same markers as
`captcha-and-safety.md`). On the live site its button is just « Continuer » — so recognise it by
its content, never by the button label. **Stop there**, screenshot it, and tell the user to review
and submit.

## 6. Fallback: finish a CDP handoff

When `publish` logs `handoff → computer use: read annonces/<slug>/handoff.json …`, the window is
still open on the step it reached. Do not restart the deposit. Read `handoff.json` (or run
`cu-sheet`, which puts it on top):

- `reason` / `wizard_stop` / `error` — why CDP stopped (`incomplete`, `form-error`,
  `not-published`; `missing-required`, `stuck`, `no-next`, `max-steps`…).
- `step` — `{ index, title }` of the step reached.
- `missing[]` — `{ field, required, value }`: the value to put in each unfilled field
  (`value: null` = not in `annonce.md`: ask the user, write it into `annonce.md`, then type it).
- `remaining_photos[]`, `preview_png` (Read it first), `cdp_port`.

Finish only what remains, then continue with step 5 as usual.

## 7. Record the result

When the ad is live (the human submitted; the page shows the ad or « mes annonces » lists it),
copy its URL (`https://www.leboncoin.fr/ad/<category>/<id>`) and run:

```
node scripts/leboncoin.mjs record <slug> --url <ad url>
```

It writes `leboncoin_url`, `leboncoin_id`, `status: published` and `published_at` into
`annonce.md`, and removes `handoff.json`. For a change made by hand on the site, pass
`--status sold|paused|deleted`.

## Recommended driver: dev-browser

[dev-browser](https://github.com/sawyerhood/dev-browser) (MIT, `npm i -g dev-browser`) runs Puppeteer scripts in a warm daemon. It is
**optional**, not a dependency of the skill. `open` detects it on `PATH` and prints
`driver → dev-browser --connect <port>` (or an install hint); `--json` reports it as
`devBrowser: { available, command }`, `handoff.json` carries the same command as `driver_hint`,
and `computer-use.md` has a "How to drive" block. `dev-browser --help` prints its full guide.

- **Always attach, never launch.** Use `dev-browser --connect <port>` with the port `open` prints.
  Without `--connect` it launches its own Puppeteer browser: a separate profile that is not
  logged in, with automation flags. Attached to the scraper window, a Leboncoin page loads with
  `navigator.webdriver=false` and no DataDome challenge.
- **Loop:** look (`page.snapshot({ interactive: true })` → an accessibility tree with refs like
  `[ref=e35]`) → act by ref (`page.click("ref/e35")`, `page.fill("ref/e7", "text")`,
  `page.select(…)` for a `<select>`) → verify (snapshot again, or `page.url()`). One
  decision-sized step per invocation; never assume a ref, snapshot first.
- **Same tab:** work in the tab `open` opened (`browser.listPages()` → `browser.getPage(id)`),
  not a new one — in a handoff it is on the step CDP reached.
- **Photos:** `(await page.ref("eN")).uploadFile(...absPaths)` or
  `(await page.$("input[type=file]")).uploadFile(...)`, with the sheet's absolute paths (only
  `remaining_photos` in a handoff). No OS file dialog. Then check the thumbnail count.
- The rules at the top still apply: only the sheet's values, a human solves DataDome, **stop on
  the final review**.

Deposit-wizard example (one step per invocation; the refs are placeholders — read them from your
own snapshot):

```bash
PORT=9222   # the CDP port printed by `leboncoin open <slug> --deposit`

# 1. Look: find the deposit tab and print its interactive snapshot.
dev-browser --connect $PORT -t 30 <<'EOF'
const tab = (await browser.listPages()).find((p) => p.url.includes("deposer-une-annonce"));
const page = await browser.getPage(tab.id);
console.log(page.url());
console.log(await page.snapshot({ interactive: true }));
EOF

# 2. Act: fill the title by its ref, pick the suggested category, verify.
dev-browser --connect $PORT -t 30 <<'EOF'
const tab = (await browser.listPages()).find((p) => p.url.includes("deposer-une-annonce"));
const page = await browser.getPage(tab.id);
await page.fill("ref/e7", "MacBook Pro 14 M3 Pro 18 Go 512 Go");
await page.click("ref/e12"); // the « Ordinateurs » category choice
console.log(await page.snapshot({ interactive: true })); // verify, find « Continuer »
EOF

# 3. Photos step: upload by absolute path (no file dialog), then verify.
dev-browser --connect $PORT -t 30 <<'EOF'
const tab = (await browser.listPages()).find((p) => p.url.includes("deposer-une-annonce"));
const page = await browser.getPage(tab.id);
await (await page.$("input[type=file]")).uploadFile("/abs/annonces/macbook/photos/1.jpg", "/abs/annonces/macbook/photos/2.jpg");
console.log(await page.snapshot({ interactive: true }));
EOF
```

Repeat look → act → verify through each step (« Continuer » by ref). When the snapshot shows the
review step (« Avant de publier » / « Je confirme l'exactitude… », title + description + price +
address on one page), **stop**: do not click its button; tell the user to review and submit, then
`record`.
