import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adIdFromUrl,
  buildHandoff,
  DEPOSIT_URL,
  detectDevBrowser,
  findOnPath,
  parseAdUrl,
  resolveOpenUrl,
  runCuSheet,
  runOpen,
  runRecord,
} from "../computer-use";
import { parseAnnonce, writeAnnonce } from "../markdown";

const EXAMPLE = resolve(__dirname, "../../assets/example-annonce");

/** A tmp annonces root holding a copy of assets/example-annonce as `ex`. */
function setup(): { root: string; dir: string } {
  const root = mkdtempSync(join(tmpdir(), "lbc-cu-"));
  const dir = join(root, "ex");
  cpSync(EXAMPLE, dir, { recursive: true });
  return { root, dir };
}

describe("cu-sheet", () => {
  it("builds the sheet from the example annonce: deposit URL, ordered values, absolute photo paths, safety rules", () => {
    const { root, dir } = setup();
    const r = runCuSheet(root, "ex");
    expect(r.ok).toBe(true);
    const s = r.sheet!;
    expect(s.deposit_url).toBe(DEPOSIT_URL);
    expect(s.values.title).toBe("MacBook Air M1 2020 — 256 Go, très bon état");
    expect(s.values.category).toBe("Ordinateurs");
    expect(s.values.price).toBe(650);
    expect(s.values.zipcode).toBe("75012");
    expect(s.values.attributes).toEqual({ brand: "Apple", "Taille d'écran": "12 à 14" });
    expect(s.values.photos).toEqual([join(dir, "photos", "macbook.jpg")]);
    expect(s.form_steps).toBeNull();
    expect(s.handoff).toBeNull();

    const md = readFileSync(join(dir, "computer-use.md"), "utf8");
    expect(r.path).toBe(join(dir, "computer-use.md"));
    expect(md).toContain(DEPOSIT_URL);
    expect(md).toContain(parseAnnonce(dir).description);
    expect(md).toContain("Taille d'écran → 12 à 14");
    expect(md).toContain(join(dir, "photos", "macbook.jpg"));
    expect(md).toMatch(/do NOT click the final/);
    expect(md).toContain("leboncoin record ex --url");
    // Ordered: title before description before price before photos.
    const order = ["Title:", "Description", "Price:", "Photos"].map((k) => md.indexOf(k));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("refuses an invalid annonce and writes nothing", () => {
    const { root, dir } = setup();
    writeAnnonce(dir, { ...parseAnnonce(dir), price: 0 });
    const r = runCuSheet(root, "ex");
    expect(r.ok).toBe(false);
    expect(r.validation.issues.some((i) => i.field === "price")).toBe(true);
    expect(existsSync(join(dir, "computer-use.md"))).toBe(false);
  });

  it("includes each step's visible labels and required ones when form-map.json exists", () => {
    const { root, dir } = setup();
    writeFileSync(
      join(dir, "form-map.json"),
      JSON.stringify({
        steps: [
          { url: "x", step: { title: "Commençons par l'essentiel", fingerprint: "a" }, fields: [{ label: "Titre de l'annonce", required: true }] },
          {
            url: "x",
            step: { title: "Dites-nous en plus", fingerprint: "b" },
            fields: [
              { label: "État", required: true },
              { label: "Marque", required: false },
            ],
          },
        ],
      }),
    );
    const r = runCuSheet(root, "ex");
    expect(r.sheet?.form_steps).toEqual([
      { index: 1, title: "Commençons par l'essentiel", required: ["Titre de l'annonce"], labels: ["Titre de l'annonce"] },
      { index: 2, title: "Dites-nous en plus", required: ["État"], labels: ["État", "Marque"] },
    ]);
    const md = readFileSync(join(dir, "computer-use.md"), "utf8");
    expect(md).toContain("### Step 2 — « Dites-nous en plus »");
    expect(md).toContain("- Required: État");
    expect(md).toContain("- Other labels: Marque");
  });

  it("surfaces handoff.json at the top (resume from step X, remaining fields)", () => {
    const { root, dir } = setup();
    writeFileSync(
      join(dir, "handoff.json"),
      JSON.stringify({
        reason: "not-published",
        wizard_stop: "missing-required",
        step: { index: 2, title: "Dites-nous en plus" },
        missing: [{ field: "État", required: true, value: null, note: "not in annonce.md — ask the user" }],
        blockers: ["État (required)"],
        remaining_photos: [],
        preview_png: null,
        cdp_port: 41234,
        created_at: "2026-11-25T00:00:00.000Z",
      }),
    );
    const r = runCuSheet(root, "ex");
    expect(r.sheet?.handoff?.step?.index).toBe(2);
    const md = readFileSync(join(dir, "computer-use.md"), "utf8");
    expect(md.indexOf("Resume from the CDP handoff")).toBeLessThan(md.indexOf("## 1. Open the deposit form"));
    expect(md).toContain("step 2 « Dites-nous en plus »");
    expect(md).toContain("CDP port 41234");
    expect(md).toContain("État (required): — not in annonce.md");
    expect(md).toContain("dev-browser --connect 41234 -t 30");
  });

  it("recommends dev-browser attached to the open window, with a fill + uploadFile example, computer use last", () => {
    const { root } = setup();
    const r = runCuSheet(root, "ex");
    const md = readFileSync(r.path as string, "utf8");
    const at = md.indexOf("## How to drive");
    expect(at).toBeGreaterThan(md.indexOf("## 1. Open the deposit form"));
    expect(at).toBeLessThan(md.indexOf("## 2. Values, in form order"));
    expect(md).toContain("`dev-browser --connect <port>`");
    expect(md).toContain("Never let it launch its own browser");
    expect(md.indexOf("Preferred: dev-browser")).toBeLessThan(md.indexOf("Last resort: computer use"));
    expect(md).toContain(`page.fill("ref/e7", ${JSON.stringify(r.sheet?.values.title)})`);
    expect(md).toContain(`uploadFile(...${JSON.stringify(r.sheet?.values.photos)})`);
  });
});

describe("handoff", () => {
  const report = { fields: [], missing: [], uploadedPhotos: 0 } as never;
  it("carries the dev-browser attach command as driver_hint when the CDP port is known", () => {
    const a = parseAnnonce(setup().dir);
    expect(buildHandoff(a, [], report, { reason: "not-published" }, 41234).driver_hint).toBe("dev-browser --connect 41234");
    expect(buildHandoff(a, [], report, { reason: "not-published" }, null)).not.toHaveProperty("driver_hint");
  });
});

describe("dev-browser detection", () => {
  it("finds an executable named dev-browser on PATH, ignoring non-executables and empty entries", () => {
    const base = mkdtempSync(join(tmpdir(), "lbc-path-"));
    const noexec = join(base, "a");
    const bin = join(base, "b");
    mkdirSync(noexec);
    mkdirSync(bin);
    writeFileSync(join(noexec, "dev-browser"), "");
    chmodSync(join(noexec, "dev-browser"), 0o644);
    writeFileSync(join(bin, "dev-browser"), "#!/bin/sh\n");
    chmodSync(join(bin, "dev-browser"), 0o755);
    expect(findOnPath("dev-browser", { PATH: `:${noexec}:${bin}` }, "darwin")).toBe(join(bin, "dev-browser"));
    expect(findOnPath("dev-browser", { PATH: noexec }, "darwin")).toBeNull();
    expect(findOnPath("dev-browser", {}, "darwin")).toBeNull();
  });

  it("reports availability and the attach command either way", () => {
    expect(detectDevBrowser(41234, () => "/usr/local/bin/dev-browser")).toEqual({ available: true, command: "dev-browser --connect 41234" });
    expect(detectDevBrowser(41234, () => null)).toEqual({ available: false, command: "dev-browser --connect 41234" });
  });
});

describe("open", () => {
  it("picks --url, else the live ad (unless --deposit), else the deposit form", () => {
    const { root, dir } = setup();
    expect(resolveOpenUrl(root, "ex")).toBe(DEPOSIT_URL);
    expect(resolveOpenUrl(root, undefined)).toBe(DEPOSIT_URL);
    writeAnnonce(dir, { ...parseAnnonce(dir), status: "published", leboncoin_url: "https://www.leboncoin.fr/ad/ordinateurs/3100000001" });
    expect(resolveOpenUrl(root, "ex")).toBe("https://www.leboncoin.fr/ad/ordinateurs/3100000001");
    expect(resolveOpenUrl(root, "ex", { deposit: true })).toBe(DEPOSIT_URL);
    expect(resolveOpenUrl(root, "ex", { url: "https://www.leboncoin.fr/compte" })).toBe("https://www.leboncoin.fr/compte");
    expect(() => resolveOpenUrl(root, "ex", { url: "file:///etc/passwd" })).toThrow(/http/);
  });

  it("navigates, disconnects (leaving the window open) and reports the CDP endpoint", async () => {
    const { root } = setup();
    const seen: string[] = [];
    let disconnected = false;
    const r = await runOpen(
      root,
      "ex",
      {},
      {
        connect: async (url) => {
          seen.push(url);
          return {
            disconnect: () => {
              disconnected = true;
            },
          } as never;
        },
        port: async () => 41234,
        which: () => null,
      },
    );
    expect(seen).toEqual([DEPOSIT_URL]);
    expect(disconnected).toBe(true);
    expect(r).toEqual({
      url: DEPOSIT_URL,
      port: 41234,
      endpoint: "http://127.0.0.1:41234",
      devBrowser: { available: false, command: "dev-browser --connect 41234" },
    });
  });
});

describe("record", () => {
  it("parses the id from both ad URL shapes", () => {
    expect(adIdFromUrl("https://www.leboncoin.fr/ad/informatique/3138258318")).toBe("3138258318");
    expect(parseAdUrl("https://www.leboncoin.fr/ad/informatique/3138258318.htm")).toBe("3138258318");
    expect(parseAdUrl("https://leboncoin.fr/ad/ordinateurs/3138258318?ref=x")).toBe("3138258318");
  });

  it("rejects anything that is not a leboncoin.fr ad URL", () => {
    expect(() => parseAdUrl("not a url")).toThrow(/not a URL/);
    expect(() => parseAdUrl("https://evil.example/ad/informatique/3138258318")).toThrow(/leboncoin\.fr/);
    expect(() => parseAdUrl("https://www.leboncoin.fr.evil.example/ad/x/3138258318")).toThrow(/leboncoin\.fr/);
    expect(() => parseAdUrl("https://www.leboncoin.fr/mes-annonces")).toThrow(/ad URL/);
    const { root, dir } = setup();
    expect(() => runRecord(root, "ex", { url: "https://www.example.com/ad/x/3138258318" })).toThrow();
    expect(parseAnnonce(dir).status).toBe("draft");
  });

  it("writes back url/id/status/published_at and removes handoff.json", () => {
    const { root, dir } = setup();
    writeFileSync(join(dir, "handoff.json"), "{}");
    const r = runRecord(root, "ex", { url: "https://www.leboncoin.fr/ad/ordinateurs/3138258318" });
    expect(r).toMatchObject({ status: "published", leboncoin_id: "3138258318", handoffRemoved: true });
    const a = parseAnnonce(dir);
    expect(a.status).toBe("published");
    expect(a.leboncoin_id).toBe("3138258318");
    expect(a.leboncoin_url).toBe("https://www.leboncoin.fr/ad/ordinateurs/3138258318");
    expect(a.published_at).toBeTruthy();
    expect(existsSync(join(dir, "handoff.json"))).toBe(false);

    // published_at is kept; a later sold record stamps sold_at.
    const first = a.published_at;
    runRecord(root, "ex", { url: "https://www.leboncoin.fr/ad/ordinateurs/3138258318", status: "sold" });
    const b = parseAnnonce(dir);
    expect(b.status).toBe("sold");
    expect(b.published_at).toBe(first);
    expect(b.sold_at).toBeTruthy();
    expect(() => runRecord(root, "ex", { url: "https://www.leboncoin.fr/ad/x/3138258318", status: "draft" })).toThrow(/--status/);
  });
});
