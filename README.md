# Leboncoin Scraper

Generic web scraper for leboncoin.fr using Puppeteer connected to your real Brave/Chrome browser via CDP, with parallel processing.

## Features

- ✅ **Generic**: Works with any leboncoin category (real estate, cars, electronics, etc.)
- 🚀 **Parallel processing**: Scrapes multiple pages simultaneously (configurable)
- 🔄 **Auto-retry**: Automatic retry with exponential backoff on failures
- 📊 **Progress tracking**: Real-time progress bars and logging
- ⚙️ **Configurable**: Environment variables and config files
- 🎯 **Type-safe**: Full TypeScript support
- 🔒 **Real browser**: Connects to your actual Brave/Chrome via CDP — no bot detection
- 🛡️ **CAPTCHA handling**: Detects challenges and waits for manual resolution

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
PARALLEL_PAGES=3        # Scrape 3 pages simultaneously

# Output Configuration
OUTPUT_DIR=./assets     # Save results here
SAVE_RAW=false          # Save raw API responses
```

### How it works

The scraper connects to your **real Brave/Chrome browser** via the Chrome DevTools Protocol (CDP).
This means it uses your actual cookies, history, and fingerprint — making bot detection nearly impossible.

1. If Brave is already running with `--remote-debugging-port=9222`, it connects directly
2. Otherwise, it launches Brave with that flag automatically
3. It opens new tabs to scrape, then closes them when done — your browser stays open
4. If a CAPTCHA appears, it pauses and waits for you to solve it manually

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

### Sequential vs Parallel (100 ads)

| Mode | Time | Speedup |
|------|------|---------|
| Sequential (old) | ~15 min | 1x |
| Parallel (3 workers) | ~5 min | 3x |
| Parallel (5 workers) | ~3 min | 5x |

**Note**: Higher parallelization may trigger rate limiting. Start with 3-5 parallel pages.

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
├── types.ts           # TypeScript type definitions
├── config.ts          # Configuration management
├── logger.ts          # Progress logging
├── utils.ts           # Utility functions (date, chunking, delay)
├── exploit.ts         # HTML parsing & data extraction
├── headless.ts        # Puppeteer browser automation
└── index.ts           # CLI entry point
```

### Key Functions

**`parseSearchResults(content)`** - Extract search results from HTML
**`parseAdDetails(content)`** - Extract individual ad details
**`saveAllSearchResults(query)`** - Scrape all pages for a search
**`savePageDetailsParallel(urls)`** - Scrape individual pages in parallel

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

The scraper will **automatically detect** CAPTCHA challenges and wait for you to solve them.
Just look at the browser window and complete the verification — the scraper resumes automatically.


To reduce challenges:

- Use your Brave browser where you're already logged in
- Don't run too many parallel pages (try `PARALLEL_PAGES=2`)
- Increase `RATE_LIMIT` (try 3000-5000ms)

### Rate limiting / Blocked

- Reduce `PARALLEL_PAGES` (try 1-2)
- Increase `RATE_LIMIT` (try 2000-5000ms)

### Timeouts

- Increase `PAGE_TIMEOUT` (try 60000 for 60s)
- Check your internet connection
- Some pages may be legitimately unavailable

## License

MIT

## Author

maxgfr
