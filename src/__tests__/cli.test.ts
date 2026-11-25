import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// `open` must never launch a real browser in tests.
const navigated: string[] = [];
vi.mock("../browser", () => ({
  connectAndNavigate: async (url: string) => {
    navigated.push(url);
    return { disconnect: () => {} };
  },
}));

// `open --real` must never run the OS opener in tests: record what it would spawn.
const spawned: [string, string[]][] = [];
vi.mock("node:child_process", () => ({
  spawn: (cmd: string, args: string[]) => {
    spawned.push([cmd, args]);
    const handlers: Record<string, () => void> = {};
    setTimeout(() => handlers.spawn?.(), 0);
    return {
      once: (event: string, fn: () => void) => {
        handlers[event] = fn;
      },
      unref: () => {},
    };
  },
}));

import { main, parseArgs } from "../cli";

/** Run parseArgs with process.exit/stdout/stderr trapped, returning either the
 *  parsed result or the exit code the parser bailed with. */
function run(argv: string[]): { result?: ReturnType<typeof parseArgs>; exitCode?: number } {
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`__exit__:${code ?? 0}`);
  }) as never);
  const outSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    return { result: parseArgs(argv) };
  } catch (e) {
    const m = /^__exit__:(\d+)$/.exec((e as Error).message);
    if (m) return { exitCode: Number(m[1]) };
    throw e;
  } finally {
    exitSpy.mockRestore();
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
}

/** Run main() with exit/stdout/stderr trapped; returns the exit code (0 if none) and what was printed. */
async function runMain(argv: string[]): Promise<{ exitCode: number; out: string; err: string }> {
  let out = "";
  let err = "";
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`__exit__:${code ?? 0}`);
  }) as never);
  const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((c) => {
    out += String(c);
    return true;
  });
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((c) => {
    err += String(c);
    return true;
  });
  try {
    await main(argv);
    return { exitCode: 0, out, err };
  } catch (e) {
    const m = /^__exit__:(\d+)$/.exec((e as Error).message);
    if (m) return { exitCode: Number(m[1]), out, err };
    throw e;
  } finally {
    exitSpy.mockRestore();
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
}

describe("parseArgs", () => {
  it("parses a command, positional and value/bool flags", () => {
    const { result } = run(["new", "macbook-air-m1", "--title", "MacBook", "--force"]);
    expect(result?.command).toBe("new");
    expect(result?.positional).toEqual(["macbook-air-m1"]);
    expect(result?.values.title).toBe("MacBook");
    expect(result?.bools.has("force")).toBe(true);
  });

  it("maps short flags (-q, -d) and --key=value", () => {
    const { result } = run(["scrape", "-q", "category=9&locations=75012", "-d"]);
    expect(result?.values.query).toBe("category=9&locations=75012");
    expect(result?.bools.has("with-details")).toBe(true);

    const eq = run(["new", "x", "--category=Informatique"]);
    expect(eq.result?.values.category).toBe("Informatique");
  });

  it("exits 1 on an unknown command", () => {
    expect(run(["frobnicate"]).exitCode).toBe(1);
  });

  it("exits 1 on an unknown flag", () => {
    expect(run(["new", "x", "--nope"]).exitCode).toBe(1);
  });

  it("exits 1 when a value flag is missing its value", () => {
    expect(run(["new", "x", "--title"]).exitCode).toBe(1);
  });

  it("exits 1 when a boolean flag is given a value", () => {
    expect(run(["new", "x", "--force=1"]).exitCode).toBe(1);
  });

  it("recognizes login/auth and their value flags", () => {
    const login = run(["login", "--cookies-file", "cookies.json", "--out", "auth.png", "--timeout-login", "1000"]);
    expect(login.result?.command).toBe("login");
    expect(login.result?.values["cookies-file"]).toBe("cookies.json");
    expect(login.result?.values.out).toBe("auth.png");
    expect(login.result?.values["timeout-login"]).toBe("1000");

    expect(run(["auth"]).result?.command).toBe("auth");
  });

  it("recognizes inspect and publish --shots", () => {
    expect(run(["inspect", "macbook"]).result?.command).toBe("inspect");
    const pub = run(["publish", "macbook", "--shots"]);
    expect(pub.result?.bools.has("shots")).toBe(true);
  });

  it("recognizes the lifecycle commands", () => {
    for (const cmd of ["edit", "renew", "mark-sold", "deactivate", "reactivate"]) {
      expect(run([cmd, "macbook", "--yes"]).result?.command).toBe(cmd);
    }
  });

  it("recognizes doctor and the browser selection flags on any live command", () => {
    const doc = run(["doctor", "macbook", "--query", "iphone"]);
    expect(doc.result?.command).toBe("doctor");
    expect(doc.result?.positional).toEqual(["macbook"]);
    const login = run(["login", "--browser", "brave", "--reset-profile"]);
    expect(login.result?.values.browser).toBe("brave");
    expect(login.result?.bools.has("reset-profile")).toBe(true);
    expect(run(["publish", "x", "--chrome-path", "/bin/b"]).result?.values["chrome-path"]).toBe("/bin/b");
  });

  it("recognizes cu-sheet / open / record and --copy-profile", () => {
    expect(run(["cu-sheet", "macbook", "--json"]).result?.bools.has("json")).toBe(true);
    const open = run(["open", "macbook", "--deposit", "--url", "https://www.leboncoin.fr/compte"]);
    expect(open.result?.command).toBe("open");
    expect(open.result?.bools.has("deposit")).toBe(true);
    expect(open.result?.values.url).toBe("https://www.leboncoin.fr/compte");
    const real = run(["open", "macbook", "--real", "--action", "delete"]);
    expect(real.result?.bools.has("real")).toBe(true);
    expect(real.result?.values.action).toBe("delete");
    expect(run(["cu-sheet", "macbook", "--action", "edit"]).result?.values.action).toBe("edit");
    const rec = run(["record", "macbook", "--url", "https://www.leboncoin.fr/ad/x/1234567", "--status", "sold"]);
    expect(rec.result?.values).toMatchObject({ url: "https://www.leboncoin.fr/ad/x/1234567", status: "sold" });
    expect(run(["login", "--copy-profile"]).result?.bools.has("copy-profile")).toBe(true);
    expect(run(["scrape", "-q", "iphone", "--copy-profile"]).result?.bools.has("copy-profile")).toBe(true);
  });

  it("prints help (exit 0) for -h and version (exit 0) for -v", () => {
    expect(run(["-h"]).exitCode).toBe(0);
    expect(run(["-v"]).exitCode).toBe(0);
  });
});

