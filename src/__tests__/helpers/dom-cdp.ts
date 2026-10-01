import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

/**
 * A CDPClient stand-in backed by a real DOM (jsdom): `evaluate` runs the
 * engine's in-page JavaScript against captured Leboncoin pages, so the tests
 * exercise the SAME code that runs in the browser — not a pattern-matching fake.
 *
 * jsdom has no layout, so `getClientRects` is patched (an element is "visible"
 * unless it or an ancestor is `hidden` / `display:none`), and a few React-ish
 * behaviours are simulated: picking a `role=option` writes it into its combobox,
 * and `onClick` lets a test swap the page (wizard « Continuer », category card).
 */
export interface DomCDPOptions {
  url?: string;
  /** Called after every click with the clicked element's normalized text/aria-label; return HTML to load a new page. */
  onClick?: (label: string, el: Element, cdp: DomCDP) => string | undefined | void;
  /** Called on Page.navigate; return the HTML served at that URL. */
  onNavigate?: (url: string, cdp: DomCDP) => string | undefined;
}

export function fixture(name: string): string {
  return readFileSync(`src/__mocks__/${name}`, "utf8");
}

export class DomCDP {
  dom!: JSDOM;
  calls: { method: string; params: Record<string, unknown> }[] = [];
  clicks: string[] = [];
  uploaded: string[] = [];
  url: string;

  constructor(
    html: string,
    private opts: DomCDPOptions = {},
  ) {
    this.url = opts.url ?? "https://www.leboncoin.fr/deposer-une-annonce";
    this.load(html);
  }

  get document(): Document {
    return this.dom.window.document;
  }

  load(html: string): void {
    this.dom = new JSDOM(html, { url: this.url, runScripts: "outside-only", pretendToBeVisual: true });
    const w = this.dom.window as unknown as Record<string, any>;
    w.CSS = { escape: (s: string) => String(s).replace(/([^\w-])/g, "\\$1") };
    const hiddenUp = (el: Element | null): boolean => {
      for (let e = el; e; e = e.parentElement) {
        if (e.hasAttribute("hidden")) return true;
        const style = e.getAttribute("style") ?? "";
        if (/display\s*:\s*none/i.test(style)) return true;
      }
      return false;
    };
    w.HTMLElement.prototype.getClientRects = function (this: Element) {
      return hiddenUp(this) ? [] : [{ width: 10, height: 10 }];
    };
    w.HTMLElement.prototype.scrollIntoView = () => {};
    // No navigation in tests: a submit button's default action is a no-op.
    this.document.addEventListener("submit", (e) => e.preventDefault(), true);
    this.document.addEventListener(
      "click",
      (ev) => {
        const el = ev.target as Element;
        const label = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
        this.clicks.push(label);
        // React-ish combobox: choosing an option fills the input that controls the listbox.
        const opt = el.closest('[role="option"]');
        const lb = opt?.closest('[role="listbox"]');
        if (opt && lb?.id) {
          const input = this.document.querySelector(`[aria-controls="${lb.id}"]`) as HTMLInputElement | null;
          if (input) input.value = (opt.textContent || "").trim();
        }
        // React-ish role=checkbox / switch / radio toggles.
        const toggle = el.closest('[role="checkbox"], [role="switch"]');
        if (toggle) toggle.setAttribute("aria-checked", toggle.getAttribute("aria-checked") === "true" ? "false" : "true");
        const radio = el.closest('[role="radio"]');
        if (radio) {
          radio
            .closest('[role="radiogroup"]')
            ?.querySelectorAll('[role="radio"]')
            .forEach((r) => r.setAttribute("aria-checked", "false"));
          radio.setAttribute("aria-checked", "true");
        }
        const next = this.opts.onClick?.(label, el, this);
        if (typeof next === "string") this.load(next);
      },
      true,
    );
  }

  async evaluate<T = unknown>(expr: string): Promise<T> {
    const w = this.dom.window as unknown as { eval: (s: string) => unknown };
    const v = await w.eval(expr);
    return (v === undefined ? undefined : JSON.parse(JSON.stringify(v))) as T;
  }

  async send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    this.calls.push({ method, params });
    if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
    if (method === "DOM.querySelector") return { nodeId: this.document.querySelector(String(params.selector)) ? 2 : 0 };
    if (method === "DOM.setFileInputFiles") {
      const files = (params.files as string[]) ?? [];
      this.uploaded.push(...files);
      // The live site renders a blob: thumbnail per photo and clears the input.
      const host = this.document.querySelector('[data-rhf-name="images"]') ?? this.document.body;
      for (const f of files) {
        const img = this.document.createElement("img");
        img.setAttribute("src", `blob:https://www.leboncoin.fr/${encodeURIComponent(f)}`);
        host.appendChild(img);
      }
      return {};
    }
    if (method === "Page.navigate" && this.opts.onNavigate) {
      const html = this.opts.onNavigate(String(params.url), this);
      if (typeof html === "string") {
        this.url = String(params.url);
        this.load(html);
      }
      return {};
    }
    if (method === "DOM.getBoxModel") return { model: { border: [10, 20, 110, 20, 110, 70, 10, 70] } };
    if (method === "Page.captureScreenshot") return { data: "iVBORw0KGgo=" };
    return {};
  }

  on(): void {}
  once(): Promise<unknown> {
    return Promise.resolve({});
  }
  disconnect(): void {}
}
