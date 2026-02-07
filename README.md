# Leboncoin Scraper

Scrape leboncoin.fr using **raw CDP + Next.js data routes** — zero bot detection.

## How It Works

Instead of using Puppeteer (detected by DataDome), this scraper connects to your real browser via the **Chrome DevTools Protocol** (CDP) and uses a hybrid approach:

1. **First page**: Real browser navigation to the search URL
2. **Subsequent pages**: Next.js data routes (`/_next/data/{buildId}/recherche.json`)
3. **Ad details**: Next.js data routes (`/_next/data/{buildId}/ad/{category}/{id}.json`)

**Why it's undetectable:**

- Real navigation sets all cookies (including DataDome tokens)
- Data route requests mimic Next.js's own client-side routing
- All requests originate from the page context → cookies sent automatically
- No automation flags, no Puppeteer footprint
- Indistinguishable from the site's own JavaScript

## Features

- ✅ **Universal**: Works with all categories (real estate, cars, electronics, etc.)
- 🔒 **Zero detection**: Raw CDP + Next.js data routes — no automation flags
- 🚀 **Lightweight**: No Puppeteer, just `ws` for WebSocket CDP
- 🌐 **Multi-browser**: Supports Brave, Chrome (default), Opera, Chromium
- 💻 **Cross-platform**: Full support for macOS and Linux
- 🔄 **CAPTCHA auto-detect**: Detects challenges and waits for manual resolution
- 📊 **Real-time progress**: Progress bars and structured logging
- ⚙️ **Configurable**: Environment variables, CLI flags, config files
- 🎯 **Type-safe**: Full TypeScript with comprehensive tests

## Installation

```bash
pnpm install
```

## Quick Start

```bash
# Basic usage (uses Chrome by default, search results only)
pnpm start -- --query "category=9&locations=75012&price=150000-300000"

# Use a specific browser
pnpm start -- --browser brave --query "category=9&locations=75012&price=150000-300000"

# Scrape search results + individual ad details
pnpm start -- --browser chrome --query "category=2&locations=Lyon&price=0-10000" --with-details

# Show help
pnpm start -- --help
```

## Usage

### Command Line Options

```bash
pnpm start -- [options]

Options:
  -q, --query <query>        Search query parameters
  -o, --output <name>        Output filename prefix (default: search_YYYY-MM-DD_HHMMSS)
  -c, --config <file>        Load configuration from JSON file
  -h, --help                 Show help message

Scraping modes:
  (default)                  Only scrape search results (no ad details)
  -d, --with-details         Also scrape individual ad detail pages
  --details-only             Only scrape ad details from existing results file

Browser options:
  -b, --browser <name>       Browser to use: brave | chrome | opera | chromium (default: auto-detect)
  --chrome-path <path>       Custom browser binary path (overrides --browser)
  -p, --port <port>          CDP remote debugging port (default: random 30000-49999)
  --timeout <ms>             Page load timeout in ms (default: 30000)

Scraping options:
  --retries <n>              Max retries for failed pages (default: 5)
  --rate-limit <ms>          Delay between pages in ms (default: 1000)

Output options:
  --output-dir <dir>         Output directory (default: ./assets)
  --save-raw                 Save raw __NEXT_DATA__ responses
```

### Examples

#### 1. Basic scraping - search results only (default)

```bash
pnpm start -- --browser brave --query "category=9&locations=75012&price=150000-300000"
```

**Output:** `assets/search_2026-02-07_143022.json`

#### 2. Search results + individual ad details

```bash
pnpm start -- --browser chrome --query "category=9" --with-details --output "paris_apartments"
```

**Output:**

- `assets/paris_apartments.json` (search results)
- `assets/details_paris_apartments.json` (ad details)

#### 3. Only scrape ad details from existing results

```bash
pnpm start -- --browser brave --output "search_2026-02-07_143022" --details-only
```

#### 4. Use Opera with slower rate limit

```bash
pnpm start -- --browser opera --query "category=15&locations=Marseille" --rate-limit 2000
```

#### 5. Use a config file

