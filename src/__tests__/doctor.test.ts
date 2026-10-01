import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../utils", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, delay: () => Promise.resolve() };
});

import { runDoctor } from "../doctor";
import { DomCDP, fixture } from "./helpers/dom-cdp";

const accountPage = `<html><body><header><a href="/account/private/home" aria-label="Mon compte">M</a></header><main><h1>Mon compte</h1></main></body></html>`;
const adPage = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  buildId: "b1",
  props: { pageProps: { ad: { list_id: 3276210930, subject: "MacBook", url: "https://www.leboncoin.fr/ad/ordinateurs/3276210930" } } },
})}</script></body></html>`;

function liveSite(opts: { loggedIn?: boolean } = {}) {
  const state = { page: "", submitted: false };
  const cdp = new DomCDP(opts.loggedIn === false ? `<html><body><button aria-label="Se connecter">Se connecter</button></body></html>` : accountPage, {
    url: "https://www.leboncoin.fr/account/private/home",
    onNavigate: (url) => {
      if (url.includes("/recherche")) return fixture("recherche.html");
      if (url.includes("/ad/")) return adPage;
      if (url.includes("/deposer-une-annonce")) {
        state.page = "step1";
        return fixture("deposit-step-1-suggest.html");
      }
      if (url === "about:blank") return "<html><body></body></html>";
      return undefined;
    },
    onClick: (label) => {
      if (state.page === "step1" && /^Choix \d/.test(label)) {
        state.page = "step2";
        return fixture("deposit-step-2.html");
      }
      if (label === "Continuer" && state.page === "step3") state.submitted = true;
      return undefined;
    },
  });
  return { cdp, state };
}

describe("runDoctor", () => {
  it("checks login, search, ad detail and walks the deposit wizard without submitting", async () => {
    const out = join(mkdtempSync(join(tmpdir(), "lbc-doc-")), "doctor-report.json");
    const { cdp, state } = liveSite();
    const r = await runDoctor({ out }, { connect: async () => cdp as never });

    expect(r.checks.map((c) => [c.name, c.ok])).toEqual([
      ["login", true],
      ["search", true],
      ["ad-detail", true],
      ["deposit", true],
    ]);
    expect(r.ok).toBe(true);
    expect(state.submitted).toBe(false);
    expect(r.deposit?.stop).toBe("missing-required"); // the probe has no photos
    expect(r.fields.title).toBe("selector");
    expect(r.fields.category).toBe("semantic");
    expect(r.fields.description).toBe("not-reached");
    expect(JSON.parse(readFileSync(out, "utf8")).checks).toHaveLength(4);
  });

  it("skips the deposit walk (and fails) when logged out", async () => {
    const out = join(mkdtempSync(join(tmpdir(), "lbc-doc-")), "r.json");
    const { cdp } = liveSite({ loggedIn: false });
    const r = await runDoctor({ out }, { connect: async () => cdp as never });
    expect(r.ok).toBe(false);
    expect(r.checks.find((c) => c.name === "deposit")?.detail).toMatch(/log in/);
  });
});
