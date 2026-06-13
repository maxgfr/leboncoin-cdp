import os from 'os';
import path from 'path';
import fs from 'fs';

export type BrowserType = 'brave' | 'chrome' | 'opera' | 'chromium';

export interface Config {
  browser: {
    chromePath: string;
    userDataDir: string;
    timeout: number;
    debuggingPort: number;
  };
  scraping: {
    resultPerPage: number;
    maxRetries: number;
    rateLimit: number;
    /** Optional cap on the number of search pages to scrape (undefined = all). */
    maxPages?: number;
  };
  output: {
    directory: string;
    saveRawJson: boolean;
  };
  api: {
    baseUrl: string;
  };
}

/** Browser binary paths by platform */
const BROWSER_PATHS_MACOS: Record<BrowserType, string> = {
  chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  brave: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  opera: '/Applications/Opera.app/Contents/MacOS/Opera',
  chromium: '/Applications/Chromium.app/Contents/MacOS/Chromium',
};

const BROWSER_PATHS_LINUX: Record<BrowserType, string[]> = {
  chrome: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/opt/google/chrome/chrome',
  ],
  brave: [
    '/usr/bin/brave-browser',
    '/usr/bin/brave',
    '/opt/brave.com/brave/brave-browser',
  ],
  chromium: [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ],
  opera: ['/usr/bin/opera', '/usr/bin/opera-stable'],
};

/**
 * Detect the current platform.
 */
function getPlatform(): 'macos' | 'linux' | 'other' {
  const platform = os.platform();
  if (platform === 'darwin') return 'macos';
  if (platform === 'linux') return 'linux';
  return 'other';
}

/**
 * Resolve browser binary path from a BrowserType name.
 * Throws if the binary doesn't exist.
 */
export function getBrowserPath(browser: BrowserType): string {
  const platform = getPlatform();

  if (platform === 'macos') {
    const p = BROWSER_PATHS_MACOS[browser];
    if (!p) throw new Error(`Unknown browser: ${browser}`);
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {
      throw new Error(
        `${browser} not found at ${p}. Install it or use --chrome-path to specify the binary.`,
      );
    }
  } else if (platform === 'linux') {
    const candidates = BROWSER_PATHS_LINUX[browser];
    if (!candidates) throw new Error(`Unknown browser: ${browser}`);

    for (const p of candidates) {
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return p;
      } catch {
        continue;
      }
    }

    throw new Error(
      `${browser} not found. Tried: ${candidates.join(', ')}. Install it or use --chrome-path to specify the binary.`,
    );
  } else {
    throw new Error(
      `Unsupported platform: ${os.platform()}. Use --chrome-path to specify the browser binary.`,
    );
  }
}

/**
 * Auto-detect a Chromium-based browser.
 * Checks Chrome first (default), then Brave, then Chromium.
 */
function detectBrowserPath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  const platform = getPlatform();

  if (platform === 'macos') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];

    for (const p of candidates) {
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return p;
      } catch {
        continue;
      }
    }

    return candidates[0]; // fallback to Chrome
  } else if (platform === 'linux') {
    const candidates = [
      // Chrome first (default)
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/opt/google/chrome/chrome',
      // Then Brave
      '/usr/bin/brave-browser',
      '/usr/bin/brave',
      '/opt/brave.com/brave/brave-browser',
      // Then Chromium
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    ];

    for (const p of candidates) {
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return p;
      } catch {
        continue;
      }
    }

    return '/usr/bin/google-chrome'; // fallback to Chrome
  }

  return '/usr/bin/google-chrome'; // ultimate fallback
}

/**
 * Derive the browser app name from the binary path.
 */
export function getBrowserAppName(chromePath: string): string {
  if (chromePath.toLowerCase().includes('brave')) return 'Brave Browser';
  if (chromePath.toLowerCase().includes('opera')) return 'Opera';
  if (chromePath.toLowerCase().includes('chromium')) return 'Chromium';
  return 'Google Chrome';
}

/**
 * Return the default user-data-dir for the detected browser.
 */
export function detectUserDataDir(chromePath: string): string {
  const home = os.homedir();
  const platform = getPlatform();
  const lowerPath = chromePath.toLowerCase();

  if (platform === 'macos') {
    if (lowerPath.includes('brave'))
      return path.join(
        home,
        'Library',
        'Application Support',
        'BraveSoftware',
        'Brave-Browser',
      );
    if (lowerPath.includes('opera'))
      return path.join(
        home,
        'Library',
        'Application Support',
        'com.operasoftware.Opera',
      );
    if (lowerPath.includes('chromium'))
      return path.join(home, 'Library', 'Application Support', 'Chromium');
    return path.join(
      home,
      'Library',
      'Application Support',
      'Google',
      'Chrome',
    );
  } else if (platform === 'linux') {
    if (lowerPath.includes('brave'))
      return path.join(home, '.config', 'BraveSoftware', 'Brave-Browser');
    if (lowerPath.includes('opera')) return path.join(home, '.config', 'opera');
    if (lowerPath.includes('chromium'))
      return path.join(home, '.config', 'chromium');
    return path.join(home, '.config', 'google-chrome');
  }

  return path.join(home, '.config', 'google-chrome'); // fallback
}

