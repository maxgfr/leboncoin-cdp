import type { Page } from 'puppeteer';
import { logger } from './logger';

export interface PreLaunchConfig {
  humanDelay: boolean;
}

/**
 * Minimal config - when connecting to a real browser we don't need
 * viewport/lang/stealth args since it's the user's actual browser.
 */
export function getMinimalPreLaunchConfig(): PreLaunchConfig {
  return { humanDelay: true };
}

export async function acceptCookieConsent(page: Page): Promise<void> {
  const selectors = [
    '#didomi-notice-agree-button',
    'button[aria-label="Accepter & Fermer"]',
    'button[aria-label="Accepter et fermer"]',
  ];

  for (const selector of selectors) {
    try {
      const button = await page.waitForSelector(selector, {
        timeout: 3000,
        visible: true,
      });
      if (button) {
        await new Promise((res) =>
          setTimeout(res, 500 + Math.floor(Math.random() * 1000)),
        );
        await button.click();
        await new Promise((res) => setTimeout(res, 500));
        return;
      }
    } catch {
      continue;
    }
  }
}

/**
 * Detect if the current page is a CAPTCHA / bot challenge (DataDome, etc.).
 * Only checks for actual CAPTCHA indicators — NOT the absence of __NEXT_DATA__
 * which causes false positives and triggers unnecessary re-navigations.
 */
export async function isCaptchaPage(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(() => {
      const url = window.location.href;
      const html = document.documentElement.innerHTML.toLowerCase();

      // URL-based detection
      if (
        url.includes('captcha') ||
        url.includes('datadome') ||
        url.includes('geo.captcha-delivery')
      )
        return true;

      // iframe-based detection (DataDome injects challenge iframes)
      if (document.querySelector('iframe[src*="datadome"]')) return true;
      if (document.querySelector('iframe[src*="captcha-delivery"]'))
        return true;
      if (document.querySelector('iframe[src*="geo.captcha"]')) return true;

      // Text-based detection
      const challengeTexts = [
        'confirmer que vous etes humain',
        'verify you are human',
        'verification de securite',
        'security check',
        'checking your browser',
        'veuillez patienter',
        'access denied',
      ];
      if (challengeTexts.some((t) => html.includes(t))) return true;

      return false;
    });
  } catch {
    return false;
  }
}

/**
 * If a CAPTCHA is detected, wait for the user to solve it manually.
 * Polls every 3s until the challenge disappears or timeout is reached.
 */
export async function waitForCaptchaResolution(
  page: Page,
  timeoutMs = 5 * 60 * 1000,
): Promise<boolean> {
  if (!(await isCaptchaPage(page))) return false;

  logger.warn(
    'CAPTCHA / bot challenge detected - please solve it manually in the browser window',
  );
  logger.info(
    'Waiting up to 5 minutes for you to complete the challenge...',
  );

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((res) => setTimeout(res, 3000));
    if (!(await isCaptchaPage(page))) {
      logger.success('Challenge resolved - resuming scraping');
      await new Promise((res) => setTimeout(res, 1500));
      return true;
    }
  }

  throw new Error('CAPTCHA timeout: challenge not resolved within 5 minutes');
}

export async function applyPostNavigationHumanSignals(
  page: Page,
  cfg: PreLaunchConfig,
): Promise<void> {
  if (!cfg.humanDelay) return;

  // Random delay like a human reading
  const waitMs = 800 + Math.floor(Math.random() * 1500);
  await new Promise((res) => setTimeout(res, waitMs));

  // Simulate mouse movement (a real user moves the mouse after page load)
  try {
    const vw = await page.evaluate(() => window.innerWidth);
    const vh = await page.evaluate(() => window.innerHeight);
    const x = 100 + Math.floor(Math.random() * (vw - 200));
    const y = 100 + Math.floor(Math.random() * (vh - 200));
    await page.mouse.move(x, y, { steps: 5 + Math.floor(Math.random() * 10) });
  } catch {
    // ignore if page navigated
  }

  // Small random scroll like a human glancing at the page
  try {
    const scrollY = 50 + Math.floor(Math.random() * 200);
    await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), scrollY);
    await new Promise((res) => setTimeout(res, 300 + Math.floor(Math.random() * 500)));
  } catch {
    // ignore
  }
}
