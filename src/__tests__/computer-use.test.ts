import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  actionStartUrl,
  adIdFromUrl,
  buildHandoff,
  type CuActionSheet,
  type CuSheet,
  DEPOSIT_URL,
  detectDevBrowser,
  findOnPath,
  macAppName,
  parseAdUrl,
  parseCuAction,
  realOpenCommand,
  resolveOpenUrl,
  runCuSheet,
  runOpen,
  runOpenReal,
  runRecord,
} from "../computer-use";
import { parseAnnonce, writeAnnonce } from "../markdown";
import { MANAGE } from "../selectors";
import type { AnnonceStatus } from "../types";

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

  it("defaults to computer use in the user's own browser; dev-browser is the advanced CDP option", () => {
    const { root } = setup();
    const r = runCuSheet(root, "ex");
    const md = readFileSync(r.path as string, "utf8");
    const at = md.indexOf("## How to drive");
    expect(at).toBeGreaterThan(md.indexOf("## 1. Open the deposit form"));
    expect(at).toBeLessThan(md.indexOf("## 2. Values, in form order"));
    expect(md).toContain("`leboncoin open ex --real`");
    expect(md.indexOf("Default: computer use")).toBeLessThan(md.indexOf("Advanced (CDP engine, scraper window only): dev-browser"));
    expect(md).toContain("`dev-browser --connect <port>`");
    expect(md).toContain("Never let it launch its own browser");
    const s = r.sheet as CuSheet;
    expect(md).toContain(`page.fill("ref/e7", ${JSON.stringify(s.values.title)})`);
    expect(md).toContain(`uploadFile(...${JSON.stringify(s.values.photos)})`);
  });

  it("gives the photos folder and the macOS / Linux file-dialog recipe", () => {
    const { root, dir } = setup();
    const r = runCuSheet(root, "ex");
    expect((r.sheet as CuSheet).values.photos_dir).toBe(join(dir, "photos"));
    const md = readFileSync(r.path as string, "utf8");
    expect(md).toContain(`Photos folder: ${join(dir, "photos")}`);
    expect(md).toContain("« Ajouter des photos »");
    expect(md).toContain("Cmd+Shift+G, paste the photos folder path");
    expect(md).toContain("Linux (GTK): press Ctrl+L");
    expect(md).toContain("Press Cmd+A");
    expect(md).toContain("« Ouvrir »");
    expect(md).toContain("check that 1 thumbnail(s) show.");
  });
});

