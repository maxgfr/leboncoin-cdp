import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = resolve("scripts/sync-version.mjs");

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "lbc-sync-"));
}

describe("sync-version.mjs", () => {
  it("sets the version in lockstep across package.json, src/types.ts and SKILL.md", () => {
    const dir = tmp();
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", version: "0.0.0" }, null, 2));
    writeFileSync(join(dir, "src", "types.ts"), 'export const VERSION = "0.0.0";\n');
    writeFileSync(join(dir, "SKILL.md"), "---\nname: leboncoin\nmetadata:\n  version: 0.0.0\n---\nbody\n");

    execFileSync("node", [SCRIPT, "9.9.9"], { cwd: dir });

    expect(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version).toBe("9.9.9");
    expect(readFileSync(join(dir, "src", "types.ts"), "utf8")).toContain('export const VERSION = "9.9.9";');
    expect(readFileSync(join(dir, "SKILL.md"), "utf8")).toMatch(/\n {2}version: 9\.9\.9\n/);
  });

  it("rejects a non-semver argument", () => {
    const dir = tmp();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "0.0.0" }));
    writeFileSync(join(dir, "SKILL.md"), "---\nmetadata:\n  version: 0.0.0\n---\n");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "types.ts"), 'export const VERSION = "0.0.0";\n');
    expect(() => execFileSync("node", [SCRIPT, "not-a-version"], { cwd: dir, stdio: "pipe" })).toThrow();
  });
});
