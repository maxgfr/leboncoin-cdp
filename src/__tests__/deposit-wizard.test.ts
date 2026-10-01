import { describe, expect, it, vi } from "vitest";

vi.mock("../utils", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, delay: () => Promise.resolve() };
});

import { runWizard } from "../deposit-wizard";
import type { Annonce } from "../types";
import { DomCDP, fixture } from "./helpers/dom-cdp";

const annonce: Annonce = {
  slug: "ad",
  title: "MacBook Air M1 2020 256 Go",
  category: "Vélos",
  price: 650,
  zipcode: "75012",
  city: "Paris",
  condition: "Très bon état",
  shipping: true,
  attributes: { brand: "Apple", storage: "256 Go" },
  photos: [],
  status: "draft",
  description: "MacBook Air M1, très bon état, batterie 92 %.",
};

/**
 * A scripted wizard over the real captured pages: picking a category card
 * advances to step 2 (like the site), « Continuer » on step 2 goes to the final
 * review, and « Continuer » on the review would SUBMIT — the test fails if the
 * engine ever clicks it.
 */
function liveWizard(opts: { step2Next?: boolean } = {}) {
  const state = { page: "step1", submitted: false };
  const cdp = new DomCDP(fixture("deposit-step-1-suggest.html"), {
    onClick: (label) => {
      if (state.page === "step1" && /^Choix \d/.test(label)) {
        state.page = "step2";
        return fixture("deposit-step-2.html");
      }
      if (label === "Continuer" && state.page === "step2" && opts.step2Next !== false) {
        state.page = "step3";
        return fixture("deposit-step-3-review.html");
      }
      if (label === "Continuer" && state.page === "step3") state.submitted = true;
      return undefined;
    },
  });
  return { cdp, state };
}

describe("runWizard over the live deposit wizard", () => {
  it("fills every step, picks the category, uploads photos, and stops ON the final step without submitting", async () => {
    const { cdp, state } = liveWizard();
    const r = await runWizard(cdp as never, annonce, { photos: ["/p/1.jpg", "/p/2.jpg"] });

    expect(r.stop).toBe("final");
    expect(state.page).toBe("step3");
    expect(state.submitted).toBe(false); // never clicked the final « Continuer »
    expect(r.steps.map((s) => s.final)).toEqual([false, false, true]);

    expect(r.category).toMatchObject({ picked: "Vélos", family: "Loisirs", guessed: false });
    expect(r.uploadedPhotos).toBe(2);
    expect(r.written).toEqual(
      expect.arrayContaining(["title", "category", "photos", "condition", "attr:brand", "description", "price", "location", "shipping"]),
    );
    expect(r.unmatchedAttributes).toEqual(["storage"]);

    // The final review now holds the annonce's values, not the site's defaults.
    expect((cdp.document.querySelector('[name="price_cents"]') as HTMLInputElement).value).toBe("650");
    expect((cdp.document.querySelector('[name="subject"]') as HTMLInputElement).value).toBe(annonce.title);
    expect((cdp.document.querySelector('[name="body"]') as HTMLTextAreaElement).value).toBe(annonce.description);
  });

  it("flags the category as guessed when the annonce's category is not offered", async () => {
    const { cdp } = liveWizard();
    const r = await runWizard(cdp as never, { ...annonce, category: "Informatique" }, { photos: ["/p/1.jpg"] });
    expect(r.category).toMatchObject({ picked: "Vélos", guessed: true });
  });

  it("stops with missing-required (photos) instead of pushing on", async () => {
    const { cdp, state } = liveWizard();
    const r = await runWizard(cdp as never, annonce, { photos: [] });
    expect(r.stop).toBe("missing-required");
    expect(state.page).toBe("step2");
    expect(r.steps.at(-1)?.unresolvedRequired.join(" ")).toMatch(/photos/i);
  });

  it("stops as stuck (with the form error) when « Continuer » does not move the wizard", async () => {
    const { cdp } = liveWizard({ step2Next: false });
    const r = await runWizard(cdp as never, annonce, { photos: ["/p/1.jpg"] });
    expect(r.stop).toBe("stuck");
    expect(r.error).toBeTruthy();
  });

  it("stops with login-required on a login redirect", async () => {
    const cdp = new DomCDP("<html><body><h1>Connexion</h1></body></html>", { url: "https://auth.leboncoin.fr/login/?client_id=lbc" });
    const r = await runWizard(cdp as never, annonce, { photos: [] });
    expect(r.stop).toBe("login-required");
  });

  it("opens the category tree when no suggestion is shown, and picks the leaf", async () => {
    let tree = false;
    const noSuggest = fixture("deposit-step-1-suggest.html").replace(/aria-label="Choix \d[^"]*"/g, "");
    const cdp = new DomCDP(noSuggest.replace("</form>", '<button type="button">Choisissez</button></form>'), {
      onClick: (label) => {
        if (label === "Choisissez") {
          tree = true;
          return fixture("deposit-category-dialog.html");
        }
        if (/^Catégorie Ordinateurs/.test(label)) return fixture("deposit-step-2.html");
        return undefined;
      },
    });
    const r = await runWizard(cdp as never, { ...annonce, category: "Ordinateurs" }, { photos: [] });
    expect(tree).toBe(true);
    expect(r.category).toMatchObject({ picked: "Ordinateurs", family: "Électronique", guessed: false });
  });

  it("is bounded by maxSteps", async () => {
    let n = 0;
    const page = (i: number) =>
      `<html><body><main><h2 id="step-title">Étape ${i}</h2><form><input name="f${i}"><button type="submit">Continuer</button></form></main></body></html>`;
    const cdp = new DomCDP(page(0), { onClick: (l) => (l === "Continuer" ? page(++n) : undefined) });
    const r = await runWizard(cdp as never, annonce, { photos: [], maxSteps: 4 });
    expect(r.stop).toBe("max-steps");
    expect(r.steps).toHaveLength(4);
  });
});
