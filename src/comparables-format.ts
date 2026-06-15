/**
 * Pure formatting helpers for `comparables` — kept config-free (no browser/CDP
 * import) so they're unit-testable without triggering config.ts's profile side
 * effects.
 */
import type { Ad, Annonce } from "./types";

/** Build a raw Leboncoin search query from a draft's title + zipcode. */
export function buildQueryFromAnnonce(a: Annonce): string {
  const params = new URLSearchParams();
  if (a.title) params.set("text", a.title);
  if (a.zipcode) params.set("locations", a.zipcode);
  return params.toString();
}

function escapePipe(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

/** Render a human-readable digest (price stats + table) for the agent. */
export function digest(a: Annonce, ads: Ad[]): string {
  const prices = ads
    .map((x) => x.price)
    .filter((p) => p > 0)
    .sort((x, y) => x - y);
  const min = prices[0] ?? 0;
  const max = prices[prices.length - 1] ?? 0;
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;

  const lines = [
    `# Comparables — ${a.slug}`,
    "",
    `Query: \`${a.title || "(no title)"}\` · ${a.zipcode || "(no zipcode)"}`,
    `Found ${ads.length} comparable listing(s).`,
    "",
    `Price (where available): min **${min} €** · median **${median} €** · max **${max} €**`,
    "",
    "Use these to set `price`, `category` and category-specific `attributes` in annonce.md.",
    "",
    "| # | Title | Price | City | Key attributes |",
    "|---|-------|-------|------|----------------|",
  ];
  ads.slice(0, 40).forEach((x, i) => {
    const attrs = Object.entries(x.attributes ?? {})
      .slice(0, 4)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    lines.push(`| ${i + 1} | ${escapePipe(x.title)} | ${x.price || "?"} € | ${escapePipe(x.city ?? "")} | ${escapePipe(attrs)} |`);
  });
  lines.push("");
  return lines.join("\n");
}
