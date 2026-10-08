#!/usr/bin/env node
import { createRequire as __lbcCreateRequire } from "node:module";
const require = __lbcCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/markdown.ts
import fs from "fs";
import path from "path";
function splitFrontmatter(raw) {
  const text = raw.replace(/\r\n/g, "\n");
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) {
    throw new Error("annonce.md is missing its `---` frontmatter block");
  }
  return { fm: m[1] ?? "", body: m[2] ?? "" };
}
function unquote(t) {
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
    return t.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  if (t.length >= 2 && t[0] === "'" && t[t.length - 1] === "'") {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}
function parseScalar(s) {
  const t = s.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return unquote(t);
}
function parseFrontmatter(fm) {
  const out = {};
  const lines = fm.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim() || line.trimStart().startsWith("#")) {
      i++;
      continue;
    }
    const m = line.match(/^([A-Za-z_][\w-]*):(.*)$/);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    const rest = (m[2] ?? "").trim();
    if (rest === "") {
      const block = [];
      let j = i + 1;
      while (j < lines.length && /^\s+\S/.test(lines[j] ?? "")) {
        block.push(lines[j]);
        j++;
      }
      if (block.length && block[0].trimStart().startsWith("- ")) {
        out[key] = block.map((b) => String(parseScalar(b.trim().replace(/^-\s*/, ""))));
      } else if (block.length) {
        const map = {};
        for (const b of block) {
          const bm = b.trim().match(/^(.+?):\s*(.*)$/);
          if (bm) map[unquote(bm[1].trim())] = String(parseScalar(bm[2]));
        }
        out[key] = map;
      } else {
        out[key] = "";
      }
      i = j;
    } else if (rest === "[]") {
      out[key] = [];
      i++;
    } else if (rest === "{}") {
      out[key] = {};
      i++;
    } else {
      out[key] = parseScalar(rest);
      i++;
    }
  }
  return out;
}
function str(v) {
  return v == null || typeof v === "object" ? "" : String(v);
}
function optStr(v) {
  const s = str(v);
  return s === "" ? void 0 : s;
}
function normStatus(v) {
  const s = str(v);
  return STATUSES.includes(s) ? s : "draft";
}
function parseAnnonce(dir) {
  const file = path.join(dir, ANNONCE_FILENAME);
  const raw = fs.readFileSync(file, "utf8");
  const { fm, body } = splitFrontmatter(raw);
  const f = parseFrontmatter(fm);
  const priceNum = typeof f.price === "number" ? f.price : Number(str(f.price)) || 0;
  return {
    slug: path.basename(path.resolve(dir)),
    title: str(f.title),
    category: str(f.category),
    price: priceNum,
    zipcode: str(f.zipcode),
    city: optStr(f.city),
    condition: optStr(f.condition),
    shipping: f.shipping === true ? true : f.shipping === false ? false : void 0,
    attributes: f.attributes && typeof f.attributes === "object" && !Array.isArray(f.attributes) ? f.attributes : {},
    photos: Array.isArray(f.photos) ? f.photos.map(String) : [],
    status: normStatus(f.status),
    leboncoin_id: optStr(f.leboncoin_id),
    leboncoin_url: optStr(f.leboncoin_url),
    published_at: optStr(f.published_at),
    deleted_at: optStr(f.deleted_at),
    sold_at: optStr(f.sold_at),
    paused_at: optStr(f.paused_at),
    description: body.trim()
  };
}
function q(s) {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function qKey(k) {
  return /^[A-Za-z0-9_-]+$/.test(k) ? k : q(k);
}
function serializeAnnonce(a) {
  const L = ["---"];
  L.push(`title: ${q(a.title)}`);
  L.push(`category: ${q(a.category)}`);
  L.push(`price: ${Number.isFinite(a.price) ? a.price : 0}`);
  L.push(`zipcode: ${q(a.zipcode)}`);
  if (a.city) L.push(`city: ${q(a.city)}`);
  if (a.condition) L.push(`condition: ${q(a.condition)}`);
  if (a.shipping !== void 0) L.push(`shipping: ${a.shipping}`);
  const attrKeys = Object.keys(a.attributes ?? {});
  if (attrKeys.length === 0) {
    L.push("attributes: {}");
  } else {
    L.push("attributes:");
    for (const k of attrKeys) L.push(`  ${qKey(k)}: ${q(String(a.attributes[k]))}`);
  }
  if (!a.photos || a.photos.length === 0) {
    L.push("photos: []");
  } else {
    L.push("photos:");
    for (const p of a.photos) L.push(`  - ${q(p)}`);
  }
  L.push(`status: ${a.status}`);
  if (a.leboncoin_id) L.push(`leboncoin_id: ${q(a.leboncoin_id)}`);
  if (a.leboncoin_url) L.push(`leboncoin_url: ${q(a.leboncoin_url)}`);
  if (a.published_at) L.push(`published_at: ${q(a.published_at)}`);
  if (a.deleted_at) L.push(`deleted_at: ${q(a.deleted_at)}`);
  if (a.sold_at) L.push(`sold_at: ${q(a.sold_at)}`);
  if (a.paused_at) L.push(`paused_at: ${q(a.paused_at)}`);
  L.push("---");
  L.push("");
  L.push(a.description.trim());
  L.push("");
  return L.join("\n");
}
function writeAnnonce(dir, a) {
  fs.writeFileSync(path.join(dir, ANNONCE_FILENAME), serializeAnnonce(a));
}
function scaffoldAnnonce(dir, init = {}, opts = {}) {
  const file = path.join(dir, ANNONCE_FILENAME);
  if (fs.existsSync(file) && !opts.force) {
    throw new Error(`annonce already exists at ${file} (use --force to overwrite)`);
  }
  fs.mkdirSync(path.join(dir, PHOTOS_DIRNAME), { recursive: true });
  const a = {
    slug: path.basename(path.resolve(dir)),
    title: init.title ?? "",
    category: init.category ?? "",
    price: init.price ?? 0,
    zipcode: init.zipcode ?? "",
    condition: init.condition,
    attributes: init.attributes ?? {},
    photos: [],
    status: "draft",
    description: init.notes && init.notes.trim() ? init.notes.trim() : PLACEHOLDER_BODY
  };
  writeAnnonce(dir, a);
  return a;
}
function listPhotoFiles(dir) {
  const pdir = path.join(dir, PHOTOS_DIRNAME);
  if (!fs.existsSync(pdir)) return [];
  return fs.readdirSync(pdir).filter((f) => PHOTO_EXTS.has(path.extname(f).toLowerCase())).sort();
}
function resolvePhotoPaths(dir, a) {
  const names = a.photos?.length ? a.photos : listPhotoFiles(dir);
  return names.map((n) => path.resolve(dir, PHOTOS_DIRNAME, n));
}
function listAnnonces(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const name of fs.readdirSync(root).sort()) {
    const dir = path.join(root, name);
    let isDir = false;
    try {
      isDir = fs.statSync(dir).isDirectory();
    } catch {
      isDir = false;
    }
    if (isDir && fs.existsSync(path.join(dir, ANNONCE_FILENAME))) {
      try {
        out.push(parseAnnonce(dir));
      } catch {
      }
    }
  }
  return out;
}
var ANNONCE_FILENAME, PHOTOS_DIRNAME, PLACEHOLDER_BODY, PHOTO_EXTS, STATUSES;
var init_markdown = __esm({
  "src/markdown.ts"() {
    "use strict";
    ANNONCE_FILENAME = "annonce.md";
    PHOTOS_DIRNAME = "photos";
    PLACEHOLDER_BODY = "<!-- D\xE9cris ton article ici (\xE9tat, d\xE9tails, raison de la vente\u2026). L'IA am\xE9liorera ce texte. -->";
    PHOTO_EXTS = /* @__PURE__ */ new Set([".jpg", ".jpeg", ".png", ".webp"]);
    STATUSES = ["draft", "published", "deleted", "sold", "paused"];
  }
});

// src/logger.ts
var Logger, logger;
var init_logger = __esm({
  "src/logger.ts"() {
    "use strict";
    Logger = class {
      startTime;
      taskName;
      info(message) {
        const timestamp = (/* @__PURE__ */ new Date()).toISOString();
        process.stdout.write(`[${timestamp}] \u2139\uFE0F  ${message}
`);
      }
      success(message) {
        const timestamp = (/* @__PURE__ */ new Date()).toISOString();
        process.stdout.write(`[${timestamp}] \u2705 ${message}
`);
      }
      error(message) {
        const timestamp = (/* @__PURE__ */ new Date()).toISOString();
        process.stderr.write(`[${timestamp}] \u274C ${message}
`);
      }
      warn(message) {
        const timestamp = (/* @__PURE__ */ new Date()).toISOString();
        process.stdout.write(`[${timestamp}] \u26A0\uFE0F  ${message}
`);
      }
      startTask(name) {
        this.taskName = name;
        this.startTime = Date.now();
        this.info(`Starting: ${name}`);
      }
      endTask() {
        if (this.startTime && this.taskName) {
          const elapsed = ((Date.now() - this.startTime) / 1e3).toFixed(2);
          this.success(`Completed: ${this.taskName} (${elapsed}s)`);
          this.startTime = void 0;
          this.taskName = void 0;
        }
      }
      progress(current, total, item) {
        const percent = Math.floor(current / total * 100);
        const bar = this.createProgressBar(percent);
        const itemInfo = item ? ` - ${item}` : "";
        process.stdout.write(`\r[${bar}] ${current}/${total} (${percent}%)${itemInfo}`);
        if (current === total) {
          process.stdout.write("\n");
        }
      }
      createProgressBar(percent) {
        const total = 20;
        const filled = Math.floor(percent / 100 * total);
        const empty = total - filled;
        return "\u2588".repeat(filled) + "\u2591".repeat(empty);
      }
    };
    logger = new Logger();
  }
});

