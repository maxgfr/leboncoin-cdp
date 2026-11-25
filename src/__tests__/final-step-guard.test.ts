import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../utils", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, delay: () => Promise.resolve() };
});

import { clickNextStep, finalReviewSignals, isOnFinalStep, runWizard } from "../deposit-wizard";
import { runDoctor } from "../doctor";
import { introspectForm } from "../form-introspect";
import { runInspect } from "../inspect";
import { writeAnnonce } from "../markdown";
import { runPublish } from "../publish";
import { DEPOSIT } from "../selectors";
import type { Annonce } from "../types";
import { DomCDP, fixture } from "./helpers/dom-cdp";

const STEP3 = fixture("deposit-step-3-live.html");
/** The same final step with straight apostrophes / quotes (the site has used both). */
const STEP3_STRAIGHT = STEP3.replace(/’/g, "'").replace(/[“”]/g, '"');

const annonce: Annonce = {
  slug: "ad",
  title: "MacBook Air M1 2020 — 256 Go, très bon état",
  category: "Ordinateurs",
  price: 650,
  zipcode: "75012",
  city: "Paris",
  address: "10 rue de Lyon, 75012 Paris",
  condition: "Très bon état",
  shipping: true,
  attributes: { brand: "Apple", "Taille d'écran": "12 à 14" },
  photos: ["macbook.jpg"],
  status: "draft",
  description: "MacBook Air M1 (2020), 8 Go de RAM, 256 Go.\nTrès bon état, batterie à 92 %.\nParis 12e — remise en main propre ou envoi possible.",
};

/** A final-step page whose « Continuer » would PUBLISH: records every attempt. */
function finalPage(html: string) {
  const state = { submitted: 0 };
  const cdp = new DomCDP(html, {
    onClick: (label) => {
      if (label === "Continuer") state.submitted++;
      return undefined;
    },
  });
  withGeocoder(cdp);
  return { cdp, state };
}

describe("final-step detection (step 3 of the live wizard, 2026-11)", () => {
  for (const [name, html] of [
    ["typographic apostrophes (’)", STEP3],
    ["straight apostrophes (')", STEP3_STRAIGHT],
  ] as const) {
    it(`recognises the final step with ${name}: by its fields, by its heading and by its footer`, async () => {
      const map = await introspectForm(new DomCDP(html) as never);
      expect(finalReviewSignals(map).sort()).toEqual(["description", "location", "price"]);
      // Each text marker alone is enough (heading, « je confirme l'exactitude » footer).
      const noFields = html.replace(/<form[\s\S]*?<article>/, "<div><article>").replace(/<(input|textarea)\b[^>]*>(<\/textarea>)?/g, "");
      expect(await isOnFinalStep(new DomCDP(noFields) as never)).toBe(true);
      const footerOnly = noFields.replace(/Un dernier aperçu avant de publier votre annonce !/, "Vérifiez");
      expect(await isOnFinalStep(new DomCDP(footerOnly) as never)).toBe(true);
    });

    it(`runWizard fills the final step (${name}) and stops ON it, never clicking « Continuer »`, async () => {
      const { cdp, state } = finalPage(html);
      const r = await runWizard(cdp as never, annonce, { photos: [] });
      expect(r.stop).toBe("final");
      expect(r.steps).toHaveLength(1);
      expect(r.steps[0]?.final).toBe(true);
      expect(state.submitted).toBe(0);
      expect(cdp.clicks).not.toContain("Continuer");
    });
  }

  it("stops on a single final-step field even when the heading and footer are reworded", async () => {
    const reworded = STEP3.replace(/Un dernier aperçu avant de publier votre annonce !/, "Récapitulatif").replace(/je confirme l’exactitude/, "j’atteste");
    for (const keep of ["price_cents", "body", "location"]) {
      // Only ONE of description / price / address left on the step.
      let html = reworded;
      for (const name of ["price_cents", "body", "location"].filter((n) => n !== keep)) {
        html = html.replace(new RegExp(`<div data-rhf-name="${name}">[\\s\\S]*?\\n</div>\\n(?=<div data-rhf-name=)`), "");
      }
      const { cdp, state } = finalPage(html);
      expect(await isOnFinalStep(cdp as never)).toBe(true);
      const r = await runWizard(cdp as never, annonce, { photos: [] });
      expect(r.stop).toBe("final");
      expect(state.submitted).toBe(0);
    }
  });

  it("clickNextStep refuses on the final step and clicks on an earlier one", async () => {
    const { cdp, state } = finalPage(STEP3);
    expect(await clickNextStep(cdp as never, DEPOSIT.nextButton)).toBe("final");
    expect(state.submitted).toBe(0);
    const step2 = new DomCDP(fixture("deposit-step-2-live.html"));
    expect(await clickNextStep(step2 as never, DEPOSIT.nextButton)).toBe("clicked");
    expect(step2.clicks).toContain("Continuer");
  });
});

