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

  /** The photo thumbnail grid — an element-clip target for cheap verification. */
  photoGrid: ['[data-qa-id*="photo" i]', '[class*="photo" i]', '[data-test*="photo" i]'],

  /** Shipping/delivery toggle (only used when the annonce sets `shipping: true`). */
  shippingToggle: {
    textCandidates: ["Proposer la livraison", "Envoi possible", "Livraison", "Colis", "Envoi"],
    css: ['input[name*="shipping" i]', 'input[name*="livraison" i]', '[data-qa-id*="shipping" i]'],
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

/**
 * Login / session signals. The probe is PASSIVE only (DOM + visible text + URL) —
 * run as in-page JS, indistinguishable from the site's own code. We never fire a
 * synthetic authenticated XHR. `accountUrl` is an authenticated route that bounces
 * to the login page when logged out, so a URL match against `loginUrlPattern`
 * (shared from DEPOSIT) is authoritative for "logged out".
 */
export const AUTH = {
  /** Authenticated route; redirects to login when the session is dead. */
  accountUrl: `${BASE_URL}/mes-annonces`,
  loginUrl: `${BASE_URL}/connexion`,

  /** DOM markers that only render for a logged-in user (ordered, best-effort). */
  loggedInSelectors: [
    '[data-qa-id="header-account"]',
    '[data-qa-id*="account" i]',
    'a[href*="/mes-annonces"]',
    'a[href*="/account"]',
    'a[href*="/mon-compte"]',
    'a[href*="/deconnexion"]',
    'button[aria-label*="compte" i]',
  ],
  /** Visible text that implies a logged-in session. */
  loggedInTextMarkers: ["mes annonces", "se déconnecter", "déconnexion", "mon compte"],
  /** Visible text that implies a logged-out session (used as a weak hint only). */
  loginRequiredTextMarkers: ["se connecter", "identifiez-vous", "créer un compte"],
};

/**
 * Named element-clip targets (consumed by screenshot.captureElement). Keeping the
 * candidate lists here means no literal selector leaks into the verify/publish flow.
 */
export const ELEMENT_TARGETS = {
  photos: DEPOSIT.photoGrid,
  price: DEPOSIT.priceInput,
  submit: DEPOSIT.publishButton.css,
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

  /** Open the modify form for a published ad. */
  editButton: {
    textCandidates: ["Modifier l'annonce", "Modifier", "Éditer", "Modifier mon annonce"],
    css: ['button[data-qa-id*="edit"]', 'a[href*="modifier"]', 'a[href*="edit"]', 'button[aria-label*="modifier" i]'],
  } satisfies ButtonSelector,

  /** Save / update an edited ad (the edit form's submit). */
  saveButton: {
    textCandidates: ["Enregistrer les modifications", "Enregistrer", "Mettre à jour", "Valider les modifications", "Valider"],
    css: ['button[type="submit"]', 'button[data-qa-id*="save"]', 'button[data-qa-id*="submit"]'],
  } satisfies ButtonSelector,

  /** Renew / bump ("remettre en avant" / boost). No status change. */
  renewButton: {
    textCandidates: ["Remettre en avant", "Remonter l'annonce", "Booster", "Renouveler", "Remonter"],
    css: ['button[data-qa-id*="renew"]', 'button[data-qa-id*="boost"]', 'a[href*="remonter"]'],
  } satisfies ButtonSelector,

  /** Mark the ad as sold ("c'est vendu" / "vendu"). */
  markSoldButton: {
    textCandidates: ["Marquer comme vendu", "C'est vendu", "Vendu", "Marquer vendu"],
    css: ['button[data-qa-id*="sold"]', 'button[data-qa-id*="vendu"]', 'button[aria-label*="vendu" i]'],
  } satisfies ButtonSelector,

  /** Deactivate / pause without deleting. */
  deactivateButton: {
    textCandidates: ["Désactiver l'annonce", "Désactiver", "Mettre en pause", "Suspendre"],
    css: ['button[data-qa-id*="deactivate"]', 'button[data-qa-id*="pause"]', 'button[aria-label*="désactiver" i]'],
  } satisfies ButtonSelector,

  /** Reactivate a paused ad. */
  reactivateButton: {
    textCandidates: ["Réactiver l'annonce", "Réactiver", "Remettre en ligne", "Activer"],
    css: ['button[data-qa-id*="reactivate"]', 'button[data-qa-id*="activate"]', 'button[aria-label*="réactiver" i]'],
  } satisfies ButtonSelector,

  /** Generic confirmation for renew/sold/deactivate/reactivate flows. */
  manageConfirmButton: {
    textCandidates: ["Confirmer", "Oui", "Valider", "Continuer", "OK"],
    css: ['button[data-qa-id*="confirm"]', 'button[type="submit"]'],
  } satisfies ButtonSelector,

  /** Page-text markers that confirm a delete succeeded. */
  deletedMarkers: ["annonce supprimée", "annonce a été supprimée", "n'existe plus", "n'est plus en ligne"],
};
