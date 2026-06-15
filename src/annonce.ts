/**
 * Pure (no-CDP) command handlers for the local annonce store: scaffolding new
 * listings and listing existing ones. Kept free of any config/browser import so
 * `new`/`list` never trigger the browser-profile side effects in config.ts.
 */
import path from "node:path";
import { listAnnonces, scaffoldAnnonce } from "./markdown";

const SLUG_RE = /^[a-z0-9][a-z0-9._-]*$/i;

export interface NewOptions {
  title?: string;
  category?: string;
  force?: boolean;
}

export function runNew(annoncesDir: string, slug: string, opts: NewOptions = {}): { slug: string; dir: string; markdown: string } {
  if (!slug || !SLUG_RE.test(slug)) {
    throw new Error(`invalid slug "${slug ?? ""}" — use letters, digits, dash or underscore (e.g. macbook-air-m1)`);
  }
  const dir = path.join(annoncesDir, slug);
  scaffoldAnnonce(dir, { title: opts.title, category: opts.category }, { force: opts.force });
  return { slug, dir, markdown: path.join(dir, "annonce.md") };
}

export interface AnnonceSummary {
  slug: string;
  title: string;
  status: string;
  price: number;
  leboncoin_id?: string;
  leboncoin_url?: string;
}

export function runList(annoncesDir: string, filterStatus?: string): AnnonceSummary[] {
  return listAnnonces(annoncesDir)
    .filter((a) => !filterStatus || a.status === filterStatus)
    .map((a) => ({
      slug: a.slug,
      title: a.title,
      status: a.status,
      price: a.price,
      leboncoin_id: a.leboncoin_id,
      leboncoin_url: a.leboncoin_url,
    }));
}
