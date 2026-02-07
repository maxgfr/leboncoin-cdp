# Leboncoin Scraper

Scraper leboncoin.fr utilisant **CDP + in-page fetch** — zéro détection par les anti-bots.

## Principe

Au lieu d'utiliser Puppeteer (détecté par DataDome), on se connecte au navigateur via le **Chrome DevTools Protocol** brut, puis on injecte des appels `fetch()` directement dans le contexte JavaScript d'un onglet leboncoin.fr.

Pourquoi c'est indétectable :
- `fetch()` s'exécute depuis l'origine de la page → tous les cookies (dont DataDome) sont envoyés automatiquement
- Les intercepteurs du SDK DataDome côté client s'appliquent naturellement 
- Aucun flag d'automation, aucune trace Puppeteer
- Indiscernable du JavaScript propre au site

## Features

- ✅ **Générique** : Fonctionne avec toutes les catégories (immobilier, voitures, électronique, etc.)
- 🔒 **Zéro détection** : CDP brut + fetch() in-page — aucun flag d'automation
- 🚀 **Léger** : Pas de Puppeteer, juste `ws` pour le WebSocket CDP
- 🔄 **CAPTCHA auto-detect** : Détecte les challenges et attend la résolution manuelle
- 📊 **Suivi en temps réel** : Barres de progression et logging
- ⚙️ **Configurable** : Variables d'environnement, CLI, fichiers de config
- 🎯 **Type-safe** : TypeScript complet

## Installation

```bash
pnpm install
```

## Quick Start

```bash
# Scrape real estate listings in Paris
pnpm start --query "category=9&locations=75012&price=150000-300000"

# Show help
pnpm start --help
```

## Usage

### Command Line Options

```bash
pnpm start -- [options]

Options:
  -q, --query <query>        Search query parameters
  -o, --output <name>        Output filename prefix (default: search_YYYY-MM-DD)
  -c, --config <file>        Load configuration from JSON file
  --search-only              Only scrape search results, skip individual pages
  --details-only             Only scrape individual pages from existing results
  -h, --help                 Show help message
```

### Examples

#### 1. Basic scraping with query

```bash
pnpm start -- --query "category=9&locations=75012&price=150000-300000"
```

#### 2. Custom output name

```bash
pnpm start -- --query "category=9" --output "paris_apartments"
```

#### 3. Only search results (skip individual pages)

```bash
pnpm start -- --query "category=9" --search-only
```

#### 4. Only scrape details from existing results

```bash
pnpm start -- --output "search_2026-2-5" --details-only
```

#### 5. Use a config file

```bash
pnpm start -- --config "./query.example.json"
```

**query.example.json:**
```json
{
  "query": "category=9&locations=75012&price=150000-300000",
  "output": "paris_apartments"
}
```

### Environment Variables

Create a `.env` file (see `.env.example`):

```bash
# Browser Configuration
CHROME_PATH=/Applications/Brave Browser.app/Contents/MacOS/Brave Browser
PAGE_TIMEOUT=30000
DEBUGGING_PORT=9222       # CDP remote debugging port

# Scraping Configuration
MAX_RETRIES=5           # Retry failed pages up to 5 times
RATE_LIMIT=1000         # Wait 1s between page requests

# Output Configuration
OUTPUT_DIR=./assets     # Save results here
SAVE_RAW=false          # Save raw API responses
```

### Comment ça marche

Le scraper se connecte à votre **vrai navigateur Brave/Chrome** via le Chrome DevTools Protocol (CDP),
puis injecte des appels `fetch()` directement dans le contexte JS d'un onglet leboncoin.fr.

1. Si le navigateur tourne déjà avec CDP, il s'y connecte directement
2. Sinon, il le lance automatiquement avec un port CDP aléatoire (30000-49999)
3. Il trouve ou crée un onglet sur leboncoin.fr
4. Les requêtes `fetch()` sont exécutées depuis le contexte de la page → cookies inclus
5. Si un CAPTCHA est détecté, il attend que vous le résolviez dans le navigateur

## Building Queries

Leboncoin uses URL query parameters. Here are common patterns:

### Categories
- `category=9` - Real estate (ventes immobilières)
- `category=2` - Cars (voitures)
- `category=15` - Electronics
- `category=10` - Vacation rentals

### Filters
- `price=150000-300000` - Price range
- `locations=CITY__LAT_LON_RADIUS` - Location with radius
- `real_estate_type=1` - Apartments only (real estate)
- `real_estate_type=2` - Houses only (real estate)
- `rooms=2-4` - 2 to 4 rooms

### Example Queries

**Paris apartments €150k-€300k:**
```
category=9&locations=75012__48.84_2.38_5000&price=150000-300000&real_estate_type=1
```

**Used cars in Lyon under €10k:**
```
category=2&locations=Lyon__45.75_4.85_10000&price=0-10000
```

**Electronics in Marseille:**
```
category=15&locations=Marseille__43.29_5.37_15000
```

## Output Format

### Search Results (`search_*.json`)

