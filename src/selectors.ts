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
 * These lists are the FAST PATH, not the only path: the deposit wizard
 * (deposit-wizard.ts) discovers every field from the live DOM and matches it by
 * MEANING (label / accessible name / placeholder / react-hook-form name) through
 * LOGICAL_FIELDS below, so a renamed `name=` or a new hashed class does not break
 * it. Last captured against the live, logged-in site on 2026-10-01 (fixtures in
 * src/__mocks__/deposit-*.html). Every list here can be extended WITHOUT a
 * rebuild through ~/.lbc-scraper/site.json (see site-overrides.ts).
 * See references/deposit-form-mapping.md for the site-drift runbook.
 */

export const BASE_URL = "https://www.leboncoin.fr";

export interface ButtonSelector {
  /** Visible label / accessible-name candidates (case- and accent-insensitive; exact > prefix > contains). */
  textCandidates: string[];
  /** CSS fallbacks if no labelled control is found. */
  css: string[];
}

export const DEPOSIT = {
  startUrl: `${BASE_URL}/deposer-une-annonce`,

  /** A redirect to one of these means the session is logged out (auth.leboncoin.fr/login/… included). */
  loginUrlPattern: /\/(connexion|login|authentification|account\/login)(?:[/?#]|$)/i,

  categoryInput: [
    'input[name="category"]',
    'input[data-qa-id="adsubject_category"]',
    'input[placeholder*="catégorie" i]',
    'input[aria-label*="catégorie" i]',
    '[data-qa-id="category"] input',
  ],

  /**
   * Category pickers seen live (2026-10): after the title is typed, the site
   * suggests categories as cards (`role=button`, aria-label « Choix 1 : catégorie
   * Ordinateurs dans la famille Électronique »); a full two-level tree opens from
   * « Choisissez » / the « Catégorie sélectionnée » button (leaf aria-label
   * « Catégorie Ordinateurs dans la famille Électronique. … »).
   */
  categoryCards: ['[role="button"][aria-label*="catégorie" i]', 'button[aria-label^="Catégorie " i]', '[role="radio"][aria-label*="catégorie" i]'],
  /** Parses « …catégorie <name> dans la famille <family>… » out of an aria-label. */
  categoryAriaPattern: /cat[ée]gorie\s+(.+?)\s+dans la famille\s+(.+?)(?:\.|$)/i,
  /** Opens the full category tree when no suggestion fits. */
  categoryTreeButton: {
    textCandidates: ["Choisissez", "Choisir une catégorie", "Toutes les catégories", "Changer de catégorie"],
    css: ['[aria-label^="Catégorie sélectionnée" i]', 'button[aria-label*="changez de catégorie" i]'],
  } satisfies ButtonSelector,

  titleInput: ['input[name="subject"]', 'input[data-qa-id="input_subject"]', "input#subject", 'input[aria-label*="titre" i]'],

  descTextarea: ['textarea[name="body"]', 'textarea[data-qa-id="textarea_body"]', "textarea#body", 'textarea[aria-label*="description" i]'],

  priceInput: [
    'input[name="price_cents"]',
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
    'input[placeholder*="adresse" i]',
    'input[placeholder*="ville" i]',
  ],

  /** Generic autocomplete option (category, zipcode→city). */
  suggestionOption: ['[role="option"]', 'li[data-qa-id*="suggestion"]', 'ul[role="listbox"] li', '[data-qa-id="suggestion"]'],

  /** The real <input type=file>; may be hidden behind photoAddButton. */
  photoFileInput: ['input[type="file"][accept*="image"]', 'input[type="file"]'],

  photoAddButton: {
    textCandidates: ["Ajouter des photos", "Ajouter une photo", "Ajoutez vos photos"],
    css: ['[aria-label^="Ajouter" i][aria-label*="photo" i]', '[data-qa-id*="photo"] button', 'button[aria-label*="photo" i]'],
  } satisfies ButtonSelector,

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
    css: ['[data-rhf-name="shipping"] [role="checkbox"]', 'input[name*="shipping" i]', 'input[name*="livraison" i]', '[data-qa-id*="shipping" i]'],
  } satisfies ButtonSelector,

  /** Category-specific attribute field, by form field name/id/data-attr. */
  attrByKey: (key: string): string[] => [
    `[name="${key}"]`,
    `[data-rhf-name="${key}"] input`,
    `[data-qa-id="${key}"]`,
    `[data-attribute="${key}"]`,
    `select[name="${key}"]`,
    `[id="${key}"]`,
  ],

  /** The wizard's "go to the next step" control. */
  nextButton: {
    textCandidates: ["Continuer", "Suivant", "Étape suivante", "Valider et continuer"],
    css: ['form button[type="submit"]'],
  } satisfies ButtonSelector,

  /**
   * The explicit final publish control, when the site labels it as such. Live
   * (2026-10) the final step's button is just « Continuer » — the FINAL STEP is
   * recognised by finalStepMarkers, never by this label alone. No generic
   * `button[type=submit]` fallback: every step's « Continuer » is one.
   */
  publishButton: {
    textCandidates: ["Déposer mon annonce", "Déposer l'annonce", "Publier mon annonce", "Publier l'annonce", "Publier"],
    css: ['button[data-qa-id="adsubmit"]'],
  } satisfies ButtonSelector,

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
  confirmedUrlPattern: [/\/deposer-une-annonce\/(confirmation|merci|success)/i, /\/ad\//],
};

/**
 * A logical annonce field and every way to recognise it on the live form.
 * `names` match the control's name / id / data-qa-id / react-hook-form container
 * name EXACTLY; `labels` match whole words of its visible label, accessible name
 * or placeholder (accent/case-insensitive); `css` is the legacy fast path.
 */
export interface LogicalField {
  names: string[];
  labels: string[];
  css: string[];
  /** Field types this logical field can be written into. */
  types: string[];
  required: boolean;
}

export type LogicalFieldName = "title" | "description" | "price" | "location" | "category" | "condition" | "shipping" | "photos";

const TEXTISH = ["text", "textarea", "combobox", "other"];

export const LOGICAL_FIELDS: Record<LogicalFieldName, LogicalField> = {
  title: { names: ["subject", "title"], labels: ["titre"], css: DEPOSIT.titleInput, types: TEXTISH, required: true },
  description: { names: ["body", "description"], labels: ["description"], css: DEPOSIT.descTextarea, types: TEXTISH, required: true },
  price: { names: ["price_cents", "price"], labels: ["prix"], css: DEPOSIT.priceInput, types: TEXTISH, required: true },
  location: {
    names: ["location", "zipcode", "city", "address"],
    labels: ["adresse", "code postal", "ville", "localisation", "location"],
    css: DEPOSIT.zipcodeInput,
    types: TEXTISH,
    required: true,
  },
  category: { names: ["category", "category_id"], labels: ["categorie"], css: DEPOSIT.categoryInput, types: [...TEXTISH, "select"], required: true },
  condition: { names: ["condition", "item_condition"], labels: ["etat"], css: [], types: [...TEXTISH, "select", "radiogroup"], required: false },
  shipping: {
    names: ["shipping", "shippable", "delivery"],
    labels: ["livraison", "envoi"],
    css: [],
    types: ["checkbox", "switch", "radiogroup"],
    required: false,
  },
  photos: { names: ["images", "photos", "pictures"], labels: ["photo", "photos"], css: DEPOSIT.photoFileInput, types: ["file"], required: true },
};

/**
 * Login / session signals. The probe is PASSIVE only (DOM + visible text + URL) —
 * run as in-page JS, indistinguishable from the site's own code. We never fire a
 * synthetic authenticated XHR. `accountUrl` is an authenticated route that bounces
 * to the login page when logged out, so a URL match against `loginUrlPattern`
 * (shared from DEPOSIT) is authoritative for "logged out".
 */
export const AUTH = {
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
    'a[href*="/logout"]',
  ],
  /** DOM markers that only render for a logged-out user (the header's « Se connecter » button). */
  loggedOutSelectors: ['button[aria-label="Se connecter" i]', 'a[aria-label="Se connecter" i]', 'a[href*="auth.leboncoin.fr/login"]'],
  /** Visible text that implies a logged-in session. */
  loggedInTextMarkers: ["se déconnecter", "déconnexion"],
  /** Visible text that implies a logged-out / sign-in page. */
  loginRequiredTextMarkers: ["identifiez-vous", "connecte-toi", "sign in to leboncoin", "sign in with google", "sécurisons votre compte"],
};

/**
 * Named element-clip targets (consumed by screenshot.captureElement). Keeping the
 * candidate lists here means no literal selector leaks into the verify/publish flow.
 */
export const ELEMENT_TARGETS = {
  photos: DEPOSIT.photoGrid,
  price: DEPOSIT.priceInput,
  submit: [...DEPOSIT.publishButton.css, ...DEPOSIT.nextButton.css],
};

export const MANAGE = {
  /** « Mes annonces » (moved from /mes-annonces, which now lands on /favorites). */
  listingUrl: `${BASE_URL}/compte/part/mes-annonces`,
  adUrl: (id: string): string => `${BASE_URL}/ad/${id}`,

  deleteButton: {
    textCandidates: ["Supprimer l'annonce", "Supprimer mon annonce", "Supprimer"],
    css: ['button[data-qa-id*="delete"]', 'button[aria-label*="supprimer" i]', 'a[href*="delete"]'],
  } satisfies ButtonSelector,

  confirmButton: {
    textCandidates: ["Confirmer la suppression", "Oui, supprimer", "Supprimer l'annonce", "Supprimer", "Confirmer", "Oui"],
    css: ['[role="dialog"] button[data-qa-id*="confirm"]', 'button[data-qa-id*="confirm"]'],
  } satisfies ButtonSelector,

  /** Open the modify form for a published ad. */
  editButton: {
    textCandidates: ["Modifier l'annonce", "Modifier mon annonce", "Modifier", "Éditer"],
    css: ['button[data-qa-id*="edit"]', 'a[href*="modifier"]', 'a[href*="edit"]', 'button[aria-label*="modifier" i]'],
  } satisfies ButtonSelector,

  /** Save / update an edited ad (the edit form's submit). */
  saveButton: {
    textCandidates: ["Enregistrer les modifications", "Valider les modifications", "Mettre à jour", "Enregistrer"],
    css: ['button[data-qa-id*="save"]', 'button[data-qa-id*="submit"]'],
  } satisfies ButtonSelector,

  /** Renew / bump ("remettre en avant" / boost). No status change. */
  renewButton: {
    textCandidates: ["Remettre en avant", "Remonter l'annonce", "Remonter", "Renouveler", "Booster"],
    css: ['button[data-qa-id*="renew"]', 'button[data-qa-id*="boost"]', 'a[href*="remonter"]'],
  } satisfies ButtonSelector,

  /** Mark the ad as sold ("c'est vendu" / "vendu"). */
  markSoldButton: {
    textCandidates: ["Marquer comme vendu", "C'est vendu", "Marquer vendu", "Vendu"],
    css: ['button[data-qa-id*="sold"]', 'button[data-qa-id*="vendu"]', 'button[aria-label*="vendu" i]'],
  } satisfies ButtonSelector,

  /** Deactivate / pause without deleting (live 2026-10: « Pause » in mes annonces). */
  deactivateButton: {
    textCandidates: ["Mettre en pause", "Pause", "Désactiver l'annonce", "Désactiver", "Suspendre"],
    css: ['button[data-qa-id*="deactivate"]', 'button[data-qa-id*="pause"]', 'button[aria-label*="pause" i]', 'button[aria-label*="désactiver" i]'],
  } satisfies ButtonSelector,

  /** Reactivate a paused ad. */
  reactivateButton: {
    textCandidates: ["Réactiver l'annonce", "Réactiver", "Remettre en ligne", "Activer"],
    css: ['button[data-qa-id*="reactivate"]', 'button[aria-label*="réactiver" i]'],
  } satisfies ButtonSelector,

  /** Generic confirmation for renew/sold/deactivate/reactivate flows. */
  manageConfirmButton: {
    textCandidates: ["Confirmer", "Oui", "Valider", "Continuer", "OK"],
    css: ['[role="dialog"] button[data-qa-id*="confirm"]', 'button[data-qa-id*="confirm"]'],
  } satisfies ButtonSelector,

  /** « … / Plus d'actions » menus that hide per-ad controls. */
  overflowMenu: {
    textCandidates: ["Plus d'actions", "Plus d'options", "Actions", "Options", "Gérer", "Gérer l'annonce", "…", "..."],
    css: ['[aria-haspopup="menu"]', '[aria-haspopup="true"]', 'button[aria-label*="plus" i]'],
  } satisfies ButtonSelector,

  /*
   * Outcome PROOF. A local status only changes when the site shows one of these
   * (whole-phrase, accent-insensitive) — or, for pause/reactivate, when the
   * opposite control appears. They are full sentences on purpose: a bare
   * « vendu » or « en pause » would also match the buttons themselves.
   */
  /** Page-text markers that confirm a delete succeeded. */
  deletedMarkers: [
    "annonce supprimée",
    "annonce a été supprimée",
    "annonce a bien été supprimée",
    "n'existe plus",
    "n'est plus en ligne",
    "n'est plus disponible",
  ],
  /** Text on the ad page once it is gone (404 / removed). */
  goneMarkers: ["n'existe plus", "n'est plus disponible", "n'est plus en ligne", "page introuvable", "cette annonce a été supprimée", "erreur 404"],
  soldMarkers: ["annonce vendue", "marquée comme vendue", "a été marquée comme vendue", "est vendue"],
  pausedMarkers: ["annonce mise en pause", "a été mise en pause", "est en pause", "annonce désactivée", "a été désactivée", "annonce suspendue"],
  reactivatedMarkers: ["annonce réactivée", "a été réactivée", "est de nouveau en ligne", "a été remise en ligne"],
};
