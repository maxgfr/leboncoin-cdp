# Enrichment playbook — writing the copy, inferring category, pricing

This is the agent's job, not the CLI's. The user gives a rough description + photos;
you turn it into a strong, honest listing and fill the structured fields. Ground every
judgment in `comparables.md` whenever possible.

## 1. Write the description (markdown body)

- Keep it **honest and specific**: condition, exact model/variant, what's included,
  flaws, reason for selling, handover (remise en main propre / envoi).
- Lead with the most search-relevant facts (brand, model, size/storage, year).
- Short paragraphs or a tight bullet list. No ALL CAPS, no emoji spam, no fake urgency.
- Match the language the user used (usually French). Don't invent specs you can't see in
  the photos or the user's notes — ask if a key fact (size, year, condition) is missing.

## 2. Infer the category + attributes

- Pick the Leboncoin **category label** that matches the item (e.g. `Ordinateurs`,
  `Téléphones & Objets connectés`, `Vélos`, `Voitures`).
- Fill `attributes` with the category-specific fields that comparable ads expose
  (`brand`, `model`, `storage`, `year`, `mileage`, `size`…). Use the **same keys** the
  scraper reports in `comparables.json` (`attributes` map) — that is the vocabulary the
  deposit form understands. Unknown keys are skipped at publish (logged), so prefer keys
  you actually saw in comparables.

## 3. Price from comparables

- Run `comparables <slug>` first. Read `comparables.md`: it gives **min / median / max**
  of comparable prices and a table of similar ads.
- Default to **near the median**, adjusted for condition and what's included. Note the
  reasoning to the user; let them override.
- If `comparables` returns few/no results, widen the query (`--query`) — e.g. drop the
  zipcode, use brand+model only — and say the sample was thin.

## 4. Photos

- The user's images go in `photos/`. Order matters: the first photo is the thumbnail.
  Set an explicit `photos:` list to control order, or leave it empty to use the sorted
  directory.
- Suggest the user add a clear, well-lit main shot if the thumbnail would be weak.

## 5. Ask the user for anything missing

You don't always have every fact. If the annonce is missing a required field — zipcode,
exact model/year, condition, price, or a **category-specific** one (mileage, surface, DPE…) —
**ask the user** and write the answer into `annonce.md`. Never invent it and never publish a blank
field. Three signals tell you what's missing:
- `validate <slug>` issues (hard structural requirements),
- `publish <slug> --diagnostic` → `form-map.json` (`{ steps }`): every live control of every
  wizard step with `required` + `requiredSource` + `options` — the authoritative list of what THIS
  category's form demands — plus `missing[]` (blocking) and `push-readiness.json`. It never
  submits. The CLI prints `ask the user about → …` and `note → …`. An attribute can be keyed by
  the **label** shown there (`Kilométrage: "120000"`); a value must be one of the listed options.
- `inspect <slug>` shows the first step only (the rest appears once the title is typed).

## 6. Then validate → publish (verify with the screenshot)

- `validate <slug>` and fix each issue (warnings are advisory).
- `publish <slug>` walks the wizard, stops on the final review, and writes `publish-preview.png`
  (Read it), `form-map.json` (every step, required/optional + options + what was filled), and
  `push-readiness.json` (**Read it first** — `ready` / `blockers[]`). For a deeper look (one
  screenshot per step + page HTML + element crops), use `publish <slug> --diagnostic --shots`;
  after a real publish, `shots/30-confirmation.png` is the proof the ad went live.
- In semi-auto (default) tell the user to **review the final step in the browser and submit it
  themselves** (the button reads « Continuer » there). Only use `--yes` if they explicitly asked
  for full-auto.
