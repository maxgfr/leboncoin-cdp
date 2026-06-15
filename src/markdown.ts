/**
 * The local annonce store: one folder per listing, markdown as the source of
 * truth.
 *
 *   annonces/<slug>/
 *     annonce.md        # YAML-subset frontmatter + body(=description)
 *     photos/           # *.jpg|*.jpeg|*.png|*.webp (upload source of truth)
 *     comparables.json  # written by `comparables` (raw Ad[])
 *     comparables.md    # human-readable digest for the agent
 *
 * Frontmatter is parsed/serialized by a tiny hand-rolled YAML subset (flat
 * scalars + one nested `attributes:` map + a `photos:` list) so the shipped
 * bundle stays zero-dependency — no `yaml` at runtime.
 */
import fs from "node:fs";
import path from "node:path";
import type { Annonce, AnnonceStatus } from "./types";

export const ANNONCE_FILENAME = "annonce.md";
export const PHOTOS_DIRNAME = "photos";
export const PLACEHOLDER_BODY = "<!-- Décris ton article ici (état, détails, raison de la vente…). L'IA améliorera ce texte. -->";

const PHOTO_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const STATUSES: AnnonceStatus[] = ["draft", "published", "deleted"];

/* ───────────────────────────── parsing ───────────────────────────── */

function splitFrontmatter(raw: string): { fm: string; body: string } {
  const text = raw.replace(/\r\n/g, "\n");
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) {
    throw new Error("annonce.md is missing its `---` frontmatter block");
  }
  return { fm: m[1] ?? "", body: m[2] ?? "" };
}

function unquote(t: string): string {
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
    return t.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  if (t.length >= 2 && t[0] === "'" && t[t.length - 1] === "'") {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

function parseScalar(s: string): string | number | boolean {
  const t = s.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return unquote(t);
}

type FrontValue = string | number | boolean | string[] | Record<string, string>;

function parseFrontmatter(fm: string): Record<string, FrontValue> {
  const out: Record<string, FrontValue> = {};
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
    const key = m[1] as string;
    const rest = (m[2] ?? "").trim();

    if (rest === "") {
      // A nested block (map or list) may follow as indented lines.
      const block: string[] = [];
      let j = i + 1;
      while (j < lines.length && /^\s+\S/.test(lines[j] ?? "")) {
        block.push(lines[j] as string);
        j++;
      }
      if (block.length && (block[0] as string).trimStart().startsWith("- ")) {
        out[key] = block.map((b) => String(parseScalar(b.trim().replace(/^-\s*/, ""))));
      } else if (block.length) {
        const map: Record<string, string> = {};
        for (const b of block) {
          const bm = b.trim().match(/^(.+?):\s*(.*)$/);
          if (bm) map[unquote((bm[1] as string).trim())] = String(parseScalar(bm[2] as string));
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

function str(v: FrontValue | undefined): string {
  return v == null || typeof v === "object" ? "" : String(v);
}
function optStr(v: FrontValue | undefined): string | undefined {
  const s = str(v);
  return s === "" ? undefined : s;
}
function normStatus(v: FrontValue | undefined): AnnonceStatus {
  const s = str(v) as AnnonceStatus;
  return STATUSES.includes(s) ? s : "draft";
}

/** Parse `<dir>/annonce.md` into an Annonce (slug derived from the folder). */
export function parseAnnonce(dir: string): Annonce {
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
    shipping: f.shipping === true ? true : f.shipping === false ? false : undefined,
    attributes: f.attributes && typeof f.attributes === "object" && !Array.isArray(f.attributes) ? (f.attributes as Record<string, string>) : {},
    photos: Array.isArray(f.photos) ? f.photos.map(String) : [],
    status: normStatus(f.status),
    leboncoin_id: optStr(f.leboncoin_id),
    leboncoin_url: optStr(f.leboncoin_url),
    published_at: optStr(f.published_at),
    deleted_at: optStr(f.deleted_at),
    description: body.trim(),
  };
}

/* ──────────────────────────── serializing ──────────────────────────── */

function q(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function qKey(k: string): string {
  return /^[A-Za-z0-9_-]+$/.test(k) ? k : q(k);
}

/** Render an Annonce back to the canonical annonce.md text. */
export function serializeAnnonce(a: Annonce): string {
  const L: string[] = ["---"];
  L.push(`title: ${q(a.title)}`);
  L.push(`category: ${q(a.category)}`);
  L.push(`price: ${Number.isFinite(a.price) ? a.price : 0}`);
  L.push(`zipcode: ${q(a.zipcode)}`);
  if (a.city) L.push(`city: ${q(a.city)}`);
  if (a.condition) L.push(`condition: ${q(a.condition)}`);
  if (a.shipping !== undefined) L.push(`shipping: ${a.shipping}`);

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

/** Write the annonce back to `<dir>/annonce.md`. */
export function writeAnnonce(dir: string, a: Annonce): void {
  fs.writeFileSync(path.join(dir, ANNONCE_FILENAME), serializeAnnonce(a));
}

/* ─────────────────────────── scaffold / list ─────────────────────────── */

/** Create `<dir>/annonce.md` + `<dir>/photos/` for a fresh draft listing. */
export function scaffoldAnnonce(dir: string, init: { title?: string; category?: string } = {}, opts: { force?: boolean } = {}): Annonce {
  const file = path.join(dir, ANNONCE_FILENAME);
  if (fs.existsSync(file) && !opts.force) {
    throw new Error(`annonce already exists at ${file} (use --force to overwrite)`);
  }
  fs.mkdirSync(path.join(dir, PHOTOS_DIRNAME), { recursive: true });
  const a: Annonce = {
    slug: path.basename(path.resolve(dir)),
    title: init.title ?? "",
    category: init.category ?? "",
    price: 0,
    zipcode: "",
    attributes: {},
    photos: [],
    status: "draft",
    description: PLACEHOLDER_BODY,
  };
  writeAnnonce(dir, a);
  return a;
}

/** List the photo filenames present in `<dir>/photos/` (sorted). */
export function listPhotoFiles(dir: string): string[] {
  const pdir = path.join(dir, PHOTOS_DIRNAME);
  if (!fs.existsSync(pdir)) return [];
  return fs
    .readdirSync(pdir)
    .filter((f) => PHOTO_EXTS.has(path.extname(f).toLowerCase()))
    .sort();
}

/** Absolute paths to the photos to upload, in order (frontmatter list wins). */
export function resolvePhotoPaths(dir: string, a: Annonce): string[] {
  const names = a.photos && a.photos.length ? a.photos : listPhotoFiles(dir);
  return names.map((n) => path.resolve(dir, PHOTOS_DIRNAME, n));
}

/** Parse every annonce under `root` (skips malformed folders). */
export function listAnnonces(root: string): Annonce[] {
  if (!fs.existsSync(root)) return [];
  const out: Annonce[] = [];
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
        /* skip malformed annonce */
      }
    }
  }
  return out;
}
