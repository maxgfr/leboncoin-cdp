/**
 * The CDP publish engine. Opens the deposit form on the logged-in stealth
 * profile, fills every field + uploads photos, then (semi-auto, the default)
 * waits for the user to review and click « Déposer mon annonce » — which also
 * clears DataDome at submit. `--yes` clicks publish automatically. On success it
 * captures the new ad's list_id/URL and writes them back to the annonce.
 *
 * The browser connection is injected via `deps.connect` so tests exercise the
 * full flow against a fake CDP client with no browser and no config side effects
 * (importing ./browser, hence ./config, is deferred to the default path only).
 */
import path from "node:path";
import type { CDPClient } from "./cdp";
import { isOnCaptcha, waitForCaptchaResolution } from "./captcha";
import { clickButton, currentUrl, firstAdLink, pickSuggestion, resolveSelector, setInputValue, uploadPhotos } from "./deposit-form";
import { logger } from "./logger";
import { parseAnnonce, resolvePhotoPaths, writeAnnonce } from "./markdown";
import { DEPOSIT } from "./selectors";
import type { Annonce } from "./types";
import { delay } from "./utils";

export interface PublishOptions {
  /** Fill AND click publish without the manual review pause. */
  yes?: boolean;
  /** Fill the form but submit nothing (debug the field mapping). */
  dryRun?: boolean;
  /** Max wait for the published ad to appear (default 15 min). */
  timeoutSubmitMs?: number;
}

export interface PublishDeps {
  connect: (url: string) => Promise<CDPClient>;
}

export interface PublishResult {
  ok: boolean;
  leboncoin_id?: string;
  leboncoin_url?: string;
  reason?: "login-required" | "dry-run" | "not-published";
}

const DEFAULT_SUBMIT_TIMEOUT_MS = 15 * 60 * 1_000;

async function defaultConnect(url: string): Promise<CDPClient> {
  const { connectAndNavigate } = await import("./browser");
  return connectAndNavigate(url);
}

/** Fill the entire deposit form from the annonce (best-effort, never throws). */
async function fillForm(cdp: CDPClient, a: Annonce, photos: string[]): Promise<void> {
  // 1. Category first — choosing it mutates the rest of the form, so later
  //    selectors must be resolved AFTER this step.
  if (a.category) {
    const catSel = await resolveSelector(cdp, DEPOSIT.categoryInput);
    if (catSel) {
      await setInputValue(cdp, DEPOSIT.categoryInput, a.category);
      await delay(1_200);
      await pickSuggestion(cdp, DEPOSIT.suggestionOption, a.category);
      await delay(1_500);
    } else {
      logger.warn("Category field not found — pick the category manually in the browser.");
    }
  }

  // 2. Core text fields.
  if (!(await setInputValue(cdp, DEPOSIT.titleInput, a.title))) logger.warn("Could not fill the title field.");
  if (!(await setInputValue(cdp, DEPOSIT.descTextarea, a.description))) logger.warn("Could not fill the description field.");
  if (!(await setInputValue(cdp, DEPOSIT.priceInput, String(a.price)))) logger.warn("Could not fill the price field.");

  // 3. Location (zipcode → pick the city suggestion).
  if (a.zipcode) {
    if (await setInputValue(cdp, DEPOSIT.zipcodeInput, a.zipcode)) {
      await delay(1_200);
      await pickSuggestion(cdp, DEPOSIT.suggestionOption, a.city ?? a.zipcode);
    }
  }

  // 4. Condition + category-specific attributes (unknown keys are logged, never fatal).
  if (a.condition) await setInputValue(cdp, DEPOSIT.attrByKey("condition"), a.condition);
  for (const [key, value] of Object.entries(a.attributes ?? {})) {
    const ok = await setInputValue(cdp, DEPOSIT.attrByKey(key), String(value));
    if (!ok) logger.warn(`Attribute "${key}" could not be set automatically — set it manually if needed.`);
  }

  // 5. Photos (the one CDP DOM-domain operation).
  let uploaded = await uploadPhotos(cdp, DEPOSIT.photoFileInput, photos);
  if (uploaded < photos.length) {
    // The real <input type=file> may be mounted only after clicking an "add" control.
    await clickButton(cdp, DEPOSIT.photoAddButton);
    await delay(800);
    uploaded = await uploadPhotos(cdp, DEPOSIT.photoFileInput, photos);
  }
  if (uploaded === 0) logger.warn("Could not upload photos automatically — add them manually in the browser.");
  else logger.info(`Uploaded ${uploaded}/${photos.length} photo(s).`);
  await delay(1_500); // let thumbnails render
}

