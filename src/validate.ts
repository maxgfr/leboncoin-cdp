/**
 * Structural gate run before publishing — the analogue of construct's `check`.
 * Confirms an annonce has everything the deposit form needs, so the agent never
 * tries to publish a half-filled draft. Pure (no CDP, no network).
 *
 * `issues` fail the gate (exit ≠ 0). `warnings` are advisory Leboncoin-limit
 * heuristics (long title/description, too many photos) — they show in the report
 * but do NOT fail the gate, since the exact limits aren't authoritative without
 * the live form.
 */
import path from "node:path";
import { listPhotoFiles, parseAnnonce, PLACEHOLDER_BODY } from "./markdown";
import type { Annonce } from "./types";

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  slug: string;
  issues: ValidationIssue[];
  warnings: ValidationIssue[];
}

const PLACEHOLDER_RE = /fill this in|décris ton article ici|lorem ipsum/i;

// Heuristic Leboncoin limits (advisory — surfaced as warnings, not hard fails).
const TITLE_MAX = 100;
const DESC_MAX = 4000;
const PHOTOS_MAX = 25;

export function validateAnnonce(dir: string): ValidationResult {
  const slug = path.basename(path.resolve(dir));
  let a: Annonce;
  try {
    a = parseAnnonce(dir);
  } catch (e) {
    return { ok: false, slug, issues: [{ field: "file", message: (e as Error).message }], warnings: [] };
  }

  const issues: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

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
    warnings.push({ field: "photos", message: `${photos.length} photos; Leboncoin caps around ${PHOTOS_MAX} — the extras may be ignored` });
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

export function formatValidationReport(r: ValidationResult): string {
  const lines: string[] = [];
  if (r.ok) lines.push(`✓ ${r.slug}: valid — ready to publish`);
  else {
    lines.push(`✗ ${r.slug}: ${r.issues.length} issue(s)`);
    for (const i of r.issues) lines.push(`  - [${i.field}] ${i.message}`);
  }
  for (const w of r.warnings) lines.push(`  ⚠ [${w.field}] ${w.message}`);
  return lines.join("\n");
}
