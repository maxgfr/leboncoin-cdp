import os from "os";
import path from "path";
import fs from "fs";

export type BrowserType = "brave" | "chrome" | "opera" | "chromium";

export interface Config {
  browser: {
    chromePath: string;
    userDataDir: string;
    /** Opt-in (`--copy-profile`): seed a NEW scraper profile from the real browser profile. */
    copyProfile: boolean;
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
  chrome: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  brave: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  opera: "/Applications/Opera.app/Contents/MacOS/Opera",
  chromium: "/Applications/Chromium.app/Contents/MacOS/Chromium",
};

const BROWSER_PATHS_LINUX: Record<BrowserType, string[]> = {
  chrome: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/opt/google/chrome/chrome"],
  brave: ["/usr/bin/brave-browser", "/usr/bin/brave", "/opt/brave.com/brave/brave-browser"],
  chromium: ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"],
  opera: ["/usr/bin/opera", "/usr/bin/opera-stable"],
};

/**
 * Detect the current platform.
 */
function getPlatform(): "macos" | "linux" | "other" {
  const platform = os.platform();
  if (platform === "darwin") return "macos";
  if (platform === "linux") return "linux";
  return "other";
}

/**
 * Resolve browser binary path from a BrowserType name.
 * Throws if the binary doesn't exist.
 */
export function getBrowserPath(browser: BrowserType): string {
  const platform = getPlatform();

  if (platform === "macos") {
    const p = BROWSER_PATHS_MACOS[browser];
    if (!p) throw new Error(`Unknown browser: ${browser}`);
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {
      throw new Error(`${browser} not found at ${p}. Install it or use --chrome-path to specify the binary.`);
    }
  } else if (platform === "linux") {
    const candidates = BROWSER_PATHS_LINUX[browser];
    if (!candidates) throw new Error(`Unknown browser: ${browser}`);

    for (const p of candidates) {
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return p;
      } catch {}
    }

    throw new Error(`${browser} not found. Tried: ${candidates.join(", ")}. Install it or use --chrome-path to specify the binary.`);
  } else {
    throw new Error(`Unsupported platform: ${os.platform()}. Use --chrome-path to specify the browser binary.`);
  }
}

function isExecutable(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pick the browser binary: $CHROME_PATH > $LBC_BROWSER (chrome|brave|chromium|opera)
 * > the choice remembered from a previous `--browser` > auto-detect (Chrome, then
 * Brave, then Chromium). The session lives in that browser's scraper profile, so
 * the choice is remembered: `login --browser brave` once, and every command then
 * runs in Brave.
 */
export function detectBrowserPath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const envBrowser = process.env.LBC_BROWSER as BrowserType | undefined;
  if (envBrowser) {
    try {
      return getBrowserPath(envBrowser);
    } catch {
      /* fall through to the remembered choice / auto-detection */
    }
  }
  const remembered = loadBrowserChoice();
  if (remembered && isExecutable(remembered)) return remembered;

  const platform = getPlatform();

  if (platform === "macos") {
    const candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];

    for (const p of candidates) {
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return p;
      } catch {}
    }

    return candidates[0]; // fallback to Chrome
  } else if (platform === "linux") {
    const candidates = [
      // Chrome first (default)
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/opt/google/chrome/chrome",
      // Then Brave
      "/usr/bin/brave-browser",
      "/usr/bin/brave",
      "/opt/brave.com/brave/brave-browser",
      // Then Chromium
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium",
    ];

    for (const p of candidates) {
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return p;
      } catch {}
    }

    return "/usr/bin/google-chrome"; // fallback to Chrome
  }

  return "/usr/bin/google-chrome"; // ultimate fallback
}

/**
 * Derive the browser app name from the binary path.
 */
export function getBrowserAppName(chromePath: string): string {
  if (chromePath.toLowerCase().includes("brave")) return "Brave Browser";
  if (chromePath.toLowerCase().includes("opera")) return "Opera";
  if (chromePath.toLowerCase().includes("chromium")) return "Chromium";
  return "Google Chrome";
}

/**
 * Return the default user-data-dir for the detected browser.
 */