// src/selectors.ts
var BASE_URL, DEPOSIT, TEXTISH, LOGICAL_FIELDS, AUTH, ELEMENT_TARGETS, MANAGE;
var init_selectors = __esm({
  "src/selectors.ts"() {
    "use strict";
    BASE_URL = "https://www.leboncoin.fr";
    DEPOSIT = {
      startUrl: `${BASE_URL}/deposer-une-annonce`,
      /** A redirect to one of these means the session is logged out (auth.leboncoin.fr/login/… included). */
      loginUrlPattern: /\/(connexion|login|authentification|account\/login)(?:[/?#]|$)/i,
      categoryInput: [
        'input[name="category"]',
        'input[data-qa-id="adsubject_category"]',
        'input[placeholder*="cat\xE9gorie" i]',
        'input[aria-label*="cat\xE9gorie" i]',
        '[data-qa-id="category"] input'
      ],
      /**
       * Category pickers seen live (2026-10): after the title is typed, the site
       * suggests categories as cards (`role=button`, aria-label « Choix 1 : catégorie
       * Ordinateurs dans la famille Électronique »); a full two-level tree opens from
       * « Choisissez » / the « Catégorie sélectionnée » button (leaf aria-label
       * « Catégorie Ordinateurs dans la famille Électronique. … »).
       */
      categoryCards: ['[role="button"][aria-label*="cat\xE9gorie" i]', 'button[aria-label^="Cat\xE9gorie " i]', '[role="radio"][aria-label*="cat\xE9gorie" i]'],
      /** Parses « …catégorie <name> dans la famille <family>… » out of an aria-label. */
      categoryAriaPattern: /cat[ée]gorie\s+(.+?)\s+dans la famille\s+(.+?)(?:\.|$)/i,
      /** Opens the full category tree when no suggestion fits. */
      categoryTreeButton: {
        textCandidates: ["Choisissez", "Choisir une cat\xE9gorie", "Toutes les cat\xE9gories", "Changer de cat\xE9gorie"],
        css: ['[aria-label^="Cat\xE9gorie s\xE9lectionn\xE9e" i]', 'button[aria-label*="changez de cat\xE9gorie" i]']
      },
      titleInput: ['input[name="subject"]', 'input[data-qa-id="input_subject"]', "input#subject", 'input[aria-label*="titre" i]'],
      descTextarea: ['textarea[name="body"]', 'textarea[data-qa-id="textarea_body"]', "textarea#body", 'textarea[aria-label*="description" i]'],
      priceInput: [
        'input[name="price_cents"]',
        'input[name="price"]',
        'input[data-qa-id="input_price"]',
        "input#price",
        'input[aria-label*="prix" i]',
        'input[inputmode="numeric"][name*="price" i]'
      ],
      zipcodeInput: [
        'input[name="location"]',
        'input[name="zipcode"]',
        'input[data-qa-id="input_location"]',
        'input[placeholder*="code postal" i]',
        'input[placeholder*="adresse" i]',
        'input[placeholder*="ville" i]'
      ],
      /** Generic autocomplete option (category, zipcode→city). */
      suggestionOption: ['[role="option"]', 'li[data-qa-id*="suggestion"]', 'ul[role="listbox"] li', '[data-qa-id="suggestion"]'],
      /** The real <input type=file>; may be hidden behind photoAddButton. */
      photoFileInput: ['input[type="file"][accept*="image"]', 'input[type="file"]'],
      photoAddButton: {
        textCandidates: ["Ajouter des photos", "Ajouter une photo", "Ajoutez vos photos"],
        css: ['[aria-label^="Ajouter" i][aria-label*="photo" i]', '[data-qa-id*="photo"] button', 'button[aria-label*="photo" i]']
      },
      /**
       * Uploaded-photo thumbnails. React clears the <input type=file> right after
       * reading it, so `input.files.length` drops back to 0 even on success — the
       * thumbnails are the only reliable proof an upload landed.
       */
      photoThumbnails: ['img[src^="blob:"]', '[data-rhf-name="images"] img', '[data-qa-id*="photo" i] img'],
      /** The photo thumbnail grid — an element-clip target for cheap verification. */
      photoGrid: ['[data-rhf-name="images"]', '[data-qa-id*="photo" i]', '[class*="photo" i]', '[data-test*="photo" i]'],
      /** Shipping/delivery toggle (only used when the annonce sets `shipping: true`). */
      shippingToggle: {
        textCandidates: ["Proposer la livraison", "Activer la livraison", "Envoi possible"],
        css: ['[data-rhf-name="shipping"] [role="checkbox"]', 'input[name*="shipping" i]', 'input[name*="livraison" i]', '[data-qa-id*="shipping" i]']
      },
      /** Category-specific attribute field, by form field name/id/data-attr. */
      attrByKey: (key) => [
        `[name="${key}"]`,
        `[data-rhf-name="${key}"] input`,
        `[data-qa-id="${key}"]`,
        `[data-attribute="${key}"]`,
        `select[name="${key}"]`,
        `[id="${key}"]`
      ],
      /** The wizard's "go to the next step" control. */
      nextButton: {
        textCandidates: ["Continuer", "Suivant", "\xC9tape suivante", "Valider et continuer"],
        css: ['form button[type="submit"]']
      },
      /**
       * The explicit final publish control, when the site labels it as such. Live
       * (2026-10) the final step's button is just « Continuer » — the FINAL STEP is
       * recognised by finalStepMarkers, never by this label alone. No generic
       * `button[type=submit]` fallback: every step's « Continuer » is one.
       */
      publishButton: {
        textCandidates: ["D\xE9poser mon annonce", "D\xE9poser l'annonce", "Publier mon annonce", "Publier l'annonce", "Publier"],
        css: ['button[data-qa-id="adsubmit"]']
      },
      /**
       * Visible text proving we are on the LAST step, where the next click submits
       * the ad (« Un dernier aperçu avant de publier… », « En cliquant sur
       * "Continuer", je confirme l'exactitude… »). The wizard never clicks past it.
       */
      finalStepMarkers: ["avant de publier", "je confirme l'exactitude", "deposer mon annonce", "publier mon annonce"],
      /** The current step's heading (step fingerprint). */
      stepTitle: ["#step-title", "main h2", "form h2", "h2", "h1"],
      /** A published ad URL carries the numeric list_id. */
      publishedUrlPattern: [/\/ad\/[^/]+\/(\d{4,})/, /\/(\d{6,})\.htm/, /[?&]listing_id=(\d+)/],
      /** Reaching one of these means the deposit succeeded (id may need a follow-up). */
      confirmedUrlPattern: [/\/deposer-une-annonce\/(confirmation|merci|success)/i, /\/ad\//]
    };
    TEXTISH = ["text", "textarea", "combobox", "other"];
    LOGICAL_FIELDS = {
      title: { names: ["subject", "title"], labels: ["titre"], css: DEPOSIT.titleInput, types: TEXTISH, required: true },
      description: { names: ["body", "description"], labels: ["description"], css: DEPOSIT.descTextarea, types: TEXTISH, required: true },
      price: { names: ["price_cents", "price"], labels: ["prix"], css: DEPOSIT.priceInput, types: TEXTISH, required: true },
      location: {
        names: ["location", "zipcode", "city", "address"],
        labels: ["adresse", "code postal", "ville", "localisation", "location"],
        css: DEPOSIT.zipcodeInput,
        types: TEXTISH,
        required: true
      },
      category: { names: ["category", "category_id"], labels: ["categorie"], css: DEPOSIT.categoryInput, types: [...TEXTISH, "select"], required: true },
      condition: { names: ["condition", "item_condition"], labels: ["etat"], css: [], types: [...TEXTISH, "select", "radiogroup"], required: false },
      shipping: {
        names: ["shipping", "shippable", "delivery"],
        labels: ["livraison", "envoi"],
        css: [],
        types: ["checkbox", "switch", "radiogroup"],
        required: false
      },
      photos: { names: ["images", "photos", "pictures"], labels: ["photo", "photos"], css: DEPOSIT.photoFileInput, types: ["file"], required: true }
    };
    AUTH = {
      /** Authenticated route; redirects to auth.leboncoin.fr/login when the session is dead. */
      accountUrl: `${BASE_URL}/account/private/home`,
      loginUrl: `${BASE_URL}/connexion`,
      /**
       * Matches a leboncoin.fr URL (incl. subdomains). A live session STAYS on
       * leboncoin.fr; being redirected off-domain (e.g. accounts.google.com for the
       * "Sign in with Google" OAuth) means we are mid-auth, i.e. NOT logged in — and
       * is also why the logged-in DOM markers below must never be trusted off-site
       * (a Google page has its own /account links).
       */
      leboncoinHostPattern: /^https?:\/\/([^/]*\.)?leboncoin\.fr(?:[:/]|$)/i,
      /**
       * DOM markers that only render for a logged-in user (ordered). Live 2026-10 the
       * header's account link is `a[href="/account/private/home"][aria-label="Mon
       * compte"]`. NOT /favorites, /messages or /my-searches: those links are in the
       * logged-out header too.
       */
      loggedInSelectors: [
        'a[href^="/account/private"]',
        'a[aria-label="Mon compte" i]',
        'a[href*="/compte/part/"]',
        '[data-qa-id="header-account"]',
        'a[href*="/deconnexion"]',
        'a[href*="/logout"]'
      ],
      /** DOM markers that only render for a logged-out user (the header's « Se connecter » button). */
      loggedOutSelectors: ['button[aria-label="Se connecter" i]', 'a[aria-label="Se connecter" i]', 'a[href*="auth.leboncoin.fr/login"]'],
      /** Visible text that implies a logged-in session. */
      loggedInTextMarkers: ["se d\xE9connecter", "d\xE9connexion"],
      /** Visible text that implies a logged-out / sign-in page. */
      loginRequiredTextMarkers: ["identifiez-vous", "connecte-toi", "sign in to leboncoin", "sign in with google", "s\xE9curisons votre compte"]
    };
    ELEMENT_TARGETS = {
      photos: DEPOSIT.photoGrid,
      price: DEPOSIT.priceInput,
      submit: [...DEPOSIT.publishButton.css, ...DEPOSIT.nextButton.css]
    };
    MANAGE = {
      /** « Mes annonces » (moved from /mes-annonces, which now lands on /favorites). */
      listingUrl: `${BASE_URL}/compte/part/mes-annonces`,
      adUrl: (id) => `${BASE_URL}/ad/${id}`,
      deleteButton: {
        textCandidates: ["Supprimer l'annonce", "Supprimer mon annonce", "Supprimer"],
        css: ['button[data-qa-id*="delete"]', 'button[aria-label*="supprimer" i]', 'a[href*="delete"]']
      },
      confirmButton: {
        textCandidates: ["Confirmer la suppression", "Oui, supprimer", "Supprimer l'annonce", "Supprimer", "Confirmer", "Oui"],
        css: ['[role="dialog"] button[data-qa-id*="confirm"]', 'button[data-qa-id*="confirm"]']
      },
      /** Open the modify form for a published ad. */
      editButton: {
        textCandidates: ["Modifier l'annonce", "Modifier mon annonce", "Modifier", "\xC9diter"],
        css: ['button[data-qa-id*="edit"]', 'a[href*="modifier"]', 'a[href*="edit"]', 'button[aria-label*="modifier" i]']
      },
      /** Save / update an edited ad (the edit form's submit). */
      saveButton: {
        textCandidates: ["Enregistrer les modifications", "Valider les modifications", "Mettre \xE0 jour", "Enregistrer"],
        css: ['button[data-qa-id*="save"]', 'button[data-qa-id*="submit"]']
      },
      /** Renew / bump ("remettre en avant" / boost). No status change. */
      renewButton: {
        textCandidates: ["Remettre en avant", "Remonter l'annonce", "Remonter", "Renouveler", "Booster"],
        css: ['button[data-qa-id*="renew"]', 'button[data-qa-id*="boost"]', 'a[href*="remonter"]']
      },
      /** Mark the ad as sold ("c'est vendu" / "vendu"). */
      markSoldButton: {
        textCandidates: ["Marquer comme vendu", "C'est vendu", "Marquer vendu", "Vendu"],
        css: ['button[data-qa-id*="sold"]', 'button[data-qa-id*="vendu"]', 'button[aria-label*="vendu" i]']
      },
      /** Deactivate / pause without deleting (live 2026-10: « Pause » in mes annonces). */
      deactivateButton: {
        textCandidates: ["Mettre en pause", "Pause", "D\xE9sactiver l'annonce", "D\xE9sactiver", "Suspendre"],
        css: ['button[data-qa-id*="deactivate"]', 'button[data-qa-id*="pause"]', 'button[aria-label*="pause" i]', 'button[aria-label*="d\xE9sactiver" i]']
      },
      /** Reactivate a paused ad. */
      reactivateButton: {
        textCandidates: ["R\xE9activer l'annonce", "R\xE9activer", "Remettre en ligne", "Activer"],
        css: ['button[data-qa-id*="reactivate"]', 'button[aria-label*="r\xE9activer" i]']
      },
      /** Generic confirmation for renew/sold/deactivate/reactivate flows. */
      manageConfirmButton: {
        textCandidates: ["Confirmer", "Oui", "Valider", "Continuer", "OK"],
        css: ['[role="dialog"] button[data-qa-id*="confirm"]', 'button[data-qa-id*="confirm"]']
      },
      /** « … / Plus d'actions » menus that hide per-ad controls. */
      overflowMenu: {
        textCandidates: ["Plus d'actions", "Plus d'options", "Actions", "Options", "G\xE9rer", "G\xE9rer l'annonce", "\u2026", "..."],
        css: ['[aria-haspopup="menu"]', '[aria-haspopup="true"]', 'button[aria-label*="plus" i]']
      },
      /*
       * Outcome PROOF. A local status only changes when the site shows one of these
       * (whole-phrase, accent-insensitive) — or, for pause/reactivate, when the
       * opposite control appears. They are full sentences on purpose: a bare
       * « vendu » or « en pause » would also match the buttons themselves.
       */
      /** Page-text markers that confirm a delete succeeded. */
      deletedMarkers: [
        "annonce supprim\xE9e",
        "annonce a \xE9t\xE9 supprim\xE9e",
        "annonce a bien \xE9t\xE9 supprim\xE9e",
        "n'existe plus",
        "n'est plus en ligne",
        "n'est plus disponible"
      ],
      /** Text on the ad page once it is gone (404 / removed). */
      goneMarkers: ["n'existe plus", "n'est plus disponible", "n'est plus en ligne", "page introuvable", "cette annonce a \xE9t\xE9 supprim\xE9e", "erreur 404"],
      soldMarkers: ["annonce vendue", "marqu\xE9e comme vendue", "a \xE9t\xE9 marqu\xE9e comme vendue", "est vendue"],
      pausedMarkers: ["annonce mise en pause", "a \xE9t\xE9 mise en pause", "est en pause", "annonce d\xE9sactiv\xE9e", "a \xE9t\xE9 d\xE9sactiv\xE9e", "annonce suspendue"],
      reactivatedMarkers: ["annonce r\xE9activ\xE9e", "a \xE9t\xE9 r\xE9activ\xE9e", "est de nouveau en ligne", "a \xE9t\xE9 remise en ligne"]
    };
  }
});

// src/site-overrides.ts
var site_overrides_exports = {};
__export(site_overrides_exports, {
  applySiteOverrides: () => applySiteOverrides,
  mergeOverrides: () => mergeOverrides,
  siteOverridesPath: () => siteOverridesPath
});
import { existsSync, readFileSync } from "fs";
import os from "os";
import path4 from "path";
function siteOverridesPath() {
  if (process.env.LBC_SITE_OVERRIDES) return process.env.LBC_SITE_OVERRIDES;
  const home = process.env.LBC_SCRAPER_HOME || path4.join(os.homedir(), ".lbc-scraper");
  return path4.join(home, "site.json");
}
function prependInPlace(target, patch) {
  const merged = [...patch, ...target.filter((t) => !patch.some((p) => String(p) === String(t)))];
  target.splice(0, target.length, ...merged);
}
function toRegExp(s, where, warn) {
  try {
    return new RegExp(s, "i");
  } catch {
    warn(`site overrides: ${where}: invalid regex "${s}" \u2014 skipped`);
    return null;
  }
}
function mergeValue(obj, key, patch, where, warn) {
  const current = obj[key];
  if (typeof current === "function") {
    warn(`site overrides: ${where} is computed and cannot be overridden \u2014 skipped`);
    return false;
  }
  if (current instanceof RegExp) {
    if (typeof patch !== "string") return warnType(where, "a regex string", warn);
    const re = toRegExp(patch, where, warn);
    if (!re) return false;
    obj[key] = re;
    return true;
  }
  if (Array.isArray(current)) {
    if (current.length > 0 && current.every((c) => c instanceof RegExp)) {
      if (!isStringArray(patch)) return warnType(where, "an array of regex strings", warn);
      const res = patch.map((p) => toRegExp(p, where, warn)).filter((r) => !!r);
      prependInPlace(current, res);
      return res.length > 0;
    }
    if (!isStringArray(patch)) return warnType(where, "an array of strings", warn);
    prependInPlace(current, patch);
    return true;
  }
  if (typeof current === "string") {
    if (typeof patch !== "string") return warnType(where, "a string", warn);
    obj[key] = patch;
    return true;
  }
  if (typeof current === "boolean") {
    if (typeof patch !== "boolean") return warnType(where, "a boolean", warn);
    obj[key] = patch;
    return true;
  }
  if (isPlainObject(current)) {
    if (!isPlainObject(patch)) return warnType(where, "an object", warn);
    let any = false;
    for (const [k, v] of Object.entries(patch)) {
      if (k.startsWith("$")) continue;
      if (!(k in current)) {
        warn(`site overrides: unknown key ${where}.${k} \u2014 skipped`);
        continue;
      }
      any = mergeValue(current, k, v, `${where}.${k}`, warn) || any;
    }
    return any;
  }
  warn(`site overrides: ${where} is not overridable \u2014 skipped`);
  return false;
}
function warnType(where, expected, warn) {
  warn(`site overrides: ${where} must be ${expected} \u2014 skipped`);
  return false;
}
function mergeOverrides(patch, warn = (m) => logger.warn(m), sections = SECTIONS) {
  if (!isPlainObject(patch)) {
    warn("site overrides: the file must contain a JSON object \u2014 ignored");
    return [];
  }
  const applied = [];
  for (const [section, value] of Object.entries(patch)) {
    if (section.startsWith("$")) continue;
    const target = sections[section];
    if (!target) {
      warn(`site overrides: unknown section "${section}" (expected ${Object.keys(sections).join(", ")}) \u2014 skipped`);
      continue;
    }
    if (!isPlainObject(value)) {
      warnType(section, "an object", warn);
      continue;
    }
    for (const [key, v] of Object.entries(value)) {
      if (key.startsWith("$")) continue;
      if (!(key in target)) {
        warn(`site overrides: unknown key ${section}.${key} \u2014 skipped`);
        continue;
      }
      if (mergeValue(target, key, v, `${section}.${key}`, warn)) applied.push(`${section}.${key}`);
    }
  }
  return applied;
}
function applySiteOverrides(file = siteOverridesPath(), warn = (m) => logger.warn(m)) {
  if (loaded !== void 0) return loaded;
  loaded = null;
  if (!existsSync(file)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    warn(`site overrides: ${file} is not valid JSON (${e.message}) \u2014 ignored`);
    return null;
  }
  const applied = mergeOverrides(parsed, warn);
  if (applied.length) logger.info(`Site overrides from ${file}: ${applied.join(", ")}`);
  loaded = { path: file, applied };
  return loaded;
}
var SECTIONS, isStringArray, isPlainObject, loaded;
var init_site_overrides = __esm({
  "src/site-overrides.ts"() {
    "use strict";
    init_logger();
    init_selectors();
    SECTIONS = {
      DEPOSIT,
      AUTH,
      MANAGE,
      LOGICAL_FIELDS
    };
    isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
    isPlainObject = (v) => !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof RegExp);
  }
});

// src/config.ts
var config_exports = {};
__export(config_exports, {
  browserKey: () => browserKey,
  clearCdpPort: () => clearCdpPort,
  config: () => config,
  createWrapperDataDir: () => createWrapperDataDir,
  detectBrowserPath: () => detectBrowserPath,
  detectUserDataDir: () => detectUserDataDir,
  ensureUserDataDir: () => ensureUserDataDir,
  getAuthStatePath: () => getAuthStatePath,
  getBrowserAppName: () => getBrowserAppName,
  getBrowserPath: () => getBrowserPath,
  getScraperHome: () => getScraperHome,
  loadBrowserChoice: () => loadBrowserChoice,
  loadCdpPort: () => loadCdpPort,
  resetScraperProfile: () => resetScraperProfile,
  saveBrowserChoice: () => saveBrowserChoice,
  saveCdpPort: () => saveCdpPort,
  selectBrowser: () => selectBrowser
});
import os2 from "os";
import path5 from "path";
import fs2 from "fs";
function getPlatform() {
  const platform = os2.platform();
  if (platform === "darwin") return "macos";
  if (platform === "linux") return "linux";
  return "other";
}
function getBrowserPath(browser) {
  const platform = getPlatform();
  if (platform === "macos") {
    const p = BROWSER_PATHS_MACOS[browser];
    if (!p) throw new Error(`Unknown browser: ${browser}`);
    try {
      fs2.accessSync(p, fs2.constants.X_OK);
      return p;
    } catch {
      throw new Error(`${browser} not found at ${p}. Install it or use --chrome-path to specify the binary.`);
    }
  } else if (platform === "linux") {
    const candidates = BROWSER_PATHS_LINUX[browser];
    if (!candidates) throw new Error(`Unknown browser: ${browser}`);
    for (const p of candidates) {
      try {
        fs2.accessSync(p, fs2.constants.X_OK);
        return p;
      } catch {
      }
    }
    throw new Error(`${browser} not found. Tried: ${candidates.join(", ")}. Install it or use --chrome-path to specify the binary.`);
  } else {
    throw new Error(`Unsupported platform: ${os2.platform()}. Use --chrome-path to specify the browser binary.`);
  }
}
function isExecutable(p) {
  try {
    fs2.accessSync(p, fs2.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function detectBrowserPath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const envBrowser = process.env.LBC_BROWSER;
  if (envBrowser) {
    try {
      return getBrowserPath(envBrowser);
    } catch {
    }
  }
  const remembered = loadBrowserChoice();
  if (remembered && isExecutable(remembered)) return remembered;
  const platform = getPlatform();
  if (platform === "macos") {
    const candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    ];
    for (const p of candidates) {
      try {
        fs2.accessSync(p, fs2.constants.X_OK);
        return p;
      } catch {
      }
    }
    return candidates[0];
  } else if (platform === "linux") {
    const candidates = [
      // Chrome first (default)
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/opt/google/chrome/chrome",
      // Then Brave
      "/usr/bin/brave-browser",
      "/usr/bin/brave",
      "/opt/brave.com/brave/brave-browser",
      // Then Chromium
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/snap/bin/chromium"
    ];
    for (const p of candidates) {
      try {
        fs2.accessSync(p, fs2.constants.X_OK);
        return p;
      } catch {
      }
    }
    return "/usr/bin/google-chrome";
  }
  return "/usr/bin/google-chrome";
}
function getBrowserAppName(chromePath) {
  if (chromePath.toLowerCase().includes("brave")) return "Brave Browser";
  if (chromePath.toLowerCase().includes("opera")) return "Opera";
  if (chromePath.toLowerCase().includes("chromium")) return "Chromium";
  return "Google Chrome";
}
function detectUserDataDir(chromePath) {
  const home = os2.homedir();
  const platform = getPlatform();
  const lowerPath = chromePath.toLowerCase();
  if (platform === "macos") {
    if (lowerPath.includes("brave")) return path5.join(home, "Library", "Application Support", "BraveSoftware", "Brave-Browser");
    if (lowerPath.includes("opera")) return path5.join(home, "Library", "Application Support", "com.operasoftware.Opera");
    if (lowerPath.includes("chromium")) return path5.join(home, "Library", "Application Support", "Chromium");
    return path5.join(home, "Library", "Application Support", "Google", "Chrome");
  } else if (platform === "linux") {
    if (lowerPath.includes("brave")) return path5.join(home, ".config", "BraveSoftware", "Brave-Browser");
    if (lowerPath.includes("opera")) return path5.join(home, ".config", "opera");
    if (lowerPath.includes("chromium")) return path5.join(home, ".config", "chromium");
    return path5.join(home, ".config", "google-chrome");
  }
  return path5.join(home, ".config", "google-chrome");
}
function getScraperHome() {
  return process.env.LBC_SCRAPER_HOME || path5.join(os2.homedir(), ".lbc-scraper");
}
function browserKey(chromePath) {
  const p = chromePath.toLowerCase();
  if (p.includes("brave")) return "brave";
  if (p.includes("opera")) return "opera";
  if (p.includes("chromium")) return "chromium";
  return "chrome";
}
function perBrowser(base, key) {
  return key === "chrome" ? base : `${base}-${key}`;
}
function currentKey() {
  try {
    return browserKey(config.browser.chromePath);
  } catch {
    return "chrome";
  }
}
function getPortFile() {
  return path5.join(getScraperHome(), perBrowser("port", currentKey()));
}
function getBrowserChoiceFile() {
  return path5.join(getScraperHome(), "browser");
}
function loadBrowserChoice() {
  try {
    const p = fs2.readFileSync(getBrowserChoiceFile(), "utf8").trim();
    return p || null;
  } catch {
    return null;
  }
}
function saveBrowserChoice(chromePath) {
  fs2.mkdirSync(getScraperHome(), { recursive: true });
  fs2.writeFileSync(getBrowserChoiceFile(), chromePath);
}
function getAuthStatePath() {
  return path5.join(getScraperHome(), "auth-state.png");
}
function createWrapperDataDir(realDir, key = "chrome") {
  const wrapper = path5.join(getScraperHome(), perBrowser("profile", key));
  if (fs2.existsSync(path5.join(wrapper, "Default")) || fs2.existsSync(path5.join(wrapper, "Local State"))) {
    console.log(`\u2713 Reusing scraper profile at ${wrapper}`);
    return wrapper;
  }
  fs2.mkdirSync(wrapper, { recursive: true });
  try {
    if (fs2.existsSync(realDir)) {
      fs2.cpSync(realDir, wrapper, {
        recursive: true,
        // Skip lock files (conflicts) and caches (GBs of nothing the session needs).
        filter: (src) => !PROFILE_COPY_SKIP.has(path5.basename(src))
      });
      console.log(`\u2713 Profile copied from ${realDir} to ${wrapper}`);
    } else {
      const localState = {
        browser: { enabled_labs_experiments: [] },
        profile: { info_cache: {} }
      };
      fs2.writeFileSync(path5.join(wrapper, "Local State"), JSON.stringify(localState, null, 2));
      console.log(`\u2713 Created new profile at ${wrapper}`);
    }
  } catch (error) {
    console.warn(`\u26A0 Failed to copy profile, using minimal profile:`, error);
  }
  return wrapper;
}
function resetScraperProfile(key = currentKey()) {
  const wrapper = path5.join(getScraperHome(), perBrowser("profile", key));
  if (fs2.existsSync(wrapper)) {
    fs2.rmSync(wrapper, { recursive: true });
    console.log("\u2713 Scraper profile deleted \u2014 will be re-created on next run");
  }
}
function saveCdpPort(port) {
  fs2.mkdirSync(getScraperHome(), { recursive: true });
  fs2.writeFileSync(getPortFile(), String(port));
}
function loadCdpPort() {
  try {
    const raw = fs2.readFileSync(getPortFile(), "utf8").trim();
    return parseInt(raw, 10) || 0;
  } catch {
    return 0;
  }
}
function clearCdpPort() {
  try {
    fs2.unlinkSync(getPortFile());
  } catch {
  }
}
function ensureUserDataDir() {
  if (!config.browser.userDataDir) {
    const p = config.browser.chromePath;
    config.browser.userDataDir = createWrapperDataDir(detectUserDataDir(p), browserKey(p));
  }
  return config.browser.userDataDir;
}
function selectBrowser(opts) {
  const chromePath = opts.browser ? getBrowserPath(opts.browser) : opts.chromePath ?? config.browser.chromePath;
  if (chromePath !== config.browser.chromePath) {
    config.browser.chromePath = chromePath;
    config.browser.userDataDir = "";
    config.browser.debuggingPort = parseInt(process.env.DEBUGGING_PORT || "0", 10);
  }
  if (opts.resetProfile) {
    resetScraperProfile(browserKey(chromePath));
    config.browser.userDataDir = "";
  }
  if (opts.remember !== false && (opts.browser || opts.chromePath)) saveBrowserChoice(chromePath);
  return chromePath;
}
var BROWSER_PATHS_MACOS, BROWSER_PATHS_LINUX, PROFILE_COPY_SKIP, config;
var init_config = __esm({
  "src/config.ts"() {
    "use strict";
    BROWSER_PATHS_MACOS = {
      chrome: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      brave: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      opera: "/Applications/Opera.app/Contents/MacOS/Opera",
      chromium: "/Applications/Chromium.app/Contents/MacOS/Chromium"
    };
    BROWSER_PATHS_LINUX = {
      chrome: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/opt/google/chrome/chrome"],
      brave: ["/usr/bin/brave-browser", "/usr/bin/brave", "/opt/brave.com/brave/brave-browser"],
      chromium: ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"],
      opera: ["/usr/bin/opera", "/usr/bin/opera-stable"]
    };
    PROFILE_COPY_SKIP = /* @__PURE__ */ new Set([
      "SingletonLock",
      "SingletonCookie",
      "SingletonSocket",
      "lockfile",
      "Cache",
      "Code Cache",
      "GPUCache",
      "DawnCache",
      "DawnGraphiteCache",
      "DawnWebGPUCache",
      "GrShaderCache",
      "GraphiteDawnCache",
      "ShaderCache",
      "GPUPersistentCache",
      "CacheStorage",
      "ScriptCache",
      "component_crx_cache",
      "extensions_crx_cache",
      "Crashpad",
      "Crash Reports",
      "optimization_guide_model_store",
      "OnDeviceHeadSuggestModel",
      "Safe Browsing",
      "BrowserMetrics"
    ]);
    config = {
      browser: {
        chromePath: detectBrowserPath(),
        // Resolved lazily by ensureUserDataDir(): importing this module must not copy a
        // multi-GB profile for a browser the command will not even use.
        userDataDir: "",
        timeout: parseInt(process.env.PAGE_TIMEOUT || "30000", 10),
        debuggingPort: parseInt(process.env.DEBUGGING_PORT || "0", 10)
      },
      scraping: {
        resultPerPage: 35,
        maxRetries: parseInt(process.env.MAX_RETRIES || "5", 10),
        rateLimit: parseInt(process.env.RATE_LIMIT || "1000", 10),
        maxPages: process.env.MAX_PAGES ? parseInt(process.env.MAX_PAGES, 10) : void 0
      },
      output: {
        directory: process.env.OUTPUT_DIR || "./assets",
        saveRawJson: process.env.SAVE_RAW === "true"
      },
      api: {
        baseUrl: "https://www.leboncoin.fr"
      }
    };
  }
});

// src/utils.ts
var formatDateWithTimestamp, delay;
var init_utils = __esm({
  "src/utils.ts"() {
    "use strict";
    formatDateWithTimestamp = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hour = String(date.getHours()).padStart(2, "0");
      const minute = String(date.getMinutes()).padStart(2, "0");
      const second = String(date.getSeconds()).padStart(2, "0");
      return `${year}-${month}-${day}_${hour}${minute}${second}`;
    };
    delay = (ms) => {
      return new Promise((resolve2) => setTimeout(resolve2, ms));
    };
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/constants.js"(exports, module) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: /* @__PURE__ */ Symbol("kIsForOnEventAttribute"),
      kListener: /* @__PURE__ */ Symbol("kListener"),
      kStatusCode: /* @__PURE__ */ Symbol("status-code"),
      kWebSocket: /* @__PURE__ */ Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/buffer-util.js"(exports, module) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = __require("bufferutil");
        module.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/limiter.js"(exports, module) {
    "use strict";
    var kDone = /* @__PURE__ */ Symbol("kDone");
    var kRun = /* @__PURE__ */ Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module.exports = Limiter;
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/permessage-deflate.js"(exports, module) {
    "use strict";
    var zlib = __require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = /* @__PURE__ */ Symbol("permessage-deflate");
    var kTotalLength = /* @__PURE__ */ Symbol("total-length");
    var kCallback = /* @__PURE__ */ Symbol("callback");
    var kBuffers = /* @__PURE__ */ Symbol("buffers");
    var kError = /* @__PURE__ */ Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       * @param {Boolean} [isServer=false] Create the instance in either server or
       *     client mode
       * @param {Number} [maxPayload=0] The maximum allowed message length
       */
      constructor(options, isServer, maxPayload) {
        this._maxPayload = maxPayload | 0;
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._isServer = !!isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module.exports = PerMessageDeflate;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/validation.js"(exports, module) {
    "use strict";
    var { isUtf8 } = __require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = __require("utf-8-validate");
        module.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/receiver.js"(exports, module) {
    "use strict";
    var { Writable } = __require("stream");
    var PerMessageDeflate = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module.exports = Receiver2;
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/sender.js"(exports, module) {
    "use strict";
    var { Duplex } = __require("stream");
    var { randomFillSync } = __require("crypto");
    var PerMessageDeflate = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = /* @__PURE__ */ Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else {
            buf.set(data, 2);
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/event-target.js"(exports, module) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = /* @__PURE__ */ Symbol("kCode");
    var kData = /* @__PURE__ */ Symbol("kData");
    var kError = /* @__PURE__ */ Symbol("kError");
    var kMessage = /* @__PURE__ */ Symbol("kMessage");
    var kReason = /* @__PURE__ */ Symbol("kReason");
    var kTarget = /* @__PURE__ */ Symbol("kTarget");
    var kType = /* @__PURE__ */ Symbol("kType");
    var kWasClean = /* @__PURE__ */ Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/extension.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension) => {
        let configurations = extensions[extension];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module.exports = { format, parse };
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/websocket.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var https = __require("https");
    var http = __require("http");
    var net = __require("net");
    var tls = __require("tls");
    var { randomBytes, createHash } = __require("crypto");
    var { Duplex, Readable } = __require("stream");
    var { URL: URL2 } = __require("url");
    var PerMessageDeflate = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = /* @__PURE__ */ Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate.extensionName]) {
          this._extensions[PerMessageDeflate.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch (e) {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate(
          opts.perMessageDeflate !== true ? opts.perMessageDeflate : {},
          false,
          opts.maxPayload
        );
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest2 = createHash("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest2) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/stream.js"(exports, module) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = __require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module.exports = createWebSocketStream2;
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/subprotocol.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module.exports = { parse };
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/lib/websocket-server.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var http = __require("http");
    var { Duplex } = __require("stream");
    var { createHash } = __require("crypto");
    var extension = require_extension();
    var PerMessageDeflate = require_permessage_deflate();
    var subprotocol = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate(
            this.options.perMessageDeflate,
            true,
            this.options.maxPayload
          );
          try {
            const offers = extension.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate.extensionName]);
              extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest2 = createHash("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest2}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate.extensionName]) {
          const params = extensions[PerMessageDeflate.extensionName].params;
          const value = extension.format({
            [PerMessageDeflate.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// node_modules/.pnpm/ws@8.19.0/node_modules/ws/wrapper.mjs
var import_stream, import_receiver, import_sender, import_websocket, import_websocket_server, wrapper_default;
var init_wrapper = __esm({
  "node_modules/.pnpm/ws@8.19.0/node_modules/ws/wrapper.mjs"() {
    "use strict";
    import_stream = __toESM(require_stream(), 1);
    import_receiver = __toESM(require_receiver(), 1);
    import_sender = __toESM(require_sender(), 1);
    import_websocket = __toESM(require_websocket(), 1);
    import_websocket_server = __toESM(require_websocket_server(), 1);
    wrapper_default = import_websocket.default;
  }
});

// src/cdp.ts
var CDPClient;
var init_cdp = __esm({
  "src/cdp.ts"() {
    "use strict";
    init_wrapper();
    CDPClient = class _CDPClient {
      ws;
      nextId = 0;
      pending = /* @__PURE__ */ new Map();
      eventHandlers = /* @__PURE__ */ new Map();
      constructor(ws) {
        this.ws = ws;
        ws.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if ("id" in msg) {
            const cb = this.pending.get(msg.id);
            if (cb) {
              if (cb.timer) clearTimeout(cb.timer);
              this.pending.delete(msg.id);
              if (msg.error) {
                cb.reject(new Error(msg.error.message));
              } else {
                cb.resolve(msg.result);
              }
            }
            return;
          }
          if ("method" in msg) {
            const handlers = this.eventHandlers.get(msg.method);
            handlers?.forEach((fn) => fn(msg.params));
          }
        });
        ws.on("close", () => {
          this.pending.forEach((cb) => cb.reject(new Error("WebSocket closed")));
          this.pending.clear();
        });
      }
      /**
       * Open a CDP WebSocket connection to a browser tab.
       */
      static connect(wsUrl, timeoutMs = 1e4) {
        return new Promise((resolve2, reject) => {
          const ws = new wrapper_default(wsUrl);
          const timer = setTimeout(() => {
            ws.close();
            reject(new Error(`CDP connection timeout (${timeoutMs}ms)`));
          }, timeoutMs);
          ws.once("open", () => {
            clearTimeout(timer);
            resolve2(new _CDPClient(ws));
          });
          ws.once("error", (err) => {
            clearTimeout(timer);
            reject(err);
          });
        });
      }
      /**
       * Send a CDP command and wait for the response.
       */
      send(method, params = {}, timeoutMs = 6e4) {
        const id = ++this.nextId;
        return new Promise((resolve2, reject) => {
          const timer = setTimeout(() => {
            this.pending.delete(id);
            reject(new Error(`CDP command timeout: ${method} (${timeoutMs}ms)`));
          }, timeoutMs);
          this.pending.set(id, { resolve: resolve2, reject, timer });
          this.ws.send(JSON.stringify({ id, method, params }));
        });
      }
      /**
       * Subscribe to a CDP event.
       */
      on(event, handler) {
        if (!this.eventHandlers.has(event)) {
          this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
      }
      /**
       * Wait for a single occurrence of an event.
       */
      once(event, timeoutMs = 3e4) {
        return new Promise((resolve2, reject) => {
          const timer = setTimeout(() => {
            reject(new Error(`Timeout waiting for event: ${event}`));
          }, timeoutMs);
          const handler = (params) => {
            clearTimeout(timer);
            const handlers = this.eventHandlers.get(event);
            if (handlers) {
              const idx = handlers.indexOf(handler);
              if (idx >= 0) handlers.splice(idx, 1);
            }
            resolve2(params);
          };
          this.on(event, handler);
        });
      }
      /**
       * Evaluate a JavaScript expression in the page context.
       *
       * This is the core of the approach: the code runs as if it were
       * the page's own JavaScript — all cookies, sessions, and DataDome
       * tokens are available. DataDome cannot distinguish this from
       * leboncoin's own frontend code.
       */
      async evaluate(expression, awaitPromise = true) {
        const result = await this.send("Runtime.evaluate", {
          expression,
          returnByValue: true,
          awaitPromise
        });
        if (result.exceptionDetails) {
          const desc = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Evaluation failed";
          throw new Error(desc);
        }
        return result.result?.value;
      }
      /**
       * Disconnect from the browser tab (does NOT close the browser).
       */
      disconnect() {
        this.pending.forEach((cb) => {
          if (cb.timer) clearTimeout(cb.timer);
          cb.reject(new Error("Disconnected"));
        });
        this.pending.clear();
        this.ws.close();
      }
    };
  }
});

// src/captcha.ts
async function isOnCaptcha(cdp) {
  return cdp.evaluate(`document.body.innerHTML.includes('geo.captcha-delivery') || !!document.querySelector('iframe[src*="datadome"]')`, false).catch(() => false);
}
async function isClear(cdp) {
  return cdp.evaluate(
    `window.location.hostname.includes('leboncoin.fr') && !document.querySelector('iframe[src*="captcha"]') && !document.querySelector('iframe[src*="datadome"]') && !document.body.innerHTML.includes('geo.captcha-delivery')`,
    false
  ).catch(() => false);
}
async function waitForCaptchaResolution(cdp, timeoutMs = CAPTCHA_TIMEOUT_MS) {
  logger.warn("CAPTCHA / bot challenge detected \u2014 solve it in the browser window");
  logger.info("Waiting up to 5 minutes\u2026");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await delay(3e3);
    if (await isClear(cdp)) {
      logger.success("CAPTCHA resolved \u2014 resuming");
      await delay(1500);
      return true;
    }
  }
  return false;
}
var CAPTCHA_TIMEOUT_MS;
var init_captcha = __esm({
  "src/captcha.ts"() {
    "use strict";
    init_logger();
    init_utils();
    CAPTCHA_TIMEOUT_MS = 5 * 60 * 1e3;
  }
});

// src/browser.ts
var browser_exports = {};
__export(browser_exports, {
  connectAndNavigate: () => connectAndNavigate,
  waitForPageReady: () => waitForPageReady
});
import { spawn, execSync } from "child_process";
function randomHighPort() {
  return 3e4 + Math.floor(Math.random() * 2e4);
}
function isBrowserRunning() {
  try {
    return execSync(`pgrep -f "${config.browser.chromePath}"`, {
      encoding: "utf-8"
    }).trim().length > 0;
  } catch {
    return false;
  }
}
async function getCdpInfo(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (!res.ok) return null;
    const data = await res.json();
    return { wsUrl: data.webSocketDebuggerUrl };
  } catch {
    return null;
  }
}
async function listTabs(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}
async function openNewTab(port) {
  for (const method of ["PUT", "GET"]) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method });
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.webSocketDebuggerUrl) return data;
    } catch {
    }
  }
  return null;
}
async function waitForPageReady(cdp) {
  await Promise.race([
    cdp.once("Page.domContentEventFired", config.browser.timeout).catch(() => {
    }),
    cdp.once("Page.loadEventFired", config.browser.timeout).catch(() => {
    })
  ]);
}
async function openTab(port, targetUrl) {
  logger.info("Opening a new tab\u2026");
  let target = await openNewTab(port);
  if (!target) {
    const tabs = await listTabs(port);
    target = tabs.find((t) => t.type === "page" && (t.url === "about:blank" || t.url === "chrome://newtab/")) ?? tabs.find((t) => t.type === "page") ?? null;
  }
  if (!target) {
    throw new Error("Could not open or find a usable browser tab");
  }
  logger.info(`Connecting to tab: ${target.url || "about:blank"}`);
  let cdp = await CDPClient.connect(target.webSocketDebuggerUrl);
  try {
    await cdp.send("Page.enable", {}, 1e4);
  } catch {
    logger.warn("Tab not responding \u2014 opening a fresh tab\u2026");
    cdp.disconnect();
    const freshTab = await openNewTab(port);
    if (!freshTab) {
      throw new Error("Could not open a fresh browser tab");
    }
    cdp = await CDPClient.connect(freshTab.webSocketDebuggerUrl);
    await cdp.send("Page.enable", {}, 15e3);
  }
  logger.info(`Navigating to ${targetUrl}`);
  await cdp.send("Page.navigate", { url: targetUrl });
  await waitForPageReady(cdp);
  await delay(2e3);
  if (await isOnCaptcha(cdp)) {
    await waitForCaptchaResolution(cdp);
  }
  logger.success("Page loaded");
  return cdp;
}
async function connectAndNavigate(targetUrl) {
  const browserName = getBrowserAppName(config.browser.chromePath);
  const explicitPort = config.browser.debuggingPort;
  if (explicitPort > 0) {
    const info = await getCdpInfo(explicitPort);
    if (info) {
      logger.info(`Found existing ${browserName} with CDP on port ${explicitPort}`);
      saveCdpPort(explicitPort);
      return openTab(explicitPort, targetUrl);
    }
  }
  const savedPort = loadCdpPort();
  if (savedPort > 0 && savedPort !== explicitPort) {
    const info = await getCdpInfo(savedPort);
    if (info) {
      logger.info(`Reconnecting to scraper ${browserName} on saved port ${savedPort}`);
      config.browser.debuggingPort = savedPort;
      return openTab(savedPort, targetUrl);
    } else {
      clearCdpPort();
    }
  }
  const newPort = randomHighPort();
  config.browser.debuggingPort = newPort;
  logger.info(`Launching a dedicated scraper ${browserName} on port ${newPort}`);
  logger.info(`  Binary  : ${config.browser.chromePath}`);
  const userDataDir = ensureUserDataDir();
  logger.info(`  Profile : ${userDataDir}`);
  if (isBrowserRunning()) {
    logger.info(`  (your existing ${browserName} will NOT be affected)`);
  }
  const child = spawn(
    config.browser.chromePath,
    [
      `--remote-debugging-port=${newPort}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-session-crashed-bubble",
      "--hide-crash-restore-bubble"
    ],
    { detached: true, stdio: "ignore" }
  );
  child.unref();
  let cdpReady = false;
  for (let i = 0; i < 30; i++) {
    await delay(500);
    if (await getCdpInfo(newPort)) {
      cdpReady = true;
      break;
    }
  }
  if (!cdpReady) {
    throw new Error(`${browserName} did not expose CDP on port ${newPort} within 15s`);
  }
  saveCdpPort(newPort);
  logger.success("Scraper browser launched and ready");
  return openTab(newPort, targetUrl);
}
var init_browser = __esm({
  "src/browser.ts"() {
    "use strict";
    init_config();
    init_logger();
    init_utils();
    init_cdp();
    init_captcha();
  }
});

// src/exploit.ts
function mapAttributes(attributes) {
  if (!Array.isArray(attributes)) return {};
  return attributes.reduce((acc, attr) => {
    if (!attr || typeof attr.key !== "string") return acc;
    const value = attr.value_label ?? attr.value;
    return value !== void 0 ? { ...acc, [attr.key]: value } : acc;
  }, {});
}
function parseDate(raw) {
  if (!raw) return /* @__PURE__ */ new Date(0);
  const d = raw.includes("T") ? new Date(raw) : /* @__PURE__ */ new Date(raw.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? /* @__PURE__ */ new Date(0) : d;
}
function priceOf(ad) {
  if (Array.isArray(ad.price)) return typeof ad.price[0] === "number" ? ad.price[0] : 0;
  if (typeof ad.price === "number") return ad.price;
  if (typeof ad.price_cents === "number") return Math.round(ad.price_cents / 100);
  return 0;
}
function mapAd(ad) {
  return {
    list_id: ad.list_id,
    title: ad.subject ?? "",
    description: ad.body ?? "",
    url: ad.url ?? "",
    price: priceOf(ad),
    date: parseDate(ad.index_date ?? ad.first_publication_date),
    city: ad.location?.city_label ?? ad.location?.city ?? "",
    user_id: ad.owner?.user_id ?? "",
    has_phone: ad.has_phone === true,
    attributes: mapAttributes(ad.attributes)
  };
}
function isAd(x) {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const id = x.list_id;
  return typeof id === "number" || typeof id === "string" && /^\d+$/.test(id);
}
function isAdList(x) {
  return Array.isArray(x) && x.length > 0 && isAd(x[0]) && x.every((e) => isAd(e));
}
function numberOf(o, keys) {
  for (const k of keys) if (typeof o[k] === "number") return o[k];
  return void 0;
}
function* walk(root) {
  const seen = /* @__PURE__ */ new Set();
  const queue = [{ node: root, parent: null }];
  while (queue.length && seen.size < MAX_NODES) {
    const item = queue.shift();
    const { node } = item;
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    yield item;
    if (Array.isArray(node)) {
      if (isAdList(node)) continue;
      for (const child of node) queue.push({ node: child, parent: null });
    } else {
      for (const child of Object.values(node)) queue.push({ node: child, parent: node });
    }
  }
}
function findSearchPayload(root) {
  let best = null;
  for (const { node, parent } of walk(root)) {
    if (!isAdList(node)) continue;
    if (best && best.ads.length >= node.length) continue;
    const total = parent ? numberOf(parent, ["total", "total_count", "totalCount", "total_all", "nbResults", "count"]) : void 0;
    const maxPages = parent ? numberOf(parent, ["max_pages", "maxPages", "total_pages", "totalPages"]) : void 0;
    best = { ads: node, total: total ?? node.length, ...maxPages !== void 0 ? { max_pages: maxPages } : {} };
  }
  return best;
}
function findAdPayload(root) {
  let fallback = null;
  for (const { node, parent } of walk(root)) {
    if (!isAd(node)) continue;
    if (parent && parent.ad === node) return node;
    if (!fallback && parent) fallback = node;
  }
  return fallback;
}
function processSearchData(data) {
  const ads = Array.isArray(data?.ads) ? data.ads : [];
  return {
    total: typeof data?.total === "number" ? data.total : ads.length,
    results: ads.filter(isAd).map(mapAd)
  };
}
function processAdData(ad) {
  return mapAd(ad);
}
var MAX_NODES;
var init_exploit = __esm({
  "src/exploit.ts"() {
    "use strict";
    init_utils();
    MAX_NODES = 5e4;
  }
});

// src/page-payload.ts
async function readPageSnapshot(cdp) {
  const s = await cdp.evaluate(SNAPSHOT_JS, false).catch(() => null);
  return s && typeof s === "object" ? { ...s, jsonScripts: s.jsonScripts ?? [], adLinks: s.adLinks ?? [] } : { url: "", jsonScripts: [], adLinks: [] };
}
function adsFromLinks(links) {
  const ads = [];
  const seen = /* @__PURE__ */ new Set();
  for (const l of links) {
    const id = l.href.match(/\/(\d{6,})(?:\.htm)?(?:[/?#]|$)/)?.[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ads.push({ list_id: Number(id), subject: l.text.split(" \xB7 ")[0]?.trim() ?? l.text, url: l.href });
  }
  return ads;
}
function searchFromSnapshot(s, sniffed = []) {
  const fromNext = s.nextData ? findSearchPayload(s.nextData) : null;
  if (fromNext) return { payload: fromNext, source: "next-data" };
  const fromScripts = findSearchPayload(s.jsonScripts);
  if (fromScripts) return { payload: fromScripts, source: "json-script" };
  const fromNetwork = findSearchPayload(sniffed);
  if (fromNetwork) return { payload: fromNetwork, source: "network" };
  const ads = adsFromLinks(s.adLinks);
  if (ads.length) return { payload: { ads, total: ads.length }, source: "dom-links" };
  return null;
}
function adFromSnapshot(s, sniffed = []) {
  const fromNext = s.nextData ? findAdPayload(s.nextData) : null;
  if (fromNext) return { ad: fromNext, source: "next-data" };
  const fromScripts = findAdPayload(s.jsonScripts);
  if (fromScripts) return { ad: fromScripts, source: "json-script" };
  const fromNetwork = findAdPayload(sniffed);
  if (fromNetwork) return { ad: fromNetwork, source: "network" };
  return null;
}
function categoryIdFromSnapshot(s) {
  const nd = s.nextData;
  const id = nd?.props?.pageProps?.categoryId ?? nd?.query?.category;
  return id === void 0 || id === null ? null : String(id);
}
var MAX_SCRIPT_CHARS, SNAPSHOT_JS, JsonSniffer;
var init_page_payload = __esm({
  "src/page-payload.ts"() {
    "use strict";
    init_exploit();
    MAX_SCRIPT_CHARS = 5e6;
    SNAPSHOT_JS = `(() => {
  /* page-snapshot */
  const out = { url: location.href, jsonScripts: [], adLinks: [] };
  const nd = document.getElementById('__NEXT_DATA__');
  if (nd && nd.textContent) { try { const d = JSON.parse(nd.textContent); out.nextData = d; out.buildId = d.buildId; } catch (e) {} }
  for (const s of Array.from(document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]'))) {
    if (s === nd || !s.textContent || s.textContent.length > ${MAX_SCRIPT_CHARS}) continue;
    try { out.jsonScripts.push(JSON.parse(s.textContent)); } catch (e) {}
    if (out.jsonScripts.length >= 30) break;
  }
  const seen = new Set();
  for (const a of Array.from(document.querySelectorAll('a[href*="/ad/"]'))) {
    const href = a.href;
    if (!href || seen.has(href)) continue;
    seen.add(href);
    out.adLinks.push({ href, text: ((a.innerText || a.textContent || '').replace(/\\s+/g, ' ').trim()).slice(0, 200) });
    if (out.adLinks.length >= 200) break;
  }
  return out;
})()`;
    JsonSniffer = class {
      constructor(cdp, maxBodies = 40) {
        this.cdp = cdp;
        this.maxBodies = maxBodies;
      }
      cdp;
      maxBodies;
      bodies = [];
      pending = /* @__PURE__ */ new Map();
      started = false;
      async start() {
        if (this.started) return;
        this.started = true;
        await this.cdp.send("Network.enable").catch(() => {
        });
        this.cdp.on("Network.responseReceived", (p) => {
          if (/json/i.test(p.response?.mimeType ?? "")) this.pending.set(p.requestId, true);
        });
        this.cdp.on("Network.loadingFinished", (p) => {
          if (!this.pending.delete(p.requestId) || this.bodies.length >= this.maxBodies) return;
          this.cdp.send("Network.getResponseBody", { requestId: p.requestId }).then((r) => {
            if (!r?.body) return;
            const text = r.base64Encoded ? Buffer.from(r.body, "base64").toString("utf8") : r.body;
            try {
              this.bodies.push(JSON.parse(text));
            } catch {
            }
          }).catch(() => {
          });
        });
      }
    };
  }
});

// src/query.ts
function normalizeSearchInput(input, baseUrl) {
  const trimmed = input.trim();
  let pathname = "/recherche";
  let params;
  let originalUrl = null;
  if (/^https?:\/\//i.test(trimmed)) {
    const url = new URL(trimmed);
    pathname = url.pathname;
    params = url.searchParams;
    originalUrl = trimmed;
  } else {
    const qIndex = trimmed.indexOf("?");
    if (qIndex >= 0) {
      pathname = "/" + trimmed.slice(0, qIndex).replace(/^\/+/, "");
      params = new URLSearchParams(trimmed.slice(qIndex + 1));
    } else if (trimmed.includes("=")) {
      params = new URLSearchParams(trimmed);
    } else {
      params = new URLSearchParams();
      if (trimmed) params.set("text", trimmed.replace(/\s+/g, " "));
    }
  }
  const isMap = /\/carte\//.test(pathname) || params.has("lat") && params.has("lng");
  if (isMap) {
    const lat = params.get("lat");
    const lng = params.get("lng");
    const city = params.get("city") ?? "";
    const radius = params.get("defaultRadius") ?? params.get("radius");
    if (lat && lng && radius && !params.has("locations")) {
      params.set("locations", `${city}__${lat}_${lng}_${radius}`);
    }
    for (const key of MAP_ONLY_KEYS) params.delete(key);
  }
  const navigateUrl = originalUrl ?? `${baseUrl}/recherche?${params.toString()}`;
  return { navigateUrl, params, isMap };
}
function buildQueryString(params, categoryId) {
  const out = new URLSearchParams(params);
  if (categoryId && !out.get("category")) out.set("category", categoryId);
  return out.toString();
}
var MAP_ONLY_KEYS;
var init_query = __esm({
  "src/query.ts"() {
    "use strict";
    MAP_ONLY_KEYS = ["lat", "lng", "city", "defaultRadius", "radius", "zoom"];
  }
});

// src/scraper.ts
async function readSearchPage(cdp, sniffer) {
  const snap = await readPageSnapshot(cdp);
  const found = searchFromSnapshot(snap, sniffer?.bodies ?? []);
  if (!found) {
    throw new Error(
      "No search results found on the page (no __NEXT_DATA__, inline JSON, network JSON or /ad/ links). The page may not have loaded, a CAPTCHA may be blocking, or the site changed \u2014 run `leboncoin doctor`."
    );
  }
  if (found.source !== "next-data") logger.warn(`Search results read from ${found.source} (no __NEXT_DATA__ payload) \u2014 the site may have changed.`);
  return { ...found, buildId: snap.buildId ?? "", categoryId: categoryIdFromSnapshot(snap) };
}
async function fetchNextDataRoute(cdp, buildId, query, page) {
  const json = await cdp.evaluate(`(async () => {
    const url = '/_next/data/' + ${JSON.stringify(buildId)} + '/recherche.json?' + ${JSON.stringify(query)} + '&page=' + ${page};
    const res = await fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      if (res.status === 403) throw new Error('BLOCKED:403');
      throw new Error('HTTP_' + res.status);
    }
    return await res.json();
  })()`);
  const payload = findSearchPayload(json);
  if (!payload) throw new Error("NO_SEARCH_DATA");
  return payload;
}
async function fetchAdDataRoute(cdp, buildId, adPath) {
  const jsonPath = adPath.replace(/\.htm$/, "").replace(/[?#].*$/, "") + ".json";
  return cdp.evaluate(`(async () => {
    const url = '/_next/data/' + ${JSON.stringify(buildId)} + ${JSON.stringify(jsonPath)};
    const res = await fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      if (res.status === 403) throw new Error('BLOCKED:403');
      throw new Error('HTTP_' + res.status);
    }
    return await res.json();
  })()`);
}
async function navigateWithCaptchaHandling(cdp, url) {
  await cdp.send("Page.enable");
  await cdp.send("Page.navigate", { url });
  await waitForPageReady(cdp);
  await delay(2e3);
  if (await isOnCaptcha(cdp)) {
    const ok = await waitForCaptchaResolution(cdp);
    if (!ok) throw new Error("CAPTCHA not solved within 5 minutes");
  }
}
async function scrapeAllSearchPages(cdp, search) {
  logger.startTask("Scraping search results");
  let first;
  try {
    first = await readSearchPage(cdp);
  } catch (error) {
    logger.warn(`First extraction failed: ${error.message}`);
    logger.info("Re-navigating to search URL (capturing network JSON)\u2026");
    const sniffer = new JsonSniffer(cdp);
    await sniffer.start();
    await navigateWithCaptchaHandling(cdp, search.navigateUrl);
    first = await readSearchPage(cdp, sniffer);
  }
  const { buildId, payload, categoryId } = first;
  const query = buildQueryString(search.params, categoryId);
  const firstPage = processSearchData(payload);
  const allAds = [...firstPage.results];
  const perPage = firstPage.results.length > 0 ? Math.max(firstPage.results.length, config.scraping.resultPerPage) : config.scraping.resultPerPage;
  const totalPages = Math.max(1, Math.ceil(firstPage.total / perPage));
  const siteCap = typeof payload.max_pages === "number" && payload.max_pages > 0 ? payload.max_pages : FALLBACK_MAX_PAGES;
  const userCap = config.scraping.maxPages && config.scraping.maxPages > 0 ? config.scraping.maxPages : Infinity;
  const nbPages = Math.min(totalPages, siteCap, userCap);
  logger.info(`Found ${firstPage.total} results across ${totalPages} pages (source: ${first.source}${buildId ? `, buildId: ${buildId}` : ""})`);
  logger.info(`Pagination query: ${query}`);
  if (nbPages < totalPages) {
    const reason = userCap <= siteCap && userCap < totalPages ? `limited to ${nbPages} page(s) via --max-pages` : `Leboncoin caps pagination at ${nbPages} of ${totalPages} pages`;
    logger.warn(`Scraping the first ${nbPages} page(s) \u2014 ${reason}.`);
  }
  let useDataRoute = !!buildId;
  for (let i = 2; i <= nbPages; i++) {
    await delay(config.scraping.rateLimit + Math.floor(Math.random() * 2e3));
    logger.progress(i - 1, nbPages, `Page ${i}/${nbPages}`);
    const pageUrl = `${config.api.baseUrl}/recherche?${query}&page=${i}`;
    try {
      if (useDataRoute) {
        try {
          allAds.push(...processSearchData(await fetchNextDataRoute(cdp, buildId, query, i)).results);
          continue;
        } catch (error) {
          if (error.message?.includes("BLOCKED") || error.message?.includes("CAPTCHA")) throw error;
          logger.warn(`Data route failed (${error.message}) \u2014 switching to page navigation.`);
          useDataRoute = false;
        }
      }
      await navigateWithCaptchaHandling(cdp, pageUrl);
      allAds.push(...processSearchData((await readSearchPage(cdp)).payload).results);
    } catch (error) {
      if (error.message?.includes("BLOCKED") || error.message?.includes("CAPTCHA")) {
        await navigateWithCaptchaHandling(cdp, pageUrl);
        allAds.push(...processSearchData((await readSearchPage(cdp)).payload).results);
      } else {
        logger.error(`Failed page ${i}: ${error.message}`);
      }
    }
  }
  if (nbPages > 1) logger.progress(nbPages, nbPages);
  logger.endTask();
  return { ads: allAds, buildId, query, source: first.source, rawFirstPage: payload };
}
async function scrapeAdDetails(cdp, urls, buildId) {
  logger.startTask(`Scraping ${urls.length} ad details`);
  const result = { success: [], failed: [] };
  const retried = /* @__PURE__ */ new Set();
  for (let i = 0; i < urls.length; i++) {
    logger.progress(i + 1, urls.length);
    const url = urls[i];
    try {
      const urlPath = url.replace(/^https?:\/\/[^/]+/, "");
      const raw = buildId ? findAdPayload(await fetchAdDataRoute(cdp, buildId, urlPath)) : null;
      if (raw) {
        result.success.push(processAdData(raw));
      } else {
        await navigateWithCaptchaHandling(cdp, url);
        const found = adFromSnapshot(await readPageSnapshot(cdp));
        if (!found) throw new Error("NO_AD_DATA");
        result.success.push(processAdData(found.ad));
      }
    } catch (error) {
      if ((error.message?.includes("BLOCKED") || error.message?.includes("CAPTCHA")) && !retried.has(i)) {
        retried.add(i);
        await navigateWithCaptchaHandling(cdp, url).catch(() => {
        });
        i--;
        continue;
      }
      result.failed.push({ url, error: error instanceof Error ? error.message : String(error) });
      logger.error(`Failed: ${url}`);
    }
    if (i < urls.length - 1) {
      await delay(config.scraping.rateLimit + Math.floor(Math.random() * 1500));
    }
  }
  logger.endTask();
  return result;
}
var FALLBACK_MAX_PAGES;
var init_scraper = __esm({
  "src/scraper.ts"() {
    "use strict";
    init_browser();
    init_captcha();
    init_config();
    init_exploit();
    init_logger();
    init_page_payload();
    init_query();
    init_utils();
    FALLBACK_MAX_PAGES = 100;
  }
});

// src/scrape.ts
var scrape_exports = {};
__export(scrape_exports, {
  runScrape: () => runScrape
});
import fs3 from "fs";
async function loadConfigFile(configPath) {
  try {
    const content = fs3.readFileSync(configPath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to load config file ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function runScrape(args) {
  selectBrowser({ browser: args.browser, chromePath: args.chromePath, resetProfile: args.resetProfile });
  if (args.debuggingPort) config.browser.debuggingPort = args.debuggingPort;
  if (args.pageTimeout) config.browser.timeout = args.pageTimeout;
  if (args.maxRetries) config.scraping.maxRetries = args.maxRetries;
  if (args.rateLimit) config.scraping.rateLimit = args.rateLimit;
  if (args.maxPages) config.scraping.maxPages = args.maxPages;
  if (args.outputDir) config.output.directory = args.outputDir;
  if (args.saveRaw) config.output.saveRawJson = true;
  let rawQuery;
  let outputName;
  if (args.configFile) {
    const configData = await loadConfigFile(args.configFile);
    rawQuery = configData.query;
    outputName = configData.output || "search_" + formatDateWithTimestamp(/* @__PURE__ */ new Date());
  } else {
    rawQuery = args.query || "category=9&locations=75012__48.84105_2.38928_5000&price=150000-300000";
    outputName = args.output || "search_" + formatDateWithTimestamp(/* @__PURE__ */ new Date());
  }
  const search = normalizeSearchInput(rawQuery, config.api.baseUrl);
  logger.info(`Navigating to: ${search.navigateUrl}`);
  const cdp = await connectAndNavigate(search.navigateUrl);
  try {
    let buildId = "";
    if (!args.detailsOnly) {
      const searchResult = await scrapeAllSearchPages(cdp, search);
      buildId = searchResult.buildId;
      fs3.mkdirSync(config.output.directory, { recursive: true });
      const outputPath = `${config.output.directory}/${outputName}.json`;
      fs3.writeFileSync(outputPath, JSON.stringify(searchResult.ads, null, 2));
      logger.success(`Saved ${searchResult.ads.length} results to ${outputPath} (source: ${searchResult.source})`);
      if (config.output.saveRawJson) {
        const rawPath = `${config.output.directory}/raw_${outputName}.json`;
        fs3.writeFileSync(rawPath, JSON.stringify(searchResult.rawFirstPage, null, 2));
        logger.info(`Saved the raw first-page payload to ${rawPath}`);
      }
    }
    if (args.withDetails || args.detailsOnly) {
      const resultsPath = `${config.output.directory}/${outputName}.json`;
      if (!fs3.existsSync(resultsPath)) {
        logger.error(`Results file not found: ${resultsPath}. Run without --details-only first.`);
        process.exit(1);
      }
      const results = JSON.parse(fs3.readFileSync(resultsPath, "utf8"));
      const urls = results.map((ad) => ad.url).filter(Boolean);
      if (urls.length > 0) {
        if (!buildId) buildId = (await readPageSnapshot(cdp)).buildId ?? "";
        if (!buildId) logger.warn("No Next.js buildId on the page \u2014 reading each ad page directly.");
        const details = await scrapeAdDetails(cdp, urls, buildId);
        const detailsPath = `${config.output.directory}/details_${outputName}.json`;
        fs3.writeFileSync(detailsPath, JSON.stringify(details.success, null, 2));
        logger.success(`Saved ${details.success.length} ad details to ${detailsPath}`);
        if (details.failed.length > 0) {
          const failedPath = `${config.output.directory}/failed_${outputName}.json`;
          fs3.writeFileSync(failedPath, JSON.stringify(details.failed, null, 2));
          logger.warn(`${details.failed.length} pages failed \u2014 see ${failedPath}`);
        }
      } else {
        logger.warn("No URLs found in results file");
      }
    }
    logger.success("All tasks completed successfully");
  } finally {
    cdp.disconnect();
  }
}
var init_scrape = __esm({
  "src/scrape.ts"() {
    "use strict";
    init_browser();
    init_page_payload();
    init_scraper();
    init_utils();
    init_query();
    init_logger();
    init_config();
  }
});

// src/comparables-format.ts
function buildQueryFromAnnonce(a) {
  const params = new URLSearchParams();
  if (a.title) params.set("text", a.title);
  if (a.zipcode) params.set("locations", a.zipcode);
  return params.toString();
}
function escapePipe(s) {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}
function digest(a, ads) {
  const prices = ads.map((x) => x.price).filter((p) => p > 0).sort((x, y) => x - y);
  const min = prices[0] ?? 0;
  const max = prices[prices.length - 1] ?? 0;
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
  const lines = [
    `# Comparables \u2014 ${a.slug}`,
    "",
    `Query: \`${a.title || "(no title)"}\` \xB7 ${a.zipcode || "(no zipcode)"}`,
    `Found ${ads.length} comparable listing(s).`,
    "",
    `Price (where available): min **${min} \u20AC** \xB7 median **${median} \u20AC** \xB7 max **${max} \u20AC**`,
    "",
    "Use these to set `price`, `category` and category-specific `attributes` in annonce.md.",
    "",
    "| # | Title | Price | City | Key attributes |",
    "|---|-------|-------|------|----------------|"
  ];
  ads.slice(0, 40).forEach((x, i) => {
    const attrs = Object.entries(x.attributes ?? {}).slice(0, 4).map(([k, v]) => `${k}=${v}`).join(", ");
    lines.push(`| ${i + 1} | ${escapePipe(x.title)} | ${x.price || "?"} \u20AC | ${escapePipe(x.city ?? "")} | ${escapePipe(attrs)} |`);
  });
  lines.push("");
  return lines.join("\n");
}
var init_comparables_format = __esm({
  "src/comparables-format.ts"() {
    "use strict";
  }
});

// src/comparables.ts
var comparables_exports = {};
__export(comparables_exports, {
  runComparables: () => runComparables
});
import fs4 from "fs";
import path6 from "path";
async function runComparables(annoncesDir, slug, opts = {}) {
  const dir = path6.join(annoncesDir, slug);
  const a = parseAnnonce(dir);
  const rawQuery = opts.query ?? buildQueryFromAnnonce(a);
  if (!rawQuery) {
    throw new Error(`cannot build a comparables query for "${slug}" \u2014 add a title/zipcode or pass --query`);
  }
  selectBrowser({ browser: opts.browser, chromePath: opts.chromePath });
  if (opts.debuggingPort) config.browser.debuggingPort = opts.debuggingPort;
  if (opts.pageTimeout) config.browser.timeout = opts.pageTimeout;
  config.scraping.maxPages = opts.maxPages && opts.maxPages > 0 ? opts.maxPages : 1;
  const search = normalizeSearchInput(rawQuery, config.api.baseUrl);
  logger.info(`Scraping comparables: ${search.navigateUrl}`);
  const cdp = await connectAndNavigate(search.navigateUrl);
  try {
    const { ads, buildId } = await scrapeAllSearchPages(cdp, search);
    let enriched = ads;
    if (opts.withDetails && ads.length) {
      const detail = await scrapeAdDetails(
        cdp,
        ads.map((x) => x.url),
        buildId
      );
      if (detail.success.length) enriched = detail.success;
    }
    const jsonPath = path6.join(dir, "comparables.json");
    const mdPath = path6.join(dir, "comparables.md");
    fs4.writeFileSync(jsonPath, JSON.stringify(enriched, null, 2));
    fs4.writeFileSync(mdPath, digest(a, enriched));
    logger.success(`Wrote ${enriched.length} comparable(s) to ${mdPath}`);
    return { count: enriched.length, jsonPath, mdPath };
  } finally {
    cdp.disconnect();
  }
}
var init_comparables = __esm({
  "src/comparables.ts"() {
    "use strict";
    init_browser();
    init_comparables_format();
    init_config();
    init_logger();
    init_markdown();
    init_query();
    init_scraper();
  }
});

// src/deposit-form.ts
async function resolveSelector(cdp, candidates) {
  for (const sel of candidates) {
    const found = await cdp.evaluate(`!!document.querySelector(${JSON.stringify(sel)})`, false).catch(() => false);
    if (found) return sel;
  }
  return null;
}
async function clickSelector(cdp, candidates, opts = {}) {
  return cdp.evaluate(
    `(() => {
        const visible = ${VISIBLE_JS};
        for (const sel of ${JSON.stringify(candidates)}) {
          let els = [];
          try { els = Array.from(document.querySelectorAll(sel)); } catch (e) { continue; }
          const el = els.find((e) => visible(e) && !e.disabled && e.getAttribute('aria-disabled') !== 'true');
          if (el) { if (!${opts.dryRun === true}) el.click(); return true; }
        }
        return false;
      })()`,
    false
  ).catch(() => false);
}
async function clickByText(cdp, texts, cssFallback = [], opts = {}) {
  const ok = await cdp.evaluate(
    `(() => {
        /* click-by-text */
        const norm = ${NORM_JS};
        const visible = ${VISIBLE_JS};
        const wanted = ${JSON.stringify(texts)}.map(norm).filter(Boolean);
        const els = Array.from(document.querySelectorAll('button, a, [role="button"], [role="menuitem"], [role="tab"], input[type="submit"], input[type="button"]'));
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]')).filter(visible);
        let best = null, bestScore = 0;
        for (const el of els) {
          if (!visible(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
          const names = [norm(el.innerText || el.textContent || el.value || ''), norm(el.getAttribute('aria-label'))].filter(Boolean);
          let score = 0;
          wanted.forEach((w, wi) => {
            for (const t of names) {
              let tier = 0;
              if (t === w) tier = 3;
              else if (t.startsWith(w + ' ')) tier = 2;
              else if (w.length >= 4 && t.length <= w.length * 3 + 20 && (' ' + t + ' ').includes(' ' + w + ' ')) tier = 1;
              if (tier) score = Math.max(score, tier * 1000 - wi * 10);
            }
          });
          if (!score) continue;
          if (dialogs.some((d) => d.contains(el))) score += 500;
          else if (el.closest('form, main, [role="main"]')) score += 5;
          if (score > bestScore) { best = el; bestScore = score; }
        }
        if (!best) return false;
        if (!${opts.dryRun === true}) best.click();
        return true;
      })()`,
    false
  ).catch(() => false);
  if (ok) return true;
  return cssFallback.length ? clickSelector(cdp, cssFallback, opts) : false;
}
async function clickButton(cdp, button, opts = {}) {
  return clickByText(cdp, button.textCandidates, button.css, opts);
}
async function hasButton(cdp, button) {
  return clickButton(cdp, button, { dryRun: true });
}
async function clickButtonOrMenu(cdp, button, menu, waitMs = 600) {
  if (await clickButton(cdp, button)) return true;
  if (!await clickButton(cdp, menu)) return false;
  await delay(waitMs);
  return clickButton(cdp, button);
}
async function fillField(cdp, d, value, hint, opts = {}) {
  const sel = d.ref ? `[data-lbc-ref="${d.ref}"]` : d.selector;
  if (!sel) return { ok: false, reason: "gone" };
  if (d.type === "file") return { ok: false, reason: "unsupported" };
  return cdp.evaluate(
    `(async () => {
        /* fill-field */
        const norm = ${NORM_JS};
        const pick = ${PICK_JS};
        const visible = ${VISIBLE_JS};
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const TYPE = ${JSON.stringify(d.type)}, VALUE = ${JSON.stringify(value)}, HINT = ${JSON.stringify(hint ?? "")};
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return { ok: false, reason: 'gone' };
        const txt = (e) => ((e && (e.innerText || e.textContent)) || '').replace(/\\s+/g, ' ').trim();
        const setVal = (input, v) => {
          const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const desc = Object.getOwnPropertyDescriptor(proto, 'value');
          if (desc && desc.set) desc.set.call(input, v); else input.value = v;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const truthy = /^(true|1|oui|yes|on)$/i.test(VALUE.trim());
        if (el.scrollIntoView) el.scrollIntoView({ block: 'center' });
        if (TYPE === 'text' || TYPE === 'textarea') {
          if (el.focus) el.focus();
          setVal(el, VALUE);
          el.dispatchEvent(new Event('blur', { bubbles: true }));
          return norm(el.value) === norm(VALUE) ? { ok: true, detail: el.value } : { ok: false, reason: 'not-applied', detail: el.value };
        }
        if (TYPE === 'select') {
          const opts = Array.from(el.options);
          const i = pick(opts.map((o) => o.textContent || o.value), VALUE);
          if (i < 0) return { ok: false, reason: 'no-option' };
          el.value = opts[i].value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, detail: txt(opts[i]) };
        }
        if (TYPE === 'combobox') {
          const input = el.matches('input, textarea') ? el : (el.querySelector('input') || el);
          if (input.focus) input.focus();
          input.click();
          await sleep(150);
          if (input.matches('input, textarea')) setVal(input, VALUE);
          // Options can load asynchronously (address geocoding, \u22481\u20133 s live) and the
          // list first shows STALE entries: poll until an option MATCHES (~6 s max).
          let options = [], labels = [], i = -1;
          for (let t = 0; t < ${Math.max(1, Math.ceil((opts.optionWaitMs ?? 6e3) / 200))}; t++) {
            const lb = document.getElementById(input.getAttribute('aria-controls') || el.getAttribute('aria-controls') || '');
            options = Array.from((lb || document).querySelectorAll('[role="option"]')).filter((o) => visible(o) && o.getAttribute('aria-disabled') !== 'true');
            labels = options.map(txt);
            i = pick(labels, VALUE);
            if (i < 0 && HINT) i = pick(labels, HINT);
            if (i >= 0) break;
            await sleep(200);
          }
          if (!options.length) {
            // Free-text combobox: the typed value stands.
            return input.value ? { ok: true, detail: input.value } : { ok: false, reason: 'no-option' };
          }
          if (i < 0) return { ok: false, reason: 'no-option', detail: labels.slice(0, 8).join(' | ') };
          options[i].click();
          await sleep(300);
          return { ok: true, detail: labels[i] };
        }
        if (TYPE === 'radiogroup' || TYPE === 'radio') {
          const group = TYPE === 'radio' ? (el.closest('[role="radiogroup"]') || el.parentElement) : el;
          const radios = Array.from(group.querySelectorAll('[role="radio"], input[type="radio"]')).filter((o) => o.getAttribute('aria-hidden') !== 'true');
          const labelOf = (o) => {
            const lb = o.getAttribute('aria-labelledby');
            const viaFor = o.id ? document.querySelector('label[for="' + o.id.replace(/([^\\w-])/g, '\\\\$1') + '"]') : null;
            return o.getAttribute('aria-label') || (lb ? lb.split(/\\s+/).map((id) => txt(document.getElementById(id))).join(' ') : '') || txt(o) || txt(viaFor) || o.value || '';
          };
          const labels = radios.map(labelOf);
          const i = pick(labels, VALUE);
          if (i < 0) return { ok: false, reason: 'no-option', detail: labels.join(' | ') };
          radios[i].click();
          return { ok: true, detail: labels[i] };
        }
        if (TYPE === 'checkbox' || TYPE === 'switch') {
          const isOn = () => (el.getAttribute('role') ? el.getAttribute('aria-checked') === 'true' : !!el.checked);
          if (isOn() !== truthy) el.click();
          await sleep(150);
          return isOn() === truthy ? { ok: true, detail: String(truthy) } : { ok: false, reason: 'not-applied' };
        }
        if (el.getAttribute('contenteditable') === 'true') {
          el.focus();
          el.textContent = VALUE;
          el.dispatchEvent(new InputEvent('input', { bubbles: true }));
          return { ok: true, detail: VALUE };
        }
        return { ok: false, reason: 'unsupported' };
      })()`,
    true
  ).then((r) => r ?? { ok: false, reason: "error" }).catch(() => ({ ok: false, reason: "error" }));
}
async function currentUrl(cdp) {
  return cdp.evaluate("location.href", false).catch(() => "");
}
async function firstAdLink(cdp) {
  return cdp.evaluate(`(() => { const a = document.querySelector('a[href*="/ad/"]'); return a ? a.href : ''; })()`, false).catch(() => "");
}
async function probeLoggedIn(cdp, opts) {
  const signals = [];
  const domSel = await resolveSelector(cdp, opts.loggedInSelectors);
  if (domSel) signals.push(`dom:${domSel}`);
  if (await pageHasText(cdp, opts.loggedInTextMarkers)) signals.push("text");
  const loggedOutSignals = [];
  if (!signals.length && opts.loggedOutSelectors?.length) {
    const out = await resolveSelector(cdp, opts.loggedOutSelectors);
    if (out) loggedOutSignals.push(`dom:${out}`);
  }
  return { loggedIn: signals.length > 0, signals, loggedOutSignals };
}
async function pageHasText(cdp, markers) {
  return cdp.evaluate(
    `(() => { const n = ${NORM_JS}; const t = ' ' + n(document.body.innerText || document.body.textContent || '') + ' '; return ${JSON.stringify(markers)}.map(n).filter(Boolean).some((m) => t.includes(' ' + m + ' ')); })()`,
    false
  ).catch(() => false);
}
async function countElements(cdp, candidates) {
  return cdp.evaluate(
    `(() => { const s = new Set(); for (const c of ${JSON.stringify(candidates)}) { try { document.querySelectorAll(c).forEach((e) => s.add(e)); } catch (e) {} } return s.size; })()`,
    false
  ).catch(() => 0);
}
async function uploadPhotos(cdp, fileInputCandidates, absPaths, thumbnailCandidates = []) {
  const sel = await resolveSelector(cdp, fileInputCandidates);
  if (!sel || absPaths.length === 0) return 0;
  const before = thumbnailCandidates.length ? await countElements(cdp, thumbnailCandidates) : 0;
  await cdp.send("DOM.enable").catch(() => {
  });
  const doc = await cdp.send("DOM.getDocument", { depth: -1, pierce: true }).catch(() => null);
  const rootId = doc?.root?.nodeId;
  if (!rootId) return 0;
  const found = await cdp.send("DOM.querySelector", { nodeId: rootId, selector: sel }).catch(() => null);
  const nodeId = found?.nodeId;
  if (!nodeId) return 0;
  await cdp.send("DOM.setFileInputFiles", { nodeId, files: absPaths }).catch(() => {
  });
  let landed = 0;
  for (let i = 0; i < 10; i++) {
    const inInput = await cdp.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el && el.files ? el.files.length : 0; })()`, false).catch(() => 0);
    const thumbs = thumbnailCandidates.length ? await countElements(cdp, thumbnailCandidates) - before : 0;
    landed = Math.min(absPaths.length, Math.max(inInput, thumbs));
    if (landed >= absPaths.length) break;
    await delay(500);
  }
  return landed;
}
var NORM_JS, VISIBLE_JS, PICK_JS;
var init_deposit_form = __esm({
  "src/deposit-form.ts"() {
    "use strict";
    init_utils();
    NORM_JS = `(s) => String(s == null ? '' : s).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()`;
    VISIBLE_JS = `(el) => !!el && el.getAttribute('aria-hidden') !== 'true' && !!(el.offsetParent !== null || (el.getClientRects && el.getClientRects().length))`;
    PICK_JS = `(labels, wanted) => {
  const n = ${NORM_JS};
  const w = n(wanted);
  if (!w || !labels.length) return -1;
  const L = labels.map(n);
  const tiers = [(o) => o === w, (o) => o.startsWith(w) || (o.length > 2 && w.startsWith(o)), (o) => o.includes(w) || (o.length > 2 && w.includes(o))];
  for (const t of tiers) { const i = L.findIndex((o) => o && t(o)); if (i >= 0) return i; }
  const wt = new Set(w.split(' ').filter((x) => x.length > 1));
  let best = -1, bs = 0;
  L.forEach((o, i) => { const s = Array.from(new Set(o.split(' '))).filter((x) => wt.has(x)).length; if (s > bs || (s === bs && s > 0 && o.length < L[best].length)) { best = i; bs = s; } });
  return best;
}`;
  }
});

// src/screenshot.ts
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
async function captureScreenshot(cdp, absPath, opts = {}) {
  try {
    await cdp.send("Page.enable").catch(() => {
    });
    const params = { format: "png", captureBeyondViewport: true };
    if (opts.clip) params.clip = opts.clip;
    const res = await cdp.send("Page.captureScreenshot", params);
    const data = res?.data;
    if (typeof data !== "string" || !data) return false;
    writeFileSync(absPath, Buffer.from(data, "base64"));
    return true;
  } catch {
    return false;
  }
}
async function captureElement(cdp, candidates, absPath) {
  try {
    const sel = await resolveSelector(cdp, candidates);
    if (!sel) return false;
    await cdp.send("DOM.enable").catch(() => {
    });
    const doc = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
    const rootId = doc?.root?.nodeId;
    if (!rootId) return false;
    const found = await cdp.send("DOM.querySelector", { nodeId: rootId, selector: sel }).catch(() => null);
    const nodeId = found?.nodeId;
    if (!nodeId) return false;
    const box = await cdp.send("DOM.getBoxModel", { nodeId }).catch(() => null);
    const quad = box?.model?.border;
    if (!quad || quad.length < 8) return false;
    const xs = [quad[0], quad[2], quad[4], quad[6]];
    const ys = [quad[1], quad[3], quad[5], quad[7]];
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;
    if (width <= 0 || height <= 0) return false;
    return captureScreenshot(cdp, absPath, { clip: { x, y, width, height, scale: 1 } });
  } catch {
    return false;
  }
}
async function savePageHtml(cdp, absPath) {
  try {
    const html = await cdp.evaluate("document.documentElement.outerHTML", false);
    if (typeof html !== "string" || !html) return false;
    writeFileSync(absPath, html);
    return true;
  } catch {
    return false;
  }
}
var ShotLog;
var init_screenshot = __esm({
  "src/screenshot.ts"() {
    "use strict";
    init_deposit_form();
    ShotLog = class {
      constructor(slugDir) {
        this.slugDir = slugDir;
      }
      slugDir;
      shots = [];
      async shot(cdp, name) {
        const dir = join(this.slugDir, "shots");
        mkdirSync(dir, { recursive: true });
        const p = join(dir, `${name}.png`);
        if (await captureScreenshot(cdp, p)) this.shots.push({ name, path: p });
      }
      entries() {
        return this.shots;
      }
    };
  }
});

// src/auth.ts
var auth_exports = {};
__export(auth_exports, {
  attachCookies: () => attachCookies,
  checkLogin: () => checkLogin,
  ensureLoggedIn: () => ensureLoggedIn,
  loadCookiesJson: () => loadCookiesJson,
  runAuth: () => runAuth
});
import { mkdirSync as mkdirSync2, readFileSync as readFileSync2 } from "fs";
import path7 from "path";
async function defaultConnect(url) {
  const { connectAndNavigate: connectAndNavigate2 } = await Promise.resolve().then(() => (init_browser(), browser_exports));
  return connectAndNavigate2(url);
}
async function checkLogin(cdp) {
  const url = await currentUrl(cdp);
  if (url) {
    if (DEPOSIT.loginUrlPattern.test(url)) return { loggedIn: false, loggedOut: true, signals: ["url:login"], url };
    if (!AUTH.leboncoinHostPattern.test(url)) return { loggedIn: false, loggedOut: true, signals: ["url:offsite-auth"], url };
  }
  let probe = await probeLoggedIn(cdp, AUTH);
  if (!probe.loggedIn) {
    await delay(REPROBE_DELAY_MS);
    probe = await probeLoggedIn(cdp, AUTH);
  }
  if (probe.loggedIn) return { loggedIn: true, loggedOut: false, signals: probe.signals, url };
  if (probe.loggedOutSignals.length) return { loggedIn: false, loggedOut: true, signals: probe.loggedOutSignals.map((s) => `logged-out:${s}`), url };
  const loggedOut = await pageHasText(cdp, AUTH.loginRequiredTextMarkers);
  return { loggedIn: false, loggedOut, signals: loggedOut ? ["text:login"] : [], url };
}
async function ensureLoggedIn(cdp) {
  const state = await checkLogin(cdp);
  return state.loggedOut ? { ok: false, reason: "login-required", state } : { ok: true, state };
}
function loadCookiesJson(absPath) {
  const data = JSON.parse(readFileSync2(absPath, "utf8"));
  const arr = Array.isArray(data) ? data : Array.isArray(data?.cookies) ? data.cookies : [];
  return arr.filter(
    (c) => !!c && typeof c === "object" && typeof c.name === "string" && typeof c.value === "string"
  ).map((c) => ({
    name: c.name,
    value: c.value,
    domain: typeof c.domain === "string" ? c.domain : void 0,
    path: typeof c.path === "string" ? c.path : void 0,
    secure: typeof c.secure === "boolean" ? c.secure : void 0,
    httpOnly: typeof c.httpOnly === "boolean" ? c.httpOnly : void 0,
    expires: typeof c.expires === "number" ? c.expires : typeof c.expirationDate === "number" ? c.expirationDate : void 0,
    sameSite: c.sameSite === "Strict" || c.sameSite === "Lax" || c.sameSite === "None" ? c.sameSite : void 0
  }));
}
async function attachCookies(cdp, cookies) {
  await cdp.send("Network.enable").catch(() => {
  });
  let applied = 0;
  for (const c of cookies) {
    const params = {
      name: c.name,
      value: c.value,
      domain: c.domain ?? ".leboncoin.fr",
      path: c.path ?? "/",
      secure: c.secure ?? true,
      httpOnly: c.httpOnly ?? false
    };
    if (typeof c.expires === "number") params.expires = c.expires;
    if (c.sameSite) params.sameSite = c.sameSite;
    const res = await cdp.send("Network.setCookie", params).catch(() => null);
    if (res?.success === true) applied++;
  }
  return applied;
}
async function runAuth(opts = {}, deps = {}) {
  const connect = deps.connect ?? defaultConnect;
  const cdp = await connect(AUTH.accountUrl);
  try {
    if (await isOnCaptcha(cdp)) await waitForCaptchaResolution(cdp);
    let cookiesAttached;
    if (opts.cookiesFile) {
      const cookies = loadCookiesJson(opts.cookiesFile);
      cookiesAttached = await attachCookies(cdp, cookies);
      logger.warn(`Attached ${cookiesAttached}/${cookies.length} cookie(s) \u2014 best-effort only; DataDome may still reject. Re-checking\u2026`);
      await cdp.send("Page.navigate", { url: AUTH.accountUrl }).catch(() => {
      });
      await delay(REPROBE_DELAY_MS);
    }
    let state = await checkLogin(cdp);
    if (!state.loggedIn) {
      logger.warn("Not logged in to Leboncoin \u2014 log in once in the opened browser window.");
      const timeout = opts.timeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS;
      const start = Date.now();
      while (Date.now() - start < timeout) {
        await delay(POLL_INTERVAL_MS);
        state = await checkLogin(cdp);
        if (state.loggedIn) break;
      }
    }
    let outPath = opts.out;
    if (!outPath) {
      const { getAuthStatePath: getAuthStatePath2 } = await Promise.resolve().then(() => (init_config(), config_exports));
      outPath = getAuthStatePath2();
    }
    mkdirSync2(path7.dirname(outPath), { recursive: true });
    const screenshot = await captureScreenshot(cdp, outPath) ? outPath : void 0;
    if (state.loggedIn) {
      logger.success(`Logged in to Leboncoin${state.signals.length ? ` (${state.signals.join(", ")})` : ""}.`);
      if (screenshot) logger.info(`Auth-state screenshot \u2192 ${screenshot} (read it to confirm the account is shown).`);
    } else {
      logger.error("Still not logged in. Log in once in the browser, then retry.");
    }
    return {
      ok: state.loggedIn,
      loggedIn: state.loggedIn,
      reason: state.loggedIn ? void 0 : "login-required",
      screenshot,
      cookiesAttached
    };
  } finally {
    cdp.disconnect();
  }
}
var DEFAULT_LOGIN_TIMEOUT_MS, POLL_INTERVAL_MS, REPROBE_DELAY_MS;
var init_auth = __esm({
  "src/auth.ts"() {
    "use strict";
    init_captcha();
    init_deposit_form();
    init_logger();
    init_screenshot();
    init_selectors();
    init_utils();
    DEFAULT_LOGIN_TIMEOUT_MS = 5 * 60 * 1e3;
    POLL_INTERVAL_MS = 3e3;
    REPROBE_DELAY_MS = 1500;
  }
});

// src/form-introspect.ts
import { writeFileSync as writeFileSync2 } from "fs";
function slugify(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
function isGeneratedId(id) {
  return /^:|_r_|^base-ui|^radix|^react-/i.test(id);
}
function buildFieldKey(d) {
  const stableId = d.id && !isGeneratedId(d.id) ? d.id : "";
  return d.dataQaId || d.name || d.rhfName || stableId || (d.label ? slugify(d.label) : "") || d.id || "field";
}
function summarizeFormMap(map) {
  const required = map.fields.filter((f) => f.required).length;
  const step = map.step?.title ? ` on \xAB ${map.step.title} \xBB` : "";
  return `${map.fields.length} field(s), ${required} required${step}`;
}
function writeFormMap(absPath, map) {
  try {
    writeFileSync2(absPath, JSON.stringify(map, null, 2));
    return true;
  } catch {
    return false;
  }
}
function defaultProbes() {
  return Object.entries(LOGICAL_FIELDS).filter(([, spec]) => spec.css.length > 0).map(([name, spec]) => ({ name, css: spec.css }));
}
function introspectScript(probes, stepTitle) {
  return `(() => {
  /* introspect-form */
  const PROBES = ${JSON.stringify(probes)};
  const STEP_TITLE = ${JSON.stringify(stepTitle)};
  const MAX = 120;
  const attr = (el, n) => (el && el.getAttribute && el.getAttribute(n)) || '';
  const visible = (el) => !!(el.offsetParent !== null || (el.getClientRects && el.getClientRects().length));
  const text = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\\s+/g, ' ').trim();
  const byIds = (ids) => ids.split(/\\s+/).map((id) => text(document.getElementById(id))).join(' ').trim();
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/([^\\w-])/g, '\\\\$1'));
  function labelFor(el) {
    const al = attr(el, 'aria-label'); if (al) return al.trim();
    const lb = attr(el, 'aria-labelledby'); if (lb) { const t = byIds(lb); if (t) return t; }
    if (el.id) { try { const l = document.querySelector('label[for="' + esc(el.id) + '"]'); if (l && text(l)) return text(l); } catch (e) {} }
    const wrap = el.closest && el.closest('label'); if (wrap && text(wrap)) return text(wrap);
    if (el.placeholder) return el.placeholder.trim();
    return attr(el, 'name') || el.id || '';
  }
  function altLabelsFor(el, main) {
    const box = el.closest('[data-rhf-name]') || el.closest('fieldset') || el.parentElement;
    if (!box) return [];
    const out = [];
    for (const l of Array.from(box.querySelectorAll('label, legend')).slice(0, 6)) {
      if (l.contains(el)) continue;
      const t = text(l).slice(0, 120);
      if (t && t !== main && out.indexOf(t) < 0) out.push(t);
      if (out.length >= 3) break;
    }
    return out;
  }
  function requiredOf(el, labels) {
    if (el.required) return 'required-attr';
    if (attr(el, 'aria-required') === 'true') return 'aria-required';
    if (labels.some((l) => l && l.indexOf('*') >= 0)) return 'asterisk';
    if (attr(el, 'aria-invalid') === 'true') return 'aria-invalid';
    return null;
  }
  function typeOf(el) {
    const tag = el.tagName.toLowerCase();
    const role = attr(el, 'role');
    if (role === 'radiogroup') return 'radiogroup';
    if (role === 'combobox' || role === 'listbox') return 'combobox';
    if (role === 'switch') return 'switch';
    if (role === 'checkbox') return 'checkbox';
    if (tag === 'textarea') return 'textarea';
    if (tag === 'select') return 'select';
    const t = (el.type || '').toLowerCase();
    if (t === 'checkbox') return 'checkbox';
    if (t === 'radio') return 'radio';
    if (t === 'file') return 'file';
    if (tag === 'input') return 'text';
    return 'other';
  }
  function optionLabel(o) {
    const lb = attr(o, 'aria-labelledby');
    const viaFor = o.id ? document.querySelector('label[for="' + esc(o.id) + '"]') : null;
    return (attr(o, 'aria-label') || (lb && byIds(lb)) || text(o) || text(viaFor) || o.value || '').slice(0, 120);
  }
  function optionsOf(el, type) {
    if (type === 'select') return Array.from(el.options).slice(0, 80).map((o) => ({ label: text(o), value: o.value }));
    if (type === 'combobox') {
      const lb = document.getElementById(attr(el, 'aria-controls')) || (attr(el, 'role') === 'listbox' ? el : null);
      if (!lb) return undefined;
      return Array.from(lb.querySelectorAll('[role="option"]')).slice(0, 80).map((o) => ({ label: text(o).slice(0, 120), value: attr(o, 'data-value') || attr(o, 'value') || text(o).slice(0, 120) }));
    }
    if (type === 'radiogroup') {
      return Array.from(el.querySelectorAll('[role="radio"], input[type="radio"]'))
        .filter((o) => attr(o, 'aria-hidden') !== 'true')
        .slice(0, 40)
        .map((o) => ({ label: optionLabel(o), value: o.value || attr(o, 'value') || optionLabel(o) }));
    }
    return undefined;
  }
  function valueOf(el, type) {
    if (type === 'switch' || type === 'checkbox') return attr(el, 'role') ? attr(el, 'aria-checked') : (el.checked ? 'true' : 'false');
    if (type === 'radiogroup') {
      const on = Array.from(el.querySelectorAll('[role="radio"], input[type="radio"]')).find((o) => attr(o, 'aria-checked') === 'true' || o.checked);
      return on ? optionLabel(on) : '';
    }
    if (attr(el, 'contenteditable') === 'true') return text(el);
    return el.value != null ? String(el.value) : '';
  }
  function cssOf(el, ref) {
    const qa = attr(el, 'data-qa-id'); if (qa) return '[data-qa-id="' + qa + '"]';
    const name = attr(el, 'name');
    if (name && document.querySelectorAll('[name="' + name + '"]').length === 1) return el.tagName.toLowerCase() + '[name="' + name + '"]';
    return '[data-lbc-ref="' + ref + '"]';
  }
  const ROLE_TOGGLES = '[role="switch"], [role="checkbox"], [role="radio"]';
  const sel = 'input, textarea, select, [role="combobox"], [role="listbox"], [role="radiogroup"], [role="switch"], [role="checkbox"], [contenteditable="true"]';
  const out = [];
  const seen = new Set();
  window.__lbcRefSeq = window.__lbcRefSeq || 0;
  for (const el of Array.from(document.querySelectorAll(sel))) {
    if (out.length >= MAX) break;
    if (seen.has(el)) continue;
    seen.add(el);
    const t = (el.type || '').toLowerCase();
    const role = attr(el, 'role');
    if (t === 'hidden' || (el.tagName === 'INPUT' && (t === 'submit' || t === 'button'))) continue;
    if (t !== 'file' && !visible(el)) continue;
    if (t !== 'file' && attr(el, 'aria-hidden') === 'true') continue;
    // A radio inside a group is an OPTION of that group, not a field.
    if ((t === 'radio' || role === 'radio') && el.closest('[role="radiogroup"]')) continue;
    // A listbox driven by a combobox is that combobox's option list.
    if (role === 'listbox' && el.id && document.querySelector('[aria-controls="' + esc(el.id) + '"]')) continue;
    // A native checkbox shadowed by an ARIA switch/checkbox in the same container is a duplicate.
    if ((t === 'checkbox' || t === 'radio') && !role) {
      const box = el.closest('[data-rhf-name]') || el.parentElement;
      if (box && box.querySelector(ROLE_TOGGLES)) continue;
    }
    const type = typeOf(el);
    const label = labelFor(el);
    const altLabels = altLabelsFor(el, label);
    const reqSrc = requiredOf(el, [label].concat(altLabels));
    const rhfBox = el.closest('[data-rhf-name]');
    let ref = attr(el, 'data-lbc-ref');
    if (!ref) { ref = 'r' + (++window.__lbcRefSeq); el.setAttribute('data-lbc-ref', ref); }
    const cssHits = [];
    for (const p of PROBES) { if (p.css.some((s) => { try { return el.matches(s); } catch (e) { return false; } })) cssHits.push(p.name); }
    const value = valueOf(el, type);
    out.push({
      label: (label || '').slice(0, 120),
      altLabels: altLabels.length ? altLabels : undefined,
      name: attr(el, 'name') || (rhfBox && (type === 'switch' || type === 'checkbox') ? attr(rhfBox, 'data-rhf-name') : '') || undefined,
      id: el.id || undefined,
      dataQaId: attr(el, 'data-qa-id') || undefined,
      rhfName: rhfBox ? attr(rhfBox, 'data-rhf-name') : undefined,
      type,
      placeholder: el.placeholder || undefined,
      value: type === 'switch' || type === 'checkbox' ? '' : String(value).slice(0, 200),
      checked: type === 'switch' || type === 'checkbox' || type === 'radio' ? value === 'true' || !!el.checked : undefined,
      options: optionsOf(el, type),
      required: !!reqSrc,
      requiredSource: reqSrc || undefined,
      selector: cssOf(el, ref),
      ref,
      cssHits: cssHits.length ? cssHits : undefined,
    });
  }
  let stepTitle = '';
  for (const s of STEP_TITLE) { const h = document.querySelector(s); if (h && text(h)) { stepTitle = text(h).slice(0, 160); break; } }
  return { url: location.href, fields: out, stepTitle };
})()`;
}
async function introspectForm(cdp, opts = {}) {
  try {
    const raw = await cdp.evaluate(
      introspectScript(opts.probes ?? defaultProbes(), opts.stepTitle ?? DEPOSIT.stepTitle),
      false
    );
    if (!raw || !Array.isArray(raw.fields)) return { url: typeof raw?.url === "string" ? raw.url : "", fields: [] };
    const seen = /* @__PURE__ */ new Map();
    const fields = raw.fields.map((f) => {
      const base = buildFieldKey(f);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return { ...f, key: n === 0 ? base : `${base}-${n}` };
    });
    const map = { url: raw.url ?? "", fields };
    if (typeof raw.stepTitle === "string") {
      map.step = { title: raw.stepTitle, fingerprint: stepFingerprint(raw.stepTitle, fields) };
    }
    return map;
  } catch {
    return { url: "", fields: [] };
  }
}
function stepFingerprint(title, fields) {
  return `${title}|${fields.map((f) => f.key).sort().join(",")}`;
}
var init_form_introspect = __esm({
  "src/form-introspect.ts"() {
    "use strict";
    init_selectors();
  }
});

// src/inspect.ts
var inspect_exports = {};
__export(inspect_exports, {
  runInspect: () => runInspect
});
import { mkdirSync as mkdirSync3 } from "fs";
import path8 from "path";
async function defaultConnect2(url) {
  const { connectAndNavigate: connectAndNavigate2 } = await Promise.resolve().then(() => (init_browser(), browser_exports));
  return connectAndNavigate2(url);
}
async function runInspect(annoncesDir, slug, _opts = {}, deps = {}) {
  const dir = path8.join(annoncesDir, slug);
  const connect = deps.connect ?? defaultConnect2;
  const cdp = await connect(DEPOSIT.startUrl);
  try {
    const auth = await ensureLoggedIn(cdp);
    if (!auth.ok) {
      logger.error("Not logged in to Leboncoin \u2014 run `login`, then retry.");
      return { ok: false, reason: "login-required" };
    }
    if (await isOnCaptcha(cdp)) await waitForCaptchaResolution(cdp);
    mkdirSync3(dir, { recursive: true });
    const formMap = await introspectForm(cdp);
    const formMapPath = path8.join(dir, "form-map.json");
    const written = writeFormMap(formMapPath, { steps: [formMap] });
    const previewPng = await captureScreenshot(cdp, path8.join(dir, "initial.png")) ? path8.join(dir, "initial.png") : void 0;
    const previewHtml = await savePageHtml(cdp, path8.join(dir, "initial.html")) ? path8.join(dir, "initial.html") : void 0;
    logger.success(`Live form: ${summarizeFormMap(formMap)}${written ? ` \u2192 ${formMapPath}` : ""}`);
    logger.info(
      "Read form-map.json + initial.png. Later steps (photos, attributes, review) only appear once step 1 is filled: run `publish <slug> --diagnostic` to walk them all without submitting."
    );
    return { ok: true, formMap, formMapPath: written ? formMapPath : void 0, previewPng, previewHtml };
  } finally {
    cdp.disconnect();
  }
}
var init_inspect = __esm({
  "src/inspect.ts"() {
    "use strict";
    init_auth();
    init_captcha();
    init_form_introspect();
    init_logger();
    init_screenshot();
    init_selectors();
  }
});

// src/field-match.ts
function normalizeText(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function hasWord(haystack, needle) {
  if (!haystack || !needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}
function tokens(s) {
  return normalizeText(s).split(" ").filter((t) => t.length > 1);
}
function pickOption(options, wanted) {
  const w = normalizeText(wanted);
  if (!w || options.length === 0) return -1;
  const norm = options.map(normalizeText);
  const tiers = [
    (o) => o === w,
    (o) => o.startsWith(w) || o.length > 2 && w.startsWith(o),
    (o) => o.includes(w) || o.length > 2 && w.includes(o)
  ];
  for (const tier of tiers) {
    const i = norm.findIndex((o) => o && tier(o));
    if (i >= 0) return i;
  }
  const wt = new Set(tokens(wanted));
  let best = -1;
  let bestScore = 0;
  norm.forEach((o, i) => {
    const score = [...new Set(tokens(o))].filter((t) => wt.has(t)).length;
    if (score > bestScore || score === bestScore && score > 0 && o.length < (norm[best] ?? "").length) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}
function pickCategoryCard(cards, wanted) {
  if (cards.length === 0) return { index: -1, guessed: true };
  const byName = pickOption(
    cards.map((c) => c.name),
    wanted
  );
  if (byName >= 0) return { index: byName, guessed: false };
  const byFamily = pickOption(
    cards.map((c) => c.family ?? ""),
    wanted
  );
  if (byFamily >= 0) return { index: byFamily, guessed: false };
  return { index: 0, guessed: true };
}
function isFieldFilled(f) {
  if (f.type === "checkbox" || f.type === "switch" || f.type === "radio") return f.checked === true;
  return String(f.value ?? "").trim() !== "";
}
function truthy(v) {
  return /^(true|1|oui|yes|on)$/i.test(v.trim());
}
function valueAlreadySet(f, wanted) {
  if (f.type === "checkbox" || f.type === "switch") return f.checked === true === truthy(wanted);
  return normalizeText(f.value) !== "" && normalizeText(f.value) === normalizeText(wanted);
}
function logicalValue(a, name) {
  switch (name) {
    case "title":
      return a.title ? { value: a.title } : null;
    case "description":
      return a.description ? { value: a.description } : null;
    case "price":
      return a.price > 0 ? { value: String(a.price) } : null;
    case "location":
      if (a.zipcode) return { value: a.city ? `${a.zipcode} ${a.city}` : a.zipcode, hint: a.zipcode };
      return a.city ? { value: a.city } : null;
    case "category":
      return a.category ? { value: a.category } : null;
    case "condition":
      return a.condition ? { value: a.condition } : null;
    case "shipping":
      return typeof a.shipping === "boolean" ? { value: String(a.shipping) } : null;
    case "photos":
      return null;
  }
}
function identities(f) {
  return [f.name, f.rhfName, f.dataQaId, f.id].map(normalizeText).filter(Boolean);
}
function labelTexts(f) {
  return [f.label, ...f.altLabels ?? []].map(normalizeText).filter(Boolean);
}
function scoreLogical(f, name, spec) {
  if (!spec.types.includes(f.type)) return null;
  if (f.cssHits?.includes(name)) return { confidence: 1, via: "selector" };
  const ids = identities(f);
  if (spec.names.some((n) => ids.includes(normalizeText(n)))) return { confidence: 0.95, via: "name" };
  const labels = labelTexts(f);
  if (spec.labels.some((l) => labels.some((t) => hasWord(t, normalizeText(l))))) return { confidence: 0.8, via: "label" };
  const ph = normalizeText(f.placeholder);
  if (spec.labels.some((l) => hasWord(ph, normalizeText(l)))) return { confidence: 0.6, via: "placeholder" };
  if (spec.types.length === 1 && spec.types[0] === f.type && f.type === "file") return { confidence: 0.5, via: "type" };
  return null;
}
function scoreAttribute(f, key) {
  if (f.type === "file") return null;
  const k = normalizeText(key);
  if (!k) return null;
  const ids = identities(f);
  if (ids.includes(k)) return { confidence: 0.95, via: "name" };
  const kSnake = k.replace(/ /g, "_");
  const rawIds = [f.name, f.rhfName, f.dataQaId].filter(Boolean).map((s) => String(s).toLowerCase());
  if (rawIds.some((id) => id.endsWith(`_${kSnake}`))) return { confidence: 0.85, via: "suffix" };
  const labels = labelTexts(f);
  if (labels.some((t) => t === k || t.startsWith(`${k} `))) return { confidence: 0.8, via: "label" };
  if (normalizeText(f.placeholder) === k) return { confidence: 0.6, via: "placeholder" };
  return null;
}
function matchFields(map, a, logical = LOGICAL_FIELDS) {
  const candidates = [];
  let order = 0;
  for (const name of Object.keys(logical)) {
    const value = name === "photos" ? { value: "" } : logicalValue(a, name);
    if (!value) continue;
    for (const field of map.fields) {
      const s = scoreLogical(field, name, logical[name]);
      if (s) candidates.push({ field, target: { kind: "logical", name }, ...value, ...s, order: order++ });
    }
  }
  const attrs = Object.entries(a.attributes ?? {});
  for (const [key, raw] of attrs) {
    const value = String(raw ?? "");
    if (!value) continue;
    for (const field of map.fields) {
      const s = scoreAttribute(field, key);
      if (s) candidates.push({ field, target: { kind: "attribute", key }, value, ...s, confidence: s.confidence - 0.01, order: order++ });
    }
  }
  candidates.sort((x, y) => y.confidence - x.confidence || x.order - y.order);
  const usedFields = /* @__PURE__ */ new Set();
  const usedTargets = /* @__PURE__ */ new Set();
  const matches = [];
  for (const c of candidates) {
    const t = c.target.kind === "logical" ? `l:${c.target.name}` : `a:${c.target.key}`;
    if (usedFields.has(c.field) || usedTargets.has(t)) continue;
    usedFields.add(c.field);
    usedTargets.add(t);
    const { order: _o, ...m } = c;
    matches.push(m);
  }
  const unmatchedAttributes = attrs.map(([k]) => k).filter((k) => !usedTargets.has(`a:${k}`));
  return { matches, unmatchedAttributes };
}
var init_field_match = __esm({
  "src/field-match.ts"() {
    "use strict";
    init_selectors();
  }
});

// src/readiness.ts
import { writeFileSync as writeFileSync3 } from "fs";
async function readFormError(cdp) {
  return cdp.evaluate(
    `(() => {
        const visible = (el) => !!(el.offsetParent !== null || (el.getClientRects && el.getClientRects().length));
        const els = Array.from(document.querySelectorAll('[role="alert"], [aria-live="assertive"], [class*="error" i], [data-qa-id*="error" i], [id$="-error"], [id*="error-message" i]'));
        for (const el of els) {
          const t = (el.innerText || el.textContent || '').trim();
          if (t && visible(el) && t.length < 200) return t;
        }
        return null;
      })()`,
    false
  ).catch(() => null);
}
async function isSubmitEnabled(cdp) {
  const norm = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const texts = JSON.stringify([...DEPOSIT.publishButton.textCandidates, ...DEPOSIT.nextButton.textCandidates].map(norm));
  const css = JSON.stringify([...DEPOSIT.publishButton.css, ...DEPOSIT.nextButton.css]);
  return cdp.evaluate(
    `(() => {
        /* submit-enabled probe */
        const texts = ${texts}, css = ${css};
        let btn = null;
        const n = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036F]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const visible = (el) => !!(el.offsetParent !== null || (el.getClientRects && el.getClientRects().length));
        const all = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]')).filter(visible);
        for (const w of texts) {
          btn = all.find((el) => { const t = n(el.innerText || el.textContent || el.value); return t === w || t.startsWith(w + ' '); }) || null;
          if (btn) break;
        }
        if (!btn) { for (const sel of css) { const el = Array.from(document.querySelectorAll(sel)).find(visible); if (el) { btn = el; break; } } }
        if (!btn) return null;
        return !btn.disabled && btn.getAttribute('aria-disabled') !== 'true';
      })()`,
    false
  ).catch(() => null);
}
async function buildReadiness(cdp, report, href) {
  const checks = [];
  const missingRequired = report.fields.filter((f) => f.required && (!f.hasValue || !f.filled)).map((f) => f.field);
  checks.push({
    name: "required-fields",
    ok: missingRequired.length === 0,
    detail: missingRequired.length ? `missing: ${missingRequired.join(", ")}` : "all required fields filled"
  });
  const photosOk = report.expectedPhotos > 0 && report.uploadedPhotos >= report.expectedPhotos;
  checks.push({ name: "photos", ok: photosOk, detail: `${report.uploadedPhotos}/${report.expectedPhotos} uploaded` });
  const loginOk = !DEPOSIT.loginUrlPattern.test(href);
  checks.push({ name: "login", ok: loginOk, detail: loginOk ? "session active" : "redirected to login" });
  const submit = await isSubmitEnabled(cdp);
  checks.push({
    name: "submit-enabled",
    ok: submit === true,
    detail: submit === null ? "submit button not found" : submit ? "enabled" : "disabled"
  });
  const err = await readFormError(cdp);
  checks.push({ name: "no-form-error", ok: !err, detail: err ? `form error: ${err}` : "no visible error" });
  if (report.wizard) {
    const final = report.wizard.stop === "final";
    checks.push({
      name: "final-step",
      ok: final,
      detail: final ? `reached the final review after ${report.wizard.steps} step(s)` : `wizard stopped early: ${report.wizard.stop}${report.wizard.error ? ` (${report.wizard.error})` : ""}`
    });
  }
  const blockers = checks.filter((c) => !c.ok).map((c) => `${c.name} (${c.detail})`);
  return { ready: blockers.length === 0, checks, blockers };
}
function writeReadiness(absPath, readiness) {
  try {
    writeFileSync3(absPath, JSON.stringify(readiness, null, 2));
    return true;
  } catch {
    return false;
  }
}
var init_readiness = __esm({
  "src/readiness.ts"() {
    "use strict";
    init_selectors();
  }
});

// src/deposit-wizard.ts
async function readCategoryCards(cdp) {
  const cards = await cdp.evaluate(
    `(() => {
        /* category-cards */
        const re = new RegExp(${JSON.stringify(DEPOSIT.categoryAriaPattern.source)}, 'i');
        const visible = (el) => !!(el.offsetParent !== null || (el.getClientRects && el.getClientRects().length));
        const out = [];
        const seen = new Set();
        window.__lbcRefSeq = window.__lbcRefSeq || 0;
        for (const sel of ${JSON.stringify(DEPOSIT.categoryCards)}) {
          let els = [];
          try { els = Array.from(document.querySelectorAll(sel)); } catch (e) { continue; }
          for (const el of els) {
            if (seen.has(el) || !visible(el)) continue;
            seen.add(el);
            const m = (el.getAttribute('aria-label') || '').match(re);
            if (!m) continue;
            let ref = el.getAttribute('data-lbc-ref');
            if (!ref) { ref = 'c' + (++window.__lbcRefSeq); el.setAttribute('data-lbc-ref', ref); }
            out.push({ name: m[1].trim(), family: m[2].trim(), ref });
          }
        }
        return out;
      })()`,
    false
  ).catch(() => []);
  return Array.isArray(cards) ? cards : [];
}
async function clickRef(cdp, ref) {
  return cdp.evaluate(`(() => { const el = document.querySelector('[data-lbc-ref="${ref}"]'); if (!el) return false; el.click(); return true; })()`, false).catch(() => false);
}
async function chooseCategory(cdp, wanted, needed) {
  let cards = await readCategoryCards(cdp);
  for (let i = 0; needed && cards.length === 0 && i < 12; i++) {
    await delay(750);
    cards = await readCategoryCards(cdp);
  }
  if (cards.length === 0 && needed && await clickButton(cdp, DEPOSIT.categoryTreeButton)) {
    await delay(800);
    cards = await readCategoryCards(cdp);
  }
  if (cards.length === 0) return null;
  const pick = pickCategoryCard(cards, wanted);
  const card = cards[pick.index];
  if (!card || !await clickRef(cdp, card.ref)) return null;
  return { picked: card.name, family: card.family, guessed: pick.guessed || !wanted };
}
async function isFinalStep(cdp, markers, buttons) {
  if (markers.length && await pageHasText(cdp, markers)) return true;
  for (const b of buttons) if (await hasButton(cdp, b)) return true;
  return false;
}
function looksLikeFinalReview(map) {
  const core = /* @__PURE__ */ new Set(["title", "description", "price", "location"]);
  const onStep = matchFields(map, PROBE_ANNONCE).matches.map((m) => m.target.kind === "logical" ? m.target.name : "").filter((n) => core.has(n));
  return new Set(onStep).size >= 3;
}
function isPaidOption(f) {
  return [f.label, ...f.altLabels ?? []].some((l) => /\d\s*(?:[,.]\d{1,2})?\s*€|€\s*\d/.test(l ?? ""));
}
function blocksStep(f) {
  if (!f.required || isPaidOption(f)) return false;
  if ((f.type === "checkbox" || f.type === "switch") && f.requiredSource === "asterisk") return false;
  return true;
}
function describe(f) {
  return f.label || f.altLabels?.[0] || f.key;
}
async function runWizard(cdp, a, opts) {
  const maxSteps = opts.maxSteps ?? 15;
  const settle = opts.settleMs ?? 1500;
  const finalMarkers = opts.finalMarkers ?? DEPOSIT.finalStepMarkers;
  const finalButtons = opts.finalButtons ?? [DEPOSIT.publishButton];
  const nextButton = opts.nextButton ?? DEPOSIT.nextButton;
  const result = {
    steps: [],
    stop: "max-steps",
    uploadedPhotos: 0,
    expectedPhotos: opts.photos.length,
    written: [],
    failed: [],
    unmatchedAttributes: Object.keys(a.attributes ?? {})
  };
  const written = /* @__PURE__ */ new Set();
  const failed = /* @__PURE__ */ new Set();
  let categoryAttempts = 0;
  for (let index = 1; index <= maxSteps; index++) {
    await delay(settle);
    if (await isOnCaptcha(cdp)) {
      if (!await waitForCaptchaResolution(cdp)) {
        result.stop = "captcha";
        break;
      }
    }
    const url = await currentUrl(cdp);
    if (url && DEPOSIT.loginUrlPattern.test(url)) {
      result.stop = "login-required";
      break;
    }
    const fills = [];
    const map = await introspectForm(cdp);
    const { matches, unmatchedAttributes } = matchFields(map, a);
    result.unmatchedAttributes = result.unmatchedAttributes.filter((k) => unmatchedAttributes.includes(k));
    for (const m of matches) {
      const target = m.target.kind === "logical" ? m.target.name : `attr:${m.target.key}`;
      if (target === "photos") continue;
      if (isPaidOption(m.field)) {
        logger.warn(`Skipped \xAB ${describe(m.field)} \xBB: a paid option is never set automatically.`);
        continue;
      }
      const label = describe(m.field);
      if (valueAlreadySet(m.field, m.value)) {
        fills.push({ target, field: label, value: m.value, ok: true, via: m.via, detail: "already" });
        written.add(target);
        continue;
      }
      const r = await fillField(cdp, m.field, m.value, m.hint);
      fills.push({ target, field: label, value: m.value, ok: r.ok, via: m.via, detail: r.detail, reason: r.reason });
      if (r.ok) {
        written.add(target);
        failed.delete(target);
      } else if (!written.has(target)) {
        failed.add(target);
        logger.warn(`Could not set \xAB ${label} \xBB to "${m.value}"${r.reason ? ` (${r.reason}${r.detail ? `: ${r.detail}` : ""})` : ""}.`);
      }
      await delay(300);
    }
    if (opts.photos.length && result.uploadedPhotos === 0 && map.fields.some((f) => f.type === "file")) {
      result.uploadedPhotos = await uploadPhotos(cdp, DEPOSIT.photoFileInput, opts.photos, DEPOSIT.photoThumbnails);
      if (result.uploadedPhotos < opts.photos.length) {
        if (await clickButton(cdp, DEPOSIT.photoAddButton)) {
          await delay(800);
          result.uploadedPhotos = Math.max(result.uploadedPhotos, await uploadPhotos(cdp, DEPOSIT.photoFileInput, opts.photos, DEPOSIT.photoThumbnails));
        }
      }
      fills.push({
        target: "photos",
        field: "photos",
        value: `${opts.photos.length} file(s)`,
        ok: result.uploadedPhotos >= opts.photos.length,
        via: "type",
        detail: `${result.uploadedPhotos}/${opts.photos.length}`
      });
      if (result.uploadedPhotos > 0) written.add("photos");
      await delay(1500);
    }
    if (categoryAttempts < 2) {
      const allowTree = !written.has("category") && written.has("title") && !await hasButton(cdp, nextButton);
      const chosen = await chooseCategory(cdp, a.category, allowTree);
      if (chosen) {
        categoryAttempts++;
        result.category = chosen;
        written.add("category");
        fills.push({
          target: "category",
          field: "cat\xE9gorie",
          value: a.category,
          ok: true,
          via: "category",
          detail: `${chosen.family ?? ""} \u203A ${chosen.picked}`
        });
        if (chosen.guessed) logger.warn(`Category \xAB ${a.category || "(none)"} \xBB not offered \u2014 picked the site's suggestion \xAB ${chosen.picked} \xBB. Check it.`);
        await delay(settle);
        const after = await introspectForm(cdp);
        if (after.step?.fingerprint !== map.step?.fingerprint) {
          result.steps.push({ index, title: map.step?.title ?? "", url, fills, unresolvedRequired: [], final: false, formMap: map });
          await opts.shotLog?.shot(cdp, `step-${String(index).padStart(2, "0")}`);
          continue;
        }
      }
    }
    const filledMap = await introspectForm(cdp);
    const photosOk = result.uploadedPhotos > 0 || await countElements(cdp, DEPOSIT.photoThumbnails) > 0;
    const unresolvedRequired = filledMap.fields.filter((f) => blocksStep(f) && !(f.type === "file" ? photosOk : isFieldFilled(f))).map((f) => `${describe(f)} (required on the live form \u2014 ${f.requiredSource ?? "required"})`);
    const final = looksLikeFinalReview(filledMap) || await isFinalStep(cdp, finalMarkers, finalButtons);
    result.steps.push({ index, title: filledMap.step?.title ?? "", url, fills, unresolvedRequired, final, formMap: filledMap });
    await opts.shotLog?.shot(cdp, `step-${String(index).padStart(2, "0")}`);
    if (final) {
      result.stop = "final";
      break;
    }
    if (unresolvedRequired.length) {
      result.stop = "missing-required";
      break;
    }
    if (await isFinalStep(cdp, finalMarkers, finalButtons)) {
      result.stop = "final";
      result.steps[result.steps.length - 1].final = true;
      break;
    }
    if (!await clickButton(cdp, nextButton)) {
      result.stop = "no-next";
      break;
    }
    await delay(settle);
    const moved = await introspectForm(cdp);
    if (moved.step?.fingerprint === filledMap.step?.fingerprint && await currentUrl(cdp) === url) {
      result.stop = "stuck";
      result.error = await readFormError(cdp) ?? "the form did not move to the next step";
      break;
    }
  }
  result.written = [...written];
  result.failed = [...failed].filter((t) => !written.has(t));
  return result;
}
var PROBE_ANNONCE;
var init_deposit_wizard = __esm({
  "src/deposit-wizard.ts"() {
    "use strict";
    init_captcha();
    init_deposit_form();
    init_field_match();
    init_form_introspect();
    init_logger();
    init_readiness();
    init_selectors();
    init_utils();
    PROBE_ANNONCE = {
      slug: "probe",
      title: "x",
      category: "x",
      price: 1,
      zipcode: "75001",
      attributes: {},
      photos: [],
      status: "draft",
      description: "x"
    };
  }
});

