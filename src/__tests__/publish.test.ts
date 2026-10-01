import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
import { DomCDP, fixture } from "./helpers/dom-cdp";

/**
 * The whole publish flow over the REAL deposit wizard pages captured live
 * (anonymized): step 1 (title + suggested categories) → step 2 (photos +
 * attributes) → step 3 (final review, whose « Continuer » submits). The page only
 * "publishes" if the engine clicks that final « Continuer » — which it must do
 * with --yes and must NOT do otherwise.
 */
function liveSite(opts: { publishedUrl?: string; startUrl?: string } = {}) {
  const state = { page: "step1", submitted: false };
  const cdp = new DomCDP(fixture("deposit-step-1-suggest.html"), {
    url: opts.startUrl,
    onClick: (label, _el, self) => {
      if (state.page === "step1" && /^Choix \d/.test(label)) {
        state.page = "step2";
        return fixture("deposit-step-2.html");
      }
      if (label === "Continuer" && state.page === "step2") {
        state.page = "step3";
        return fixture("deposit-step-3-review.html");
      }
      if (label === "Continuer" && state.page === "step3") {
        state.submitted = true;
        if (opts.publishedUrl) {
          self.url = opts.publishedUrl;
          return "<html><body><h1>Votre annonce est en ligne</h1></body></html>";
        }
      }
      return undefined;
    },
  });
  return { cdp, state };
}

const draft: Annonce = {
  slug: "ad",
  title: "MacBook Air M1 2020",
  category: "Vélos",
  price: 650,
  zipcode: "75012",
  city: "Paris",
  condition: "Très bon état",
  attributes: { brand: "Apple" },
  photos: ["1.jpg", "2.jpg"],
  status: "draft",
  description: "MacBook Air M1, très bon état, vendu avec chargeur, batterie 92%.",
};

function setupDraft(over: Partial<Annonce> = {}): { dir: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "lbc-pub-"));
  const dir = join(root, "ad");
  mkdirSync(join(dir, "photos"), { recursive: true });
  writeFileSync(join(dir, "photos", "1.jpg"), "");
  writeFileSync(join(dir, "photos", "2.jpg"), "");
  writeAnnonce(dir, { ...draft, ...over });
  return { dir, root };
}

