# Captcha & safety

## Semi-auto vs `--yes`

- **Default (semi-auto):** `publish` walks the deposit wizard via CDP (fills each step,
  uploads the photos, « Continuer » between steps) and *stops on the final review*, then
  waits. The user reviews it in the real browser and submits it themselves (on that step the
  button reads « Continuer »). That human click is also what clears DataDome at submit. This
  is the safe default — use it unless the user explicitly opts into full-auto.
- **The final step is never clicked by accident.** It is recognised by its content (« avant de
  publier », « je confirme l'exactitude »), by an explicit publish button, and structurally
  (title + description + price/address on one step); `--diagnostic`, `doctor` and the default
  mode never submit.
- **`--yes` (full-auto):** the engine submits itself, and only from that recognised final
  step. It is **not truly headless**: if a DataDome challenge appears at submit, it still
  waits for a human to solve it.
- `delete` always asks a `y/N` confirmation unless `--yes`.

Never pass `--yes` on the user's behalf without an explicit request.

## DataDome / captcha

- The skill reuses the scraper's challenge handling: it detects a DataDome/captcha page
  (`geo.captcha-delivery`, `iframe[src*="datadome"]`) and **waits up to 5 minutes** for the
  user to solve it in the browser window, then resumes.
- Because the first navigation is a *real* navigation in a normal (non-automated) browser and all
  page interaction runs as in-page JS (`cdp.evaluate`), there are no automation flags —
  DataDome sees a normal browser. But a challenge can still appear; a human solves it.

## The stealth profile (`~/.lbc-scraper`)

- On first run the skill creates a **fresh, isolated** scraper profile in
  `~/.lbc-scraper/profile` (`profile-brave`… per browser; override dir via `LBC_SCRAPER_HOME`) and
  launches a **separate** browser instance against it on a random high port. **It never kills or
  touches the user's running browser.** The profile is reused as-is on every later run.
- **Reads need no login**: `scrape` / `comparables` work in that fresh profile on any browser
  (e.g. Chrome). **Writes** (publish/delete/edit/manage) need it logged in once, by hand, in that
  window (`login` waits for it). That gives the scraper its **own** session, independent of the
  real browser.
- **Why not copy the real profile?** Copying it makes two browsers share the same Leboncoin
  session tokens, and Leboncoin then logs the user **out of their real browser**. Copying is
  therefore an explicit opt-in, `--copy-profile` (on `login` and every live command), which prints
  that warning; it only seeds a *new* profile. `--reset-profile` deletes and re-creates the
  profile (fresh, or copied with `--copy-profile`).

## Login / session

- **Active verification.** `login` (alias `auth`) opens the account page and checks the session
  with a PASSIVE in-page probe — account/logout DOM markers + visible text + URL-not-on-login,
  run as `cdp.evaluate` exactly like the captcha probe, so it is indistinguishable from the site's
  own JavaScript. **It never fires a synthetic authenticated XHR.** It saves `auth-state.png` to
  Read. `publish`/`delete`/`edit`/`renew`/`mark-sold`/`deactivate`/`reactivate` all pre-flight the
  same check and stop early with `login-required` (an explicit, screenshot-backed signal instead of
  a mid-flow surprise). The pre-flight only blocks when it is *confident* the session is logged out
  (on the login page, or a login-required marker is visible) — an inconclusive probe is allowed
  through, with the human review gate as the final guard.
- **The reliable path** is logging in once by hand in the scraper window (`login` waits while you
  do): the session then belongs to the scraper profile and its device fingerprint, and does not
  conflict with the user's real browser. The user's real browser can stay logged in (e.g. Brave)
  while the scraper uses another one (e.g. Chrome).
- **Cookie attach is a best-effort escape hatch.** `login --cookies-file cookies.json` injects
  cookies via CDP `Network.setCookie` (scoped to `.leboncoin.fr`). DataDome binds the session to
  the device fingerprint and validates the token server-side, so an exported cookie often *sets*
  yet still bounces to `/connexion`. The command therefore ALWAYS re-probes and reports the
  **probe** result, never the set-count — never trust "N cookies attached" as "logged in". (The
  live `Cookies` SQLite re-import / `--import-profile` is deliberately NOT implemented: it is
  OS-keychain-locked while the source browser runs and, like `--copy-profile`, would share the real
  browser's session tokens.)

## Legal / Terms of Service

- Automating posting/deleting on a real account may violate Leboncoin's Terms of Service
  and can put the account at risk. The semi-auto default and the explicit `--yes` opt-in
  are deliberate guardrails. Surface this to the user; let them decide. Use modest pacing
  and don't mass-post.