// src/publish.ts
var publish_exports = {};
__export(publish_exports, {
  fillForm: () => fillForm,
  runPublish: () => runPublish
});
import path9 from "path";
async function defaultConnect3(url) {
  const { connectAndNavigate: connectAndNavigate2 } = await Promise.resolve().then(() => (init_browser(), browser_exports));
  return connectAndNavigate2(url);
}
async function fillForm(cdp, a, photos, shotLog, wizardOpts = {}) {
  const wizard = await runWizard(cdp, a, { photos, shotLog, ...wizardOpts });
  const written = new Set(wizard.written);
  const reached = wizard.stop === "final";
  const fields = [];
  const missing = [];
  const warnings = [];
  for (const [logical, name, required] of REPORTED_FIELDS) {
    const hasValue = logical === "category" ? !!a.category : logicalValue(a, logical) !== null;
    if (!required && !hasValue) continue;
    const filled = written.has(logical);
    fields.push({ field: name, required, hasValue, filled });
    if (!required) {
      if (hasValue && !filled) warnings.push(`${name}: could not be set \u2014 set it in the browser if the form offers it`);
      continue;
    }
    if (!hasValue) missing.push(`${name} (missing in annonce)`);
    else if (!filled) missing.push(reached ? `${name} (form field not found)` : `${name} (not reached \u2014 wizard stopped: ${wizard.stop})`);
  }
  for (const key of Object.keys(a.attributes ?? {})) {
    fields.push({ field: `attr:${key}`, required: false, hasValue: true, filled: written.has(`attr:${key}`) });
  }
  const last = wizard.steps.at(-1);
  for (const u of last?.unresolvedRequired ?? []) {
    const label = u.split(" (")[0]?.toLowerCase() ?? u;
    if (missing.some((m) => m.toLowerCase().includes(label))) continue;
    fields.push({ field: u.split(" (")[0] ?? u, required: true, hasValue: false, filled: false });
    missing.push(u);
  }
  if (wizard.uploadedPhotos < photos.length) missing.push(`photos (${wizard.uploadedPhotos}/${photos.length} uploaded)`);
  if (wizard.stop === "stuck") missing.push(`step \xAB ${last?.title ?? "?"} \xBB refused to continue: ${wizard.error ?? "unknown error"}`);
  if (wizard.stop === "no-next") missing.push(`step \xAB ${last?.title ?? "?"} \xBB: no \xAB Continuer \xBB button found`);
  if (wizard.category?.guessed)
    warnings.push(`category: \xAB ${a.category || "(none)"} \xBB not offered \u2014 the site's suggestion \xAB ${wizard.category.picked} \xBB was picked; check it`);
  for (const k of wizard.unmatchedAttributes) warnings.push(`attribute \xAB ${k} \xBB: no matching field on the form (use a label from form-map.json)`);
  for (const t of wizard.failed) if (t.startsWith("attr:")) warnings.push(`attribute \xAB ${t.slice(5)} \xBB: value not accepted by the form`);
  if (wizard.uploadedPhotos === 0 && photos.length) logger.warn("Could not upload photos automatically \u2014 add them manually in the browser.");
  else if (photos.length) logger.info(`Uploaded ${wizard.uploadedPhotos}/${photos.length} photo(s).`);
  return {
    fields,
    missing,
    warnings,
    uploadedPhotos: wizard.uploadedPhotos,
    expectedPhotos: photos.length,
    wizard: { stop: wizard.stop, error: wizard.error, steps: wizard.steps.length, category: wizard.category },
    formMap: last?.formMap,
    formMapSteps: wizard.steps.map((st) => ({ ...st.formMap, fills: st.fills, unresolvedRequired: st.unresolvedRequired, final: st.final }))
  };
}
function logFillReport(r) {
  logger.info("Field resolution:");
  for (const f of r.fields) {
    const mark = f.filled ? "\u2713" : f.hasValue ? "\u2717" : "\u2014";
    const note = !f.hasValue ? " [no value in annonce]" : !f.filled ? " [form field not found]" : "";
    logger.info(`  ${mark} ${f.field}${f.required ? "" : " (optional)"}${note}`);
  }
  logger.info(`  ${r.uploadedPhotos === r.expectedPhotos ? "\u2713" : "\u2717"} photos: ${r.uploadedPhotos}/${r.expectedPhotos}`);
  if (r.wizard) logger.info(`Wizard: ${r.wizard.steps} step(s), stopped: ${r.wizard.stop}${r.wizard.error ? ` (${r.wizard.error})` : ""}`);
  for (const w of r.warnings ?? []) logger.warn(w);
  if (r.missing.length) logger.warn(`Ask the user about: ${r.missing.join(", ")}`);
}
async function waitForPublished(cdp, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await delay(2e3);
    if (await isOnCaptcha(cdp)) {
      await waitForCaptchaResolution(cdp);
      continue;
    }
    const href = await currentUrl(cdp);
    for (const re of DEPOSIT.publishedUrlPattern) {
      const m = href.match(re);
      if (m?.[1]) return { url: href, id: m[1] };
    }
    for (const re of DEPOSIT.confirmedUrlPattern) {
      if (re.test(href)) {
        const adHref = await firstAdLink(cdp);
        let id = "";
        for (const r2 of DEPOSIT.publishedUrlPattern) {
          const m = (adHref || href).match(r2);
          if (m?.[1]) {
            id = m[1];
            break;
          }
        }
        return { url: adHref || href, id };
      }
    }
  }
  return null;
}
async function runPublish(annoncesDir, slug, opts = {}, deps = {}) {
  const dir = path9.join(annoncesDir, slug);
  const a = parseAnnonce(dir);
  if (a.status !== "draft") {
    throw new Error(`annonce "${slug}" is "${a.status}", not "draft" \u2014 only drafts can be published`);
  }
  const photos = resolvePhotoPaths(dir, a);
  if (photos.length === 0) throw new Error(`annonce "${slug}" has no photos in photos/ to upload`);
  const connect = deps.connect ?? defaultConnect3;
  const cdp = await connect(DEPOSIT.startUrl);
  try {
    const auth = await ensureLoggedIn(cdp);
    if (!auth.ok) {
      logger.error("Not logged in to Leboncoin \u2014 run `login` (or log in once in the opened browser), then retry.");
      if (opts.screenshot !== false) await captureScreenshot(cdp, path9.join(dir, "auth-state.png"));
      return { ok: false, reason: "login-required" };
    }
    if (await isOnCaptcha(cdp)) await waitForCaptchaResolution(cdp);
    const shotLog = new ShotLog(dir);
    if (opts.shots) await shotLog.shot(cdp, "00-initial");
    const report = await fillForm(cdp, a, photos, opts.shots ? shotLog : void 0);
    if (report.wizard?.stop === "login-required") {
      logger.error("The session was logged out during the deposit \u2014 run `login`, then retry.");
      return { ok: false, reason: "login-required", report };
    }
    if (opts.screenshot !== false) {
      const png = path9.join(dir, "publish-preview.png");
      if (await captureScreenshot(cdp, png)) {
        report.previewPng = png;
        logger.info(`Saved form screenshot \u2192 ${png} (read it to verify before submitting)`);
      }
    }
    if (opts.shots) {
      await shotLog.shot(cdp, "20-prefilled");
      const shotsDir = path9.join(dir, "shots");
      await captureElement(cdp, ELEMENT_TARGETS.price, path9.join(shotsDir, "elem-price.png"));
      await captureElement(cdp, ELEMENT_TARGETS.photos, path9.join(shotsDir, "elem-photos.png"));
      await captureElement(cdp, ELEMENT_TARGETS.submit, path9.join(shotsDir, "elem-submit.png"));
    }
    const formMapPath = path9.join(dir, "form-map.json");
    if (writeFormMap(formMapPath, { steps: report.formMapSteps ?? [] })) report.formMapPath = formMapPath;
    const href = await currentUrl(cdp);
    const readiness = await buildReadiness(cdp, report, href);
    const readinessPath = path9.join(dir, "push-readiness.json");
    if (writeReadiness(readinessPath, readiness)) {
      report.readiness = readiness;
      report.readinessPath = readinessPath;
    }
    logger.info(
      `Push-readiness: ${readiness.ready ? "READY" : "NOT READY"}${readiness.blockers.length ? ` \u2014 ${readiness.blockers.join("; ")}` : ""} \u2192 ${readinessPath}`
    );
    if (opts.diagnostic) {
      const htmlPath = path9.join(dir, "publish-preview.html");
      if (await savePageHtml(cdp, htmlPath)) report.previewHtml = htmlPath;
      logFillReport(report);
      logger.info("Diagnostic \u2014 nothing submitted.");
      return { ok: false, reason: "diagnostic", report, missing: report.missing };
    }
    if (opts.strict && report.missing.length) {
      logger.error(`Strict mode: ${report.missing.length} required field(s) unresolved/missing \u2014 not submitting:`);
      for (const m of report.missing) logger.error(`  - ${m}`);
      return { ok: false, reason: "incomplete", report, missing: report.missing };
    }
    if (opts.dryRun) {
      logFillReport(report);
      logger.info("Dry run \u2014 form filled, nothing submitted.");
      return { ok: false, reason: "dry-run", report, missing: report.missing };
    }
    if (opts.yes) {
      if (report.wizard?.stop !== "final") {
        logger.error(
          `Not on the final step (wizard stopped: ${report.wizard?.stop ?? "unknown"}) \u2014 not submitting. Fix: ${report.missing.join(", ") || "see form-map.json"}`
        );
        return { ok: false, reason: "form-error", error: `wizard stopped before the final step (${report.wizard?.stop})`, report, missing: report.missing };
      }
      logger.info("Auto-submitting (--yes)\u2026");
      const submitControl = await hasButton(cdp, DEPOSIT.publishButton) ? DEPOSIT.publishButton : DEPOSIT.nextButton;
      if (!await clickButton(cdp, submitControl)) {
        logger.error("Could not find/click the publish button \u2014 review the form and click \xAB D\xE9poser mon annonce \xBB yourself.");
        return { ok: false, reason: "form-error", error: "publish button not found", report, missing: report.missing };
      }
      await delay(1500);
      const err = await readFormError(cdp);
      if (err) {
        logger.error(`Leboncoin rejected the form: ${err}`);
        return { ok: false, reason: "form-error", error: err, report, missing: report.missing };
      }
    } else {
      if (report.missing.length) logger.warn(`Before submitting, check: ${report.missing.join(", ")}`);
      logger.warn(
        report.wizard?.stop === "final" ? "Form prefilled up to the final review. Check it in the browser and submit it yourself (the last \xAB Continuer \xBB / \xAB D\xE9poser \xBB)." : `Form prefilled up to \xAB ${report.formMap?.step?.title ?? "the current step"} \xBB \u2014 finish the remaining steps and submit in the browser yourself.`
      );
      logger.info("Waiting for you to publish\u2026");
    }
    const published = await waitForPublished(cdp, opts.timeoutSubmitMs ?? DEFAULT_SUBMIT_TIMEOUT_MS);
    if (!published) {
      logger.warn("Did not detect a published ad before the timeout.");
      report.shots = shotLog.entries();
      return { ok: false, reason: "not-published", report, missing: report.missing };
    }
    if (opts.screenshot !== false) await shotLog.shot(cdp, "30-confirmation");
    report.shots = shotLog.entries();
    a.status = "published";
    a.leboncoin_url = published.url;
    if (published.id) a.leboncoin_id = published.id;
    a.published_at = (/* @__PURE__ */ new Date()).toISOString();
    writeAnnonce(dir, a);
    logger.success(`Published: ${published.url}`);
    return { ok: true, leboncoin_id: published.id || void 0, leboncoin_url: published.url, report };
  } finally {
    cdp.disconnect();
  }
}
var DEFAULT_SUBMIT_TIMEOUT_MS, REPORTED_FIELDS;
var init_publish = __esm({
  "src/publish.ts"() {
    "use strict";
    init_auth();
    init_captcha();
    init_deposit_form();
    init_deposit_wizard();
    init_field_match();
    init_form_introspect();
    init_logger();
    init_markdown();
    init_readiness();
    init_screenshot();
    init_selectors();
    init_utils();
    DEFAULT_SUBMIT_TIMEOUT_MS = 15 * 60 * 1e3;
    REPORTED_FIELDS = [
      ["category", "category", true],
      ["title", "title", true],
      ["description", "description", true],
      ["price", "price", true],
      ["location", "zipcode", true],
      ["condition", "condition", false],
      ["shipping", "shipping", false]
    ];
  }
});

