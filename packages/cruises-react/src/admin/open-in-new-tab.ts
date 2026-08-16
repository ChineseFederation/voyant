/**
 * Open a resolved destination href in a new tab (keeps the search/list page
 * in place). No-op during SSR and for unresolvable destinations (`"#"` is the
 * `useAdminHref` fallback — opening it would just clone the current page).
 */
export function openHrefInNewTab(href: string): void {
  if (typeof window === "undefined" || href === "#") return
  window.open(href, "_blank", "noopener,noreferrer")
}
