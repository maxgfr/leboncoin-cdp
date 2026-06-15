#!/usr/bin/env node
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
    price: 0,
    zipcode: "",
    attributes: {},
    photos: [],
    status: "draft",
    description: PLACEHOLDER_BODY
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
  const names = a.photos && a.photos.length ? a.photos : listPhotoFiles(dir);
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
    STATUSES = ["draft", "published", "deleted"];
  }
});

// src/config.ts
import os from "os";
import path4 from "path";
import fs2 from "fs";
function getPlatform() {
  const platform = os.platform();
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
    throw new Error(`Unsupported platform: ${os.platform()}. Use --chrome-path to specify the browser binary.`);
  }
}
function detectBrowserPath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
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
  const home = os.homedir();
  const platform = getPlatform();
  const lowerPath = chromePath.toLowerCase();
  if (platform === "macos") {
    if (lowerPath.includes("brave")) return path4.join(home, "Library", "Application Support", "BraveSoftware", "Brave-Browser");
    if (lowerPath.includes("opera")) return path4.join(home, "Library", "Application Support", "com.operasoftware.Opera");
    if (lowerPath.includes("chromium")) return path4.join(home, "Library", "Application Support", "Chromium");
    return path4.join(home, "Library", "Application Support", "Google", "Chrome");
  } else if (platform === "linux") {
    if (lowerPath.includes("brave")) return path4.join(home, ".config", "BraveSoftware", "Brave-Browser");
    if (lowerPath.includes("opera")) return path4.join(home, ".config", "opera");
    if (lowerPath.includes("chromium")) return path4.join(home, ".config", "chromium");
    return path4.join(home, ".config", "google-chrome");
  }
  return path4.join(home, ".config", "google-chrome");
}
function getScraperHome() {
  return process.env.LBC_SCRAPER_HOME || path4.join(os.homedir(), ".lbc-scraper");
}
function getPortFile() {
  return path4.join(getScraperHome(), "port");
}
function createWrapperDataDir(realDir) {
  const wrapper = path4.join(getScraperHome(), "profile");
  if (fs2.existsSync(path4.join(wrapper, "Default")) || fs2.existsSync(path4.join(wrapper, "Local State"))) {
    console.log(`\u2713 Reusing scraper profile at ${wrapper}`);
    return wrapper;
  }
  fs2.mkdirSync(wrapper, { recursive: true });
  try {
    if (fs2.existsSync(realDir)) {
      fs2.cpSync(realDir, wrapper, {
        recursive: true,
        // Skip lock files to avoid conflicts
        filter: (src) => {
          const basename = path4.basename(src);
          return basename !== "SingletonLock" && basename !== "SingletonCookie" && basename !== "SingletonSocket" && basename !== "lockfile";
        }
      });
      console.log(`\u2713 Profile copied from ${realDir} to ${wrapper}`);
    } else {
      const localState = {
        browser: { enabled_labs_experiments: [] },
        profile: { info_cache: {} }
      };
      fs2.writeFileSync(path4.join(wrapper, "Local State"), JSON.stringify(localState, null, 2));
      console.log(`\u2713 Created new profile at ${wrapper}`);
    }
  } catch (error) {
    console.warn(`\u26A0 Failed to copy profile, using minimal profile:`, error);
  }
  return wrapper;
}
function resetScraperProfile() {
  const wrapper = path4.join(getScraperHome(), "profile");
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
var BROWSER_PATHS_MACOS, BROWSER_PATHS_LINUX, config;
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
    config = {
      browser: {
        chromePath: detectBrowserPath(),
        userDataDir: createWrapperDataDir(detectUserDataDir(detectBrowserPath())),
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
  logger.info(`  Profile : ${config.browser.userDataDir}`);
  if (isBrowserRunning()) {
    logger.info(`  (your existing ${browserName} will NOT be affected)`);
  }
  const child = spawn(
    config.browser.chromePath,
    [
      `--remote-debugging-port=${newPort}`,
      `--user-data-dir=${config.browser.userDataDir}`,
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
  return attributes.reduce((acc, attr) => {
    const value = attr.value_label ?? attr.value;
    return value !== void 0 ? { ...acc, [attr.key]: value } : acc;
  }, {});
}
function mapAd(ad) {
  const dateUTC = ad.index_date.includes("T") ? new Date(ad.index_date) : /* @__PURE__ */ new Date(ad.index_date.replace(" ", "T") + "Z");
  return {
    list_id: ad.list_id,
    title: ad.subject,
    description: ad.body,
    url: ad.url,
    price: ad.price?.length ? ad.price[0] : 0,
    date: dateUTC,
    city: ad.location.city_label,
    user_id: ad.owner.user_id,
    has_phone: ad.has_phone,
    attributes: mapAttributes(ad.attributes)
  };
}
function processSearchData(data) {
  return {
    total: data.total,
    results: data.ads.map(mapAd)
  };
}
function processAdData(ad) {
  return mapAd(ad);
}
var init_exploit = __esm({
  "src/exploit.ts"() {
    "use strict";
    init_utils();
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
    } else {
      params = new URLSearchParams(trimmed);
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
async function extractNextDataFromDOM(cdp) {
  const result = await cdp.evaluate(
    `(() => {
      const el = document.getElementById('__NEXT_DATA__');
      if (!el || !el.textContent) return null;
      const data = JSON.parse(el.textContent);
      const pp = data.props && data.props.pageProps;
      const searchData = pp ? (pp.searchData || pp.searchResult || null) : null;
      const categoryId =
        (pp && pp.categoryId) || (data.query && data.query.category) || null;
      return { buildId: data.buildId, searchData, categoryId };
    })()`
  );
  if (!result) {
    throw new Error("Could not read __NEXT_DATA__ from the page. The page may not have loaded correctly or a CAPTCHA may be blocking.");
  }
  if (!result.searchData) {
    throw new Error("No searchData/searchResult in __NEXT_DATA__ \u2014 the page may not be a search results page.");
  }
  return result;
}
async function fetchNextDataRoute(cdp, buildId, query, page) {
  const escapedBuildId = JSON.stringify(buildId);
  const escapedQuery = JSON.stringify(query);
  const result = await cdp.evaluate(`(async () => {
    const url = '/_next/data/' + ${escapedBuildId} + '/recherche.json?' + ${escapedQuery} + '&page=' + ${page};
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      if (res.status === 403) throw new Error('BLOCKED:403');
      throw new Error('HTTP_' + res.status);
    }
    const data = await res.json();
    if (data.pageProps && data.pageProps.searchData) return data.pageProps.searchData;
    throw new Error('NO_SEARCH_DATA');
  })()`);
  return result;
}
async function fetchAdDataRoute(cdp, buildId, adPath) {
  const escapedBuildId = JSON.stringify(buildId);
  const jsonPath = adPath.replace(/\.htm$/, "") + ".json";
  const escapedPath = JSON.stringify(jsonPath);
  const result = await cdp.evaluate(`(async () => {
    const url = '/_next/data/' + ${escapedBuildId} + ${escapedPath};
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      if (res.status === 403) throw new Error('BLOCKED:403');
      throw new Error('HTTP_' + res.status);
    }
    const data = await res.json();
    if (data.pageProps && data.pageProps.ad) return data.pageProps.ad;
    throw new Error('NO_AD_DATA');
  })()`);
  return result;
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
  let firstPage;
  try {
    firstPage = await extractNextDataFromDOM(cdp);
  } catch (error) {
    logger.warn(`First extraction failed: ${error.message}`);
    logger.info("Re-navigating to search URL\u2026");
    await navigateWithCaptchaHandling(cdp, search.navigateUrl);
    firstPage = await extractNextDataFromDOM(cdp);
  }
  const { buildId, searchData, categoryId } = firstPage;
  const query = buildQueryString(search.params, categoryId);
  const first = processSearchData(searchData);
  const allAds = [...first.results];
  const totalPages = Math.ceil(first.total / config.scraping.resultPerPage);
  const siteCap = typeof searchData.max_pages === "number" && searchData.max_pages > 0 ? searchData.max_pages : FALLBACK_MAX_PAGES;
  const userCap = config.scraping.maxPages && config.scraping.maxPages > 0 ? config.scraping.maxPages : Infinity;
  const nbPages = Math.min(totalPages, siteCap, userCap);
  logger.info(`Found ${first.total} results across ${totalPages} pages (buildId: ${buildId})`);
  logger.info(`Pagination query: ${query}`);
  if (nbPages < totalPages) {
    const reason = userCap <= siteCap && userCap < totalPages ? `limited to ${nbPages} page(s) via --max-pages` : `Leboncoin caps pagination at ${nbPages} of ${totalPages} pages`;
    logger.warn(`Scraping the first ${nbPages} page(s) \u2014 ${reason}.`);
  }
  for (let i = 2; i <= nbPages; i++) {
    await delay(config.scraping.rateLimit + Math.floor(Math.random() * 2e3));
    logger.progress(i - 1, nbPages, `Page ${i}/${nbPages}`);
    try {
      const pageData = await fetchNextDataRoute(cdp, buildId, query, i);
      const page = processSearchData(pageData);
      allAds.push(...page.results);
    } catch (error) {
      if (error.message?.includes("BLOCKED") || error.message?.includes("CAPTCHA")) {
        await navigateWithCaptchaHandling(cdp, `${config.api.baseUrl}/recherche?${query}&page=${i}`);
        const retryData = await extractNextDataFromDOM(cdp);
        allAds.push(...processSearchData(retryData.searchData).results);
      } else {
        logger.error(`Failed page ${i}: ${error.message}`);
      }
    }
  }
  if (nbPages > 1) logger.progress(nbPages, nbPages);
  logger.endTask();
  return { ads: allAds, buildId, query };
}
async function scrapeAdDetails(cdp, urls, buildId) {
  logger.startTask(`Scraping ${urls.length} ad details`);
  const result = { success: [], failed: [] };
  for (let i = 0; i < urls.length; i++) {
    logger.progress(i + 1, urls.length);
    try {
      const urlPath = urls[i].replace(/^https?:\/\/[^/]+/, "");
      const adData = await fetchAdDataRoute(cdp, buildId, urlPath);
      result.success.push(processAdData(adData));
    } catch (error) {
      if (error.message?.includes("BLOCKED") || error.message?.includes("CAPTCHA")) {
        await navigateWithCaptchaHandling(cdp, urls[i]);
        try {
          const dom = await cdp.evaluate(
            `(() => {
              const el = document.getElementById('__NEXT_DATA__');
              if (!el) return null;
              return JSON.parse(el.textContent).props.pageProps.ad;
            })()`
          );
          if (dom) {
            result.success.push(processAdData(dom));
            continue;
          }
        } catch {
        }
        i--;
        continue;
      }
      result.failed.push({
        url: urls[i],
        error: error instanceof Error ? error.message : String(error)
      });
      logger.error(`Failed: ${urls[i]}`);
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
    init_exploit();
    init_config();
    init_logger();
    init_utils();
    init_captcha();
    init_query();
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
  if (args.resetProfile) {
    resetScraperProfile();
  }
  if (args.browser) {
    config.browser.chromePath = getBrowserPath(args.browser);
    config.browser.userDataDir = createWrapperDataDir(detectUserDataDir(config.browser.chromePath));
  } else if (args.chromePath) {
    config.browser.chromePath = args.chromePath;
    config.browser.userDataDir = createWrapperDataDir(detectUserDataDir(args.chromePath));
  }
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
      logger.success(`Saved ${searchResult.ads.length} results to ${outputPath}`);
    }
    if (args.withDetails || args.detailsOnly) {
      const resultsPath = `${config.output.directory}/${outputName}.json`;
      if (!fs3.existsSync(resultsPath)) {
        logger.error(`Results file not found: ${resultsPath}. Run without --details-only first.`);
        process.exit(1);
      }
      const results = JSON.parse(fs3.readFileSync(resultsPath, "utf8"));
      const urls = results.map((ad) => ad.url);
      if (urls.length > 0) {
        if (!buildId) {
          const nextData = await cdp.evaluate(
            `(() => {
              const el = document.getElementById('__NEXT_DATA__');
              return el ? JSON.parse(el.textContent).buildId : null;
            })()`
          ).catch(() => null);
          buildId = nextData?.buildId || "";
          if (!buildId) {
            logger.warn("Could not get buildId \u2014 navigating to get one\u2026");
            await cdp.send("Page.enable");
            await cdp.send("Page.navigate", { url: urls[0] });
            await waitForPageReady(cdp);
            await new Promise((r) => setTimeout(r, 2e3));
            const nd = await cdp.evaluate(
              `(() => {
                const el = document.getElementById('__NEXT_DATA__');
                return el ? { buildId: JSON.parse(el.textContent).buildId } : null;
              })()`
            ).catch(() => null);
            buildId = nd?.buildId || "";
          }
        }
        if (!buildId) {
          logger.error("Cannot determine buildId \u2014 ad detail scraping requires it.");
          process.exit(1);
        }
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
    init_scraper();
    init_utils();
    init_query();
    init_logger();
    init_config();
  }
});

// src/comparables.ts
var comparables_exports = {};
__export(comparables_exports, {
  runComparables: () => runComparables
});
import fs4 from "fs";
import path5 from "path";
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
async function runComparables(annoncesDir, slug, opts = {}) {
  const dir = path5.join(annoncesDir, slug);
  const a = parseAnnonce(dir);
  const rawQuery = opts.query ?? buildQueryFromAnnonce(a);
  if (!rawQuery) {
    throw new Error(`cannot build a comparables query for "${slug}" \u2014 add a title/zipcode or pass --query`);
  }
  if (opts.browser) {
    config.browser.chromePath = getBrowserPath(opts.browser);
    config.browser.userDataDir = createWrapperDataDir(detectUserDataDir(config.browser.chromePath));
  } else if (opts.chromePath) {
    config.browser.chromePath = opts.chromePath;
    config.browser.userDataDir = createWrapperDataDir(detectUserDataDir(opts.chromePath));
  }
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
    const jsonPath = path5.join(dir, "comparables.json");
    const mdPath = path5.join(dir, "comparables.md");
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
async function setInputValue(cdp, candidates, value) {
  const sel = await resolveSelector(cdp, candidates);
  if (!sel) return false;
  return cdp.evaluate(
    `(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return false;
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(el, ${JSON.stringify(value)});
        else el.value = ${JSON.stringify(value)};
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      })()`,
    false
  ).catch(() => false);
}
async function clickSelector(cdp, candidates) {
  const sel = await resolveSelector(cdp, candidates);
  if (!sel) return false;
  return cdp.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`, false).catch(() => false);
}
async function clickByText(cdp, texts, cssFallback = []) {
  const wanted = JSON.stringify(texts.map((t) => t.toLowerCase()));
  const ok = await cdp.evaluate(
    `(() => {
        const wanted = ${wanted};
        const els = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"]'));
        for (const el of els) {
          if (el.disabled) continue;
          const txt = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();
          if (txt && wanted.some((w) => txt === w || txt.includes(w))) { el.click(); return true; }
        }
        return false;
      })()`,
    false
  ).catch(() => false);
  if (ok) return true;
  return cssFallback.length ? clickSelector(cdp, cssFallback) : false;
}
async function clickButton(cdp, button) {
  return clickByText(cdp, button.textCandidates, button.css);
}
async function pickSuggestion(cdp, candidates, label) {
  const sel = await resolveSelector(cdp, candidates);
  if (!sel) return false;
  const wanted = label ? JSON.stringify(label.toLowerCase()) : "null";
  return cdp.evaluate(
    `(() => {
        const opts = Array.from(document.querySelectorAll(${JSON.stringify(sel)}));
        if (!opts.length) return false;
        const w = ${wanted};
        let target = opts[0];
        if (w) {
          const hit = opts.find((o) => (o.innerText || o.textContent || '').trim().toLowerCase().includes(w));
          if (hit) target = hit;
        }
        target.click();
        return true;
      })()`,
    false
  ).catch(() => false);
}
async function currentUrl(cdp) {
  return cdp.evaluate("location.href", false).catch(() => "");
}
async function firstAdLink(cdp) {
  return cdp.evaluate(`(() => { const a = document.querySelector('a[href*="/ad/"]'); return a ? a.href : ''; })()`, false).catch(() => "");
}
async function pageHasText(cdp, markers) {
  const arr = JSON.stringify(markers.map((m) => m.toLowerCase()));
  return cdp.evaluate(`(() => { const t = (document.body.innerText || '').toLowerCase(); return ${arr}.some((m) => t.includes(m)); })()`, false).catch(() => false);
}
async function uploadPhotos(cdp, fileInputCandidates, absPaths) {
  const sel = await resolveSelector(cdp, fileInputCandidates);
  if (!sel) return 0;
  await cdp.send("DOM.enable").catch(() => {
  });
  const doc = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  const rootId = doc?.root?.nodeId;
  if (!rootId) return 0;
  const found = await cdp.send("DOM.querySelector", { nodeId: rootId, selector: sel }).catch(() => null);
  const nodeId = found?.nodeId;
  if (!nodeId) return 0;
  await cdp.send("DOM.setFileInputFiles", { nodeId, files: absPaths }).catch(() => {
  });
  const count = await cdp.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el && el.files ? el.files.length : 0; })()`, false).catch(() => 0);
  return count;
}
var init_deposit_form = __esm({
  "src/deposit-form.ts"() {
    "use strict";
  }
});

// src/selectors.ts
var BASE_URL, DEPOSIT, MANAGE;
var init_selectors = __esm({
  "src/selectors.ts"() {
    "use strict";
    BASE_URL = "https://www.leboncoin.fr";
    DEPOSIT = {
      startUrl: `${BASE_URL}/deposer-une-annonce`,
      /** A redirect to one of these means the session is logged out. */
      loginUrlPattern: /\/(connexion|login|authentification|account\/login)/i,
      categoryInput: [
        'input[name="category"]',
        'input[data-qa-id="adsubject_category"]',
        'input[placeholder*="cat\xE9gorie" i]',
        'input[aria-label*="cat\xE9gorie" i]',
        '[data-qa-id="category"] input'
      ],
      titleInput: ['input[name="subject"]', 'input[data-qa-id="input_subject"]', "input#subject", 'input[aria-label*="titre" i]'],
      descTextarea: ['textarea[name="body"]', 'textarea[data-qa-id="textarea_body"]', "textarea#body", 'textarea[aria-label*="description" i]'],
      priceInput: [
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
        'input[placeholder*="ville" i]'
      ],
      /** Generic autocomplete option (category, zipcode→city). */
      suggestionOption: ['[role="option"]', 'li[data-qa-id*="suggestion"]', 'ul[role="listbox"] li', '[data-qa-id="suggestion"]'],
      /** The real <input type=file>; may be hidden behind photoAddButton. */
      photoFileInput: ['input[type="file"][accept*="image"]', 'input[type="file"]'],
      photoAddButton: {
        textCandidates: ["Ajouter des photos", "Ajouter une photo", "Ajoutez vos photos", "Ajouter"],
        css: ['[data-qa-id*="photo"] button', 'button[aria-label*="photo" i]']
      },
      /** Category-specific attribute field, by form field name/id/data-attr. */
      attrByKey: (key) => [`[name="${key}"]`, `[data-qa-id="${key}"]`, `[data-attribute="${key}"]`, `select[name="${key}"]`, `[id="${key}"]`],
      publishButton: {
        textCandidates: ["D\xE9poser mon annonce", "D\xE9poser l'annonce", "Publier mon annonce", "Publier", "Valider"],
        css: ['button[type="submit"]', 'button[data-qa-id="adsubmit"]']
      },
      /** A published ad URL carries the numeric list_id. */
      publishedUrlPattern: [/\/ad\/[^/]+\/(\d{4,})/, /\/(\d{6,})\.htm/, /[?&]listing_id=(\d+)/],
      /** Reaching one of these means the deposit succeeded (id may need a follow-up). */
      confirmedUrlPattern: [/\/deposer-une-annonce\/(confirmation|merci|success)/i, /\/ad\//]
    };
    MANAGE = {
      listingUrl: `${BASE_URL}/mes-annonces`,
      adUrl: (id) => `${BASE_URL}/ad/${id}`,
      deleteButton: {
        textCandidates: ["Supprimer l'annonce", "Supprimer", "D\xE9sactiver l'annonce", "D\xE9sactiver"],
        css: ['button[data-qa-id*="delete"]', 'a[href*="delete"]', 'button[aria-label*="supprimer" i]']
      },
      confirmButton: {
        textCandidates: ["Confirmer la suppression", "Confirmer", "Supprimer", "Oui", "Valider"],
        css: ['button[data-qa-id*="confirm"]', 'button[type="submit"]']
      },
      /** Page-text markers that confirm a delete succeeded. */
      deletedMarkers: ["annonce supprim\xE9e", "annonce a \xE9t\xE9 supprim\xE9e", "n'existe plus", "n'est plus en ligne"]
    };
  }
});

// src/publish.ts
var publish_exports = {};
__export(publish_exports, {
  runPublish: () => runPublish
});
import path6 from "path";
async function defaultConnect(url) {
  const { connectAndNavigate: connectAndNavigate2 } = await Promise.resolve().then(() => (init_browser(), browser_exports));
  return connectAndNavigate2(url);
}
async function fillForm(cdp, a, photos) {
  if (a.category) {
    const catSel = await resolveSelector(cdp, DEPOSIT.categoryInput);
    if (catSel) {
      await setInputValue(cdp, DEPOSIT.categoryInput, a.category);
      await delay(1200);
      await pickSuggestion(cdp, DEPOSIT.suggestionOption, a.category);
      await delay(1500);
    } else {
      logger.warn("Category field not found \u2014 pick the category manually in the browser.");
    }
  }
  if (!await setInputValue(cdp, DEPOSIT.titleInput, a.title)) logger.warn("Could not fill the title field.");
  if (!await setInputValue(cdp, DEPOSIT.descTextarea, a.description)) logger.warn("Could not fill the description field.");
  if (!await setInputValue(cdp, DEPOSIT.priceInput, String(a.price))) logger.warn("Could not fill the price field.");
  if (a.zipcode) {
    if (await setInputValue(cdp, DEPOSIT.zipcodeInput, a.zipcode)) {
      await delay(1200);
      await pickSuggestion(cdp, DEPOSIT.suggestionOption, a.city ?? a.zipcode);
    }
  }
  if (a.condition) await setInputValue(cdp, DEPOSIT.attrByKey("condition"), a.condition);
  for (const [key, value] of Object.entries(a.attributes ?? {})) {
    const ok = await setInputValue(cdp, DEPOSIT.attrByKey(key), String(value));
    if (!ok) logger.warn(`Attribute "${key}" could not be set automatically \u2014 set it manually if needed.`);
  }
  let uploaded = await uploadPhotos(cdp, DEPOSIT.photoFileInput, photos);
  if (uploaded < photos.length) {
    await clickButton(cdp, DEPOSIT.photoAddButton);
    await delay(800);
    uploaded = await uploadPhotos(cdp, DEPOSIT.photoFileInput, photos);
  }
  if (uploaded === 0) logger.warn("Could not upload photos automatically \u2014 add them manually in the browser.");
  else logger.info(`Uploaded ${uploaded}/${photos.length} photo(s).`);
  await delay(1500);
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
  const dir = path6.join(annoncesDir, slug);
  const a = parseAnnonce(dir);
  if (a.status !== "draft") {
    throw new Error(`annonce "${slug}" is "${a.status}", not "draft" \u2014 only drafts can be published`);
  }
  const photos = resolvePhotoPaths(dir, a);
  if (photos.length === 0) throw new Error(`annonce "${slug}" has no photos in photos/ to upload`);
  const connect = deps.connect ?? defaultConnect;
  const cdp = await connect(DEPOSIT.startUrl);
  try {
    const href = await currentUrl(cdp);
    if (DEPOSIT.loginUrlPattern.test(href)) {
      logger.error("Not logged in to Leboncoin \u2014 log in once in the opened browser, then retry.");
      return { ok: false, reason: "login-required" };
    }
    if (await isOnCaptcha(cdp)) await waitForCaptchaResolution(cdp);
    await fillForm(cdp, a, photos);
    if (opts.dryRun) {
      logger.info("Dry run \u2014 form filled, nothing submitted.");
      return { ok: false, reason: "dry-run" };
    }
    if (opts.yes) {
      logger.info("Auto-submitting (--yes)\u2026");
      await clickButton(cdp, DEPOSIT.publishButton);
    } else {
      logger.warn("Form prefilled. Review it in the browser and click \xAB D\xE9poser mon annonce \xBB yourself.");
      logger.info("Waiting for you to publish\u2026");
    }
    const published = await waitForPublished(cdp, opts.timeoutSubmitMs ?? DEFAULT_SUBMIT_TIMEOUT_MS);
    if (!published) {
      logger.warn("Did not detect a published ad before the timeout.");
      return { ok: false, reason: "not-published" };
    }
    a.status = "published";
    a.leboncoin_url = published.url;
    if (published.id) a.leboncoin_id = published.id;
    a.published_at = (/* @__PURE__ */ new Date()).toISOString();
    writeAnnonce(dir, a);
    logger.success(`Published: ${published.url}`);
    return { ok: true, leboncoin_id: published.id || void 0, leboncoin_url: published.url };
  } finally {
    cdp.disconnect();
  }
}
var DEFAULT_SUBMIT_TIMEOUT_MS;
var init_publish = __esm({
  "src/publish.ts"() {
    "use strict";
    init_captcha();
    init_deposit_form();
    init_logger();
    init_markdown();
    init_selectors();
    init_utils();
    DEFAULT_SUBMIT_TIMEOUT_MS = 15 * 60 * 1e3;
  }
});

// src/delete.ts
var delete_exports = {};
__export(delete_exports, {
  runDelete: () => runDelete
});
import path7 from "path";
import readline from "readline";
async function defaultConnect2(url) {
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
  const dir = path7.join(annoncesDir, slug);
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
  const connect = deps.connect ?? defaultConnect2;
  const target = a.leboncoin_url || MANAGE.adUrl(a.leboncoin_id);
  const cdp = await connect(target);
  try {
    if (await isOnCaptcha(cdp)) await waitForCaptchaResolution(cdp);
    const clickedDelete = await clickButton(cdp, MANAGE.deleteButton);
    if (!clickedDelete) {
      logger.warn("Delete control not found on the ad page \u2014 open mes-annonces and delete it manually.");
    }
    await delay(1500);
    await clickButton(cdp, MANAGE.confirmButton);
    await delay(2500);
    const confirmed = await pageHasText(cdp, MANAGE.deletedMarkers);
    if (confirmed) logger.success(`Leboncoin confirmed the deletion of "${slug}".`);
    a.status = "deleted";
    a.deleted_at = (/* @__PURE__ */ new Date()).toISOString();
    writeAnnonce(dir, a);
    logger.success(`Marked "${slug}" as deleted locally.`);
    return { ok: true };
  } finally {
    cdp.disconnect();
  }
}
var init_delete = __esm({
  "src/delete.ts"() {
    "use strict";
    init_captcha();
    init_deposit_form();
    init_logger();
    init_markdown();
    init_selectors();
    init_utils();
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
  scaffoldAnnonce(dir, { title: opts.title, category: opts.category }, { force: opts.force });
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
function validateAnnonce(dir) {
  const slug = path3.basename(path3.resolve(dir));
  let a;
  try {
    a = parseAnnonce(dir);
  } catch (e) {
    return { ok: false, slug, issues: [{ field: "file", message: e.message }] };
  }
  const issues = [];
  if (!a.title.trim()) issues.push({ field: "title", message: "title is required" });
  else if (a.title.trim().length < 5) issues.push({ field: "title", message: "title is too short (min 5 chars)" });
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
  }
  if (a.status !== "draft") {
    issues.push({ field: "status", message: `status must be "draft" to publish (is "${a.status}")` });
  }
  return { ok: issues.length === 0, slug, issues };
}
function formatValidationReport(r) {
  if (r.ok) return `\u2713 ${r.slug}: valid \u2014 ready to publish`;
  const lines = [`\u2717 ${r.slug}: ${r.issues.length} issue(s)`];
  for (const i of r.issues) lines.push(`  - [${i.field}] ${i.message}`);
  return lines.join("\n");
}

// src/types.ts
var VERSION = "1.0.0";

// src/cli.ts
var HELP = `leboncoin v${VERSION}
Manage your Leboncoin listings from local markdown + photos, then publish/delete
them on your own account via the Chrome DevTools Protocol. Markdown is the source
of truth; you (or the agent) write the copy, the engine just drives the browser.

Usage:
  leboncoin new <slug> [--title "<t>"] [--category "<c>"] [--force]
  leboncoin comparables <slug> [--query "<lbc query>"] [--max-pages <n>] [--with-details]
  leboncoin validate <slug>
  leboncoin publish <slug> [--yes] [--dry-run] [--timeout-submit <ms>]
  leboncoin delete <slug> [--yes]
  leboncoin list [--status draft|published|deleted]
  leboncoin scrape --query "<query|url>" [scraper options]

Commands:
  new           Scaffold annonces/<slug>/annonce.md + photos/ (a draft).
  comparables   Scrape similar live listings into the folder (price/keyword grounding).
  validate      Structural gate: required fields, >=1 photo, real description, draft status.
  publish       Open the deposit form, fill it + upload photos via CDP. Semi-auto by
                default: review and click \xAB D\xE9poser mon annonce \xBB yourself. --yes to auto-submit.
  delete        Remove a published ad (confirms unless --yes).
  list/status   Show local annonces and their published state.
  scrape        The original read-only scraper (search results + ad details).

Common options:
  --annonces-dir <dir>   Root of the local store            (default: ./annonces)
  --json                 Machine-readable output
  -h, --help             Show this help
  -v, --version          Show version

Publish/delete safety:
  Semi-auto is the default \u2014 the engine never clicks the final publish for you unless
  you pass --yes. A DataDome captcha at submit always needs a human, so --yes is not
  fully headless. These actions hit your real account; see SKILL.md.
`;
var COMMANDS = /* @__PURE__ */ new Set(["new", "comparables", "validate", "publish", "delete", "list", "status", "scrape"]);
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
  "status",
  "timeout-submit"
]);
var BOOL_FLAGS = /* @__PURE__ */ new Set(["json", "with-details", "details-only", "search-only", "save-raw", "reset-profile", "yes", "dry-run", "force"]);
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
function requireSlug(p) {
  const slug = p.positional[0];
  if (!slug) fail(`missing <slug> (e.g. leboncoin ${p.command} macbook-air-m1)`);
  return slug;
}
async function main() {
  const p = parseArgs(process.argv.slice(2));
  const json = p.bools.has("json");
  switch (p.command) {
    case "new": {
      const slug = requireSlug(p);
      const r = runNew(annoncesDirOf(p), slug, {
        title: p.values.title,
        category: p.values.category,
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
    case "publish": {
      const slug = requireSlug(p);
      const { runPublish: runPublish2 } = await Promise.resolve().then(() => (init_publish(), publish_exports));
      const r = await runPublish2(annoncesDirOf(p), slug, {
        yes: p.bools.has("yes"),
        dryRun: p.bools.has("dry-run"),
        timeoutSubmitMs: intOf(p.values["timeout-submit"])
      });
      if (json) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
      if (!r.ok && r.reason === "login-required") process.exit(2);
      if (!r.ok && r.reason === "not-published") process.exit(2);
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