// src/manage-actions.ts
async function navigate(cdp, url, settleMs = 3e3) {
  await cdp.send("Page.enable").catch(() => {
  });
  await cdp.send("Page.navigate", { url }).catch(() => {
  });
  await delay(settleMs);
}
async function clickInAdCard(cdp, adId, button) {
  return cdp.evaluate(
    `(() => {
        /* click-in-ad-card */
        const n = (s) => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const visible = (el) => !!(el.offsetParent !== null || (el.getClientRects && el.getClientRects().length));
        const link = Array.from(document.querySelectorAll('a[href]')).find((a) => a.getAttribute('href').includes(${JSON.stringify(adId)}));
        if (!link) return false;
        let card = link;
        for (let i = 0; i < 8 && card.parentElement; i++) {
          card = card.parentElement;
          if (card.matches('li, article, [role="listitem"], [role="row"]') || card.querySelectorAll('button, [role="button"]').length >= 1) break;
        }
        const wanted = ${JSON.stringify(button.textCandidates)}.map(n);
        const els = Array.from(card.querySelectorAll('button, [role="button"], [role="menuitem"], a')).filter((e) => visible(e) && !e.disabled && e.getAttribute('aria-disabled') !== 'true');
        for (const w of wanted) {
          const el = els.find((e) => { const t = n(e.innerText || e.textContent); const a = n(e.getAttribute('aria-label')); return t === w || a === w || t.startsWith(w + ' ') || a.startsWith(w + ' '); });
          if (el) { el.click(); return true; }
        }
        return false;
      })()`,
    false
  ).catch(() => false);
}
async function clickManageControl(cdp, adId, button) {
  if (await clickButtonOrMenu(cdp, button, MANAGE.overflowMenu)) return true;
  await navigate(cdp, MANAGE.listingUrl);
  if (await clickInAdCard(cdp, adId, button)) return true;
  if (!await clickInAdCard(cdp, adId, MANAGE.overflowMenu)) return false;
  await delay(600);
  return clickInOpenMenu(cdp, button);
}
async function clickInOpenMenu(cdp, button) {
  return cdp.evaluate(
    `(() => {
        const n = (s) => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const visible = (el) => !!(el.offsetParent !== null || (el.getClientRects && el.getClientRects().length));
        const menus = Array.from(document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"]')).filter(visible);
        const wanted = ${JSON.stringify(button.textCandidates)}.map(n);
        for (const m of menus) {
          const els = Array.from(m.querySelectorAll('button, [role="menuitem"], [role="option"], a')).filter(visible);
          for (const w of wanted) {
            const el = els.find((e) => n(e.innerText || e.textContent) === w || n(e.getAttribute('aria-label')) === w);
            if (el) { el.click(); return true; }
          }
        }
        return false;
      })()`,
    false
  ).catch(() => false);
}
async function confirmIfAsked(cdp, confirm, waitMs = 1500) {
  await delay(waitMs);
  const clicked = await clickButton(cdp, confirm);
  if (clicked) await delay(waitMs);
  return clicked;
}
async function proveOutcome(cdp, proof) {
  if (proof.markers.length && await pageHasText(cdp, proof.markers)) return "confirmation-text";
  if (proof.flippedTo && await hasButton(cdp, proof.flippedTo)) return "control-flipped";
  if (proof.reloadUrl && proof.goneMarkers?.length) {
    await navigate(cdp, proof.reloadUrl);
    if (await pageHasText(cdp, proof.goneMarkers)) return "ad-page-gone";
  }
  return null;
}
var init_manage_actions = __esm({
  "src/manage-actions.ts"() {
    "use strict";
    init_deposit_form();
    init_selectors();
    init_utils();
  }
});