export function detectUserDataDir(chromePath: string): string {
  const home = os.homedir();
  const platform = getPlatform();
  const lowerPath = chromePath.toLowerCase();

  if (platform === "macos") {
    if (lowerPath.includes("brave")) return path.join(home, "Library", "Application Support", "BraveSoftware", "Brave-Browser");
    if (lowerPath.includes("opera")) return path.join(home, "Library", "Application Support", "com.operasoftware.Opera");
    if (lowerPath.includes("chromium")) return path.join(home, "Library", "Application Support", "Chromium");
    return path.join(home, "Library", "Application Support", "Google", "Chrome");
  } else if (platform === "linux") {
    if (lowerPath.includes("brave")) return path.join(home, ".config", "BraveSoftware", "Brave-Browser");
    if (lowerPath.includes("opera")) return path.join(home, ".config", "opera");
    if (lowerPath.includes("chromium")) return path.join(home, ".config", "chromium");
    return path.join(home, ".config", "google-chrome");
  }

  return path.join(home, ".config", "google-chrome"); // fallback
}

/**
 * Root directory for all scraper data (persistent across runs).
 * Resolved lazily so it can be overridden via LBC_SCRAPER_HOME — used by tests
 * to avoid touching the user's real ~/.lbc-scraper profile.
 */
export function getScraperHome(): string {
  return process.env.LBC_SCRAPER_HOME || path.join(os.homedir(), ".lbc-scraper");
}

/** Short key for a browser binary: chrome | brave | chromium | opera. */
export function browserKey(chromePath: string): string {
  const p = chromePath.toLowerCase();
  if (p.includes("brave")) return "brave";
  if (p.includes("opera")) return "opera";
  if (p.includes("chromium")) return "chromium";
  return "chrome";
}

/**
 * Per-browser file/dir name inside the scraper home. Chrome keeps the historical
 * names (`profile`, `port`) so existing setups are untouched; other browsers get
 * `profile-brave`, `port-brave`… — a profile copied from Brave is encrypted with
 * Brave's keychain entry and is useless to Chrome (and vice versa).
 */
function perBrowser(base: string, key: string): string {
  return key === "chrome" ? base : `${base}-${key}`;
}

function currentKey(): string {
  try {
    return browserKey(config.browser.chromePath);
  } catch {
    return "chrome"; // `config` is still initialising (temporal dead zone)
  }
}

function getPortFile(): string {
  return path.join(getScraperHome(), perBrowser("port", currentKey()));
}

function getBrowserChoiceFile(): string {
  return path.join(getScraperHome(), "browser");
}

/** The browser binary remembered from a previous `--browser` (or null). */
export function loadBrowserChoice(): string | null {
  try {
    const p = fs.readFileSync(getBrowserChoiceFile(), "utf8").trim();
    return p || null;
  } catch {
    return null;
  }
}

/** Remember the browser binary for the next runs. */
export function saveBrowserChoice(chromePath: string): void {
  fs.mkdirSync(getScraperHome(), { recursive: true });
  fs.writeFileSync(getBrowserChoiceFile(), chromePath);
}

/** Directory names never worth copying from a real profile (caches, crash dumps, locks). */
const PROFILE_COPY_SKIP = new Set([
  "SingletonLock",
  "SingletonCookie",
  "SingletonSocket",
  "lockfile",
  "Cache",
  "Code Cache",
  "GPUCache",
  "DawnCache",
  "DawnGraphiteCache",
  "DawnWebGPUCache",
  "GrShaderCache",
  "GraphiteDawnCache",
  "ShaderCache",
  "GPUPersistentCache",
  "CacheStorage",
  "ScriptCache",
  "component_crx_cache",
  "extensions_crx_cache",
  "Crashpad",
  "Crash Reports",
  "optimization_guide_model_store",
  "OnDeviceHeadSuggestModel",
  "Safe Browsing",
  "BrowserMetrics",
]);

/**
 * Default path for the login-state screenshot written by the `login` command.
 * Lives under the scraper home (honors LBC_SCRAPER_HOME so tests stay sandboxed).
 */
export function getAuthStatePath(): string {
  return path.join(getScraperHome(), "auth-state.png");
}

/** Warning printed whenever the real profile is copied (`--copy-profile`). */
export const COPY_PROFILE_WARNING =
  "⚠ --copy-profile: the scraper now shares your real browser's Leboncoin session tokens — Leboncoin may log your real browser out. Prefer the default isolated profile (log in once by hand in the scraper window).";

/**
 * Create the PERSISTENT scraper profile once; subsequent runs reuse it as-is so
 * the session, cookies and settings survive between runs.
 *
 * Default: a FRESH, isolated profile (a minimal "Local State"). The user logs in
 * once by hand in the scraper window, which gives it its own independent session.
 * Copying the real profile (`copy: true`, `--copy-profile`) makes two browsers share
 * the same Leboncoin session tokens, and Leboncoin then logs the real browser out —
 * so it is an explicit opt-in only.
 *
 * The profile lives at ~/.lbc-scraper/profile/ (not /tmp).
 * Use --reset-profile to delete and re-create it.
 */
