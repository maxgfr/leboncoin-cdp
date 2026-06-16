import { describe, expect, it, vi } from "vitest";
import { parseArgs } from "../cli";

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

  it("prints help (exit 0) for -h and version (exit 0) for -v", () => {
    expect(run(["-h"]).exitCode).toBe(0);
    expect(run(["-v"]).exitCode).toBe(0);
  });
});