// src/doctor.ts
var doctor_exports = {};
__export(doctor_exports, {
  fieldResolutions: () => fieldResolutions,
  runDoctor: () => runDoctor
});
import { mkdirSync as mkdirSync4, writeFileSync as writeFileSync4 } from "fs";
import path10 from "path";
async function defaultConnect4(url) {
  const { connectAndNavigate: connectAndNavigate2 } = await Promise.resolve().then(() => (init_browser(), browser_exports));
  return connectAndNavigate2(url);
}
function fieldResolutions(w, a) {
  const out = {};
  for (const name of Object.keys(LOGICAL_FIELDS)) {
    const fills = w.steps.flatMap((s) => s.fills).filter((f) => f.target === name);
    if (fills.some((f) => f.via === "selector")) out[name] = "selector";
    else if (fills.length) out[name] = "semantic";
    else if (name === "category" && w.category) out[name] = "semantic";
    else if (w.stop !== "final") out[name] = "not-reached";
    else
      out[name] = LOGICAL_FIELDS[name].required || (name === "condition" ? !!a.condition : name === "shipping" ? typeof a.shipping === "boolean" : false) ? "unresolved" : "not-reached";
  }
  return out;
}
async function runDoctor(opts = {}, deps = {}) {
  const siteOverrides = applySiteOverrides();
  const report = { at: (/* @__PURE__ */ new Date()).toISOString(), ok: false, checks: [], fields: {}, siteOverrides };
  const connect = deps.connect ?? defaultConnect4;
  const cdp = await connect(AUTH.accountUrl);
  try {
    if (await isOnCaptcha(cdp)) await waitForCaptchaResolution(cdp);
    const login = await checkLogin(cdp);
    report.checks.push({
      name: "login",
      ok: login.loggedIn,
      detail: login.loggedIn ? `logged in (${login.signals.join(", ")})` : login.loggedOut ? `logged out (${login.signals.join(", ") || login.url})` : "inconclusive \u2014 no account marker found"
    });
    await navigate(cdp, `${BASE_URL}/recherche?text=${encodeURIComponent(opts.query ?? "iphone")}`);
    if (await isOnCaptcha(cdp)) await waitForCaptchaResolution(cdp);
    const searchSnap = await readPageSnapshot(cdp);
    const search = searchFromSnapshot(searchSnap);
    report.checks.push({
      name: "search",
      ok: !!search && search.source === "next-data",
      detail: search ? `${search.payload.ads.length} ads (total ${search.payload.total}) from ${search.source}${searchSnap.buildId ? `, buildId ${searchSnap.buildId}` : ", no buildId (pagination by navigation)"}` : "no results found on the search page"
    });
    const firstUrl = search?.payload.ads.find((x) => x.url)?.url;
    if (firstUrl) {
      await navigate(cdp, firstUrl);
      const adFound = adFromSnapshot(await readPageSnapshot(cdp));
      report.checks.push({
        name: "ad-detail",
        ok: !!adFound,
        detail: adFound ? `ad ${adFound.ad.list_id} from ${adFound.source}` : `no ad payload on ${firstUrl}`
      });
    } else {
      report.checks.push({ name: "ad-detail", ok: false, detail: "skipped \u2014 no ad URL from the search check" });
    }
    if (login.loggedOut) {
      report.checks.push({ name: "deposit", ok: false, detail: "skipped \u2014 log in first (`leboncoin login`)" });
    } else {
      const a = opts.slug ? parseAnnonce(path10.join(opts.annoncesDir ?? "annonces", opts.slug)) : PROBE;
      const photos = opts.slug ? resolvePhotoPaths(path10.join(opts.annoncesDir ?? "annonces", opts.slug), a) : [];
      await navigate(cdp, DEPOSIT.startUrl);
      const w = await runWizard(cdp, a, { photos });
      report.fields = fieldResolutions(w, a);
      report.deposit = {
        stop: w.stop,
        error: w.error,
        steps: w.steps.map((s) => ({ title: s.title, fields: s.formMap.fields.length, final: s.final, unresolvedRequired: s.unresolvedRequired }))
      };
      const expectedStop = opts.slug ? "final" : "missing-required";
      const ok = w.stop === "final" || w.stop === expectedStop && w.steps.length >= 2;
      report.checks.push({
        name: "deposit",
        ok,
        detail: `${w.steps.length} step(s): ${w.steps.map((s) => `\xAB ${s.title || "?"} \xBB`).join(" \u2192 ")}; stopped: ${w.stop}${w.error ? ` (${w.error})` : ""} \u2014 nothing submitted`
      });
      await navigate(cdp, "about:blank", 300);
    }
    report.ok = report.checks.every((c) => c.ok);
    let out = opts.out;
    if (!out) {
      const { getScraperHome: getScraperHome2 } = await Promise.resolve().then(() => (init_config(), config_exports));
      out = path10.join(getScraperHome2(), "doctor-report.json");
    }
    mkdirSync4(path10.dirname(out), { recursive: true });
    writeFileSync4(out, JSON.stringify(report, null, 2));
    report.reportPath = out;
    for (const c of report.checks) {
      if (c.ok) logger.success(`${c.name}: ${c.detail}`);
      else logger.warn(`${c.name}: ${c.detail}`);
    }
    const fields = Object.entries(report.fields).map(([k, v]) => `${k}=${v}`);
    if (fields.length) logger.info(`deposit fields: ${fields.join(", ")}`);
    logger.info(`Doctor report \u2192 ${out}`);
    return report;
  } finally {
    cdp.disconnect();
  }
}
var PROBE;
var init_doctor = __esm({
  "src/doctor.ts"() {
    "use strict";
    init_auth();
    init_captcha();
    init_deposit_wizard();
    init_logger();
    init_manage_actions();
    init_markdown();
    init_page_payload();
    init_selectors();
    init_site_overrides();
    PROBE = {
      slug: "doctor-probe",
      title: "Test de diagnostic \u2014 ne pas publier",
      category: "",
      price: 1,
      zipcode: "75001",
      city: "Paris",
      attributes: {},
      photos: [],
      status: "draft",
      description: "Annonce de test du diagnostic leboncoin-cdp. Elle n'est jamais publi\xE9e."
    };
  }
});