/** The live wizard, 2026-11: the category attributes only render once the photo is in. */
const STEP2 = fixture("deposit-step-2-live.html");
const STEP2_BEFORE_UPLOAD =
  STEP2.slice(0, STEP2.indexOf('<div data-rhf-name="adparams_prediction_status">')) +
  STEP2.slice(STEP2.indexOf('<div>\n<div>\n<button type="button" aria-busy="false" aria-live="off">Retour</button>'));

/** The delivery block, as it renders once an address is picked (« Désactiver la livraison » = currently on). */
const SHIPPING_BLOCK = `<div data-rhf-name="shipping">
<p>En livraison</p>
<button type="button" role="checkbox" aria-checked="true" data-state="checked" value="on" aria-label="Désactiver la livraison"><span></span></button>
<span>Activer la livraison</span>
<button type="button" aria-label="Modifier les transporteurs"></button>
<p>En main propre</p>
</div>`;

/**
 * The address geocoder: suggestions arrive a moment after typing; picking one
 * renders the delivery block. « Géolocaliser » must never be clicked.
 */
function withGeocoder(cdp: DomCDP): void {
  const input = cdp.document.querySelector('input[name="location"]') as HTMLInputElement | null;
  const listbox = input && cdp.document.getElementById(input.getAttribute("aria-controls") as string);
  if (!input || !listbox) return;
  listbox.addEventListener("click", () => {
    if (!cdp.document.querySelector('[data-rhf-name="shipping"]'))
      cdp.document.querySelector('[data-rhf-name="address_banner_id"]')?.insertAdjacentHTML("afterend", SHIPPING_BLOCK);
  });
  input.addEventListener("input", () => {
    const typed = input.value;
    setTimeout(() => {
      listbox.innerHTML = /lyon/i.test(typed)
        ? ["1 Rue de Lyon, Paris (75012)", "10 Rue de Lyon, Paris (75012)", "10 Rue de Lyon, Vaulx-en-Velin (69120)"]
            .map((o) => `<li role="option">${o}</li>`)
            .join("")
        : "";
    }, 300);
  });
}

function liveWizard() {
  const state = { page: "step1", submitted: false };
  const cdp = new DomCDP(fixture("deposit-step-1-suggest.html"), {
    onClick: (label, _el, self) => {
      if (/géolocaliser/i.test(label)) throw new Error("clicked « Géolocaliser ma position »");
      if (state.page === "step1" && /^Choix \d/.test(label)) {
        state.page = "step2";
        return STEP2_BEFORE_UPLOAD;
      }
      if (label === "Continuer" && state.page === "step2") {
        state.page = "step3";
        self.load(STEP3);
        withGeocoder(self);
        return undefined;
      }
      if (label === "Continuer" && state.page === "step3") state.submitted = true;
      return undefined;
    },
    onUpload: () => (state.page === "step2" ? STEP2 : undefined),
  });
  return { cdp, state };
}