/**
 * Root directory for all scraper data (persistent across runs).
 * Resolved lazily so it can be overridden via LBC_SCRAPER_HOME — used by tests
 * to avoid touching the user's real ~/.lbc-scraper profile.
 */
function getScraperHome(): string {
  return (
    process.env.LBC_SCRAPER_HOME || path.join(os.homedir(), '.lbc-scraper')
  );
}

function getPortFile(): string {
  return path.join(getScraperHome(), 'port');
}

/**
 * Create a PERSISTENT scraper profile by copying the real browser profile
 * ONCE. Subsequent runs reuse the existing profile so extensions, cookies,
 * and settings are preserved between sessions.
 *
 * The profile lives at ~/.lbc-scraper/profile/ (not /tmp).
 * Use --reset-profile to force a fresh copy from the real profile.
 */
export function createWrapperDataDir(realDir: string): string {
  const wrapper = path.join(getScraperHome(), 'profile');

  // If profile already exists → reuse it (fast path)
  if (fs.existsSync(path.join(wrapper, 'Default')) || fs.existsSync(path.join(wrapper, 'Local State'))) {
    console.log(`✓ Reusing scraper profile at ${wrapper}`);
    return wrapper;
  }

  // First run (or after --reset-profile): copy from real profile
  fs.mkdirSync(wrapper, { recursive: true });

  try {
    if (fs.existsSync(realDir)) {
      fs.cpSync(realDir, wrapper, {
        recursive: true,
        // Skip lock files to avoid conflicts
        filter: (src) => {
          const basename = path.basename(src);
          return (
            basename !== 'SingletonLock' &&
            basename !== 'SingletonCookie' &&
            basename !== 'SingletonSocket' &&
            basename !== 'lockfile'
          );
        },
      });
      console.log(`✓ Profile copied from ${realDir} to ${wrapper}`);
    } else {
      // If real profile doesn't exist, create minimal profile
      const localState = {
        browser: { enabled_labs_experiments: [] },
        profile: { info_cache: {} },
      };
      fs.writeFileSync(
        path.join(wrapper, 'Local State'),
        JSON.stringify(localState, null, 2),
      );
      console.log(`✓ Created new profile at ${wrapper}`);
    }
  } catch (error) {
    console.warn(`⚠ Failed to copy profile, using minimal profile:`, error);
  }

  return wrapper;
}

/**
 * Delete the persistent scraper profile so it gets re-created from the
 * real browser profile on the next run.
 */
export function resetScraperProfile(): void {
  const wrapper = path.join(getScraperHome(), 'profile');
  if (fs.existsSync(wrapper)) {
    fs.rmSync(wrapper, { recursive: true });
    console.log('✓ Scraper profile deleted — will be re-created on next run');
  }
}

/** Persist the CDP debugging port so the next run can reconnect. */
export function saveCdpPort(port: number): void {
  fs.mkdirSync(getScraperHome(), { recursive: true });
  fs.writeFileSync(getPortFile(), String(port));
}

/** Load a previously saved CDP port (0 if none). */
export function loadCdpPort(): number {
  try {
    const raw = fs.readFileSync(getPortFile(), 'utf8').trim();
    return parseInt(raw, 10) || 0;
  } catch {
    return 0;
  }
}

/** Clear the saved CDP port file. */
export function clearCdpPort(): void {
  try {
    fs.unlinkSync(getPortFile());
  } catch {
    // file may not exist
  }
}

export const config: Config = {
  browser: {
    chromePath: detectBrowserPath(),
    userDataDir: createWrapperDataDir(detectUserDataDir(detectBrowserPath())),
    timeout: parseInt(process.env.PAGE_TIMEOUT || '30000', 10),
    debuggingPort: parseInt(process.env.DEBUGGING_PORT || '0', 10),
  },
  scraping: {
    resultPerPage: 35,
    maxRetries: parseInt(process.env.MAX_RETRIES || '5', 10),
    rateLimit: parseInt(process.env.RATE_LIMIT || '1000', 10),
    maxPages: process.env.MAX_PAGES
      ? parseInt(process.env.MAX_PAGES, 10)
      : undefined,
  },
  output: {
    directory: process.env.OUTPUT_DIR || './assets',
    saveRawJson: process.env.SAVE_RAW === 'true',
  },
  api: {
    baseUrl: 'https://www.leboncoin.fr',
  },
};