// src/delete.ts
var delete_exports = {};
__export(delete_exports, {
  runDelete: () => runDelete
});
import path11 from "path";
import readline from "readline";
async function defaultConnect5(url) {
  const { connectAndNavigate: connectAndNavigate2 } = await Promise.resolve().then(() => (init_browser(), browser_exports));
  return connectAndNavigate2(url);
}
function promptYesNo(question) {
  return new Promise((resolve2) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve2(/^y(es)?$/i.test(answer.trim()));
    });
  });
}
async function runDelete(annoncesDir, slug, opts = {}, deps = {}) {
  const dir = path11.join(annoncesDir, slug);
  const a = parseAnnonce(dir);
  if (a.status !== "published" || !a.leboncoin_id) {
    throw new Error(`annonce "${slug}" is not published (no leboncoin_id) \u2014 nothing to delete`);
  }
  if (!opts.yes) {
    const confirm = deps.confirm ?? promptYesNo;
    const yes = await confirm(`Delete "${a.title}" (${a.leboncoin_url ?? a.leboncoin_id}) from Leboncoin? [y/N] `);
    if (!yes) {
      logger.info("Aborted \u2014 nothing deleted.");
      return { ok: false, reason: "aborted" };
    }
  }
  const connect = deps.connect ?? defaultConnect5;
  const target = a.leboncoin_url || MANAGE.adUrl(a.leboncoin_id);
  const cdp = await connect(target);
  try {
    if (await isOnCaptcha(cdp)) await waitForCaptchaResolution(cdp);
    const auth = await ensureLoggedIn(cdp);
    if (!auth.ok) {
      logger.error("Not logged in to Leboncoin \u2014 run `login`, then retry.");
      return { ok: false, reason: "login-required" };
    }
    if (!await clickManageControl(cdp, a.leboncoin_id, MANAGE.deleteButton)) {
      logger.error(`Delete control not found \u2014 open \xAB mes annonces \xBB (${MANAGE.listingUrl}) and delete it manually.`);
      return { ok: false, reason: "control-not-found" };
    }
    await confirmIfAsked(cdp, MANAGE.confirmButton);
    const proof = await proveOutcome(cdp, { markers: MANAGE.deletedMarkers, reloadUrl: target, goneMarkers: MANAGE.goneMarkers });
    if (!proof) {
      const png = path11.join(dir, "delete-unconfirmed.png");
      const previewPng = await captureScreenshot(cdp, png) ? png : void 0;
      logger.warn(`Clicked delete, but Leboncoin showed no proof the ad is gone \u2014 "${slug}" stays "published" locally. Check ${previewPng ?? "the browser"}.`);
      return { ok: false, reason: "unconfirmed", previewPng };
    }
    a.status = "deleted";
    a.deleted_at = (/* @__PURE__ */ new Date()).toISOString();
    writeAnnonce(dir, a);
    logger.success(`Leboncoin confirmed the deletion of "${slug}" (${proof}) \u2014 marked deleted locally.`);
    return { ok: true, proof };
  } finally {
    cdp.disconnect();
  }
}
var init_delete = __esm({
  "src/delete.ts"() {
    "use strict";
    init_auth();
    init_captcha();
    init_logger();
    init_manage_actions();
    init_markdown();
    init_screenshot();
    init_selectors();
  }
});

