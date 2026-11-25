# Computer use — account actions in your own browser

Every account action — publish, edit, delete, renew, mark-sold, deactivate, reactivate — is done
by default by **computer use**: the agent controls the user's own, already logged-in browser
(e.g. Brave) with screenshots, clicks and typing, from the values in `annonce.md`. No CDP, no
scraper profile, no remote-debugging port, no login anywhere else. Read-only research (`scrape`,
`comparables`) runs on the CDP engine, which needs no login — or, for `comparables`, in the
user's own browser too (see [Comparables in the user's browser](#comparables-in-the-users-browser)).

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

## Claude in Chrome (preferred)

Drivers for the user's own browser, in order: **1)** the Claude in Chrome extension, when its
tools (`mcp__claude-in-chrome__*`) are available in the session; **2)** desktop computer use
(screenshots, clicks) on the window `open --real` opened; **3)** dev-browser, only for the
advanced CDP scraper window. The extension installs from the Chrome Web Store in Chrome and
Brave alike and acts in the user's real, logged-in profile, so `open --real` is optional with it.

- **Own tab.** `tabs_context_mcp`, then `tabs_create_mcp`: work in a new tab, `navigate` it to
  the sheet's start URL, and close it at the end. Never reuse the user's tabs.
- **Loop:** look (`read_page` with `filter: "interactive"` → an accessibility tree with refs, e.g.
  `textbox "Quel est le titre de l’annonce ?" [ref_5]`; or `find` "the price field") → act by
  ref (`computer` clicks/types by ref or coordinates) → verify (`read_page` again).
  `get_page_text` reads the proof-of-success text.
- **Text fields are React inputs:** click the field, then type (to replace text: `Cmd+A` /
  `Ctrl+A`, `Delete`, then type). That worked reliably on the live wizard; `form_input` is only a
  fallback. Always read the value back before moving on.