export function createWrapperDataDir(realDir: string, key = "chrome", copy = false): string {
  const wrapper = path.join(getScraperHome(), perBrowser("profile", key));

  // If profile already exists → reuse it (fast path)
  if (fs.existsSync(path.join(wrapper, "Default")) || fs.existsSync(path.join(wrapper, "Local State"))) {
    console.log(`✓ Reusing scraper profile at ${wrapper}`);
    return wrapper;
  }

  // First run (or after --reset-profile)
  fs.mkdirSync(wrapper, { recursive: true });

  if (copy && fs.existsSync(realDir)) {
    try {
      console.warn(COPY_PROFILE_WARNING);
      fs.cpSync(realDir, wrapper, {
        recursive: true,
        // Skip lock files (conflicts) and caches (GBs of nothing the session needs).
        filter: (src) => !PROFILE_COPY_SKIP.has(path.basename(src)),
      });
      console.log(`✓ Profile copied from ${realDir} to ${wrapper}`);
      return wrapper;
    } catch (error) {
      console.warn(`⚠ Failed to copy profile, using minimal profile:`, error);
    }
  }

  // Fresh, isolated profile (the default)
  const localState = {
    browser: { enabled_labs_experiments: [] },
    profile: { info_cache: {} },
  };
  fs.writeFileSync(path.join(wrapper, "Local State"), JSON.stringify(localState, null, 2));
  console.log(`✓ Created a fresh, isolated scraper profile at ${wrapper} — log in to Leboncoin once in that window (leboncoin login)`);
  return wrapper;
}

/**
 * Delete the persistent scraper profile so it gets re-created on the next run
 * (fresh by default, copied only with --copy-profile).
 */
export function resetScraperProfile(key = currentKey()): void {
  const wrapper = path.join(getScraperHome(), perBrowser("profile", key));
  if (fs.existsSync(wrapper)) {
    fs.rmSync(wrapper, { recursive: true });
    console.log("✓ Scraper profile deleted — will be re-created on next run");
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
    const raw = fs.readFileSync(getPortFile(), "utf8").trim();
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
    // Resolved lazily by ensureUserDataDir(): importing this module must not create
    // a profile for a browser the command will not even use.
    userDataDir: "",
    copyProfile: false,
    timeout: parseInt(process.env.PAGE_TIMEOUT || "30000", 10),
    debuggingPort: parseInt(process.env.DEBUGGING_PORT || "0", 10),
  },
  scraping: {
    resultPerPage: 35,
    maxRetries: parseInt(process.env.MAX_RETRIES || "5", 10),
    rateLimit: parseInt(process.env.RATE_LIMIT || "1000", 10),
    maxPages: process.env.MAX_PAGES ? parseInt(process.env.MAX_PAGES, 10) : undefined,
  },
  output: {
    directory: process.env.OUTPUT_DIR || "./assets",
    saveRawJson: process.env.SAVE_RAW === "true",
  },
  api: {
    baseUrl: "https://www.leboncoin.fr",
  },
};

/**
 * The scraper profile for the selected browser (`profile` for Chrome,
 * `profile-brave` for Brave…), created fresh on first use — or copied from the
 * real profile with --copy-profile.
 */
export function ensureUserDataDir(): string {
  if (!config.browser.userDataDir) {
    const p = config.browser.chromePath;
    config.browser.userDataDir = createWrapperDataDir(detectUserDataDir(p), browserKey(p), config.browser.copyProfile);
  }
  return config.browser.userDataDir;
}

/**
 * Select the browser for this run (and remember it): `--browser brave` or
 * `--chrome-path <bin>`. `resetProfile` deletes that browser's scraper profile so
 * it is re-created (fresh, or copied from the real profile with `copyProfile`).
 */
export function selectBrowser(opts: { browser?: BrowserType; chromePath?: string; resetProfile?: boolean; copyProfile?: boolean; remember?: boolean }): string {
  const chromePath = opts.browser ? getBrowserPath(opts.browser) : (opts.chromePath ?? config.browser.chromePath);
  if (chromePath !== config.browser.chromePath) {
    config.browser.chromePath = chromePath;
    config.browser.userDataDir = "";
    config.browser.debuggingPort = parseInt(process.env.DEBUGGING_PORT || "0", 10);
  }
  if (opts.copyProfile) config.browser.copyProfile = true;
  if (opts.resetProfile) {
    resetScraperProfile(browserKey(chromePath));
    config.browser.userDataDir = "";
  }
  if (opts.remember !== false && (opts.browser || opts.chromePath)) saveBrowserChoice(chromePath);
  return chromePath;
}