```json
[
  {
    "list_id": "2465136414",
    "title": "Appartement 2 pièces 18 m²",
    "description": "...",
    "url": "https://www.leboncoin.fr/ventes_immobilieres/2465136414.htm",
    "price": 190000,
    "date": "2024-01-12T16:34:39.000Z",
    "city": "Paris 75017",
    "user_id": "d95b266d-...",
    "has_phone": true,
    "attributes": {
      "real_estate_type": "Appartement",
      "square": "18",
      "rooms": "2",
      "energy_rate": "E",
      "ges": "B",
      "elevator": "Non",
      "floor_number": "6",
      ...
    }
  }
]
```

### Individual Pages (`page_*.json`)

Same format as search results, but with potentially more detail.

### Failed URLs (`*_failed.json`)

```json
[
  {
    "url": "https://www.leboncoin.fr/...",
    "error": "Failed to load after 5 attempts: timeout"
  }
]
```

## Performance

Les requêtes sont séquentielles (une page à la fois via fetch) avec un délai configurable entre chaque.
C'est volontaire : éviter le rate limiting et rester discret.

| Rate Limit | 10 pages | 50 pages |
|-----------|----------|----------|
| 1s | ~15s | ~1min |
| 2s | ~25s | ~2min |
| 3s | ~35s | ~3min |

## Development

### Build

```bash
pnpm build          # TypeScript compilation
pnpm build:swc      # Fast SWC compilation
```

### Watch Mode

```bash
pnpm dev            # Nodemon watch + auto-rebuild
```

### Testing

```bash
pnpm test               # Run Vitest tests
pnpm lint           # ESLint check
pnpm prettier       # Format code
```

### Type Checking

```bash
pnpm typecheck       # Type-check without compilation
```

## Architecture

```
src/
├── types.ts           # Définitions TypeScript
├── config.ts          # Configuration (navigateur, scraping, output)
├── logger.ts          # Logging avec barres de progression
├── utils.ts           # Utilitaires (date, delay, parsing __NEXT_DATA__)
├── cdp.ts             # Client CDP léger (WebSocket brut)
├── browser.ts         # Gestion navigateur (lancement, connexion CDP)
├── scraper.ts         # Moteur de scraping (fetch in-page via CDP)
├── exploit.ts         # Mapping données brutes → types Ad
└── index.ts           # Point d'entrée CLI
```

### Flux de données

```
CLI (index.ts)
  └─→ browser.ts     → Lance/connecte Chrome via CDP
  └─→ scraper.ts     → Injecte fetch() dans l'onglet leboncoin.fr
      └─→ fetch()    → Récupère le HTML avec __NEXT_DATA__
  └─→ exploit.ts     → Parse searchData/ad → type Ad
  └─→ fs.writeFile   → Sauvegarde JSON dans ./assets/
```

## Troubleshooting

### Launching Brave or Chrome in Debugging Mode (CDP)

To let the scraper connect to your real browser session (with your cookies, logins, and fingerprint), you must launch Brave or Chrome with the `--remote-debugging-port=9222` flag **before** starting the scraper.

There are two options:

#### 1. Let the scraper launch the browser automatically

By default, if Brave/Chrome is not already running with `--remote-debugging-port=9222`, the scraper will launch it for you with this flag. However, this may open a fresh profile without your sessions/logins.

#### 2. Manually launch with your user profile

To use your real session (cookies, logins, etc.), launch Brave or Chrome yourself with the flag **before** starting the scraper.

##### macOS

Brave:

```bash
open -na "/Applications/Brave Browser.app" --args --remote-debugging-port=9222
```

Chrome:

```bash
open -na "/Applications/Google Chrome.app" --args --remote-debugging-port=9222
```

##### Linux

Brave:

```bash
brave-browser --remote-debugging-port=9222 &
```

Chrome:

```bash
google-chrome --remote-debugging-port=9222 &
```

##### Windows

Brave:

```powershell
Start-Process "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" -ArgumentList "--remote-debugging-port=9222"
```

Chrome:

```powershell
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222"
```

**Tip:** To force your main profile, you can also add `--profile-directory="Default"` if needed.

Once the browser is running like this, start the scraper as usual. It will use your existing session and be much less detectable.

### Browser not found

Set the `CHROME_PATH` environment variable:

```bash
# macOS (Brave)
export CHROME_PATH="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"

# macOS (Chrome)
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Linux
export CHROME_PATH="/usr/bin/brave-browser"
```

### CAPTCHA / Bot challenge

Le scraper **détecte automatiquement** les challenges CAPTCHA dans les réponses fetch.
Quand c'est détecté :
1. Il navigue la page visible vers leboncoin.fr (pour afficher le CAPTCHA)
2. Il attend jusqu'à 5 minutes que vous le résolviez
3. Il reprend automatiquement le scraping

Pour réduire les challenges :
- Utilisez votre navigateur où vous êtes déjà connecté
- Augmentez `RATE_LIMIT` (essayez 3000-5000ms)

### Rate limiting / Bloqué

- Augmentez `RATE_LIMIT` (essayez 2000-5000ms)
- Vérifiez que vous avez des cookies DataDome valides (visitez leboncoin.fr manuellement)

### Timeouts

- Increase `PAGE_TIMEOUT` (try 60000 for 60s)
- Check your internet connection
- Some pages may be legitimately unavailable

## License

MIT

## Author

maxgfr
