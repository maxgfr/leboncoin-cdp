/**
 * Browser management — launch/connect to Chrome or Brave with CDP.
 *
 * Unlike Puppeteer, we never call puppeteer.launch() or puppeteer.connect().
 * We spawn the browser as a normal process and attach via raw WebSocket CDP.
 * This means zero automation flags — the browser is indistinguishable from
 * a manually launched instance.
 */
import { spawn, execSync } from "child_process";
import { config, getBrowserAppName, saveCdpPort, loadCdpPort, clearCdpPort } from "./config";
import { logger } from "./logger";
import { delay } from "./utils";
import { CDPClient } from "./cdp";
import { isOnCaptcha, waitForCaptchaResolution } from "./captcha";

interface TabInfo {
  id: string;
  title: string;
  url: string;
  type: string;
  webSocketDebuggerUrl: string;
}

function randomHighPort(): number {
  return 30_000 + Math.floor(Math.random() * 20_000);
}

function isBrowserRunning(): boolean {
  try {
    return (
      execSync(`pgrep -f "${config.browser.chromePath}"`, {
        encoding: "utf-8",
      }).trim().length > 0
    );
  } catch {
    return false;
  }
}

async function getCdpInfo(port: number): Promise<{ wsUrl: string } | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (!res.ok) return null;
    const data = (await res.json()) as { webSocketDebuggerUrl: string };
    return { wsUrl: data.webSocketDebuggerUrl };
  } catch {
    return null;
  }
}

async function listTabs(port: number): Promise<TabInfo[]> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    return res.ok ? ((await res.json()) as TabInfo[]) : [];
  } catch {
    return [];
  }
}

/**
 * Open a new browser tab via the DevTools HTTP endpoint.
 * Modern Chrome (>= ~v111) requires PUT for /json/new and rejects GET;
 * older builds only accept GET. Try PUT first, then fall back to GET.
 */
async function openNewTab(port: number): Promise<TabInfo | null> {
  for (const method of ["PUT", "GET"] as const) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method });
      if (!res.ok) continue;
      const data = (await res.json()) as TabInfo;
      if (data?.webSocketDebuggerUrl) return data;
    } catch {
      // Try the next verb
    }
  }
  return null;
}

/**
 * Wait until the page is usable, then return.
 *
 * We resolve on whichever of DOMContentLoaded / load fires first. The data we
 * need (`__NEXT_DATA__`) is in the server-rendered HTML, so DOMContentLoaded is
 * sufficient — and the full `load` event on ad-heavy Leboncoin pages often
 * takes 30s+ or never fires, which would otherwise stall every navigation.
 */
export async function waitForPageReady(cdp: CDPClient): Promise<void> {
  await Promise.race([
    cdp.once("Page.domContentEventFired", config.browser.timeout).catch(() => {}),
    cdp.once("Page.loadEventFired", config.browser.timeout).catch(() => {}),
  ]);
}

/**
 * Find or create a tab and navigate it to the target URL.
 * Returns a CDPClient connected to that tab's JS context.
 */
async function openTab(port: number, targetUrl: string): Promise<CDPClient> {
  // Always open a new tab so we never clobber an existing page's data
  logger.info("Opening a new tab…");
  let target: TabInfo | null = await openNewTab(port);

  if (!target) {
    // Fallback: reuse an existing blank tab
    const tabs = await listTabs(port);
    target = tabs.find((t) => t.type === "page" && (t.url === "about:blank" || t.url === "chrome://newtab/")) ?? tabs.find((t) => t.type === "page") ?? null;
  }

  if (!target) {
    throw new Error("Could not open or find a usable browser tab");
  }

  logger.info(`Connecting to tab: ${target.url || "about:blank"}`);
  let cdp = await CDPClient.connect(target.webSocketDebuggerUrl);

  // Try to enable Page domain — might fail on stale/restored tabs
  try {
    await cdp.send("Page.enable", {}, 10_000);
  } catch {
    logger.warn("Tab not responding — opening a fresh tab…");
    cdp.disconnect();
    const freshTab = await openNewTab(port);
    if (!freshTab) {
      throw new Error("Could not open a fresh browser tab");
    }
    cdp = await CDPClient.connect(freshTab.webSocketDebuggerUrl);
    await cdp.send("Page.enable", {}, 15_000);
  }

  // Navigate to the required URL
  logger.info(`Navigating to ${targetUrl}`);
  await cdp.send("Page.navigate", { url: targetUrl });

  // Wait until the DOM is ready (don't block on the slow/never-firing `load`)
  await waitForPageReady(cdp);
  await delay(2_000); // Extra time for JS hydration + DataDome init

  // Check if we landed on a CAPTCHA and wait for the user to solve it.
  if (await isOnCaptcha(cdp)) {
    await waitForCaptchaResolution(cdp);
  }

  logger.success("Page loaded");
  return cdp;
}

/**
 * Ensure a browser is running with CDP and return a CDPClient
 * connected to a tab navigated to `targetUrl`.
 *
 * Strategy (NEVER kills the user's existing browser):
 *   1. Try the CLI/env port if provided
 *   2. Try the saved port from a previous scraper session
 *   3. Launch a SEPARATE browser instance with the scraper profile
 */
export async function connectAndNavigate(targetUrl: string): Promise<CDPClient> {
  const browserName = getBrowserAppName(config.browser.chromePath);

  // 1. Try the explicitly-configured port (CLI --port or env)
  const explicitPort = config.browser.debuggingPort;
  if (explicitPort > 0) {
    const info = await getCdpInfo(explicitPort);
    if (info) {
      logger.info(`Found existing ${browserName} with CDP on port ${explicitPort}`);
      saveCdpPort(explicitPort);
      return openTab(explicitPort, targetUrl);
    }
  }

  // 2. Try the port saved from a previous scraper run
  const savedPort = loadCdpPort();
  if (savedPort > 0 && savedPort !== explicitPort) {
    const info = await getCdpInfo(savedPort);
    if (info) {
      logger.info(`Reconnecting to scraper ${browserName} on saved port ${savedPort}`);
      config.browser.debuggingPort = savedPort;
      return openTab(savedPort, targetUrl);
    } else {
      // Stale port — clean up
      clearCdpPort();
    }
  }

  // 3. Launch a NEW browser instance with the scraper profile
  //    (the user's existing browser is left untouched)
  const newPort = randomHighPort();
  config.browser.debuggingPort = newPort;

  logger.info(`Launching a dedicated scraper ${browserName} on port ${newPort}`);
  logger.info(`  Binary  : ${config.browser.chromePath}`);
  logger.info(`  Profile : ${config.browser.userDataDir}`);
  if (isBrowserRunning()) {
    logger.info(`  (your existing ${browserName} will NOT be affected)`);
  }

  const child = spawn(
    config.browser.chromePath,
    [
      `--remote-debugging-port=${newPort}`,
      `--user-data-dir=${config.browser.userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-session-crashed-bubble",
      "--hide-crash-restore-bubble",
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();

  // Wait for CDP to become available
  let cdpReady = false;
  for (let i = 0; i < 30; i++) {
    await delay(500);
    if (await getCdpInfo(newPort)) {
      cdpReady = true;
      break;
    }
  }

  if (!cdpReady) {
    throw new Error(`${browserName} did not expose CDP on port ${newPort} within 15s`);
  }

  // Save port so the next run can reconnect without new launch
  saveCdpPort(newPort);
  logger.success("Scraper browser launched and ready");
  return openTab(newPort, targetUrl);
}
