# Captcha & safety

## Semi-auto vs `--yes`

- **Default (semi-auto):** `publish` fills every field and uploads the photos via CDP,
  then *waits*. The user reviews the prefilled form in the real browser and clicks
  « Déposer mon annonce » themselves. That human click is also what clears DataDome at
  submit. This is the safe default — use it unless the user explicitly opts into full-auto.
- **`--yes` (full-auto):** the engine clicks publish itself. It is **not truly headless**:
  if a DataDome challenge appears at submit, it still waits for a human to solve it.
- `delete` always asks a `y/N` confirmation unless `--yes`.

Never pass `--yes` on the user's behalf without an explicit request.

## DataDome / captcha

- The skill reuses the scraper's challenge handling: it detects a DataDome/captcha page
  (`geo.captcha-delivery`, `iframe[src*="datadome"]`) and **waits up to 5 minutes** for the
  user to solve it in the browser window, then resumes.
- Because the first navigation is a *real* navigation on the user's *real* profile and all
  page interaction runs as in-page JS (`cdp.evaluate`), there are no automation flags —
  DataDome sees a normal browser. But a challenge can still appear; a human solves it.

## The stealth profile (`~/.lbc-scraper`)

- On first run the skill copies the user's real browser profile **once** into
  `~/.lbc-scraper/profile` (override dir via `LBC_SCRAPER_HOME`) and launches a **separate**
  browser instance against it on a random high port. **It never kills or touches the user's
  running browser.**
- This preserves the logged-in Leboncoin session, cookies and extensions. `--reset-profile`
  re-copies from the real profile.

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
- **The reliable path** is the once-copied real-browser profile (it carries the valid session +
  device fingerprint). If logged out, `login` waits while you log in once in the opened browser.
- **Cookie attach is a best-effort escape hatch.** `login --cookies-file cookies.json` injects
  cookies via CDP `Network.setCookie` (scoped to `.leboncoin.fr`). DataDome binds the session to
  the device fingerprint and validates the token server-side, so an exported cookie often *sets*
  yet still bounces to `/connexion`. The command therefore ALWAYS re-probes and reports the
  **probe** result, never the set-count — never trust "N cookies attached" as "logged in". (The
  live `Cookies` SQLite re-import / `--import-profile` is deliberately NOT implemented: it is
  OS-keychain-locked while the source browser runs and adds little over the one-time profile copy.)

## Legal / Terms of Service

- Automating posting/deleting on a real account may violate Leboncoin's Terms of Service
  and can put the account at risk. The semi-auto default and the explicit `--yes` opt-in
  are deliberate guardrails. Surface this to the user; let them decide. Use modest pacing
  and don't mass-post.
