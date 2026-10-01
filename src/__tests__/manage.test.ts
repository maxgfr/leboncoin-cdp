import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../utils", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, delay: () => Promise.resolve() };
});

import { runDeactivate, runEdit, runMarkSold, runReactivate, runRenew } from "../manage";
import { parseAnnonce, writeAnnonce } from "../markdown";
import type { Annonce } from "../types";
import { adPage, confirmDialog, messagePage } from "./helpers/ad-pages";
import { DomCDP, fixture } from "./helpers/dom-cdp";

const AD_URL = "https://www.leboncoin.fr/ad/informatique/123";

const published: Annonce = {
  slug: "ad",
  title: "MacBook Air M1 2020",
  category: "Ordinateurs",
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
  const root = mkdtempSync(join(tmpdir(), "lbc-manage-"));
  const dir = join(root, "ad");
  mkdirSync(dir, { recursive: true });
  writeAnnonce(dir, { ...published, ...over });
  return { dir, root };
}

/** An ad page whose `control` opens a confirm dialog, then shows `after`. */
function site(control: string, after: string, controls = ["Modifier", "Mettre en pause", "Marquer comme vendu", "Remonter"]) {
  return new DomCDP(adPage({ controls }), {
    url: AD_URL,
    onClick: (label) => {
      if (label === control) return confirmDialog(`${control} ?`);
      if (label === "Confirmer") return after;
      return undefined;
    },
    onNavigate: () => adPage({ controls }),
  });
}

describe("runMarkSold", () => {
  it("clicks the sold flow and transitions published → sold once Leboncoin confirms", async () => {
    const { dir, root } = setup();
    const cdp = site("Marquer comme vendu", messagePage("Votre annonce a été marquée comme vendue."));
    const res = await runMarkSold(root, "ad", { yes: true }, { connect: async () => cdp as never });
    expect(res).toMatchObject({ ok: true, proof: "confirmation-text" });
    const after = parseAnnonce(dir);
    expect(after.status).toBe("sold");
    expect(after.sold_at).toBeTruthy();
  });

  it("does NOT change the status without proof (unconfirmed)", async () => {
    const { dir, root } = setup();
    const cdp = site("Marquer comme vendu", adPage({ controls: ["Modifier", "Marquer comme vendu"] }));
    const res = await runMarkSold(root, "ad", { yes: true }, { connect: async () => cdp as never });
    expect(res).toMatchObject({ ok: false, reason: "unconfirmed" });
    expect(parseAnnonce(dir).status).toBe("published");
    expect(existsSync(join(dir, "manage-unconfirmed.png"))).toBe(true);
  });

  it("aborts (and changes nothing) when the user declines", async () => {
    const { dir, root } = setup();
    const res = await runMarkSold(root, "ad", {}, { connect: async () => site("x", "") as never, confirm: async () => false });
    expect(res.reason).toBe("aborted");
    expect(parseAnnonce(dir).status).toBe("published");
  });

  it("returns login-required (no change) when logged out", async () => {
    const { dir, root } = setup();
    const cdp = new DomCDP("<html><body></body></html>", { url: "https://www.leboncoin.fr/connexion" });
    const res = await runMarkSold(root, "ad", { yes: true }, { connect: async () => cdp as never });
    expect(res.reason).toBe("login-required");
    expect(parseAnnonce(dir).status).toBe("published");
  });

  it("returns action-failed and does NOT change status when the control isn't found", async () => {
    const { dir, root } = setup();
    const res = await runMarkSold(root, "ad", { yes: true }, { connect: async () => site("x", "", ["Modifier"]) as never });
    expect(res).toMatchObject({ ok: false, reason: "action-failed" });
    expect(parseAnnonce(dir).status).toBe("published"); // local state not corrupted
  });
});

describe("runDeactivate / runReactivate", () => {
  it("pauses (proof: « Réactiver » appears), then reactivates (proof: confirmation text)", async () => {
    const { dir, root } = setup();
    const off = await runDeactivate(
      root,
      "ad",
      { yes: true },
      { connect: async () => site("Mettre en pause", adPage({ controls: ["Modifier", "Réactiver"] })) as never },
    );
    expect(off).toMatchObject({ ok: true, proof: "control-flipped" });
    expect(parseAnnonce(dir).status).toBe("paused");
    expect(parseAnnonce(dir).paused_at).toBeTruthy();

    const on = await runReactivate(
      root,
      "ad",
      { yes: true },
      { connect: async () => site("Réactiver", messagePage("Votre annonce a été réactivée."), ["Modifier", "Réactiver"]) as never },
    );
    expect(on.ok).toBe(true);
    expect(parseAnnonce(dir).status).toBe("published");
  });

  it("does not take the « Mettre en pause » button itself as proof of a pause", async () => {
    const { dir, root } = setup();
    const res = await runDeactivate(
      root,
      "ad",
      { yes: true },
      { connect: async () => site("Mettre en pause", adPage({ controls: ["Mettre en pause"] })) as never },
    );
    expect(res.reason).toBe("unconfirmed");
    expect(parseAnnonce(dir).status).toBe("published");
  });

  it("refuses to reactivate an ad that is not paused", async () => {
    const { root } = setup(); // status published
    await expect(runReactivate(root, "ad", { yes: true }, { connect: async () => site("x", "") as never })).rejects.toThrow(/expected paused/);
  });
});

describe("runRenew", () => {
  it("bumps a published ad without changing its status", async () => {
    const { dir, root } = setup();
    const cdp = site("Remonter", messagePage("ok"));
    const res = await runRenew(root, "ad", { yes: true }, { connect: async () => cdp as never });
    expect(res.ok).toBe(true);
    expect(cdp.clicks).toContain("Remonter");
    expect(parseAnnonce(dir).status).toBe("published");
  });
});

describe("runEdit", () => {
  function editSite() {
    const state = { saved: false };
    const cdp = new DomCDP(adPage({ controls: ["Modifier", "Supprimer"] }), {
      url: AD_URL,
      onClick: (label) => {
        if (label === "Modifier") return fixture("deposit-step-3-review.html");
        if (label === "Continuer") state.saved = true;
        return undefined;
      },
    });
    return { cdp, state };
  }

  it("opens the modify form, re-fills it by meaning, screenshots, and submits with --yes", async () => {
    const { dir, root } = setup();
    const { cdp, state } = editSite();
    const res = await runEdit(root, "ad", { yes: true }, { connect: async () => cdp as never });
    expect(res.ok).toBe(true);
    expect(state.saved).toBe(true);
    expect((cdp.document.querySelector('[name="price_cents"]') as HTMLInputElement).value).toBe("650");
    expect(cdp.uploaded).toHaveLength(0); // photos are never re-uploaded on edit
    expect(existsSync(join(dir, "edit-preview.png"))).toBe(true);
    expect(parseAnnonce(dir).status).toBe("published"); // edit keeps it published
  });

  it("semi-auto edit prefills but never saves", async () => {
    const { root } = setup();
    const { cdp, state } = editSite();
    const res = await runEdit(root, "ad", {}, { connect: async () => cdp as never });
    expect(res.ok).toBe(true);
    expect(state.saved).toBe(false);
  });

  it("returns action-failed when the modify form never opens (does not fill the wrong page)", async () => {
    const { root } = setup();
    const cdp = new DomCDP(adPage({ controls: [] }), { url: AD_URL });
    const res = await runEdit(root, "ad", { yes: true }, { connect: async () => cdp as never });
    expect(res).toMatchObject({ ok: false, reason: "action-failed" });
  });
});