describe("runWizard over the live 2026-11 wizard", () => {
  it("fills attributes that render after the upload, sets « État », replaces the AI description, sets price + address, stops on the final step", async () => {
    const { cdp, state } = liveWizard();
    const r = await runWizard(cdp as never, annonce, { photos: ["/p/macbook.jpg"] });

    expect(r.stop).toBe("final");
    expect(state.page).toBe("step3");
    expect(state.submitted).toBe(false);
    expect(r.steps.map((s) => s.final)).toEqual([false, false, true]);

    const step2 = r.steps[1]?.fills ?? [];
    expect(step2.find((f) => f.target === "condition")).toMatchObject({ ok: true, detail: "Très bon état" });
    // Leboncoin's prefill already matches the annonce: left alone, reported "prefilled".
    expect(step2.find((f) => f.target === "attr:brand")).toMatchObject({ ok: true, detail: "prefilled" });
    expect(step2.find((f) => f.target === "attr:Taille d'écran")).toMatchObject({ ok: true, detail: "prefilled" });
    // Prefilled values the annonce says nothing about are surfaced for the user.
    expect(r.prefilled).toEqual(expect.arrayContaining(["« Type » = « Portable »", "« Usage » = « Polyvalent »"]));
    expect(r.unmatchedAttributes).toEqual([]);

    const doc = cdp.document;
    expect((doc.querySelector('[name="body"]') as HTMLTextAreaElement).value).toBe(annonce.description);
    expect((doc.querySelector('[name="price_cents"]') as HTMLInputElement).value).toBe("650");
    expect((doc.querySelector('[name="location"]') as HTMLInputElement).value).toBe("10 Rue de Lyon, Paris (75012)");
    expect(doc.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toContain("Je vends");
    expect(r.written).toEqual(
      expect.arrayContaining(["title", "category", "photos", "condition", "attr:brand", "attr:Taille d'écran", "description", "price", "location", "shipping"]),
    );
    expect(r.failed).toEqual([]);
  });

  it("overwrites a prefilled attribute that differs from the annonce", async () => {
    const { cdp } = liveWizard();
    const r = await runWizard(cdp as never, { ...annonce, attributes: { ...annonce.attributes, Usage: "Bureautique" } }, { photos: ["/p/macbook.jpg"] });
    expect(r.steps[1]?.fills.find((f) => f.target === "attr:Usage")).toMatchObject({ ok: true, detail: "Bureautique" });
    expect(r.prefilled).not.toContain("« Usage » = « Polyvalent »");
  });

  it("sets the delivery block that renders after the address (shipping: false → « Activer la livraison »)", async () => {
    const { cdp } = liveWizard();
    const r = await runWizard(cdp as never, { ...annonce, shipping: false }, { photos: ["/p/macbook.jpg"] });
    expect(r.stop).toBe("final");
    expect(r.written).toContain("shipping");
    expect(cdp.document.querySelector('[data-rhf-name="shipping"] [role="checkbox"]')?.getAttribute("aria-checked")).toBe("false");
  });

  it("stops on « État » (missing-required) when the annonce has no condition", async () => {
    const { cdp, state } = liveWizard();
    const r = await runWizard(cdp as never, { ...annonce, condition: undefined }, { photos: ["/p/macbook.jpg"] });
    expect(r.stop).toBe("missing-required");
    expect(state.page).toBe("step2");
    expect(r.steps.at(-1)?.unresolvedRequired.join(" ")).toMatch(/^État/);
  });
});

describe("no mode ever clicks the final « Continuer » (only --yes, from the final step)", () => {
  function setup(over: Partial<Annonce> = {}): string {
    const root = mkdtempSync(join(tmpdir(), "lbc-guard-"));
    const dir = join(root, "ad");
    mkdirSync(join(dir, "photos"), { recursive: true });
    writeFileSync(join(dir, "photos", "macbook.jpg"), "");
    writeAnnonce(dir, { ...annonce, ...over });
    return root;
  }

  for (const [mode, opts] of [
    ["--diagnostic", { diagnostic: true }],
    ["--diagnostic --shots", { diagnostic: true, shots: true }],
    ["--dry-run", { dryRun: true }],
    ["semi-auto (default)", { timeoutSubmitMs: 10 }],
    ["--strict", { strict: true, timeoutSubmitMs: 10 }],
  ] as const) {
    it(`publish ${mode}: parks on the final step, submits nothing`, async () => {
      const root = setup();
      const { cdp, state } = liveWizard();
      const res = await runPublish(root, "ad", opts, { connect: async () => cdp as never });
      expect(res.ok).toBe(false);
      expect(res.report?.wizard?.stop).toBe("final");
      expect(state.submitted).toBe(false);
    });
  }

  it("publish --diagnostic: readiness is READY on the complete annonce; without an address it is blocked by `address` only", async () => {
    const full = await runPublish(setup(), "ad", { diagnostic: true }, { connect: async () => liveWizard().cdp as never });
    expect(full.report?.readiness?.blockers).toEqual([]);
    expect(full.report?.missing).toEqual([]);

    const { cdp, state } = liveWizard();
    const noAddr = await runPublish(setup({ address: undefined }), "ad", { diagnostic: true }, { connect: async () => cdp as never });
    expect(state.submitted).toBe(false);
    expect(noAddr.missing).toEqual([expect.stringMatching(/^address \(missing in annonce/)]);
    expect(noAddr.report?.readiness?.blockers).toEqual([expect.stringMatching(/^required-fields \(missing: address\)/)]);
    expect((cdp.document.querySelector('[name="location"]') as HTMLInputElement).value).toBe(""); // nothing typed, nothing geolocated
  });

  it("publish --yes submits exactly once, from the final step", async () => {
    const { cdp, state } = liveWizard();
    const res = await runPublish(setup(), "ad", { yes: true, timeoutSubmitMs: 10 }, { connect: async () => cdp as never });
    expect(state.submitted).toBe(true);
    expect(cdp.clicks.filter((c) => c === "Continuer")).toHaveLength(2); // step 2 → 3, then the --yes submit
    expect(res.report?.wizard?.stop).toBe("final");
  });

  it("doctor (no slug): walks to the final step with the bundled photo and submits nothing", async () => {
    const out = join(mkdtempSync(join(tmpdir(), "lbc-guard-doc-")), "r.json");
    const state = { page: "", submitted: false };
    const cdp = new DomCDP('<html><body><a href="/account/private/home" aria-label="Mon compte">M</a></body></html>', {
      onNavigate: (url) => {
        if (url.includes("/deposer-une-annonce")) {
          state.page = "step1";
          return fixture("deposit-step-1-suggest.html");
        }
        return "<html><body></body></html>";
      },
      onClick: (label, _el, self) => {
        if (state.page === "step1" && /^Choix \d/.test(label)) {
          state.page = "step2";
          return STEP2_BEFORE_UPLOAD;
        }
        if (label === "Continuer" && state.page === "step2") {
          state.page = "step3";
          self.load(STEP3);
          return undefined;
        }
        if (label === "Continuer" && state.page === "step3") state.submitted = true;
        return undefined;
      },
      onUpload: () => (state.page === "step2" ? STEP2 : undefined),
    });
    const r = await runDoctor({ out }, { connect: async () => cdp as never });
    expect(r.deposit?.stop).toBe("final");
    expect(state.page).toBe("step3");
    expect(state.submitted).toBe(false);
    expect(r.checks.find((c) => c.name === "deposit")?.ok).toBe(true);
  });

  it("inspect: reads the final step, clicks nothing", async () => {
    const root = mkdtempSync(join(tmpdir(), "lbc-guard-insp-"));
    const { cdp, state } = finalPage(`${STEP3.replace("</body>", '<a href="/account/private/home" aria-label="Mon compte">M</a></body>')}`);
    const r = await runInspect(root, "ad", {}, { connect: async () => cdp as never });
    expect(r.ok).toBe(true);
    expect(state.submitted).toBe(0);
    expect(cdp.clicks).toEqual([]);
  });
});
