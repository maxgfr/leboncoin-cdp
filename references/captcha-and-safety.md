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

## Login required

- `publish`/`delete` need that profile to already be **logged in** to Leboncoin. If the
  deposit flow redirects to login, `publish` stops and returns `login-required`. Tell the
  user to log in once in the opened browser, then retry.

## Legal / Terms of Service

- Automating posting/deleting on a real account may violate Leboncoin's Terms of Service
  and can put the account at risk. The semi-auto default and the explicit `--yes` opt-in
  are deliberate guardrails. Surface this to the user; let them decide. Use modest pacing
  and don't mass-post.
