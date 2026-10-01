import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../utils", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, delay: () => Promise.resolve() };
});

import { runDelete } from "../delete";
import { parseAnnonce, writeAnnonce } from "../markdown";
import type { Annonce } from "../types";
import { adPage, confirmDialog, messagePage, myAdsPage } from "./helpers/ad-pages";
import { DomCDP } from "./helpers/dom-cdp";

const AD_URL = "https://www.leboncoin.fr/ad/informatique/123";

const published: Annonce = {
  slug: "ad",
  title: "MacBook Air M1 2020",
  category: "Informatique",
  price: 650,
  zipcode: "75012",
  attributes: {},
  photos: [],
  status: "published",
  leboncoin_id: "123",
  leboncoin_url: AD_URL,
  description: "MacBook Air M1, très bon état.",
};

function setup(over: Partial<Annonce> = {}): { dir: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "lbc-del-"));
  const dir = join(root, "ad");
  mkdirSync(dir, { recursive: true });
  writeAnnonce(dir, { ...published, ...over });
  return { dir, root };
}

/** Ad page → « Supprimer » → confirm dialog → `after` page. */
function site(opts: { after?: string; adPageAfter?: string; start?: string; listing?: string } = {}) {
  return new DomCDP(opts.start ?? adPage({ controls: ["Modifier", "Supprimer"] }), {
    url: AD_URL,
    onClick: (label) => {
      if (label === "Supprimer") return confirmDialog("Supprimer cette annonce ?");
      if (label === "Confirmer") return opts.after ?? messagePage("Votre annonce a bien été supprimée.");
      return undefined;
    },
    onNavigate: (url) =>
      url.includes("/compte/part/mes-annonces") ? opts.listing : url === AD_URL ? (opts.adPageAfter ?? adPage({ controls: ["Supprimer"] })) : undefined,
  });
}

describe("runDelete", () => {
  it("clicks delete + confirm and marks deleted once Leboncoin confirms", async () => {
    const { dir, root } = setup();
    const cdp = site();
    const res = await runDelete(root, "ad", {}, { connect: async () => cdp as never, confirm: async () => true });
    expect(res).toMatchObject({ ok: true, proof: "confirmation-text" });
    expect(cdp.clicks).toEqual(["Supprimer", "Confirmer"]);
    const after = parseAnnonce(dir);
    expect(after.status).toBe("deleted");
    expect(after.deleted_at).toBeTruthy();
  });

  it("accepts the reloaded ad page being gone as proof", async () => {
    const { dir, root } = setup();
    const cdp = site({ after: messagePage("…"), adPageAfter: messagePage("Cette annonce n’est plus disponible.") });
    const res = await runDelete(root, "ad", { yes: true }, { connect: async () => cdp as never });
    expect(res).toMatchObject({ ok: true, proof: "ad-page-gone" });
    expect(parseAnnonce(dir).status).toBe("deleted");
  });

  it("leaves the annonce published (unconfirmed) when there is no proof", async () => {
    const { dir, root } = setup();
    const cdp = site({ after: messagePage("Une erreur est survenue") });
    const res = await runDelete(root, "ad", { yes: true }, { connect: async () => cdp as never });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("unconfirmed");
    expect(parseAnnonce(dir).status).toBe("published");
  });

  it("finds « Supprimer » behind the « … » menu", async () => {
    const { dir, root } = setup();
    const cdp = new DomCDP(adPage({ controls: ["Modifier"], menu: ["Supprimer", "Mettre en pause"] }), {
      url: AD_URL,
      onClick: (label) => {
        if (label === "Plus d'actions") return adPage({ controls: ["Modifier"], menu: ["Supprimer", "Mettre en pause"], menuOpen: true });
        if (label === "Supprimer") return confirmDialog("Supprimer cette annonce ?");
        if (label === "Confirmer") return messagePage("Votre annonce a bien été supprimée.");
        return undefined;
      },
    });
    const res = await runDelete(root, "ad", { yes: true }, { connect: async () => cdp as never });
    expect(res.ok).toBe(true);
    expect(cdp.clicks).toEqual(["Plus d'actions", "Supprimer", "Confirmer"]);
    expect(parseAnnonce(dir).status).toBe("deleted");
  });

  it("falls back to the ad's own card on « mes annonces » (never another ad's button)", async () => {
    const { dir, root } = setup();
    const cdp = site({ start: adPage({ controls: ["Modifier"] }), listing: myAdsPage("123", ["Modifier", "Supprimer"]) });
    const res = await runDelete(root, "ad", { yes: true }, { connect: async () => cdp as never });
    expect(res.ok).toBe(true);
    expect(parseAnnonce(dir).status).toBe("deleted");
  });

  it("aborts when the user declines and leaves the annonce published", async () => {
    const { dir, root } = setup();
    const cdp = site();
    const res = await runDelete(root, "ad", {}, { connect: async () => cdp as never, confirm: async () => false });
    expect(res).toMatchObject({ ok: false, reason: "aborted" });
    expect(cdp.clicks).toHaveLength(0);
    expect(parseAnnonce(dir).status).toBe("published");
  });

  it("skips the prompt with --yes", async () => {
    const { root } = setup();
    const confirm = vi.fn(async () => true);
    const res = await runDelete(root, "ad", { yes: true }, { connect: async () => site() as never, confirm });
    expect(res.ok).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("returns login-required (and deletes nothing) when the session is logged out", async () => {
    const { dir, root } = setup();
    const cdp = new DomCDP("<html><body>Connexion</body></html>", { url: "https://auth.leboncoin.fr/login/?client_id=x" });
    const res = await runDelete(root, "ad", { yes: true }, { connect: async () => cdp as never });
    expect(res).toMatchObject({ ok: false, reason: "login-required" });
    expect(cdp.clicks).toHaveLength(0);
    expect(parseAnnonce(dir).status).toBe("published");
  });

  it("returns control-not-found (and leaves it published) when no delete control exists anywhere", async () => {
    const { dir, root } = setup();
    const cdp = site({ start: adPage({ controls: ["Modifier"] }), listing: myAdsPage("123", ["Modifier"]) });
    const res = await runDelete(root, "ad", { yes: true }, { connect: async () => cdp as never });
    expect(res).toMatchObject({ ok: false, reason: "control-not-found" });
    expect(parseAnnonce(dir).status).toBe("published");
  });

  it("refuses to delete an annonce that was never published", async () => {
    const { root } = setup({ status: "draft", leboncoin_id: undefined, leboncoin_url: undefined });
    await expect(runDelete(root, "ad", { yes: true }, { connect: async () => site() as never })).rejects.toThrow(/not published/);
  });
});
