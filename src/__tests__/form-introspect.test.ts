import { describe, expect, it } from "vitest";
import { buildFieldKey, introspectForm, summarizeFormMap } from "../form-introspect";

/**
 * The DOM walk runs in-page (untestable without a real DOM, like setInputValue's
 * JS); these tests cover the TS orchestration: key building, de-duplication,
 * robustness, and that the required signals from the payload are preserved.
 */
class FakeCDP {
  constructor(private payload: unknown) {}
  async evaluate(expr: string): Promise<unknown> {
    if (expr.includes("introspect-form")) return this.payload;
    return null;
  }
  async send(): Promise<unknown> {
    return {};
  }
  on(): void {}
  once(): Promise<unknown> {
    return Promise.resolve({});
  }
  disconnect(): void {}
}

describe("buildFieldKey", () => {
  it("prefers data-qa-id > name > id > slugified label", () => {
    expect(buildFieldKey({ dataQaId: "qa", name: "n", id: "i", label: "L" })).toBe("qa");
    expect(buildFieldKey({ name: "n", id: "i", label: "L" })).toBe("n");
    expect(buildFieldKey({ id: "i", label: "L" })).toBe("i");
    expect(buildFieldKey({ label: "Kilométrage *" })).toBe("kilometrage");
  });
});

describe("introspectForm", () => {
  it("preserves required + requiredSource + options and builds keys", async () => {
    const cdp = new FakeCDP({
      url: "https://www.leboncoin.fr/deposer-une-annonce",
      fields: [
        { label: "Titre", type: "text", value: "x", required: true, requiredSource: "required-attr", name: "subject", selector: 'input[name="subject"]' },
        {
          label: "Kilométrage",
          type: "text",
          value: "",
          required: true,
          requiredSource: "aria-required",
          name: "mileage",
          selector: 'input[name="mileage"]',
        },
        {
          label: "Carburant",
          type: "select",
          value: "",
          required: false,
          options: [
            { label: "Essence", value: "essence" },
            { label: "Diesel", value: "diesel" },
          ],
          name: "fuel",
          selector: 'select[name="fuel"]',
        },
      ],
    });
    const map = await introspectForm(cdp as never);
    expect(map.fields).toHaveLength(3);
    expect(map.fields[0]?.key).toBe("subject");
    const km = map.fields.find((f) => f.label === "Kilométrage");
    expect(km?.required).toBe(true);
    expect(km?.requiredSource).toBe("aria-required");
    expect(map.fields.find((f) => f.type === "select")?.options).toHaveLength(2);
  });

  it("de-duplicates colliding keys with a numeric suffix", async () => {
    const cdp = new FakeCDP({
      url: "u",
      fields: [
        { label: "A", type: "radio", value: "", required: false, name: "choice", selector: "" },
        { label: "B", type: "radio", value: "", required: false, name: "choice", selector: "" },
      ],
    });
    const keys = (await introspectForm(cdp as never)).fields.map((f) => f.key);
    expect(new Set(keys).size).toBe(2);
  });

  it("never throws on a malformed payload (returns an empty map)", async () => {
    expect(await introspectForm(new FakeCDP(null) as never)).toEqual({ url: "", fields: [] });
    expect(await introspectForm(new FakeCDP({ nope: 1 }) as never)).toEqual({ url: "", fields: [] });
  });
});

describe("summarizeFormMap", () => {
  it("reports the field and required counts", () => {
    const s = summarizeFormMap({
      url: "u",
      fields: [
        { key: "a", label: "A", type: "text", value: "", required: true, selector: "" },
        { key: "b", label: "B", type: "text", value: "", required: false, selector: "" },
      ],
    });
    expect(s).toContain("2");
    expect(s.toLowerCase()).toContain("required");
  });
});
