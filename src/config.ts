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
  };
  output: {
    directory: string;
    saveRawJson: boolean;
  };
  api: {
    baseUrl: string;
  };
}

/** Known browser binary paths on macOS. */
const BROWSER_PATHS: Record<BrowserType, string> = {
  chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  brave: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  opera: '/Applications/Opera.app/Contents/MacOS/Opera',
  chromium: '/Applications/Chromium.app/Contents/MacOS/Chromium',
};

/**
 * Resolve browser binary path from a BrowserType name.
 * Throws if the binary doesn't exist.
 */
export function getBrowserPath(browser: BrowserType): string {
  const p = BROWSER_PATHS[browser];
  if (!p) throw new Error(`Unknown browser: ${browser}`);
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return p;
  } catch {
    throw new Error(
      `${browser} not found at ${p}. Install it or use --chrome-path to specify the binary.`,
    );
  }
}

/**
 * Auto-detect a Chromium-based browser on macOS.
 * Checks Chrome first, then Brave, then Chromium.
 */
function detectBrowserPath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

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

  return candidates[0]; // fallback
}

/**
 * Derive the macOS .app name from the binary path.
 */
export function getBrowserAppName(chromePath: string): string {
  if (chromePath.includes('Brave')) return 'Brave Browser';
  if (chromePath.includes('Opera')) return 'Opera';
  if (chromePath.includes('Chromium')) return 'Chromium';
  return 'Google Chrome';
}

/**
 * Return the default user-data-dir for the detected browser.
 */
export function detectUserDataDir(chromePath: string): string {
  const home = os.homedir();
  if (chromePath.includes('Brave'))
    return path.join(
      home,
      'Library',
      'Application Support',
      'BraveSoftware',
      'Brave-Browser',
    );
  if (chromePath.includes('Opera'))
    return path.join(
      home,
      'Library',
      'Application Support',
      'com.operasoftware.Opera',
    );
  if (chromePath.includes('Chromium'))
    return path.join(home, 'Library', 'Application Support', 'Chromium');
  return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
}

/**
 * Create a wrapper user-data-dir that symlinks ALL contents of the
 * real profile directory.  This is needed because Chrome >= 131 refuses
 * --remote-debugging-port on the default user-data-dir.
 *
 * By symlinking everything (not just Default + Local State), the browser
 * sees ALL cookies, extensions, caches, DataDome tokens, etc. — it's
 * indistinguishable from a normal session.
 *
 * 'Local State' is copied instead of symlinked because Chrome holds a
 *  write-lock on it at startup and may refuse to start with a symlink.
 */
export function createWrapperDataDir(realDir: string): string {
  const wrapper = path.join(os.tmpdir(), 'lbc-scraper-profile');

  // Remove stale wrapper to avoid leftover symlinks to deleted dirs
  if (fs.existsSync(wrapper)) {
    fs.rmSync(wrapper, { recursive: true });
  }
  fs.mkdirSync(wrapper, { recursive: true });

  let entries: string[];
  try {
    entries = fs.readdirSync(realDir);
  } catch {
    return wrapper;
  }

  for (const entry of entries) {
    const realPath = path.join(realDir, entry);
    const linkPath = path.join(wrapper, entry);

    if (
      entry === 'Local State' ||
      entry === 'SingletonLock' ||
      entry === 'SingletonCookie' ||
      entry === 'SingletonSocket'
    ) {
      // Copy files that Chrome needs exclusive write access to
      try {
        fs.copyFileSync(realPath, linkPath);
      } catch {
        // ignore
      }
    } else {
      // Symlink everything else (Default, caches, extensions, etc.)
      try {
        fs.symlinkSync(realPath, linkPath);
      } catch {
        // ignore
      }
    }
  }

  return wrapper;
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
  },
  output: {
    directory: process.env.OUTPUT_DIR || './assets',
    saveRawJson: process.env.SAVE_RAW === 'true',
  },
  api: {
    baseUrl: 'https://www.leboncoin.fr',
  },
};
