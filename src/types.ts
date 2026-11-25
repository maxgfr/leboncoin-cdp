export const VERSION = "1.6.0";

export type Ad = {
  list_id: string;
  title: string;
  description: string;
  url: string;
  price: number;
  date: Date;
  city: string;
  user_id: string;
  has_phone: boolean;
  phone_number?: string;
  attributes: Record<string, string>;
};

export type SearchResults = {
  total: number;
  results: Ad[];
};

/** Lifecycle of a locally-managed listing. */
export type AnnonceStatus = "draft" | "published" | "deleted" | "sold" | "paused";

/**
 * A listing managed locally as markdown + photos (the source of truth).
 * Frontmatter holds the structured fields; the markdown body is the
 * description. Publish/delete write the leboncoin_* fields back.
 */
export type Annonce = {
  /** Folder name under the annonces dir (also the local identity). */
  slug: string;
  title: string;
  /** Leboncoin category label the agent infers (e.g. "Informatique"). */
  category: string;
  /** Price in euros. */
  price: number;
  /** French postal code; drives the location autocomplete on publish. */
  zipcode: string;
  /** Optional city label; resolved from the zipcode when blank. */
  city?: string;
  /**
   * Full street address ("12 rue X, 75012 Paris") the deposit form asks for (« À quelle
   * adresse se trouve le bien ? »). Private: Leboncoin never shows it on the ad. Asked to
   * the user, never invented.
   */
  address?: string;
  /** Optional item condition (per category, e.g. "Très bon état"). */
  condition?: string;
  /** Offer delivery / shipping. */
  shipping?: boolean;
  /** Category-specific fields — same vocabulary as Ad.attributes. */
  attributes: Record<string, string>;
  /** Explicit photo order (filenames under photos/); empty = sorted dir. */
  photos: string[];
  status: AnnonceStatus;
  /** Set once published. */
  leboncoin_id?: string;
  leboncoin_url?: string;
  published_at?: string;
  deleted_at?: string;
  /** Set when marked sold / paused via the manage commands. */
  sold_at?: string;
  paused_at?: string;
  /** Last bump (« Remettre en avant »), set by `record --status renewed`. */
  renewed_at?: string;
  /** The description (markdown body). */
  description: string;
};