describe("main dispatch (computer use)", () => {
  let home: string;
  let root: string;
  const prevHome = process.env.LBC_SCRAPER_HOME;
  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), "lbc-cli-home-"));
    process.env.LBC_SCRAPER_HOME = home;
    root = mkdtempSync(join(tmpdir(), "lbc-cli-"));
    cpSync(resolve(__dirname, "../../assets/example-annonce"), join(root, "ex"), { recursive: true });
  });
  afterAll(() => {
    if (prevHome === undefined) delete process.env.LBC_SCRAPER_HOME;
    else process.env.LBC_SCRAPER_HOME = prevHome;
  });

  it("help lists the computer-use commands and --copy-profile", async () => {
    const { exitCode, out } = await runMain(["--help"]);
    expect(exitCode).toBe(0);
    for (const t of ["cu-sheet <slug>", "open [<slug>]", "record <slug> --url", "--copy-profile"]) expect(out).toContain(t);
  });

  it("cu-sheet writes computer-use.md, --json prints the sheet, and refuses an invalid annonce (exit 1)", async () => {
    const r = await runMain(["cu-sheet", "ex", "--annonces-dir", root, "--json"]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.out).deposit_url).toBe("https://www.leboncoin.fr/deposer-une-annonce");
    expect(existsSync(join(root, "ex", "computer-use.md"))).toBe(true);
    const bad = await runMain(["cu-sheet", "missing", "--annonces-dir", root]);
    expect(bad.exitCode).toBe(1);
    expect(bad.out).toContain("issue");
  });

  it("open navigates through the (mocked) browser and prints the CDP endpoint", async () => {
    const r = await runMain(["open", "ex", "--annonces-dir", root, "--port", "41234", "--json"]);
    expect(r.exitCode).toBe(0);
    expect(navigated.at(-1)).toBe("https://www.leboncoin.fr/deposer-une-annonce");
    const out = JSON.parse(r.out.slice(r.out.indexOf("{")));
    expect(out).toMatchObject({
      url: "https://www.leboncoin.fr/deposer-une-annonce",
      port: 41234,
      endpoint: "http://127.0.0.1:41234",
      devBrowser: { command: "dev-browser --connect 41234" },
    });
    expect(typeof out.devBrowser.available).toBe("boolean");
  });

  it("cu-sheet --action writes the action playbook; an unknown action exits 1", async () => {
    const r = await runMain(["cu-sheet", "ex", "--annonces-dir", root, "--action", "delete", "--json"]);
    expect(r.exitCode).toBe(0);
    const sheet = JSON.parse(r.out);
    expect(sheet).toMatchObject({ action: "delete", start_url: "https://www.leboncoin.fr/compte/part/mes-annonces" });
    expect(sheet.record).toBe("leboncoin record ex --url <ad url> --status deleted");
    expect(readFileSync(join(root, "ex", "computer-use.md"), "utf8")).toContain("Computer-use playbook — delete — ex");
    const bad = await runMain(["cu-sheet", "ex", "--annonces-dir", root, "--action", "boost"]);
    expect(bad.exitCode).toBe(1);
    expect(bad.err).toContain("--action must be one of");
  });

  it("comparables --own-browser prints the plan and --import builds the files, both without a browser", async () => {
    const before = navigated.length;
    const plan = await runMain(["comparables", "ex", "--own-browser", "--annonces-dir", root, "--json"]);
    expect(plan.exitCode).toBe(0);
    const p = JSON.parse(plan.out);
    expect(p.url).toMatch(/^https:\/\/www\.leboncoin\.fr\/recherche\?text=/);
    expect(p.snippet).toContain("__NEXT_DATA__");
    const text = await runMain(["comparables", "ex", "--own-browser", "--annonces-dir", root]);
    expect(text.out).toContain("javascript_tool");

    const file = join(root, "captured.json");
    writeFileSync(
      file,
      JSON.stringify({ total: 1, ads: [{ list_id: 3100000001, subject: "MacBook Air M1", price: [600], location: { city_label: "Paris" } }] }),
    );
    const imp = await runMain(["comparables", "ex", "--import", file, "--annonces-dir", root, "--json"]);
    expect(imp.exitCode).toBe(0);
    expect(JSON.parse(imp.out).count).toBe(1);
    expect(readFileSync(join(root, "ex", "comparables.md"), "utf8")).toContain("| 1 | MacBook Air M1 | 600 € | Paris |");

    writeFileSync(file, JSON.stringify({ nope: true }));
    const bad = await runMain(["comparables", "ex", "--import", file, "--annonces-dir", root]);
    expect(bad.exitCode).toBe(1);
    expect(bad.err).toContain("no ad list found");
    expect((await runMain(["comparables", "ex", "--import", file, "--own-browser", "--annonces-dir", root])).exitCode).toBe(1);
    expect(navigated.length).toBe(before);
  });

  it("open --real hands the URL to the (mocked) OS opener — no CDP navigation", async () => {
    const before = navigated.length;
    const brave = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
    const r = await runMain(["open", "ex", "--real", "--action", "mark-sold", "--chrome-path", brave, "--annonces-dir", root, "--json"]);
    expect(r.exitCode).toBe(0);
    const listing = "https://www.leboncoin.fr/compte/part/mes-annonces";
    expect(navigated.length).toBe(before);
    if (process.platform === "darwin") {
      expect(JSON.parse(r.out)).toEqual({ url: listing, mode: "real", browser: "Brave Browser" });
      expect(spawned.at(-1)).toEqual(["open", ["-a", "Brave Browser", listing]]);
    } else if (process.platform === "linux") {
      expect(JSON.parse(r.out)).toEqual({ url: listing, mode: "real", browser: "default" });
      expect(spawned.at(-1)).toEqual(["xdg-open", [listing]]);
    }
  });

  it("record writes the ad back, and exits 1 on a missing or non-Leboncoin URL", async () => {
    expect((await runMain(["record", "ex", "--annonces-dir", root])).exitCode).toBe(1);
    expect((await runMain(["record", "ex", "--annonces-dir", root, "--url", "https://example.com/ad/x/1234567"])).exitCode).toBe(1);
    const ok = await runMain(["record", "ex", "--annonces-dir", root, "--url", "https://www.leboncoin.fr/ad/ordinateurs/3138258318"]);
    expect(ok.exitCode).toBe(0);
    const md = readFileSync(join(root, "ex", "annonce.md"), "utf8");
    expect(md).toContain('leboncoin_id: "3138258318"');
    expect(md).toContain("status: published");
  });
});