describe("runPublish over the live wizard", () => {
  it("--yes walks every step, submits from the final step only, and writes back the ad id", async () => {
    const { dir, root } = setupDraft();
    const { cdp, state } = liveSite({ publishedUrl: "https://www.leboncoin.fr/ad/informatique/3138258318" });
    const res = await runPublish(root, "ad", { yes: true, timeoutSubmitMs: 5_000 }, { connect: async () => cdp as never });

    expect(res.ok).toBe(true);
    expect(state.submitted).toBe(true);
    expect(res.leboncoin_id).toBe("3138258318");
    expect(res.report?.wizard).toMatchObject({ stop: "final", steps: 3 });
    expect(res.report?.uploadedPhotos).toBe(2);
    expect(cdp.uploaded).toHaveLength(2);

    const after = parseAnnonce(dir);
    expect(after.status).toBe("published");
    expect(after.leboncoin_id).toBe("3138258318");
    expect(existsSync(join(dir, "publish-preview.png"))).toBe(true);
  });

  it("semi-auto (default) parks on the final review and NEVER submits", async () => {
    const { dir, root } = setupDraft();
    const { cdp, state } = liveSite();
    const res = await runPublish(root, "ad", { timeoutSubmitMs: 10 }, { connect: async () => cdp as never });
    expect(state.page).toBe("step3");
    expect(state.submitted).toBe(false);
    expect(res.reason).toBe("not-published");
    expect(parseAnnonce(dir).status).toBe("draft");
  });

  it("--diagnostic fills + screenshots + saves HTML + reports missing, without submitting", async () => {
    const { dir, root } = setupDraft({ zipcode: "", city: undefined });
    const { cdp, state } = liveSite();
    const res = await runPublish(root, "ad", { diagnostic: true }, { connect: async () => cdp as never });

    expect(res.reason).toBe("diagnostic");
    expect(res.missing).toEqual(expect.arrayContaining([expect.stringContaining("zipcode")]));
    expect(state.submitted).toBe(false);
    expect(parseAnnonce(dir).status).toBe("draft");
    expect(existsSync(join(dir, "publish-preview.png"))).toBe(true);
    expect(existsSync(join(dir, "publish-preview.html"))).toBe(true);
  });

  it("surfaces a required field the annonce cannot fill (État) and writes every step to form-map.json", async () => {
    const { dir, root } = setupDraft({ condition: undefined });
    const { cdp } = liveSite();
    const res = await runPublish(root, "ad", { diagnostic: true }, { connect: async () => cdp as never });
    expect(res.report?.wizard?.stop).toBe("missing-required");
    expect(res.missing).toEqual(expect.arrayContaining([expect.stringMatching(/^État/)]));
    const map = JSON.parse(readFileSync(join(dir, "form-map.json"), "utf8"));
    expect(map.steps).toHaveLength(2);
    expect(map.steps[1].fields.some((f: { rhfName?: string }) => f.rhfName === "condition")).toBe(true);
  });

  it("writes push-readiness.json (ready on the final step)", async () => {
    const { dir, root } = setupDraft();
    const { cdp } = liveSite();
    const res = await runPublish(root, "ad", { dryRun: true }, { connect: async () => cdp as never });
    expect(existsSync(join(dir, "push-readiness.json"))).toBe(true);
    expect(res.report?.readiness?.blockers).toEqual([]);
    expect(res.report?.readiness?.ready).toBe(true);
  });

  it("--shots captures one checkpoint per wizard step + element crops + the confirmation", async () => {
    const { dir, root } = setupDraft();
    const { cdp } = liveSite({ publishedUrl: "https://www.leboncoin.fr/ad/x/123456" });
    const res = await runPublish(root, "ad", { yes: true, shots: true, timeoutSubmitMs: 5_000 }, { connect: async () => cdp as never });
    expect(res.ok).toBe(true);
    for (const f of ["00-initial.png", "step-01.png", "step-02.png", "step-03.png", "20-prefilled.png", "30-confirmation.png", "elem-price.png"]) {
      expect(existsSync(join(dir, "shots", f))).toBe(true);
    }
    expect(res.report?.shots?.map((s) => s.name)).toEqual(expect.arrayContaining(["00-initial", "step-03", "30-confirmation"]));
  });

  it("--no-screenshot skips the capture", async () => {
    const { dir, root } = setupDraft();
    const { cdp } = liveSite({ publishedUrl: "https://www.leboncoin.fr/ad/x/999999" });
    await runPublish(root, "ad", { yes: true, screenshot: false, timeoutSubmitMs: 5_000 }, { connect: async () => cdp as never });
    expect(cdp.calls.some((c) => c.method === "Page.captureScreenshot")).toBe(false);
    expect(existsSync(join(dir, "publish-preview.png"))).toBe(false);
  });

  it("--yes refuses to submit when the wizard stopped before the final step", async () => {
    const { dir, root } = setupDraft({ condition: undefined });
    const { cdp, state } = liveSite({ publishedUrl: "https://www.leboncoin.fr/ad/x/1" });
    const res = await runPublish(root, "ad", { yes: true, timeoutSubmitMs: 5_000 }, { connect: async () => cdp as never });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("form-error");
    expect(state.submitted).toBe(false);
    expect(parseAnnonce(dir).status).toBe("draft");
  });

  it("--strict refuses to submit while required fields are missing", async () => {
    const { root } = setupDraft({ condition: undefined });
    const { cdp, state } = liveSite();
    const res = await runPublish(root, "ad", { strict: true, yes: true, timeoutSubmitMs: 10 }, { connect: async () => cdp as never });
    expect(res.reason).toBe("incomplete");
    expect(state.submitted).toBe(false);
  });

  it("stops with login-required when redirected to the login page", async () => {
    const { root } = setupDraft();
    const { cdp } = liveSite({ startUrl: "https://auth.leboncoin.fr/login/?client_id=lbc-front-web" });
    const res = await runPublish(root, "ad", {}, { connect: async () => cdp as never });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("login-required");
  });

  it("refuses to publish a non-draft annonce", async () => {
    const { root } = setupDraft({ status: "published", leboncoin_id: "1" });
    const { cdp } = liveSite();
    await expect(runPublish(root, "ad", {}, { connect: async () => cdp as never })).rejects.toThrow(/only drafts/);
  });
});
