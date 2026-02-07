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
 * Create an ISOLATED wrapper user-data-dir by COPYING the real profile.
 *
 * IMPORTANT: This creates a COMPLETE COPY of your browser profile to:
 * - Preserve cookies, extensions, and settings for the scraper
 * - Protect your real profile from corruption (no symlinks!)
 * - Allow Chrome >= 131 to use --remote-debugging-port
 *
 * The copy is temporary and deleted on next run, so your real profile
 * is NEVER modified.
 */
export function createWrapperDataDir(realDir: string): string {
  const wrapper = path.join(os.tmpdir(), 'lbc-scraper-profile');

  // Remove stale wrapper to start fresh
  if (fs.existsSync(wrapper)) {
    fs.rmSync(wrapper, { recursive: true });
  }

  // Copy the entire profile directory recursively
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
      fs.mkdirSync(wrapper, { recursive: true });
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
    // Fallback: create minimal profile
    fs.mkdirSync(wrapper, { recursive: true });
    console.warn(`⚠ Failed to copy profile, using minimal profile:`, error);
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