// src/manage.ts
var manage_exports = {};
__export(manage_exports, {
  runDeactivate: () => runDeactivate,
  runEdit: () => runEdit,
  runMarkSold: () => runMarkSold,
  runReactivate: () => runReactivate,
  runRenew: () => runRenew
});
import path12 from "path";
import readline2 from "readline";
async function defaultConnect6(url) {
  const { connectAndNavigate: connectAndNavigate2 } = await Promise.resolve().then(() => (init_browser(), browser_exports));
  return connectAndNavigate2(url);
}
function promptYesNo2(question) {
  return new Promise((resolve2) => {
    const rl = readline2.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve2(/^y(es)?$/i.test(answer.trim()));
    });
  });
}
async function withAd(annoncesDir, slug, opts, deps, cfg, stage) {
  const dir = path12.join(annoncesDir, slug);
  const a = parseAnnonce(dir);
  if (!a.leboncoin_id) throw new Error(`annonce "${slug}" has no leboncoin_id \u2014 it was never published`);
  if (!cfg.allow.includes(a.status)) throw new Error(`annonce "${slug}" is "${a.status}" \u2014 expected ${cfg.allow.join(" or ")}`);
  if (cfg.confirm && !opts.yes) {
    const ask = deps.confirm ?? promptYesNo2;
    if (!await ask(cfg.confirm(a))) {
      logger.info("Aborted \u2014 nothing changed.");
      return { ok: false, reason: "aborted" };
    }
  }
  logger.warn(TOS_REMINDER);
  const connect = deps.connect ?? defaultConnect6;
  const cdp = await connect(a.leboncoin_url || MANAGE.adUrl(a.leboncoin_id));
  try {
    if (await isOnCaptcha(cdp)) await waitForCaptchaResolution(cdp);
    const auth = await ensureLoggedIn(cdp);
    if (!auth.ok) {
      logger.error("Not logged in to Leboncoin \u2014 run `login`, then retry.");
      return { ok: false, reason: "login-required" };
    }
    return await stage(cdp, a, dir);
  } finally {
    cdp.disconnect();
  }
}
async function lifecycle(cdp, a, dir, label, button, proof, apply) {
  if (!await clickManageControl(cdp, a.leboncoin_id, button)) {
    logger.error(`${label} control not found \u2014 do it manually in \xAB mes annonces \xBB (${MANAGE.listingUrl}).`);
    return { ok: false, reason: "action-failed" };
  }
  await confirmIfAsked(cdp, MANAGE.manageConfirmButton);
  const how = await proveOutcome(cdp, proof);
  if (!how) {
    const png = path12.join(dir, "manage-unconfirmed.png");
    const previewPng = await captureScreenshot(cdp, png) ? png : void 0;
    logger.warn(`${label}: clicked, but Leboncoin showed no confirmation \u2014 local status left as "${a.status}". Check ${previewPng ?? "the browser"}.`);
    return { ok: false, reason: "unconfirmed", previewPng };
  }
  apply(a);
  writeAnnonce(dir, a);
  logger.success(`${label}: confirmed by Leboncoin (${how}).`);
  return { ok: true, proof: how };
}
async function runMarkSold(annoncesDir, slug, opts = {}, deps = {}) {
  return withAd(
    annoncesDir,
    slug,
    opts,
    deps,
    { allow: ["published", "paused"], confirm: (a) => `Mark "${a.title}" as sold on Leboncoin? [y/N] ` },
    (cdp, a, dir) => lifecycle(cdp, a, dir, "Mark-sold", MANAGE.markSoldButton, { markers: MANAGE.soldMarkers }, (x) => {
      x.status = "sold";
      x.sold_at = (/* @__PURE__ */ new Date()).toISOString();
    })
  );
}
async function runRenew(annoncesDir, slug, opts = {}, deps = {}) {
  return withAd(annoncesDir, slug, opts, deps, { allow: ["published"], confirm: (a) => `Renew / bump "${a.title}" on Leboncoin? [y/N] ` }, async (cdp, a) => {
    if (!await clickManageControl(cdp, a.leboncoin_id, MANAGE.renewButton)) {
      logger.warn("Renew control not found \u2014 bump it manually in \xAB mes annonces \xBB.");
      return { ok: false, reason: "action-failed" };
    }
    await confirmIfAsked(cdp, MANAGE.manageConfirmButton);
    logger.success(`Requested a bump for "${slug}" (status unchanged \u2014 a bump may lead to a paid option page: finish or cancel it in the browser).`);
    return { ok: true };
  });
}
async function runDeactivate(annoncesDir, slug, opts = {}, deps = {}) {
  return withAd(
    annoncesDir,
    slug,
    opts,
    deps,
    { allow: ["published"], confirm: (a) => `Deactivate (pause) "${a.title}"? [y/N] ` },
    (cdp, a, dir) => lifecycle(cdp, a, dir, "Deactivate", MANAGE.deactivateButton, { markers: MANAGE.pausedMarkers, flippedTo: MANAGE.reactivateButton }, (x) => {
      x.status = "paused";
      x.paused_at = (/* @__PURE__ */ new Date()).toISOString();
    })
  );
}
async function runReactivate(annoncesDir, slug, opts = {}, deps = {}) {
  return withAd(
    annoncesDir,
    slug,
    opts,
    deps,
    { allow: ["paused"], confirm: (a) => `Reactivate "${a.title}"? [y/N] ` },
    (cdp, a, dir) => lifecycle(cdp, a, dir, "Reactivate", MANAGE.reactivateButton, { markers: MANAGE.reactivatedMarkers, flippedTo: MANAGE.deactivateButton }, (x) => {
      x.status = "published";
      x.paused_at = void 0;
    })
  );
}
async function runEdit(annoncesDir, slug, opts = {}, deps = {}) {
  return withAd(annoncesDir, slug, opts, deps, { allow: ["published", "paused"] }, async (cdp, a, dir) => {
    if (!await clickButtonOrMenu(cdp, MANAGE.editButton, MANAGE.overflowMenu)) {
      logger.error("Edit control not found \u2014 open the ad and click \xAB Modifier \xBB manually.");
      return { ok: false, reason: "action-failed" };
    }
    await delay(2e3);
    const report = await fillForm(cdp, a, [], void 0, { finalButtons: [MANAGE.saveButton, DEPOSIT.publishButton] });
    let previewPng;
    if (opts.screenshot !== false) {
      const png = path12.join(dir, "edit-preview.png");
      if (await captureScreenshot(cdp, png)) previewPng = png;
    }
    if (report.missing.length) logger.warn(`Check before saving: ${report.missing.join(", ")}`);
    for (const w of report.warnings ?? []) logger.warn(w);
    if (opts.yes) {
      if (report.wizard?.stop !== "final") {
        logger.error(`The edit form did not reach its last step (${report.wizard?.stop}) \u2014 review it and save yourself.`);
        return { ok: false, reason: "action-failed", previewPng, missing: report.missing };
      }
      const save = await hasButton(cdp, MANAGE.saveButton) ? MANAGE.saveButton : DEPOSIT.nextButton;
      if (!await clickButton(cdp, save)) {
        logger.error("Save control not found \u2014 review the prefilled form and click \xAB Enregistrer \xBB yourself.");
        return { ok: false, reason: "action-failed", previewPng, missing: report.missing };
      }
      logger.success(`Submitted edits for "${slug}".`);
    } else {
      logger.warn("Edit form prefilled. Review it and click \xAB Enregistrer \xBB / \xAB Mettre \xE0 jour \xBB yourself.");
    }
    return { ok: true, previewPng, missing: report.missing };
  });
}
var TOS_REMINDER;
var init_manage = __esm({
  "src/manage.ts"() {
    "use strict";
    init_auth();
    init_captcha();
    init_deposit_form();
    init_logger();
    init_manage_actions();
    init_markdown();
    init_publish();
    init_screenshot();
    init_selectors();
    init_utils();
    TOS_REMINDER = "Reminder: automating a real account may breach Leboncoin's ToS \u2014 pace your actions and don't mass-post.";
  }
});