describe("cu-sheet --action", () => {
  const URL = "https://www.leboncoin.fr/ad/ordinateurs/3100000001";
  function published(status: AnnonceStatus = "published") {
    const s = setup();
    writeAnnonce(s.dir, { ...parseAnnonce(s.dir), status, leboncoin_id: "3100000001", leboncoin_url: URL });
    return s;
  }
  const md = (r: { path?: string }) => readFileSync(r.path as string, "utf8");

  it("parses --action (default publish) and rejects unknown ones", () => {
    expect(parseCuAction(undefined)).toBe("publish");
    expect(parseCuAction("mark-sold")).toBe("mark-sold");
    expect(() => parseCuAction("boost")).toThrow(/--action must be one of publish, edit, delete/);
  });

  it("delete: starts on the ad, the site's controls, an irreversible stop rule, the deletion proof and the record command", () => {
    const { root } = published();
    const r = runCuSheet(root, "ex", "delete");
    expect(r.ok).toBe(true);
    const s = r.sheet as CuActionSheet;
    expect(s.action).toBe("delete");
    expect(s.start_url).toBe(URL);
    expect(s.notes).toEqual([]);
    expect(s.record).toBe(`leboncoin record ex --url ${URL} --status deleted`);
    const text = md(r);
    expect(text).toContain("`leboncoin open ex --real --action delete`");
    expect(text).toContain("« Supprimer l'annonce »");
    expect(text).toContain("« Plus d'actions »");
    expect(text).toContain("click « Confirmer la suppression »");
    expect(text).toContain("STOP RULE: Irreversible: ask the user to confirm");
    expect(text).toContain("« annonce supprimée »");
    expect(text).toContain("« page introuvable »");
    expect(text).toContain("id 3100000001");
    expect(text.indexOf("STOP RULE")).toBeLessThan(text.indexOf("Click the control"));
    expect(text).toContain(`\`leboncoin record ex --url ${URL} --status deleted\``);
  });

  it("without a leboncoin_url: starts in « Mes annonces » and says how to find the ad instead of refusing", () => {
    const { root } = setup(); // a draft, never recorded
    const r = runCuSheet(root, "ex", "mark-sold");
    expect(r.ok).toBe(true);
    const s = r.sheet as CuActionSheet;
    expect(s.start_url).toBe(MANAGE.listingUrl);
    expect(s.record).toBe("leboncoin record ex --url <ad url> --status sold");
    expect(s.notes.join("\n")).toMatch(/no leboncoin_url: find the ad in « Mes annonces » by its title and price/);
    expect(s.notes.join("\n")).toMatch(/status "draft"/);
    const text = md(r);
    expect(text).toContain("## Check first");
    expect(text).toContain("« Marquer comme vendu »");
    expect(text).toContain("« annonce vendue »");
    expect(text).toContain("replace <ad url> with the ad's URL");
  });

  it("edit: lists the annonce.md values, stops before « Enregistrer », keeps the current status in record", () => {
    const { root } = published("paused");
    const r = runCuSheet(root, "ex", "edit");
    expect(r.ok).toBe(true);
    const s = r.sheet as CuActionSheet;
    expect(s.changes?.find((c) => c.field === "Price")?.value).toBe("650 €");
    expect(s.changes?.find((c) => c.field === "Taille d'écran")?.value).toBe("12 à 14");
    expect(s.record).toBe(`leboncoin record ex --url ${URL} --status paused`);
    const text = md(r);
    expect(text).toContain("« Modifier l'annonce »");
    expect(text).toContain("Stop before « Enregistrer les modifications »");
    expect(text).toContain("- Title: MacBook Air M1 2020");
    expect(text).toContain("Description (type it verbatim)");
    expect(text).toContain("unless they explicitly asked you to save");
  });

  it("edit refuses invalid values; the other actions have no content gate; a deleted annonce is refused", () => {
    const { root, dir } = published();
    writeAnnonce(dir, { ...parseAnnonce(dir), price: 0 });
    expect(runCuSheet(root, "ex", "edit").ok).toBe(false);
    expect(runCuSheet(root, "ex", "deactivate").ok).toBe(true);
    writeAnnonce(dir, { ...parseAnnonce(dir), status: "deleted" });
    const r = runCuSheet(root, "ex", "renew");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/deleted/);
  });

  it("renew / deactivate / reactivate: proofs, stop rules and record statuses", () => {
    const { root } = published();
    const renew = runCuSheet(root, "ex", "renew");
    expect((renew.sheet as CuActionSheet).record).toBe(`leboncoin record ex --url ${URL} --status renewed`);
    expect(md(renew)).toContain("« Remettre en avant »");
    expect(md(renew)).toContain("Never pay");

    const pause = runCuSheet(root, "ex", "deactivate");
    expect((pause.sheet as CuActionSheet).record).toBe(`leboncoin record ex --url ${URL} --status paused`);
    expect(md(pause)).toContain("« Mettre en pause »");
    expect(md(pause)).toContain("or the ad now offers « Réactiver l'annonce »");

    const back = runCuSheet(root, "ex", "reactivate");
    const s = back.sheet as CuActionSheet;
    expect(s.start_url).toBe(MANAGE.listingUrl); // a paused ad's page may be hidden
    expect(s.record).toBe(`leboncoin record ex --url ${URL} --status published`);
    expect(s.notes.join()).toMatch(/expects paused/);
    expect(md(back)).toContain("« annonce réactivée »");
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

describe("open --action / --real", () => {
  const URL = "https://www.leboncoin.fr/ad/ordinateurs/3100000001";
  const BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";

  it("resolves --url > the action's start page > the existing logic", () => {
    const { root, dir } = setup();
    expect(resolveOpenUrl(root, "ex", { action: "delete" })).toBe(MANAGE.listingUrl);
    expect(resolveOpenUrl(root, undefined, { action: "edit" })).toBe(MANAGE.listingUrl);
    expect(resolveOpenUrl(root, "ex", { action: "publish" })).toBe(DEPOSIT_URL);
    writeAnnonce(dir, { ...parseAnnonce(dir), status: "published", leboncoin_id: "3100000001", leboncoin_url: URL });
    for (const a of ["edit", "delete", "renew", "mark-sold", "deactivate"] as const) expect(resolveOpenUrl(root, "ex", { action: a })).toBe(URL);
    expect(resolveOpenUrl(root, "ex", { action: "reactivate" })).toBe(MANAGE.listingUrl);
    expect(resolveOpenUrl(root, "ex", { action: "publish" })).toBe(DEPOSIT_URL);
    expect(resolveOpenUrl(root, "ex", { action: "delete", url: "https://www.leboncoin.fr/compte" })).toBe("https://www.leboncoin.fr/compte");
    expect(actionStartUrl(null, "renew")).toBe(MANAGE.listingUrl);
  });

  it("derives the macOS app name from the browser binary", () => {
    expect(macAppName(BRAVE)).toBe("Brave Browser");
    expect(macAppName("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")).toBe("Google Chrome");
    expect(macAppName("/Users/me/Applications/Chromium.app")).toBe("Chromium");
    expect(macAppName("/usr/bin/google-chrome")).toBeNull();
  });

  it("builds the OS command as an argument array: open -a <App>, plain open, xdg-open; refuses other platforms", () => {
    expect(realOpenCommand(URL, "darwin", BRAVE)).toEqual({ cmd: "open", args: ["-a", "Brave Browser", URL], browser: "Brave Browser" });
    expect(realOpenCommand(URL, "darwin", "/usr/bin/google-chrome")).toEqual({ cmd: "open", args: [URL], browser: "default" });
    expect(realOpenCommand(URL, "darwin", null)).toEqual({ cmd: "open", args: [URL], browser: "default" });
    expect(realOpenCommand(URL, "linux", BRAVE)).toEqual({ cmd: "xdg-open", args: [URL], browser: "default" });
    expect(() => realOpenCommand(URL, "win32", null)).toThrow(/macOS and Linux/);
  });

  it("opens the action's page in the user's own browser through the (mocked) OS opener, no CDP", async () => {
    const { root, dir } = setup();
    writeAnnonce(dir, { ...parseAnnonce(dir), status: "published", leboncoin_id: "3100000001", leboncoin_url: URL });
    const calls: [string, string[]][] = [];
    const opener = async (cmd: string, args: string[]) => {
      calls.push([cmd, args]);
    };
    const mac = await runOpenReal(root, "ex", { action: "delete" }, { platform: "darwin", browserPath: async () => BRAVE, opener });
    expect(mac).toEqual({ url: URL, mode: "real", browser: "Brave Browser" });
    const fallback = await runOpenReal(root, "ex", { action: "publish" }, { platform: "darwin", browserPath: async () => null, opener });
    expect(fallback).toEqual({ url: DEPOSIT_URL, mode: "real", browser: "default" });
    const linux = await runOpenReal(root, undefined, { action: "edit" }, { platform: "linux", browserPath: async () => BRAVE, opener });
    expect(linux.url).toBe(MANAGE.listingUrl);
    expect(calls).toEqual([
      ["open", ["-a", "Brave Browser", URL]],
      ["open", [DEPOSIT_URL]],
      ["xdg-open", [MANAGE.listingUrl]],
    ]);
    await expect(runOpenReal(root, "ex", {}, { platform: "win32", opener })).rejects.toThrow(/macOS and Linux/);
    expect(calls).toHaveLength(3);
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

  it("supports every status the actions need: renewed stays published + renewed_at, reactivation clears paused_at", () => {
    const { root, dir } = setup();
    const url = "https://www.leboncoin.fr/ad/ordinateurs/3138258318";
    runRecord(root, "ex", { url });
    expect(runRecord(root, "ex", { url, status: "paused" }).status).toBe("paused");
    expect(parseAnnonce(dir).paused_at).toBeTruthy();
    runRecord(root, "ex", { url, status: "published" });
    expect(parseAnnonce(dir).status).toBe("published");
    expect(parseAnnonce(dir).paused_at).toBeUndefined();
    const renewed = runRecord(root, "ex", { url, status: "renewed" });
    expect(renewed.status).toBe("published");
    expect(renewed.renewed_at).toBeTruthy();
    const a = parseAnnonce(dir);
    expect(a.status).toBe("published");
    expect(a.renewed_at).toBe(renewed.renewed_at);
    expect(readFileSync(join(dir, "annonce.md"), "utf8")).toContain("renewed_at:");
    runRecord(root, "ex", { url, status: "deleted" });
    expect(parseAnnonce(dir)).toMatchObject({ status: "deleted", renewed_at: renewed.renewed_at });
    expect(parseAnnonce(dir).deleted_at).toBeTruthy();
  });
});
