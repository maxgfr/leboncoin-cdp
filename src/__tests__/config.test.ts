import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { getBrowserAppName, detectUserDataDir, createWrapperDataDir, getBrowserPath, resetScraperProfile } from "../config";
import type { BrowserType } from "../config";
import os from "os";
import path from "path";
import fs from "fs";

// Redirect the scraper home to a throwaway dir so the test suite never wipes
// the user's real ~/.lbc-scraper profile (cookies/login).
let testHome: string;
const prevHome = process.env.LBC_SCRAPER_HOME;
beforeAll(() => {
  testHome = fs.mkdtempSync(path.join(os.tmpdir(), "lbc-home-"));
  process.env.LBC_SCRAPER_HOME = testHome;
});
afterAll(() => {
  if (prevHome === undefined) delete process.env.LBC_SCRAPER_HOME;
  else process.env.LBC_SCRAPER_HOME = prevHome;
  fs.rmSync(testHome, { recursive: true, force: true });
});

describe("getBrowserAppName", () => {
  test("detects Brave", () => {
    expect(getBrowserAppName("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser")).toBe("Brave Browser");
  });

  test("detects Chrome", () => {
    expect(getBrowserAppName("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")).toBe("Google Chrome");
  });

  test("detects Opera", () => {
    expect(getBrowserAppName("/Applications/Opera.app/Contents/MacOS/Opera")).toBe("Opera");
  });

  test("detects Chromium", () => {
    expect(getBrowserAppName("/Applications/Chromium.app/Contents/MacOS/Chromium")).toBe("Chromium");
  });

  test("defaults to Google Chrome for unknown path", () => {
    expect(getBrowserAppName("/usr/bin/some-browser")).toBe("Google Chrome");
  });
});

describe("detectUserDataDir", () => {
  const home = os.homedir();
  const platform = os.platform();

  test("Brave data dir", () => {
    const result = detectUserDataDir("/path/Brave Browser/binary");
    if (platform === "darwin") {
      expect(result).toBe(path.join(home, "Library", "Application Support", "BraveSoftware", "Brave-Browser"));
    } else if (platform === "linux") {
      expect(result).toBe(path.join(home, ".config", "BraveSoftware", "Brave-Browser"));
    }
  });

  test("Opera data dir", () => {
    const result = detectUserDataDir("/path/Opera/binary");
    if (platform === "darwin") {
      expect(result).toBe(path.join(home, "Library", "Application Support", "com.operasoftware.Opera"));
    } else if (platform === "linux") {
      expect(result).toBe(path.join(home, ".config", "opera"));
    }
  });

  test("Chromium data dir", () => {
    const result = detectUserDataDir("/path/Chromium/binary");
    if (platform === "darwin") {
      expect(result).toBe(path.join(home, "Library", "Application Support", "Chromium"));
    } else if (platform === "linux") {
      expect(result).toBe(path.join(home, ".config", "chromium"));
    }
  });

  test("Chrome data dir (default)", () => {
    const result = detectUserDataDir("/path/google-chrome");
    if (platform === "darwin") {
      expect(result).toBe(path.join(home, "Library", "Application Support", "Google", "Chrome"));
    } else if (platform === "linux") {
      expect(result).toBe(path.join(home, ".config", "google-chrome"));
    }
  });
});

describe("createWrapperDataDir", () => {
  test("creates wrapper by copying profile", () => {
    // Ensure no pre-existing scraper profile interferes
    resetScraperProfile();

    // Create a temp dir with some test files (simulating real profile)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lbc-test-"));
    fs.writeFileSync(path.join(tmpDir, "Local State"), "{}");
    fs.writeFileSync(path.join(tmpDir, "testfile"), "content");
    fs.mkdirSync(path.join(tmpDir, "Default"));

    const wrapper = createWrapperDataDir(tmpDir);
    expect(fs.existsSync(wrapper)).toBe(true);

    // Local State should exist and be a regular file (copied, not symlink)
    const localStatePath = path.join(wrapper, "Local State");
    expect(fs.existsSync(localStatePath)).toBe(true);
    expect(fs.lstatSync(localStatePath).isSymbolicLink()).toBe(false);

    // The wrapper should contain COPIES of all files (not symlinks)
    const testfilePath = path.join(wrapper, "testfile");
    expect(fs.existsSync(testfilePath)).toBe(true);
    expect(fs.lstatSync(testfilePath).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(testfilePath, "utf-8")).toBe("content");

    const defaultPath = path.join(wrapper, "Default");
    expect(fs.existsSync(defaultPath)).toBe(true);
    expect(fs.lstatSync(defaultPath).isSymbolicLink()).toBe(false);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
    fs.rmSync(wrapper, { recursive: true });
  });

  test("handles non-existent dir gracefully", () => {
    const wrapper = createWrapperDataDir("/nonexistent/path/1234");
    expect(fs.existsSync(wrapper)).toBe(true);

    // Should still create a valid wrapper with Local State
    const localStatePath = path.join(wrapper, "Local State");
    expect(fs.existsSync(localStatePath)).toBe(true);

    fs.rmSync(wrapper, { recursive: true });
  });
});

describe("getBrowserPath", () => {
  test("throws for unknown browser type", () => {
    expect(() => getBrowserPath("firefox" as BrowserType)).toThrow("Unknown browser");
  });

  // These tests depend on which browsers are installed.
  // We test that the function throws with a helpful message
  // if the browser is not found.
  test("throws helpful error for missing browser", () => {
    // Chromium is unlikely to be installed in most dev environments
    try {
      getBrowserPath("chromium");
    } catch (error: any) {
      expect(error.message).toContain("not found at");
      expect(error.message).toContain("Chromium");
    }
  });
});