```bash
pnpm start -- --browser brave --config "./query.example.json"
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
PAGE_TIMEOUT=30000         # Page load timeout in ms
DEBUGGING_PORT=0           # CDP port (0 = random high port)

# Scraping Configuration
MAX_RETRIES=5              # Retry failed pages up to 5 times
RATE_LIMIT=1000            # Wait 1s between page requests

# Output Configuration
OUTPUT_DIR=./assets        # Save results here
SAVE_RAW=false             # Save raw __NEXT_DATA__ responses
```

### How the Scraper Works

The scraper connects to your **real Brave/Chrome browser** via the Chrome DevTools Protocol (CDP) and uses a hybrid scraping strategy:

1. **Auto-launch or connect**: If the browser is already running with CDP, it connects directly. Otherwise, it launches it automatically with a random CDP port (30000-49999).
2. **Real navigation (first page)**: Opens or reuses a tab and navigates to the search URL — this sets all DataDome cookies.
3. **Extract buildId**: Reads `__NEXT_DATA__` from the loaded page DOM to get the Next.js `buildId`.
4. **Next.js data routes (subsequent pages)**: Uses `/_next/data/{buildId}/recherche.json?query&page=N` — exactly like the site's own client-side navigation.
5. **Ad details**: Fetches individual ads via `/_next/data/{buildId}/ad/{category}/{id}.json`.
6. **CAPTCHA detection**: If a challenge is detected, it waits up to 5 minutes for you to solve it in the browser window.

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

Requests are sequential (one page at a time) with a configurable delay between each.
This is intentional to avoid rate limiting and stay stealthy.

**Example timing** (approximate):

| Rate Limit | 10 pages | 50 pages | 100 pages |
| ---------- | -------- | -------- | --------- |
| 1s         | ~15s     | ~1min    | ~2min     |
| 2s         | ~25s     | ~2min    | ~3.5min   |
| 3s         | ~35s     | ~3min    | ~5min     |

**Real-world test** (category 2, vehicles in Paris):

- 674 ads across 20 pages scraped in **42 seconds** (1s rate limit)

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
pnpm test               # Run Vitest tests (28 tests)
pnpm test -- --run      # Run tests without watch mode
pnpm lint               # ESLint check
pnpm format             # Format code with Prettier
```

### Type Checking

```bash
pnpm typecheck       # Type-check without compilation
```

## Architecture

```
src/
├── types.ts           # TypeScript type definitions (Ad, SearchResults)
├── config.ts          # Configuration (browser paths, scraping, output)
├── logger.ts          # Structured logging with progress bars
├── utils.ts           # Utilities (date, delay, __NEXT_DATA__ parsing)
├── cdp.ts             # Lightweight CDP client (raw WebSocket)
├── browser.ts         # Browser lifecycle (launch, connect, navigate)
├── scraper.ts         # Scraping engine (real nav + Next.js data routes)
├── exploit.ts         # Raw data mapping → typed Ad objects
├── index.ts           # CLI entry point
└── __tests__/         # Test suite (28 tests across 4 files)
```

### Data Flow

```
CLI (index.ts)
  ├─→ config.ts       → Parse CLI args, detect browser, create profile wrapper
  └─→ browser.ts      → Launch/connect to Brave/Chrome via CDP
      └─→ openTab()   → Navigate to search URL (real navigation)
  └─→ scraper.ts
      ├─→ extractNextDataFromDOM()  → Read __NEXT_DATA__, get buildId
      ├─→ fetchNextDataRoute()      → Use /_next/data/{buildId}/recherche.json
      └─→ fetchAdDataRoute()        → Use /_next/data/{buildId}/ad/...json
  └─→ exploit.ts
      ├─→ processSearchData()       → Map raw JSON → SearchResults
      └─→ processAdData()           → Map raw JSON → Ad
  └─→ fs.writeFile    → Save to ./assets/
