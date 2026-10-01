/**
 * Minimal owner-side pages for the management flows (ad page with an overflow
 * menu, confirmation dialog, « mes annonces » card list). Built from the
 * patterns seen live — accessible names and roles, no class names.
 */
const header = `<header><a href="/account/private/home" aria-label="Mon compte">M</a></header>`;

export function adPage(opts: { controls?: string[]; menu?: string[]; menuOpen?: boolean; banner?: string } = {}): string {
  const controls = (opts.controls ?? []).map((c) => `<button type="button">${c}</button>`).join("");
  const menu = opts.menu?.length
    ? `<button type="button" aria-haspopup="menu" aria-label="Plus d'actions">…</button>
       <div role="menu" ${opts.menuOpen ? "" : "hidden"}>${opts.menu.map((m) => `<button type="button" role="menuitem">${m}</button>`).join("")}</div>`
    : "";
  const banner = opts.banner ? `<div role="status">${opts.banner}</div>` : "";
  return `<!doctype html><html><body>${header}<main><h1>MacBook Air M1 2020</h1>${banner}${controls}${menu}</main></body></html>`;
}

export function confirmDialog(title: string, confirm = "Confirmer"): string {
  return `<!doctype html><html><body>${header}<main><h1>MacBook Air M1 2020</h1></main>
    <div role="dialog" aria-modal="true"><h2>${title}</h2><button type="button">Annuler</button><button type="button">${confirm}</button></div></body></html>`;
}

export function messagePage(text: string, controls: string[] = []): string {
  return `<!doctype html><html><body>${header}<main><p>${text}</p>${controls.map((c) => `<button type="button">${c}</button>`).join("")}</main></body></html>`;
}

export function myAdsPage(adId: string, controls: string[]): string {
  return `<!doctype html><html><body>${header}<main><h1>Mes annonces</h1><ul>
    <li><a href="/ad/informatique/999">Autre annonce</a><button type="button">Supprimer</button></li>
    <li><a href="/ad/informatique/${adId}">MacBook Air M1 2020</a>${controls.map((c) => `<button type="button">${c}</button>`).join("")}</li>
  </ul></main></body></html>`;
}
