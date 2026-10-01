import { describe, expect, it, vi } from "vitest";

vi.mock("../utils", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, delay: () => Promise.resolve() };
});

import { checkLogin } from "../auth";
import { DomCDP } from "./helpers/dom-cdp";

/**
 * Headers as served live on 2026-10-01. Regression: the previous markers
 * (/mes-annonces, /messagerie, /favoris…) matched NEITHER state, so a logged-in
 * Brave session was reported as "not logged in". /favorites, /messages and
 * /my-searches are present in BOTH states and must not count as a signal.
 */
const shared = `<a href="/deposer-une-annonce">Déposer une annonce</a><a href="/my-searches" aria-label="Mes recherches">Mes recherches</a>
  <a href="/favorites" aria-label="Favoris">Favoris</a><a href="/messages" aria-label="Messages">Messages</a>`;
const loggedInHeader = `<html><body><header>${shared}<a href="/account/private/home" aria-label="Mon compte">M Maxime</a></header><main>Favoris</main></body></html>`;
const loggedOutHeader = `<html><body><header>${shared}<button type="button" aria-label="Se connecter">Se connecter</button></header><main>Accueil</main></body></html>`;

describe("checkLogin against the live header", () => {
  it("recognises the logged-in header (account link)", async () => {
    const s = await checkLogin(new DomCDP(loggedInHeader, { url: "https://www.leboncoin.fr/favorites" }) as never);
    expect(s.loggedIn).toBe(true);
    expect(s.signals.join(" ")).toContain("/account/private");
  });

  it("recognises the logged-out header (« Se connecter ») as confidently logged out", async () => {
    const s = await checkLogin(new DomCDP(loggedOutHeader, { url: "https://www.leboncoin.fr/" }) as never);
    expect(s.loggedIn).toBe(false);
    expect(s.loggedOut).toBe(true);
  });

  it("treats the auth.leboncoin.fr login / « Sécurisons votre compte » page as logged out", async () => {
    const page = `<html><body><h1>Sécurisons votre compte</h1></body></html>`;
    const s = await checkLogin(new DomCDP(page, { url: "https://auth.leboncoin.fr/login/??client_id=lbc-front-web" }) as never);
    expect(s.loggedOut).toBe(true);
  });

  it("stays inconclusive (not logged out) on a page with neither signal", async () => {
    const s = await checkLogin(new DomCDP(`<html><body><main>Déposer une annonce</main></body></html>`) as never);
    expect(s.loggedIn).toBe(false);
    expect(s.loggedOut).toBe(false);
  });
});