// src/cli.ts
import { realpathSync } from "fs";
import { resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

// src/annonce.ts
init_markdown();
import path2 from "path";
var SLUG_RE = /^[a-z0-9][a-z0-9._-]*$/i;
function runNew(annoncesDir, slug, opts = {}) {
  if (!slug || !SLUG_RE.test(slug)) {
    throw new Error(`invalid slug "${slug ?? ""}" \u2014 use letters, digits, dash or underscore (e.g. macbook-air-m1)`);
  }
  const dir = path2.join(annoncesDir, slug);
  scaffoldAnnonce(
    dir,
    {
      title: opts.title,
      category: opts.category,
      notes: opts.notes,
      price: opts.price,
      zipcode: opts.zipcode,
      condition: opts.condition,
      attributes: opts.attributes
    },
    { force: opts.force }
  );
  return { slug, dir, markdown: path2.join(dir, "annonce.md") };
}
function runList(annoncesDir, filterStatus) {
  return listAnnonces(annoncesDir).filter((a) => !filterStatus || a.status === filterStatus).map((a) => ({
    slug: a.slug,
    title: a.title,
    status: a.status,
    price: a.price,
    leboncoin_id: a.leboncoin_id,
    leboncoin_url: a.leboncoin_url
  }));
}

// src/validate.ts
init_markdown();
import path3 from "path";
var PLACEHOLDER_RE = /fill this in|décris ton article ici|lorem ipsum/i;
var TITLE_MAX = 100;
var DESC_MAX = 4e3;
var PHOTOS_MAX = 25;
function validateAnnonce(dir) {
  const slug = path3.basename(path3.resolve(dir));
  let a;
  try {
    a = parseAnnonce(dir);
  } catch (e) {
    return { ok: false, slug, issues: [{ field: "file", message: e.message }], warnings: [] };
  }
  const issues = [];
  const warnings = [];
  const title = a.title.trim();
  if (!title) issues.push({ field: "title", message: "title is required" });
  else if (title.length < 5) issues.push({ field: "title", message: "title is too short (min 5 chars)" });
  else if (title.length > TITLE_MAX) warnings.push({ field: "title", message: `title is long (${title.length} > ${TITLE_MAX}); Leboncoin may truncate it` });
  if (!a.category.trim()) issues.push({ field: "category", message: "category is required" });
  if (!Number.isFinite(a.price) || a.price <= 0) {
    issues.push({ field: "price", message: "price must be a positive number" });
  }
  if (!/^\d{5}$/.test(a.zipcode.trim())) {
    issues.push({ field: "zipcode", message: "zipcode must be a 5-digit French postal code" });
  }
  const photos = listPhotoFiles(dir);
  if (photos.length === 0) {
    issues.push({ field: "photos", message: "at least one photo is required in photos/" });
  } else if (photos.length > PHOTOS_MAX) {
    warnings.push({ field: "photos", message: `${photos.length} photos; Leboncoin caps around ${PHOTOS_MAX} \u2014 the extras may be ignored` });
  }
  for (const p of a.photos) {
    if (!photos.includes(p)) {
      issues.push({ field: "photos", message: `listed photo not found in photos/: ${p}` });
    }
  }
  const body = a.description.trim();
  if (!body || body === PLACEHOLDER_BODY.trim() || PLACEHOLDER_RE.test(body)) {
    issues.push({ field: "description", message: "description body is empty or still a placeholder" });
  } else if (body.length < 20) {
    issues.push({ field: "description", message: "description is too short (min 20 chars)" });
  } else if (body.length > DESC_MAX) {
    warnings.push({ field: "description", message: `description is long (${body.length} > ${DESC_MAX}); Leboncoin may reject or truncate it` });
  }
  if (a.status !== "draft") {
    issues.push({ field: "status", message: `status must be "draft" to publish (is "${a.status}")` });
  }
  return { ok: issues.length === 0, slug, issues, warnings };
}
function formatValidationReport(r) {
  const lines = [];
  if (r.ok) lines.push(`\u2713 ${r.slug}: valid \u2014 ready to publish`);
  else {
    lines.push(`\u2717 ${r.slug}: ${r.issues.length} issue(s)`);
    for (const i of r.issues) lines.push(`  - [${i.field}] ${i.message}`);
  }
  for (const w of r.warnings) lines.push(`  \u26A0 [${w.field}] ${w.message}`);
  return lines.join("\n");
}

// src/types.ts
var VERSION = "1.4.0";

// src/cli.ts
var HELP = `leboncoin v${VERSION}
Manage your Leboncoin listings from local markdown + photos, then publish/delete
them on your own account via the Chrome DevTools Protocol. Markdown is the source
of truth; you (or the agent) write the copy, the engine just drives the browser.

Usage:
  leboncoin login [--browser brave|chrome|chromium|opera] [--reset-profile] [--cookies-file <path>] [--out <path>] [--timeout-login <ms>]
  leboncoin doctor [<slug>] [--query "<search>"] [--out <path>]
  leboncoin new <slug> [--title "<t>"] [--category "<c>"] [--notes "<texte libre>"]
                       [--price <n>] [--zipcode <cp>] [--condition "<c>"] [--attributes "k=v,k2=v2"] [--force]
  leboncoin comparables <slug> [--query "<lbc query>"] [--max-pages <n>] [--with-details]
  leboncoin validate <slug>
  leboncoin inspect <slug>
  leboncoin publish <slug> [--diagnostic] [--strict] [--shots] [--no-screenshot] [--yes] [--dry-run] [--timeout-submit <ms>]
  leboncoin delete <slug> [--yes]
  leboncoin edit <slug> [--no-screenshot] [--yes]
  leboncoin renew|mark-sold|deactivate|reactivate <slug> [--yes]
  leboncoin list [--status draft|published|deleted|sold|paused]
  leboncoin scrape --query "<query|url>" [scraper options]

Commands:
  login/auth    Open the account page, actively verify you're logged in (DOM probe, not just a
                redirect), and save an auth-state screenshot. --cookies-file attaches an exported
                cookies.json (best-effort escape hatch; always re-verified). If logged out, it
                waits while you log in once in the browser. Run this before publish/delete.
                --browser brave uses (and remembers) your Brave session: its profile is copied
                once to ~/.lbc-scraper/profile-brave. --reset-profile re-copies it (after you
                logged in again in the real browser).
  doctor        READ-ONLY health check against the live site: login, a search page, an ad page,
                and a walk of the deposit wizard that stops on the final review WITHOUT
                submitting. Reports how each field was found (selector / semantic / unresolved)
                in ~/.lbc-scraper/doctor-report.json. Run it first when something breaks.
                With <slug>, the walk uses that annonce and its photos.
  new           Scaffold annonces/<slug>/annonce.md + photos/ (a draft). --notes seeds the body.
  comparables   Scrape similar live listings into the folder (price/keyword grounding).
  validate      Structural gate: required fields, >=1 photo, real description, draft status.
  inspect       READ-ONLY: open the live deposit form and write form-map.json ({ steps: [...] }:
                every field of step 1 + required/optional + options) + initial.png/html. Types
                and submits nothing. Later steps appear once step 1 is filled: use
                publish --diagnostic to see them all.
  publish       Drive the deposit wizard step by step: fill each step by field MEANING (label /
                name, not fixed selectors), upload photos, click \xAB Continuer \xBB, and stop ON the
                final review without submitting. Semi-auto by default: review it and submit
                yourself. --diagnostic = walk + screenshot + HTML + field report, no submit.
                --strict = refuse to submit while fields are missing. --yes = auto-submit, and
                only from the recognised final step. --shots = one screenshot per step + element
                crops + post-submit into shots/. Writes form-map.json (every step) and
                push-readiness.json.
  delete        Remove a published ad (confirms unless --yes). Marked deleted locally only when
                Leboncoin proves it (message, or the ad page is gone) \u2014 else "unconfirmed".
  edit          Re-open the published ad's modify form, re-fill it from annonce.md, screenshot;
                review and save \xAB Enregistrer \xBB yourself (or --yes to submit).
  renew         Bump / "remettre en avant" a published ad (no status change).
  mark-sold     Mark a published/paused ad as sold (status \u2192 sold).
  deactivate    Pause a published ad without deleting it (status \u2192 paused).
  reactivate    Put a paused ad back online (status \u2192 published).
                Controls are looked up on the ad page, in its \xAB \u2026 \xBB menu, then in its card on
                \xAB mes annonces \xBB; the local status changes only with proof from the site.
  list/status   Show local annonces and their published state.
  scrape        The original read-only scraper (search results + ad details).

Common options:
  --annonces-dir <dir>   Root of the local store            (default: ./annonces)
  --browser <name>       chrome | brave | chromium | opera \u2014 remembered for next runs
  --chrome-path <bin>    Explicit browser binary (remembered too)
  --reset-profile        Re-copy the selected browser's real profile into ~/.lbc-scraper
  --json                 Machine-readable output
  -h, --help             Show this help
  -v, --version          Show version

Site changes:
  ~/.lbc-scraper/site.json (or $LBC_SITE_OVERRIDES) extends the selector tables without a
  rebuild \u2014 see references/deposit-form-mapping.md. Start with: leboncoin doctor.

Publish/delete safety:
  Semi-auto is the default \u2014 the engine never clicks the final publish for you unless
  you pass --yes. A DataDome captcha at submit always needs a human, so --yes is not
  fully headless. These actions hit your real account; see SKILL.md.
`;
var COMMANDS = /* @__PURE__ */ new Set([
  "new",
  "comparables",
  "validate",
  "publish",
  "delete",
  "list",
  "status",
  "scrape",
  "login",
  "auth",
  "inspect",
  "edit",
  "renew",
  "mark-sold",
  "deactivate",
  "reactivate",
  "doctor"
]);
var VALUE_FLAGS = /* @__PURE__ */ new Set([
  "query",
  "output",
  "config",
  "browser",
  "chrome-path",
  "port",
  "timeout",
  "annonces-dir",
  "max-pages",
  "rate-limit",
  "retries",
  "output-dir",
  "title",
  "category",
  "notes",
  "price",
  "zipcode",
  "condition",
  "attributes",
  "status",
  "timeout-submit",
  "cookies-file",
  "out",
  "timeout-login"
]);
var BOOL_FLAGS = /* @__PURE__ */ new Set([
  "json",
  "with-details",
  "details-only",
  "search-only",
  "save-raw",
  "reset-profile",
  "yes",
  "dry-run",
  "diagnostic",
  "strict",
  "no-screenshot",
  "shots",
  "force"
]);
var SHORT = {
  q: "query",
  o: "output",
  c: "config",
  d: "with-details",
  b: "browser",
  p: "port"
};
function fail(message) {
  process.stderr.write(`leboncoin: ${message}
`);
  process.exit(1);
}
function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    process.stdout.write(HELP);
    process.exit(0);
  }
  if (argv[0] === "-v" || argv[0] === "--version") {
    process.stdout.write(VERSION + "\n");
    process.exit(0);
  }
  const command = argv[0];
  if (!COMMANDS.has(command)) fail(`unknown command: ${command} (run --help for usage)`);
  const values = {};
  const bools = /* @__PURE__ */ new Set();
  const positional = [];
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      process.stdout.write(HELP);
      process.exit(0);
    }
    if (arg === "-v" || arg === "--version") {
      process.stdout.write(VERSION + "\n");
      process.exit(0);
    }
    let key;
    let inlineVal;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      key = eq !== -1 ? arg.slice(2, eq) : arg.slice(2);
      if (eq !== -1) inlineVal = arg.slice(eq + 1);
    } else if (arg.startsWith("-") && arg.length > 1) {
      const mapped = SHORT[arg.slice(1)];
      if (!mapped) fail(`unknown flag: ${arg} (run --help for the supported options)`);
      key = mapped;
    } else {
      positional.push(arg);
      continue;
    }
    if (BOOL_FLAGS.has(key)) {
      if (inlineVal !== void 0) fail(`--${key} is a boolean flag and does not take a value`);
      bools.add(key);
      continue;
    }
    if (!VALUE_FLAGS.has(key)) fail(`unknown flag: --${key} (run --help for the supported options)`);
    let value;
    if (inlineVal !== void 0) {
      value = inlineVal;
    } else {
      const next = argv[i + 1];
      if (next === void 0 || next.startsWith("--")) fail(`missing value for --${key}`);
      value = next;
      i++;
    }
    values[key] = value;
  }
  return { command, positional, values, bools };
}
function annoncesDirOf(p) {
  return resolve(p.values["annonces-dir"] ?? "./annonces");
}
function intOf(raw) {
  if (raw === void 0) return void 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : void 0;
}
function parseAttributes(raw) {
  if (!raw) return void 0;
  const out = {};
  for (const pair of raw.split(",")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (k) out[k] = v;
  }
  return Object.keys(out).length ? out : void 0;
}
function requireSlug(p) {
  const slug = p.positional[0];
  if (!slug) fail(`missing <slug> (e.g. leboncoin ${p.command} macbook-air-m1)`);
  return slug;
}
var BROWSER_COMMANDS = /* @__PURE__ */ new Set(["login", "auth", "inspect", "publish", "delete", "edit", "renew", "mark-sold", "deactivate", "reactivate", "doctor"]);
async function prepareSite(p) {
  if (!BROWSER_COMMANDS.has(p.command) && p.command !== "scrape" && p.command !== "comparables") return;
  const { applySiteOverrides: applySiteOverrides2 } = await Promise.resolve().then(() => (init_site_overrides(), site_overrides_exports));
  applySiteOverrides2();
  if (!BROWSER_COMMANDS.has(p.command)) return;
  if (p.values.browser || p.values["chrome-path"] || p.bools.has("reset-profile")) {
    const { selectBrowser: selectBrowser2 } = await Promise.resolve().then(() => (init_config(), config_exports));
    selectBrowser2({ browser: p.values.browser, chromePath: p.values["chrome-path"], resetProfile: p.bools.has("reset-profile") });
  }
  const port = intOf(p.values.port);
  if (port) {
    const { config: config2 } = await Promise.resolve().then(() => (init_config(), config_exports));
    config2.browser.debuggingPort = port;
  }
}
async function main() {
  const p = parseArgs(process.argv.slice(2));
  const json = p.bools.has("json");
  await prepareSite(p);
  switch (p.command) {
    case "new": {
      const slug = requireSlug(p);
      const r = runNew(annoncesDirOf(p), slug, {
        title: p.values.title,
        category: p.values.category,
        notes: p.values.notes,
        price: intOf(p.values.price),
        zipcode: p.values.zipcode,
        condition: p.values.condition,
        attributes: parseAttributes(p.values.attributes),
        force: p.bools.has("force")
      });
      if (json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      else {
        process.stderr.write(`leboncoin: created ${r.markdown}
`);
        process.stderr.write(`  add photos to ${r.dir}/photos/, write the description, then: leboncoin validate ${slug}
`);
      }
      return;
    }
    case "list":
    case "status": {
      const rows = runList(annoncesDirOf(p), p.values.status);
      if (json) {
        process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
        return;
      }
      if (rows.length === 0) {
        process.stderr.write("leboncoin: no annonces found\n");
        return;
      }
      const out = rows.map((r) => `  ${r.status.padEnd(9)} ${r.slug.padEnd(28)} ${String(r.price).padStart(7)} \u20AC  ${r.title}`);
      process.stdout.write([`leboncoin: ${rows.length} annonce(s)`, ...out].join("\n") + "\n");
      return;
    }
    case "validate": {
      const slug = requireSlug(p);
      const r = validateAnnonce(resolve(annoncesDirOf(p), slug));
      if (json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      else process.stdout.write(formatValidationReport(r) + "\n");
      if (!r.ok) process.exit(1);
      return;
    }
    case "scrape": {
      const { runScrape: runScrape2 } = await Promise.resolve().then(() => (init_scrape(), scrape_exports));
      await runScrape2({
        query: p.values.query,
        output: p.values.output,
        configFile: p.values.config,
        detailsOnly: p.bools.has("details-only"),
        searchOnly: p.bools.has("search-only"),
        withDetails: p.bools.has("with-details"),
        resetProfile: p.bools.has("reset-profile"),
        browser: p.values.browser,
        chromePath: p.values["chrome-path"],
        debuggingPort: intOf(p.values.port),
        pageTimeout: intOf(p.values.timeout),
        maxRetries: intOf(p.values.retries),
        rateLimit: intOf(p.values["rate-limit"]),
        maxPages: intOf(p.values["max-pages"]),
        outputDir: p.values["output-dir"],
        saveRaw: p.bools.has("save-raw")
      });
      return;
    }
    case "comparables": {
      const slug = requireSlug(p);
      const { runComparables: runComparables2 } = await Promise.resolve().then(() => (init_comparables(), comparables_exports));
      const r = await runComparables2(annoncesDirOf(p), slug, {
        query: p.values.query,
        maxPages: intOf(p.values["max-pages"]),
        withDetails: p.bools.has("with-details"),
        browser: p.values.browser,
        chromePath: p.values["chrome-path"],
        debuggingPort: intOf(p.values.port),
        pageTimeout: intOf(p.values.timeout)
      });
      if (json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      return;
    }
    case "inspect": {
      const slug = requireSlug(p);
      const { runInspect: runInspect2 } = await Promise.resolve().then(() => (init_inspect(), inspect_exports));
      const r = await runInspect2(annoncesDirOf(p), slug, {}, {});
      if (json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      if (!r.ok) process.exit(2);
      return;
    }
    case "publish": {
      const slug = requireSlug(p);
      const { runPublish: runPublish2 } = await Promise.resolve().then(() => (init_publish(), publish_exports));
      const r = await runPublish2(annoncesDirOf(p), slug, {
        yes: p.bools.has("yes"),
        dryRun: p.bools.has("dry-run"),
        diagnostic: p.bools.has("diagnostic"),
        strict: p.bools.has("strict"),
        screenshot: !p.bools.has("no-screenshot"),
        shots: p.bools.has("shots"),
        timeoutSubmitMs: intOf(p.values["timeout-submit"])
      });
      if (json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      else {
        if (r.missing && r.missing.length) process.stderr.write(`leboncoin: ask the user about \u2192 ${r.missing.join(", ")}
`);
        for (const w of r.report?.warnings ?? []) process.stderr.write(`leboncoin: note \u2192 ${w}
`);
      }
      if (!r.ok && ["login-required", "not-published", "incomplete", "form-error"].includes(r.reason ?? "")) {
        process.exit(2);
      }
      return;
    }
    case "doctor": {
      const { runDoctor: runDoctor2 } = await Promise.resolve().then(() => (init_doctor(), doctor_exports));
      const r = await runDoctor2({ slug: p.positional[0], annoncesDir: annoncesDirOf(p), query: p.values.query, out: p.values.out });
      if (json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      if (!r.ok) process.exit(2);
      return;
    }
    case "login":
    case "auth": {
      const { runAuth: runAuth2 } = await Promise.resolve().then(() => (init_auth(), auth_exports));
      const r = await runAuth2({
        cookiesFile: p.values["cookies-file"],
        out: p.values.out,
        timeoutMs: intOf(p.values["timeout-login"])
      });
      if (json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      if (!r.ok) process.exit(2);
      return;
    }
    case "delete": {
      const slug = requireSlug(p);
      const { runDelete: runDelete2 } = await Promise.resolve().then(() => (init_delete(), delete_exports));
      const r = await runDelete2(annoncesDirOf(p), slug, { yes: p.bools.has("yes") });
      if (json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      if (!r.ok) process.exit(2);
      return;
    }
    case "edit":
    case "renew":
    case "mark-sold":
    case "deactivate":
    case "reactivate": {
      const slug = requireSlug(p);
      const m = await Promise.resolve().then(() => (init_manage(), manage_exports));
      const actions = {
        edit: m.runEdit,
        renew: m.runRenew,
        "mark-sold": m.runMarkSold,
        deactivate: m.runDeactivate,
        reactivate: m.runReactivate
      };
      const r = await actions[p.command](annoncesDirOf(p), slug, {
        yes: p.bools.has("yes"),
        screenshot: !p.bools.has("no-screenshot")
      });
      if (json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      if (!r.ok) process.exit(2);
      return;
    }
  }
}
function isInvokedDirectly() {
  const argv1 = process.argv[1];
  if (argv1 === void 0) return false;
  const modulePath = fileURLToPath(import.meta.url);
  try {
    if (realpathSync(argv1) === realpathSync(modulePath)) return true;
  } catch {
  }
  return import.meta.url === pathToFileURL(argv1).href;
}
if (isInvokedDirectly()) {
  main().catch((e) => fail(e.message));
}
export {
  COMMANDS,
  parseArgs
};
