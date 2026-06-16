# Markdown schema — the annonce contract

One folder per listing. Markdown is the source of truth; the CLI never invents content.

## Folder layout

```
annonces/<slug>/
  annonce.md        # frontmatter (structured fields) + body (= description)
  photos/           # *.jpg | *.jpeg | *.png | *.webp — the upload source of truth
  comparables.json  # written by `comparables` (raw Ad[])
  comparables.md    # written by `comparables` (human-readable digest for you)
```

`<slug>` is the folder name and the local identity (letters, digits, `-`, `_`, `.`).

## Frontmatter fields

Parsed by a tiny YAML subset (flat scalars + one nested `attributes:` map + a
`photos:` list) — keep it simple; do not use anchors, multi-line scalars, or nested
lists beyond what is shown.

| Field | Type | Required to publish | Notes |
|---|---|---|---|
| `title` | string | yes (≥5 chars) | The ad title. |
| `category` | string | yes | Leboncoin category label you infer (e.g. `"Informatique"`). |
| `price` | number | yes (> 0) | Euros, integer. |
| `zipcode` | string | yes (`\d{5}`) | French postal code; drives the location autocomplete. |
| `city` | string | no | Resolved from the zipcode if blank. |
| `condition` | string | no | Per category, e.g. `"Très bon état"`. |
| `shipping` | bool | no | Offer delivery. |
| `attributes` | map | no | Category-specific fields, e.g. `brand: "Apple"`. Same vocabulary as the scraper's `Ad.attributes`. Unknown keys are skipped (logged) at publish, never fatal. |
| `photos` | list | no | Explicit order (filenames under `photos/`). Empty list = every image in `photos/`, sorted. |
| `status` | enum | — | `draft` \| `published` \| `deleted` \| `sold` \| `paused`. Must be `draft` to publish. |
| `leboncoin_id` | string | (set by publish) | Numeric ad id captured from the published URL. |
| `leboncoin_url` | string | (set by publish) | The live ad URL. |
| `published_at` | ISO string | (set by publish) | |
| `deleted_at` | ISO string | (set by delete) | |
| `sold_at` | ISO string | (set by mark-sold) | |
| `paused_at` | ISO string | (set by deactivate; cleared on reactivate) | |

The markdown **body** (everything after the closing `---`) is the description.

## Status state machine

```
draft  --publish-->  published  --delete-->     deleted
                     published  --mark-sold-->  sold        (also from paused)
                     published  --deactivate--> paused
                     paused     --reactivate--> published
                     published  --edit-->       published   (re-fill, no status change)
```

- `validate` requires `status: draft`.
- `publish` refuses anything that is not a `draft`; on success it writes the
  `leboncoin_*` fields and flips `status` to `published`.
- `delete` requires `status: published` and a `leboncoin_id`; it sets `status: deleted` and `deleted_at`.
- `edit` re-opens the modify form for a `published`/`paused` ad and re-fills it (status unchanged).
- `renew` bumps a `published` ad (no status change). `mark-sold` → `sold` (+`sold_at`),
  `deactivate` → `paused` (+`paused_at`), `reactivate` → `published`. All require a `leboncoin_id`.

## Example (valid draft)

```markdown
---
title: "MacBook Air M1 2020 — 256 Go, très bon état"
category: "Informatique"
price: 650
zipcode: "75012"
city: "Paris"
condition: "Très bon état"
shipping: true
attributes:
  brand: "Apple"
  model: "MacBook Air M1"
  storage: "256 Go"
photos:
  - macbook.jpg
status: draft
---

MacBook Air M1 (2020), 8 Go RAM, 256 Go. Très bon état, batterie 92 %, chargeur
d'origine. Remise en main propre à Paris 12e ou envoi.
```

A committed working copy lives at `assets/example-annonce/` (used by the `demo` and the
Node-18 CI floor job).
