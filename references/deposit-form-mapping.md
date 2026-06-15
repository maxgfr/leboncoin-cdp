# Deposit-form mapping & maintenance runbook

The Leboncoin « déposer une annonce » flow is an obfuscated React SPA. **All** of its
brittleness is confined to one file: `src/selectors.ts`. `publish.ts`, `delete.ts` and
`deposit-form.ts` contain **no literal selectors** — they consume the ordered candidate
lists from `selectors.ts`. When Leboncoin changes its markup, this is the only file to
edit (plus the fixtures in `src/__tests__/selectors.test.ts`).

## How selectors are modelled

Each logical field maps to an **ordered array of candidate strategies**; the engine tries
them in order (`resolveSelector`) and uses the first that matches:

```ts
DEPOSIT.titleInput = [
  'input[name="subject"]',            // most specific / most stable first
  'input[data-qa-id="input_subject"]',
  "input#subject",
  'input[aria-label*="titre" i]',     // looser fallback last
];
```

Buttons (`publishButton`, `photoAddButton`, `MANAGE.deleteButton`, `confirmButton`) are
`{ textCandidates, css }` — matched first by **visible text** (exact or contains,
case-insensitive), then by CSS fallback. URL recognition uses regex lists:
`publishedUrlPattern` (extracts the numeric `list_id`), `confirmedUrlPattern`,
`loginUrlPattern`.

## How the engine drives the form (`deposit-form.ts`)

- `setInputValue` — sets `.value` via the **native setter** then dispatches
  `input`/`change`/`blur` so React controlled inputs register the value.
- `pickSuggestion` — for autocompletes (category, zipcode→city): type, then click the
  option whose text matches (else the first option).
- `uploadPhotos` — the **only** CDP DOM-domain operation (page JS can't set a file input):
  `DOM.getDocument` → `DOM.querySelector` → `DOM.setFileInputFiles(absolutePaths)`, then
  verifies `input.files.length`. If the input is behind a custom button, it clicks
  `photoAddButton` first and retries.
- Category is filled **first** because choosing it mutates the rest of the form; later
  fields are resolved after that step.

## Runbook — when publishing breaks

1. Run `publish <slug> --diagnostic` (or `--dry-run`). It fills what it can, **saves
   `annonces/<slug>/publish-preview.png` and `publish-preview.html`**, and prints a
   field-by-field report (`✓`/`✗`/`—` per field + `missing[]`). The `✗` fields and the saved
   HTML are exactly what you need to author selectors offline.
2. Inspect `publish-preview.html` (or the live form in DevTools) for each `✗` field. Find a
   **stable** selector (prefer `name`, `data-qa-id`, `data-testid`, `aria-label`; avoid hashed
   class names).
3. Add it to the **front** of that field's candidate array in `src/selectors.ts`. Keep the
   old ones as fallbacks.
4. If a published URL stops yielding an id, update `DEPOSIT.publishedUrlPattern` (capture
   group 1 = the numeric id) and add a fixture URL to `selectors.test.ts`.
5. `pnpm run build` (refresh the committed bundle) and `pnpm test`.

## Why this is safe to ship imperfect

The semi-auto default is the safety net: even if one selector drifts and a field is left
blank, the **human reviews the prefilled form before submitting**. The candidates here are
best-effort until captured against a live, logged-in deposit form — capturing that HTML and
tightening the selectors is the first thing to do when iterating on the write engine.
