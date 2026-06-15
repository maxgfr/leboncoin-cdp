/**
 * Structural gate run before publishing — the analogue of construct's `check`.
 * Confirms an annonce has everything the deposit form needs, so the agent never
 * tries to publish a half-filled draft. Pure (no CDP, no network).
 */
import path from "node:path";
import type { Annonce } from "./types";
import { listPhotoFiles, parseAnnonce, PLACEHOLDER_BODY } from "./markdown";

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  slug: string;
  issues: ValidationIssue[];
}

const PLACEHOLDER_RE = /fill this in|décris ton article ici|lorem ipsum/i;

export function validateAnnonce(dir: string): ValidationResult {
  const slug = path.basename(path.resolve(dir));
  let a: Annonce;
  try {
    a = parseAnnonce(dir);
  } catch (e) {
    return { ok: false, slug, issues: [{ field: "file", message: (e as Error).message }] };
  }

  const issues: ValidationIssue[] = [];

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

export function formatValidationReport(r: ValidationResult): string {
  if (r.ok) return `✓ ${r.slug}: valid — ready to publish`;
  const lines = [`✗ ${r.slug}: ${r.issues.length} issue(s)`];
  for (const i of r.issues) lines.push(`  - [${i.field}] ${i.message}`);
  return lines.join("\n");
}
