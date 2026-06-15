import { describe, expect, it } from "vitest";
import { DEPOSIT, MANAGE } from "../selectors";

/** Replicates how publish.ts extracts the list_id from a landed URL. */
function extractId(url: string): string | null {
  for (const re of DEPOSIT.publishedUrlPattern) {
    const m = url.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

describe("DEPOSIT.publishedUrlPattern", () => {
  it("extracts the list_id from real published-ad URL shapes", () => {
    expect(extractId("https://www.leboncoin.fr/ad/informatique/3138258318")).toBe("3138258318");
    expect(extractId("https://www.leboncoin.fr/ad/ventes_immobilieres/2998877665")).toBe("2998877665");
    expect(extractId("https://www.leboncoin.fr/voitures/2998877665.htm")).toBe("2998877665");
    expect(extractId("https://www.leboncoin.fr/recherche?listing_id=123456")).toBe("123456");
  });

  it("does not extract an id from the bare deposit URL", () => {
    expect(extractId("https://www.leboncoin.fr/deposer-une-annonce")).toBeNull();
  });
});

describe("login + confirmation patterns", () => {
  it("detects a login redirect", () => {
    expect(DEPOSIT.loginUrlPattern.test("https://www.leboncoin.fr/connexion")).toBe(true);
    expect(DEPOSIT.loginUrlPattern.test("https://www.leboncoin.fr/deposer-une-annonce")).toBe(false);
  });
});

describe("selector maps are non-empty (regression net)", () => {
  it("every deposit text field has at least one candidate", () => {
    for (const field of [DEPOSIT.categoryInput, DEPOSIT.titleInput, DEPOSIT.descTextarea, DEPOSIT.priceInput, DEPOSIT.zipcodeInput, DEPOSIT.photoFileInput]) {
      expect(Array.isArray(field)).toBe(true);
      expect(field.length).toBeGreaterThan(0);
    }
  });

  it("attrByKey builds attribute selectors for a given key", () => {
    const sels = DEPOSIT.attrByKey("brand");
    expect(sels).toContain('[name="brand"]');
    expect(sels.length).toBeGreaterThan(1);
  });

  it("buttons expose text candidates and css fallbacks", () => {
    for (const btn of [DEPOSIT.publishButton, DEPOSIT.photoAddButton, MANAGE.deleteButton, MANAGE.confirmButton]) {
      expect(btn.textCandidates.length).toBeGreaterThan(0);
      expect(btn.css.length).toBeGreaterThan(0);
    }
  });
});
