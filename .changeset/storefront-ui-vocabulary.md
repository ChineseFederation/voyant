---
"@voyant-travel/auth-react": patch
"@voyant-travel/media-react": patch
"@voyant-travel/distribution-react": patch
---

Retire the last user-visible "storefront" wording from the admin UI.

The storefront entity is gone and its pages were replaced — the nav is Public API with
a keys view and a sites seam — but seven strings still said "storefront" to an operator:
the allowed-origin field label and its validation message, the media translation hint,
and a publication-rule explanation.

The media hint had also drifted between languages: English said "used by your
storefronts" while Romanian already said "site-urile tale". English now follows Romanian
rather than introducing a third term, and the origin examples use `site.example.com` /
`site.exemplu.ro` in place of `shop.example.com` / `magazin.exemplu.ro`.
