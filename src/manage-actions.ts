/**
 * Shared, site-agnostic building blocks for the listing-management commands
 * (delete / mark-sold / deactivate / reactivate / renew / edit):
 *  - find a control on the ad page, inside an overflow « … » menu, or in the
 *    ad's own card on « mes annonces »;
 *  - PROVE the outcome before any local state changes (a confirmation text, the
 *    ad page being gone, or the opposite control appearing).
 */
import type { CDPClient } from "./cdp";
import { clickButton, clickButtonOrMenu, hasButton, pageHasText } from "./deposit-form";
import { type ButtonSelector, MANAGE } from "./selectors";
import { delay } from "./utils";

/** Navigate the current tab and give the SPA time to render. */
export async function navigate(cdp: CDPClient, url: string, settleMs = 3_000): Promise<void> {
  await cdp.send("Page.enable").catch(() => {});
  await cdp.send("Page.navigate", { url }).catch(() => {});
  await delay(settleMs);
}

/**
 * Click `button` for the ad `adId` inside its card on the current page (a list
 * such as « mes annonces »): find a link to the ad, climb to the enclosing card
 * and click the best-matching visible control there. Returns false if no card.
 */
export async function clickInAdCard(cdp: CDPClient, adId: string, button: ButtonSelector): Promise<boolean> {
  return cdp
    .evaluate<boolean>(
      `(() => {
        /* click-in-ad-card */
        const n = (s) => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const visible = (el) => !!(el.offsetParent !== null || (el.getClientRects && el.getClientRects().length));
        const link = Array.from(document.querySelectorAll('a[href]')).find((a) => a.getAttribute('href').includes(${JSON.stringify(adId)}));
        if (!link) return false;
        let card = link;
        for (let i = 0; i < 8 && card.parentElement; i++) {
          card = card.parentElement;
          if (card.matches('li, article, [role="listitem"], [role="row"]') || card.querySelectorAll('button, [role="button"]').length >= 1) break;
        }
        const wanted = ${JSON.stringify(button.textCandidates)}.map(n);
        const els = Array.from(card.querySelectorAll('button, [role="button"], [role="menuitem"], a')).filter((e) => visible(e) && !e.disabled && e.getAttribute('aria-disabled') !== 'true');
        for (const w of wanted) {
          const el = els.find((e) => { const t = n(e.innerText || e.textContent); const a = n(e.getAttribute('aria-label')); return t === w || a === w || t.startsWith(w + ' ') || a.startsWith(w + ' '); });
          if (el) { el.click(); return true; }
        }
        return false;
      })()`,
      false,
    )
    .catch(() => false);
}

/**
 * Find and click a management control for an ad: on the current (ad) page, then
 * behind an overflow menu, then in the ad's OWN card on « mes annonces » (with
 * its card menu). Never a page-wide click on the list: that could hit another ad.
 */
export async function clickManageControl(cdp: CDPClient, adId: string, button: ButtonSelector): Promise<boolean> {
  if (await clickButtonOrMenu(cdp, button, MANAGE.overflowMenu)) return true;
  await navigate(cdp, MANAGE.listingUrl);
  if (await clickInAdCard(cdp, adId, button)) return true;
  // The card may hide its actions behind its own « … » menu, rendered as a popup.
  if (!(await clickInAdCard(cdp, adId, MANAGE.overflowMenu))) return false;
  await delay(600);
  return clickInOpenMenu(cdp, button);
}

/** Click `button` inside a currently open menu/popup only (role=menu / listbox / dialog). */
async function clickInOpenMenu(cdp: CDPClient, button: ButtonSelector): Promise<boolean> {
  return cdp
    .evaluate<boolean>(
      `(() => {
        const n = (s) => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const visible = (el) => !!(el.offsetParent !== null || (el.getClientRects && el.getClientRects().length));
        const menus = Array.from(document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"]')).filter(visible);
        const wanted = ${JSON.stringify(button.textCandidates)}.map(n);
        for (const m of menus) {
          const els = Array.from(m.querySelectorAll('button, [role="menuitem"], [role="option"], a')).filter(visible);
          for (const w of wanted) {
            const el = els.find((e) => n(e.innerText || e.textContent) === w || n(e.getAttribute('aria-label')) === w);
            if (el) { el.click(); return true; }
          }
        }
        return false;
      })()`,
      false,
    )
    .catch(() => false);
}

/** Click a confirmation control if a confirmation dialog shows up (optional step). */
export async function confirmIfAsked(cdp: CDPClient, confirm: ButtonSelector, waitMs = 1_500): Promise<boolean> {
  await delay(waitMs);
  const clicked = await clickButton(cdp, confirm);
  if (clicked) await delay(waitMs);
  return clicked;
}

export interface OutcomeProof {
  /** Whole-phrase page markers proving the action happened. */
  markers: string[];
  /** A control that only exists once the action happened (e.g. « Réactiver » after a pause). */
  flippedTo?: ButtonSelector;
  /** Re-open this URL and look for `goneMarkers` (delete: the ad page must be gone). */
  reloadUrl?: string;
  goneMarkers?: string[];
}

/** Evidence that the site performed the action, or null (= unconfirmed: do NOT change local state). */
export async function proveOutcome(cdp: CDPClient, proof: OutcomeProof): Promise<string | null> {
  if (proof.markers.length && (await pageHasText(cdp, proof.markers))) return "confirmation-text";
  if (proof.flippedTo && (await hasButton(cdp, proof.flippedTo))) return "control-flipped";
  if (proof.reloadUrl && proof.goneMarkers?.length) {
    await navigate(cdp, proof.reloadUrl);
    if (await pageHasText(cdp, proof.goneMarkers)) return "ad-page-gone";
  }
  return null;
}
