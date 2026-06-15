import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Make every delay() instant so the polling loops don't slow the suite.
vi.mock("../utils", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, delay: () => Promise.resolve() };
});

import { parseAnnonce, writeAnnonce } from "../markdown";
import { runPublish } from "../publish";
import type { Annonce } from "../types";

/**
 * A fake CDPClient that answers cdp.evaluate by pattern-matching the in-page JS
 * the engine sends, and records cdp.send calls — so the whole publish flow runs
 * with no browser, no network, no config side effects.
 */
class FakeCDP {
  calls: { method: string; params: Record<string, unknown> }[] = [];
  filesSet: string[] = [];
  submitted = false;
  constructor(private opts: { url?: string; publishedUrl?: string } = {}) {}

  async evaluate(expr: string): Promise<unknown> {
    if (expr.includes("location.href")) {
      return this.submitted && this.opts.publishedUrl ? this.opts.publishedUrl : (this.opts.url ?? "https://www.leboncoin.fr/deposer-une-annonce");
    }
    if (expr.includes("geo.captcha-delivery")) return expr.includes("hostname"); // isOnCaptcha=false, isClear=true
    if (expr.includes('role="alert"')) return null; // readFormError → no error
    if (expr.includes("documentElement.outerHTML")) return "<html><body>form</body></html>"; // savePageHtml
    if (expr.includes('a[href*="/ad/"]')) return ""; // firstAdLink
    if (expr.includes("files")) return this.filesSet.length; // upload verify
    if (expr.includes("querySelectorAll('button")) {
      this.submitted = true; // clickByText (publish)
      return true;
    }
    if (expr.includes("opts[0]")) return true; // pickSuggestion
    if (expr.includes("dispatchEvent")) return true; // setInputValue
    if (expr.startsWith("!!document.querySelector")) return true; // resolveSelector
    if (expr.includes("body.innerText")) return false; // pageHasText
    return null;
  }

  async send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    this.calls.push({ method, params });
    if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
    if (method === "DOM.querySelector") return { nodeId: 2 };
    if (method === "DOM.setFileInputFiles") {
      this.filesSet = params.files as string[];
      return {};
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

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "lbc-pub-"));
}

const draft: Annonce = {
  slug: "ad",
  title: "MacBook Air M1 2020",
  category: "Informatique",
  price: 650,
  zipcode: "75012",
  city: "Paris",
  attributes: { brand: "Apple" },
  photos: ["1.jpg", "2.jpg"],
  status: "draft",
  description: "MacBook Air M1, très bon état, vendu avec chargeur, batterie 92%.",
};

function setupDraft(over: Partial<Annonce> = {}): { dir: string; root: string } {
  const root = scratch();
  const dir = join(root, "ad");
  mkdirSync(join(dir, "photos"), { recursive: true });
  writeFileSync(join(dir, "photos", "1.jpg"), "");
  writeFileSync(join(dir, "photos", "2.jpg"), "");
  writeAnnonce(dir, { ...draft, ...over });
  return { dir, root };
}

describe("runPublish", () => {
  it("fills the form, uploads photos, screenshots, and writes back the ad id (--yes)", async () => {
    const { dir, root } = setupDraft();
    const cdp = new FakeCDP({ publishedUrl: "https://www.leboncoin.fr/ad/informatique/3138258318" });
    const res = await runPublish(root, "ad", { yes: true, timeoutSubmitMs: 5_000 }, { connect: async () => cdp as never });

    expect(res.ok).toBe(true);
    expect(res.leboncoin_id).toBe("3138258318");

    const after = parseAnnonce(dir);
    expect(after.status).toBe("published");
    expect(after.leboncoin_id).toBe("3138258318");

    // DOM upload sequence + screenshot happened
    const methods = cdp.calls.map((c) => c.method);
    expect(methods).toEqual(expect.arrayContaining(["DOM.getDocument", "DOM.querySelector", "DOM.setFileInputFiles", "Page.captureScreenshot"]));
    const upload = cdp.calls.find((c) => c.method === "DOM.setFileInputFiles");
    expect((upload?.params.files as string[]).length).toBe(2);
    expect(existsSync(join(dir, "publish-preview.png"))).toBe(true);
  });

  it("--diagnostic fills + screenshots + saves HTML + reports missing, without submitting", async () => {
    const { dir, root } = setupDraft({ zipcode: "" }); // a required field left empty
    const cdp = new FakeCDP();
    const res = await runPublish(root, "ad", { diagnostic: true }, { connect: async () => cdp as never });

    expect(res.reason).toBe("diagnostic");
    expect(res.missing).toEqual(expect.arrayContaining([expect.stringContaining("zipcode")]));
    expect(parseAnnonce(dir).status).toBe("draft"); // not submitted
    expect(cdp.submitted).toBe(false);
    expect(existsSync(join(dir, "publish-preview.png"))).toBe(true);
    expect(existsSync(join(dir, "publish-preview.html"))).toBe(true);
  });

  it("--no-screenshot skips the capture", async () => {
    const { dir, root } = setupDraft();
    const cdp = new FakeCDP({ publishedUrl: "https://www.leboncoin.fr/ad/x/999999" });
    await runPublish(root, "ad", { yes: true, screenshot: false, timeoutSubmitMs: 5_000 }, { connect: async () => cdp as never });
    expect(cdp.calls.some((c) => c.method === "Page.captureScreenshot")).toBe(false);
    expect(existsSync(join(dir, "publish-preview.png"))).toBe(false);
  });

  it("stops with login-required when redirected to the login page", async () => {
    const { root } = setupDraft();
    const cdp = new FakeCDP({ url: "https://www.leboncoin.fr/connexion" });
    const res = await runPublish(root, "ad", {}, { connect: async () => cdp as never });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("login-required");
  });

  it("refuses to publish a non-draft annonce", async () => {
    const { root } = setupDraft({ status: "published", leboncoin_id: "1" });
    const cdp = new FakeCDP();
    await expect(runPublish(root, "ad", {}, { connect: async () => cdp as never })).rejects.toThrow(/only drafts/);
  });
});