- **Screenshot** (`computer` screenshot) before every irreversible step, then apply the stop rule.
- **Photos:** `file_upload` on the file input's ref with the sheet's absolute paths — no native
  dialog. Never click the file input (that opens the OS dialog). It only reaches files shared with
  the session (e.g. the photos folder connected to it), at most 10 MB per call; otherwise switch
  to desktop computer use and the [file-dialog recipe](#4-photos-os-file-dialog). Then check the
  thumbnail count.
- **No native dialogs.** A JS `alert` / `confirm` freezes the extension: never trigger one blindly.
  Leboncoin's delete confirmation is an in-page modal (fine); if a native dialog appears, ask the
  user to dismiss it.
- **`javascript_tool` truncates its return value at ~1,000 chars.** Never return large data from
  it: write it into the page and read it back with `get_page_text` (which returns the full text).
- Every rule above still applies (logins and captchas are the human's, stop rules, never pay).

### Comparables in the user's browser

`comparables <slug> --own-browser` launches nothing; it prints these steps with the URL, the
snippet and the paths filled in:

1. `tabs_context_mcp`, then `tabs_create_mcp` (your own tab) → `navigate` to the printed search
   URL. A captcha is the human's.
2. `javascript_tool` with the printed one-line snippet. It finds the ads in `__NEXT_DATA__`,
   **replaces the page** with `<pre id="lbc-export">JSON</pre>` (title `lbc-export`) and returns
   only a status: `OK 20 ads, 13098 chars — read it with get_page_text` (`NO_NEXT_DATA` /
   `NO_ADS` = nothing to export). Reload the URL if you need the page again.
3. `get_page_text`: a header (`Title:` / `URL:` / `Source element:` / `---`), then the JSON.
4. Save the JSON after the `---` line, as is, to the printed path
   (`annonces/<slug>/comparables-browser.json`; a pasted header is tolerated).
5. `comparables <slug> --import <that file>` → `comparables.json` + `comparables.md` (exit 1 on a
   wrong shape).
6. Close the tab (`tabs_close_mcp`).

## 1. Prepare (publish)

```
node scripts/leboncoin.mjs validate <slug>        # must pass; a missing `address` is a warning: ask the user
node scripts/leboncoin.mjs cu-sheet <slug>        # → annonces/<slug>/computer-use.md
node scripts/leboncoin.mjs open <slug> --real     # the deposit form, in the user's own browser
```

Read `computer-use.md`: it follows the live wizard step by step, with the labels below and the
`annonce.md` value for each control (title, category, the **absolute** photo paths and folder,
every attribute label → value, condition, the full description, price, address). If
`form-map.json` exists (`inspect`, or better `publish --diagnostic`), the sheet also lists per
step the visible labels and which are **required**.

Find every control by its visible label (class names are hashed and change; labels do not;
accents and case do not matter). An attribute key may already be the label (`Taille d'écran`) or
a technical key (`brand` → « Marque »). A required field is marked with `*`. Text fields are React
inputs: click + type, then read the value back. Comboboxes: open, click the option whose text
matches; if none matches exactly, pick the closest and tell the user.

## 2. The deposit wizard — three steps

Walked live in the user's own browser (2026-11). Screenshot each new step before acting.

**Step 1 — « Commençons par l'essentiel ! »**

1. Click the textbox « Quel est le titre de l'annonce ? » and type the title.
2. Typing reveals « Choisissez une catégorie suggérée »: buttons like « Choix 1 : catégorie
   Ordinateurs dans la famille Électronique ». Click the one whose category is the sheet's
   `category`: it moves on to step 2 directly. If none matches, open the « Choisissez » dropdown
   and find the category by name (families first, e.g. « Électronique » → « Ordinateurs »). If
   nothing matches, pick the closest and tell the user — never guess silently.

**Step 2 — « Dites-nous en plus sur votre article »**

1. Photos: the dropzone « Cliquez et déposez jusqu'à 20 photos » / « Importer » has a hidden
   `input type=file` (« Upload files »). Claude in Chrome: `file_upload` on that input's ref with
   the sheet's absolute paths — no native dialog. Desktop computer use: the
   [file-dialog recipe](#4-photos-os-file-dialog). Then « Vos photos » lists them, the first one
   labelled « Couverture »: check the count and the order.
2. **Leboncoin pre-fills the category attributes from the title** (e.g. Type « Portable », Usage
   « Polyvalent », Marque « Apple », Taille d'écran « 12 à 14" (33cm à 37cm) »). Check **every**
   prefilled value against the sheet's attributes and fix each mismatch. A prefilled field the
   sheet does not list: leave it, and tell the user what Leboncoin chose.
3. Fill the listed attributes still empty (« Année de fabrication », AAAA; the toggles « Numéro
   de série lisible », « Sous garantie constructeur » only if the sheet has them).
4. « État * » (required combobox: « État neuf », « Très bon état », « Bon état », « État
   satisfaisant - fonctionnel »…): the sheet's `condition`; not in `annonce.md` → ask the user.
5. Click « Continuer ».

**Step 3 (final) — « Un dernier aperçu avant de publier votre annonce ! »**

It shows Galerie, Titre, « Informations clés », then:

1. « Description de l'annonce * » is **pre-filled with Leboncoin's own AI-generated text** (e.g.
   « Je vends ce MacBook Air M1 2020 avec 256 Go de stockage… »). **Replace it** with the sheet's
   description, verbatim: click, `Cmd+A` / `Ctrl+A`, `Delete`, type it (keep its line breaks).
   Read the value back and check it is exactly the sheet's text.
2. Check the title still reads as in the sheet.
3. « Prix »: « Je vends » (not « Je donne »), then « Prix de vente souhaité » = the price
   (digits only). The hint « Prix recommandé entre X € et Y € » and the « Annonces similaires en
   vente » are **information for the user**: relay them, never change the price yourself.
4. « Remise du bien » — « À quelle adresse se trouve le bien ? * » (placeholder « Adresse »):
   Leboncoin wants a **full** address (« Saisissez le numéro, la voie et la ville, puis
   sélectionnez votre adresse parmi nos suggestions »); it is not shown on the ad. Type the
   sheet's `address` and click the matching suggestion. **No `address` in `annonce.md` → stop
   and ask the user**, write it into `annonce.md`, then type it. Never invent it, never click
   « Géolocaliser ma position ».
5. **Stop before « Continuer ».** The footer reads « En cliquant sur "Continuer", je confirme
   l'exactitude des informations… »: that click **publishes**. Screenshot the whole step, tell
   the user (with the recommended price range), and click it only with their explicit go-ahead —
   or let them click.

## 3. Errors and aborting

- A step refuses to continue: read the red error under the field, fix it from the sheet, or ask
  the user when the value is not in it.
- Abort cleanly: « Quitter » opens « Vous voulez interrompre votre dépôt ? » → « Quitter sans
  enregistrer » (or « Enregistrer le brouillon » if the user wants a draft). It is an in-page
  modal, not a native dialog.

## 4. Photos (OS file dialog)

With Claude in Chrome, use `file_upload` instead (see above). With desktop computer use: the
sheet gives the photos folder (absolute path) and the files in order. Click « Importer » (or the
« Cliquez et déposez jusqu'à 20 photos » zone). The OS file dialog opens:

- macOS: press `Cmd+Shift+G`, paste the **folder** path, Enter; then `Cmd+A` to select every
  photo of that folder (or `Cmd`-click only the listed files if it holds others); « Ouvrir ».
- Linux (GTK): press `Ctrl+L`, type the folder path, Enter; then `Ctrl+A` (or `Ctrl`-click the
  listed files); « Open ».

Wait for the thumbnails, then compare the count with the sheet; reorder them on the page if the
order matters. In a handoff, upload only `remaining_photos`.

## 5. Recognise the final step

The final step is the review: on today's site « Un dernier aperçu avant de publier votre
annonce ! » with « Je confirme l'exactitude… » in the footer; older variants read « Avant de
publier » or show « Déposer mon annonce » / « Publier mon annonce » (the same markers as
`captcha-and-safety.md`). It repeats title + description + price + address on one page, and its
button is just « Continuer » — so recognise it by its content, never by the button label.
**Stop there** (step 3 above).

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
   **Or, from the « Mes annonces » list** (pause, reactivate, delete — see below).
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

**The « Mes annonces » list** (`https://www.leboncoin.fr/compte/part/mes-annonces`, as seen live
2026-11): tabs « En ligne (n) » and « Expirées (n) », a search box « Recherchez dans vos
annonces » + « Catégories » + « Rechercher », « Trier par : Date », a checkbox « Sélectionner
toutes les annonces », and **bulk** buttons « Pause », « Réactiver », « Supprimer » at the top of
the list that act on the ticked ads. Empty state: « C'est désert ici ! » (the ad is not in that
tab). The alternative path for `deactivate`, `reactivate` and `delete`:

1. Open the right tab: « En ligne » for pause and delete; for reactivate « Expirées » or
   « En ligne » — check both.
2. Type the ad's title in « Recherchez dans vos annonces » → « Rechercher ».
3. Tick **only** this ad's checkbox — never « Sélectionner toutes les annonces ».
4. Screenshot: exactly one ad is ticked, and it is this one (title, price).
5. Apply the stop rule, click the bulk button (« Pause » / « Réactiver » / « Supprimer »), then
   the confirmation, then look for the same proof as above.

For `renew` and `mark-sold` the list only helps to find the ad (search box); their controls are
on the ad page or its menu. (Per-ad menus in the list could not be checked live yet.)

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

Finish only what remains, then continue with the wizard (section 2) as usual.

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
