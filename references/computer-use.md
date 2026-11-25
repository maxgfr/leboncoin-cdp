# Computer use — account actions in your own browser

Every account action — publish, edit, delete, renew, mark-sold, deactivate, reactivate — is done
by default by **computer use**: the agent controls the user's own, already logged-in browser
(e.g. Brave) with screenshots, clicks and typing, from the values in `annonce.md`. No CDP, no
scraper profile, no remote-debugging port, no login anywhere else. Read-only research (`scrape`,
`comparables`) stays on the CDP engine, which needs no login.

The loop for any action:

```
node scripts/leboncoin.mjs cu-sheet <slug> --action <a>   # → annonces/<slug>/computer-use.md
node scripts/leboncoin.mjs open <slug> --real --action <a> # the start page, in the user's own browser
# … the agent performs the action by computer use, following the sheet …
node scripts/leboncoin.mjs record <slug> --url <ad url> --status <s>
```

`<a>` is `publish` (default) | `edit` | `delete` | `renew` | `mark-sold` | `deactivate` |
`reactivate`. `open --real` uses the OS (`open -a "<App>"` on macOS with the remembered browser —
`--browser brave` once —, else the default browser; `xdg-open` on Linux).

The CDP write engine (`publish`, `edit`, `delete`, …) is the advanced alternative: it needs the
isolated scraper profile logged in once (`login`). Its windows can also be driven by
[dev-browser](#advanced-dev-browser-on-the-cdp-scraper-window) — never the user's own browser,
which exposes no CDP port.

Rules first (they override everything below):

- Type **only** the values from the sheet. Never invent a title, price, attribute or text.
- **Take a screenshot before every step** and check it before acting; again after every action
  that changes the page.
- **The user is logged in already.** Never type their password, never log in for them: a login
  page means stop and ask them to log in themselves.
- **The human owns the final / irreversible click.** Publish: stop on the final review, never
  click its « Continuer » / « Déposer mon annonce » unless the user explicitly asked for
  full-auto. Delete and mark-sold: the user confirms in the chat before the click. Edit: stop
  before « Enregistrer » unless the user asked you to save.
- **DataDome** (« Vérification », a slider or puzzle, a `captcha-delivery` frame): stop and ask
  the human to solve it. Never try to solve it yourself.
- **Never pay**: a bump may lead to a paid-option page — stop there and ask.
- No proof of success → no `record`.

## 1. Prepare (publish)

```
node scripts/leboncoin.mjs validate <slug>        # must pass
node scripts/leboncoin.mjs cu-sheet <slug>        # → annonces/<slug>/computer-use.md
node scripts/leboncoin.mjs open <slug> --real     # the deposit form, in the user's own browser
```

Read `computer-use.md`: it lists, in form order, title, category, the full description, price,
location, condition/shipping, every attribute (label → value), the **absolute** photo paths and
the photos folder. If `form-map.json` exists (`inspect`, or better `publish --diagnostic`, which
walks every step), the sheet also lists per step the visible labels and which are **required** —
that is what to look for on screen.

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

The sheet gives the photos folder (absolute path) and the files in order. Click the photo area
(« Ajouter des photos »). The OS file dialog opens:

- macOS: press `Cmd+Shift+G`, paste the **folder** path, Enter; then `Cmd+A` to select every
  photo of that folder (or `Cmd`-click only the listed files if it holds others); « Ouvrir ».
- Linux (GTK): press `Ctrl+L`, type the folder path, Enter; then `Ctrl+A` (or `Ctrl`-click the
  listed files); « Open ».

Wait for the thumbnails, then compare the count with the sheet; reorder them on the page if the
order matters. In a handoff, upload only `remaining_photos`.

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

## 6. The other account actions

`cu-sheet <slug> --action <a>` writes an ordered playbook instead of a fill sheet. Each one:

1. `open <slug> --real --action <a>` — the start page: the ad's `leboncoin_url`, or « Mes annonces »
   (`https://www.leboncoin.fr/compte/part/mes-annonces`) when it is unknown, and always for
   `reactivate` (a paused ad's page may be hidden). Screenshot; a login page or a captcha → the
   user handles it.
2. **Find the ad** by its title and price (and `leboncoin_id` when known). On the ad page, check
   it is the right one; in « Mes annonces », find its card.
3. **Find the control** on the ad page, else in its « … » menu (« Plus d'actions » / « Gérer
   l'annonce »…), else on its card in « Mes annonces » — the same places and labels the CDP
   engine uses.
4. Apply the **stop rule**, click, then click the confirmation if a dialog asks. Screenshot.
5. Look for the **proof of success** — the same proof the CDP engine requires before it changes
   the local status. With it, run the sheet's `record` command; without it, screenshot, tell the
   user, record nothing.

| Action | Control (first labels tried) | Confirmation | Proof of success | Stop rule | `record --status` |
|---|---|---|---|---|---|
| `edit` | « Modifier l'annonce » / « Modifier » | — | the ad page shows the new values | stop before « Enregistrer les modifications » / « Enregistrer » unless the user asked | current (`published` or `paused`) |
| `delete` | « Supprimer l'annonce » / « Supprimer » | « Confirmer la suppression » / « Oui, supprimer » | « annonce supprimée »…, or the ad URL reloads to « n'existe plus » / « page introuvable » | irreversible: the user confirms in the chat first | `deleted` |
| `renew` | « Remettre en avant » / « Remonter l'annonce » | « Confirmer » / « Valider » | no reliable text: « Mes annonces » shows it put forward | a paid-option page → stop and ask; never pay | `renewed` |
| `mark-sold` | « Marquer comme vendu » / « C'est vendu » | « Confirmer » / « Oui » | « annonce vendue » / « marquée comme vendue » | irreversible: the user confirms in the chat first | `sold` |
| `deactivate` | « Mettre en pause » / « Pause » / « Désactiver » | « Confirmer » / « Oui » | « annonce mise en pause »…, or « Réactiver » now shows | reversible: the request is the consent | `paused` |
| `reactivate` | « Réactiver l'annonce » / « Remettre en ligne » | « Confirmer » / « Oui » | « annonce réactivée »…, or « Mettre en pause » now shows | reversible: the request is the consent | `published` |

The sheet lists every label and proof phrase in full. For `edit` it also lists every value from
`annonce.md` the modify form must end up with (title, the description verbatim, price, location,
condition, shipping, attributes); the photos stay as they are unless the user asked.

**An ad the annonce does not know.** When `annonce.md` has no `leboncoin_url` (it was published
by hand, or never recorded) or its status does not match the action, the sheet does not refuse:
it starts in « Mes annonces », adds a « Check first » note (find the ad by title and price, check
the action applies, copy its URL from the address bar), and its `record` command carries an
`<ad url>` placeholder to fill in. Only a `deleted` annonce is refused.

## 7. Advanced: finish a CDP handoff

When the CDP `publish` logs `handoff → computer use: read annonces/<slug>/handoff.json …`, the
scraper window (not the user's own browser) is still open on the step it reached. Do not restart
the deposit. Read `handoff.json` (or run `cu-sheet`, which puts it on top):

- `reason` / `wizard_stop` / `error` — why CDP stopped (`incomplete`, `form-error`,
  `not-published`; `missing-required`, `stuck`, `no-next`, `max-steps`…).
- `step` — `{ index, title }` of the step reached.
- `missing[]` — `{ field, required, value }`: the value to put in each unfilled field
  (`value: null` = not in `annonce.md`: ask the user, write it into `annonce.md`, then type it).
- `remaining_photos[]`, `preview_png` (Read it first), `cdp_port`.

Finish only what remains, then continue with step 5 as usual.

## 8. Record the result

When the ad is live (the human submitted; the page shows the ad or « Mes annonces » lists it),
copy its URL (`https://www.leboncoin.fr/ad/<category>/<id>`) and run:

```
node scripts/leboncoin.mjs record <slug> --url <ad url>
```

It writes `leboncoin_url`, `leboncoin_id`, `status: published` and `published_at` into
`annonce.md`, and removes `handoff.json`. After the other actions, run the command their sheet
prints: `--status deleted` (`deleted_at`), `sold` (`sold_at`), `paused` (`paused_at`),
`published` after a reactivation (clears `paused_at`), `renewed` after a bump (stays `published`,
stamps `renewed_at`).

## Advanced: dev-browser on the CDP scraper window

[dev-browser](https://github.com/sawyerhood/dev-browser) (MIT, `npm i -g dev-browser`) runs Puppeteer scripts in a warm daemon. It is
**optional**, not a dependency of the skill, and only for the CDP engine: it needs a CDP port,
which only the scraper window opened by `open` (without `--real`) exposes — the user's own
browser has none. `open` detects it on `PATH` and prints
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
