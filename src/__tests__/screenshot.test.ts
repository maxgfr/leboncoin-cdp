import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ShotLog, captureElement, captureScreenshot } from "../screenshot";

class FakeCDP {
  calls: { method: string; params: Record<string, unknown> }[] = [];
  constructor(private opts: { resolves?: boolean; box?: number[] | null } = {}) {}
  async evaluate(expr: string): Promise<unknown> {
    if (expr.startsWith("!!document.querySelector")) return this.opts.resolves ?? true;
    return null;
  }
  async send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    this.calls.push({ method, params });
    if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
    if (method === "DOM.querySelector") return { nodeId: 2 };
    if (method === "DOM.getBoxModel") {
      const box = this.opts.box === undefined ? [10, 20, 110, 20, 110, 70, 10, 70] : this.opts.box;
      return box ? { model: { border: box } } : {};
    }
    if (method === "Page.captureScreenshot") return { data: "iVBORw0KGgo=" };
    return {};
  }
  on(): void {}
  once(): Promise<unknown> {
    return Promise.resolve({});
  }
  disconnect(): void {}
}

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "lbc-shot-"));
}

describe("captureScreenshot", () => {
  it("passes a clip rect through to Page.captureScreenshot when given one", async () => {
    const cdp = new FakeCDP();
    const out = join(tmp(), "clip.png");
    const ok = await captureScreenshot(cdp as never, out, { clip: { x: 1, y: 2, width: 3, height: 4, scale: 1 } });
    expect(ok).toBe(true);
    const shot = cdp.calls.find((c) => c.method === "Page.captureScreenshot");
    expect(shot?.params.clip).toEqual({ x: 1, y: 2, width: 3, height: 4, scale: 1 });
    expect(existsSync(out)).toBe(true);
  });

  it("captures full-page (no clip) by default", async () => {
    const cdp = new FakeCDP();
    await captureScreenshot(cdp as never, join(tmp(), "full.png"));
    const shot = cdp.calls.find((c) => c.method === "Page.captureScreenshot");
    expect(shot?.params.clip).toBeUndefined();
    expect(shot?.params.captureBeyondViewport).toBe(true);
  });
});

describe("captureElement", () => {
  it("derives a clip rect from the element box model and writes the crop", async () => {
    const cdp = new FakeCDP();
    const out = join(tmp(), "elem.png");
    const ok = await captureElement(cdp as never, ['input[name="price"]'], out);
    expect(ok).toBe(true);
    const shot = cdp.calls.find((c) => c.method === "Page.captureScreenshot");
    expect(shot?.params.clip).toEqual({ x: 10, y: 20, width: 100, height: 50, scale: 1 });
    expect(existsSync(out)).toBe(true);
  });

  it("returns false (never throws) when the element is not found", async () => {
    const cdp = new FakeCDP({ resolves: false });
    expect(await captureElement(cdp as never, ['input[name="nope"]'], join(tmp(), "x.png"))).toBe(false);
  });

  it("returns false when the box model is empty (off-screen / display:none)", async () => {
    const cdp = new FakeCDP({ box: null });
    expect(await captureElement(cdp as never, ['input[name="price"]'], join(tmp(), "x.png"))).toBe(false);
  });
});

describe("ShotLog", () => {
  it("writes named checkpoint screenshots into shots/ and records them", async () => {
    const dir = tmp();
    const cdp = new FakeCDP();
    const log = new ShotLog(dir);
    await log.shot(cdp as never, "00-initial");
    await log.shot(cdp as never, "20-prefilled");
    expect(log.entries().map((s) => s.name)).toEqual(["00-initial", "20-prefilled"]);
    expect(existsSync(join(dir, "shots", "00-initial.png"))).toBe(true);
    expect(readdirSync(join(dir, "shots")).length).toBe(2);
  });
});
