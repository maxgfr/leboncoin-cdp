/**
 * THE single isolation point for everything brittle about Leboncoin's pages.
 *
 * The deposit ("déposer une annonce") flow is an obfuscated React SPA whose
 * class names and structure change over time. Every logical form field is mapped
 * here to an ORDERED list of candidate strategies (CSS selectors, or text probes
 * for buttons); the engine tries them in order and uses the first that resolves.
 * publish.ts / delete.ts / deposit-form.ts contain NO literal selectors — when
 * Leboncoin changes, this file (and its fixture tests) is the only thing to edit.
 *
 * NOTE: these candidates are best-effort until captured against a live, logged-in
 * deposit form. The semi-auto human review gate is the safety net while they
 * mature: even if one field is left blank, you see it before submitting.
 * See references/deposit-form-mapping.md for the maintenance runbook.
 */

export const BASE_URL = "https://www.leboncoin.fr";

export interface ButtonSelector {
  /** Visible label substrings to match (case-insensitive). */
  textCandidates: string[];
  /** CSS fallbacks if no labelled control is found. */
  css: string[];
}

export const DEPOSIT = {
  startUrl: `${BASE_URL}/deposer-une-annonce`,

  /** A redirect to one of these means the session is logged out. */
  loginUrlPattern: /\/(connexion|login|authentification|account\/login)/i,

  categoryInput: [
    'input[name="category"]',
    'input[data-qa-id="adsubject_category"]',
    'input[placeholder*="catégorie" i]',
    'input[aria-label*="catégorie" i]',
    '[data-qa-id="category"] input',
  ],

  titleInput: ['input[name="subject"]', 'input[data-qa-id="input_subject"]', "input#subject", 'input[aria-label*="titre" i]'],

  descTextarea: ['textarea[name="body"]', 'textarea[data-qa-id="textarea_body"]', "textarea#body", 'textarea[aria-label*="description" i]'],

  priceInput: [
    'input[name="price"]',
    'input[data-qa-id="input_price"]',
    "input#price",
    'input[aria-label*="prix" i]',
    'input[inputmode="numeric"][name*="price" i]',
  ],

  zipcodeInput: [
    'input[name="location"]',
    'input[name="zipcode"]',
    'input[data-qa-id="input_location"]',
    'input[placeholder*="code postal" i]',
    'input[placeholder*="ville" i]',
  ],

  /** Generic autocomplete option (category, zipcode→city). */
  suggestionOption: ['[role="option"]', 'li[data-qa-id*="suggestion"]', 'ul[role="listbox"] li', '[data-qa-id="suggestion"]'],

  /** The real <input type=file>; may be hidden behind photoAddButton. */
  photoFileInput: ['input[type="file"][accept*="image"]', 'input[type="file"]'],

  photoAddButton: {
    textCandidates: ["Ajouter des photos", "Ajouter une photo", "Ajoutez vos photos", "Ajouter"],
    css: ['[data-qa-id*="photo"] button', 'button[aria-label*="photo" i]'],
  } satisfies ButtonSelector,

  /** Category-specific attribute field, by form field name/id/data-attr. */
  attrByKey: (key: string): string[] => [`[name="${key}"]`, `[data-qa-id="${key}"]`, `[data-attribute="${key}"]`, `select[name="${key}"]`, `[id="${key}"]`],

  publishButton: {
    textCandidates: ["Déposer mon annonce", "Déposer l'annonce", "Publier mon annonce", "Publier", "Valider"],
    css: ['button[type="submit"]', 'button[data-qa-id="adsubmit"]'],
  } satisfies ButtonSelector,

  /** A published ad URL carries the numeric list_id. */
  publishedUrlPattern: [/\/ad\/[^/]+\/(\d{4,})/, /\/(\d{6,})\.htm/, /[?&]listing_id=(\d+)/],

  /** Reaching one of these means the deposit succeeded (id may need a follow-up). */
  confirmedUrlPattern: [/\/deposer-une-annonce\/(confirmation|merci|success)/i, /\/ad\//],
};

export const MANAGE = {
  listingUrl: `${BASE_URL}/mes-annonces`,
  adUrl: (id: string): string => `${BASE_URL}/ad/${id}`,

  deleteButton: {
    textCandidates: ["Supprimer l'annonce", "Supprimer", "Désactiver l'annonce", "Désactiver"],
    css: ['button[data-qa-id*="delete"]', 'a[href*="delete"]', 'button[aria-label*="supprimer" i]'],
  } satisfies ButtonSelector,

  confirmButton: {
    textCandidates: ["Confirmer la suppression", "Confirmer", "Supprimer", "Oui", "Valider"],
    css: ['button[data-qa-id*="confirm"]', 'button[type="submit"]'],
  } satisfies ButtonSelector,

  /** Page-text markers that confirm a delete succeeded. */
  deletedMarkers: ["annonce supprimée", "annonce a été supprimée", "n'existe plus", "n'est plus en ligne"],
};