/** Poll the page until a published-ad URL appears (or timeout). */
async function waitForPublished(cdp: CDPClient, timeoutMs: number): Promise<{ url: string; id: string } | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await delay(2_000);
    if (await isOnCaptcha(cdp)) {
      await waitForCaptchaResolution(cdp);
      continue;
    }
    const href = await currentUrl(cdp);
    for (const re of DEPOSIT.publishedUrlPattern) {
      const m = href.match(re);
      if (m?.[1]) return { url: href, id: m[1] };
    }
    for (const re of DEPOSIT.confirmedUrlPattern) {
      if (re.test(href)) {
        const adHref = await firstAdLink(cdp);
        let id = "";
        for (const r2 of DEPOSIT.publishedUrlPattern) {
          const m = (adHref || href).match(r2);
          if (m?.[1]) {
            id = m[1];
            break;
          }
        }
        return { url: adHref || href, id };
      }
    }
  }
  return null;
}

export async function runPublish(annoncesDir: string, slug: string, opts: PublishOptions = {}, deps: Partial<PublishDeps> = {}): Promise<PublishResult> {
  const dir = path.join(annoncesDir, slug);
  const a = parseAnnonce(dir);
  if (a.status !== "draft") {
    throw new Error(`annonce "${slug}" is "${a.status}", not "draft" — only drafts can be published`);
  }
  const photos = resolvePhotoPaths(dir, a);
  if (photos.length === 0) throw new Error(`annonce "${slug}" has no photos in photos/ to upload`);

  const connect = deps.connect ?? defaultConnect;
  const cdp = await connect(DEPOSIT.startUrl);
  try {
    const href = await currentUrl(cdp);
    if (DEPOSIT.loginUrlPattern.test(href)) {
      logger.error("Not logged in to Leboncoin — log in once in the opened browser, then retry.");
      return { ok: false, reason: "login-required" };
    }
    if (await isOnCaptcha(cdp)) await waitForCaptchaResolution(cdp);

    await fillForm(cdp, a, photos);

    if (opts.dryRun) {
      logger.info("Dry run — form filled, nothing submitted.");
      return { ok: false, reason: "dry-run" };
    }

    if (opts.yes) {
      logger.info("Auto-submitting (--yes)…");
      await clickButton(cdp, DEPOSIT.publishButton);
    } else {
      logger.warn("Form prefilled. Review it in the browser and click « Déposer mon annonce » yourself.");
      logger.info("Waiting for you to publish…");
    }

    const published = await waitForPublished(cdp, opts.timeoutSubmitMs ?? DEFAULT_SUBMIT_TIMEOUT_MS);
    if (!published) {
      logger.warn("Did not detect a published ad before the timeout.");
      return { ok: false, reason: "not-published" };
    }

    a.status = "published";
    a.leboncoin_url = published.url;
    if (published.id) a.leboncoin_id = published.id;
    a.published_at = new Date().toISOString();
    writeAnnonce(dir, a);
    logger.success(`Published: ${published.url}`);
    return { ok: true, leboncoin_id: published.id || undefined, leboncoin_url: published.url };
  } finally {
    cdp.disconnect();
  }
}