```

## Troubleshooting

### Browser Auto-Launch

The scraper **automatically launches** your browser with CDP if it's not already running. It:

1. Checks if the browser is running with CDP enabled
2. If running without CDP, quits it gracefully and relaunches with CDP
3. Uses a random high port (30000-49999) to avoid conflicts
4. Creates a wrapper profile that symlinks to your real profile (so you keep all cookies and sessions)

**No manual setup required** — just run `pnpm start -- --browser brave ...` and it handles everything.

### Manual Browser Launch (Optional)

If you prefer to launch the browser manually with your profile:

##### macOS

Brave:

```bash
open -na "/Applications/Brave Browser.app" --args --remote-debugging-port=37000
```

Chrome:

```bash
open -na "/Applications/Google Chrome.app" --args --remote-debugging-port=37000
```

##### Linux

Brave:

```bash
brave-browser --remote-debugging-port=37000 &
```

Chrome:

```bash
google-chrome --remote-debugging-port=37000 &
```

##### Windows

Brave:

```powershell
Start-Process "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" -ArgumentList "--remote-debugging-port=37000"
```

Chrome:

```powershell
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=37000"
```

Then specify the port when running the scraper:

```bash
pnpm start -- --browser brave --port 37000 --query "..."
```

### Browser not found

The scraper **auto-detects Chrome (default), Brave, and Chromium** on both macOS and Linux.

**Linux paths checked automatically:**

- Chrome: `/usr/bin/google-chrome`, `/usr/bin/google-chrome-stable`, `/opt/google/chrome/chrome`
- Brave: `/usr/bin/brave-browser`, `/usr/bin/brave`, `/opt/brave.com/brave/brave-browser`
- Chromium: `/usr/bin/chromium`, `/usr/bin/chromium-browser`, `/snap/bin/chromium`
- Opera: `/usr/bin/opera`, `/usr/bin/opera-stable`

**macOS paths checked automatically:**

- Chrome: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Brave: `/Applications/Brave Browser.app/Contents/MacOS/Brave Browser`
- Chromium: `/Applications/Chromium.app/Contents/MacOS/Chromium`
- Opera: `/Applications/Opera.app/Contents/MacOS/Opera`

If your browser isn't found:

```bash
# Use --chrome-path to specify a custom binary
pnpm start -- --chrome-path "/usr/bin/brave-browser" --query "..."

# Or set the CHROME_PATH environment variable
export CHROME_PATH="/usr/bin/brave-browser"
```

**Supported browsers:**

- Chrome (default — most compatible)
- Brave (recommended — best anti-fingerprinting)
- Opera
- Chromium

### CAPTCHA / Bot Challenge

The scraper **automatically detects** CAPTCHA challenges in responses. When detected:

1. It navigates the visible tab to leboncoin.fr (to display the CAPTCHA)
2. It waits up to 5 minutes for you to solve it
3. It automatically resumes scraping once resolved

**To reduce CAPTCHA challenges:**

- Use your real browser where you're already logged in
- Increase the rate limit (try 2000-3000ms): `--rate-limit 2000`
- Let the browser warm up by manually browsing leboncoin.fr first

### Rate Limiting / Blocked

If you're getting blocked or rate limited:

- **Increase the delay**: `--rate-limit 3000` (3 seconds between requests)
- **Check your cookies**: Make sure you have valid DataDome cookies (visit leboncoin.fr manually first)
- **Use Brave**: Brave has better anti-fingerprinting than Chrome
- **Don't scrape too much**: Respect the site's resources

### Timeouts

If you're seeing timeout errors:

- **Increase page timeout**: `--timeout 60000` (60 seconds)
- **Check your internet connection**
- **Try a different browser**: Some profiles may have extensions that slow page loads
- Some pages may be legitimately unavailable or removed

### Stale Tab / Connection Issues

If the scraper fails to connect to an existing tab:

- The scraper automatically falls back to opening a fresh tab
- If you keep getting connection errors, close all browser windows and let the scraper relaunch it
- Check CDP port isn't already in use: `lsof -i :37000`

## Why This Approach Works

**Traditional scraping (Puppeteer)** is easily detected because:

- `navigator.webdriver === true`
- Missing Chrome plugins and features
- Predictable automation patterns
- DataDome can detect Puppeteer's fingerprint

**This scraper's approach:**

- ✅ Uses your **real browser** with your real profile (cookies, logins, extensions)
- ✅ Real navigation for the first page → sets all DataDome tokens naturally
- ✅ Next.js data routes for pagination → identical to the site's own client-side routing
- ✅ Raw CDP via WebSocket → zero Puppeteer footprint
- ✅ Random high ports → avoids detection patterns
- ✅ Profile wrapper with symlinks → keeps all your cookies and fingerprint

**Result:** DataDome cannot distinguish the scraper from a real user browsing with JavaScript enabled.

## License

MIT

## Author

maxgfr
