import { describe, expect, it, vi } from "vitest";

vi.mock("../utils", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, delay: () => Promise.resolve() };
});

import { clickButton, clickByText, fillField, hasButton, pageHasText, uploadPhotos } from "../deposit-form";
import { introspectForm } from "../form-introspect";
import { DEPOSIT } from "../selectors";
import { DomCDP, fixture } from "./helpers/dom-cdp";

async function field(cdp: DomCDP, pred: (f: Awaited<ReturnType<typeof introspectForm>>["fields"][number]) => boolean) {
  const map = await introspectForm(cdp as never);
  const f = map.fields.find(pred);
  if (!f) throw new Error("field not found");
  return f;
}

describe("fillField on the live wizard markup", () => {
  it("types into a React text input / textarea (native setter)", async () => {
    const cdp = new DomCDP(fixture("deposit-step-3-review.html"));
    const price = await field(cdp, (f) => f.name === "price_cents");
    expect(await fillField(cdp as never, price, "650")).toMatchObject({ ok: true });
    expect((cdp.document.querySelector('[name="price_cents"]') as HTMLInputElement).value).toBe("650");

    const body = await field(cdp, (f) => f.name === "body");
    expect((await fillField(cdp as never, body, "Très bon état.\nBatterie 92 %.")).ok).toBe(true);
  });

  it("picks an ARIA combobox option by its label (État → Très bon état)", async () => {
    const cdp = new DomCDP(fixture("deposit-step-2.html"));
    const etat = await field(cdp, (f) => f.rhfName === "condition");
    const r = await fillField(cdp as never, etat, "tres bon etat");
    expect(r).toMatchObject({ ok: true, detail: "Très bon état" });
    expect(cdp.clicks).toContain("Très bon état");
  });

  it("reports no-option (and the choices) when the value is not offered", async () => {
    const cdp = new DomCDP(fixture("deposit-step-2.html"));
    const brand = await field(cdp, (f) => f.rhfName === "computer_brand");
    const r = await fillField(cdp as never, brand, "Commodore");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no-option");
    expect(r.detail).toContain("Apple");
  });

  it("clicks the matching option of a radio group (Je donne)", async () => {
    const cdp = new DomCDP(fixture("deposit-step-3-review.html"));
    const group = await field(cdp, (f) => f.type === "radiogroup");
    expect((await fillField(cdp as never, group, "Je donne")).ok).toBe(true);
    const checked = cdp.document.querySelector('[role="radio"][aria-checked="true"]');
    expect(checked?.textContent).toContain("Je donne");
  });

  it("only toggles a checkbox / switch when its state differs", async () => {
    const cdp = new DomCDP(fixture("deposit-step-3-review.html"));
    const ship = await field(cdp, (f) => f.rhfName === "shipping");
    expect(ship.checked).toBe(true);
    await fillField(cdp as never, ship, "true");
    expect(cdp.clicks).toHaveLength(0); // already on → untouched
    expect((await fillField(cdp as never, ship, "false")).ok).toBe(true);
    expect(cdp.document.querySelector('[data-rhf-name="shipping"] [role="checkbox"]')?.getAttribute("aria-checked")).toBe("false");
  });
});

describe("uploadPhotos verifies by thumbnails (the input is cleared by React)", () => {
  it("counts the new blob: thumbnails", async () => {
    const cdp = new DomCDP(fixture("deposit-step-2.html"));
    const n = await uploadPhotos(cdp as never, DEPOSIT.photoFileInput, ["/a.jpg", "/b.jpg"], DEPOSIT.photoThumbnails);
    expect(n).toBe(2);
    expect(cdp.calls.filter((c) => c.method === "DOM.setFileInputFiles")).toHaveLength(1);
  });

  it("returns 0 when there is no file input", async () => {
    const cdp = new DomCDP(fixture("deposit-step-3-review.html"));
    expect(await uploadPhotos(cdp as never, DEPOSIT.photoFileInput, ["/a.jpg"], DEPOSIT.photoThumbnails)).toBe(0);
  });
});

describe("clickByText is strict", () => {
  const html = `<!doctype html><body><main><form>
    <button type="button">Supprimer la photo</button>
    <button type="button" hidden>Supprimer</button>
    <button type="button" disabled>Continuer</button>
    <a href="#">Continuer avec Google</a>
  </form></main>
  <div role="dialog"><button type="button">Supprimer</button><button type="button">Annuler</button></div></body>`;

  it("ignores hidden and disabled controls and prefers an exact match in the open dialog", async () => {
    const cdp = new DomCDP(html);
    expect(await clickByText(cdp as never, ["Supprimer"])).toBe(true);
    expect(cdp.clicks).toEqual(["Supprimer"]);
  });

  it("does not take « Continuer avec Google » for a disabled « Continuer » only by containment", async () => {
    const cdp = new DomCDP(html);
    // prefix match is allowed (word boundary) — but the dry-run never clicks
    expect(await clickByText(cdp as never, ["Continuer"], [], { dryRun: true })).toBe(true);
    expect(cdp.clicks).toHaveLength(0);
  });

  it("finds the wizard's « Continuer » (submit) on the live markup, and no publish button", async () => {
    const cdp = new DomCDP(fixture("deposit-step-3-review.html"));
    expect(await hasButton(cdp as never, DEPOSIT.nextButton)).toBe(true);
    expect(await hasButton(cdp as never, DEPOSIT.publishButton)).toBe(false);
    expect(await clickButton(cdp as never, DEPOSIT.nextButton, { dryRun: true })).toBe(true);
  });
});

describe("pageHasText (final-step markers)", () => {
  it("recognises the live final step and only it", async () => {
    expect(await pageHasText(new DomCDP(fixture("deposit-step-3-review.html")) as never, DEPOSIT.finalStepMarkers)).toBe(true);
    expect(await pageHasText(new DomCDP(fixture("deposit-step-2.html")) as never, DEPOSIT.finalStepMarkers)).toBe(false);
    expect(await pageHasText(new DomCDP(fixture("deposit-step-1-suggest.html")) as never, DEPOSIT.finalStepMarkers)).toBe(false);
  });
});
