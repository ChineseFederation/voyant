---
"@voyant-travel/ui": minor
"@voyant-travel/inventory-react": patch
---

Add an `Image` component that renders a neutral placeholder icon when a source
is missing or fails to load, instead of the browser's broken-image glyph and
leaked file name. Layout classes are applied to the placeholder as well, so a
missing asset no longer collapses or shifts the surrounding grid.

Product media surfaces in the admin — the media gallery, tiles, lightbox, day
media tray, day rows, quick view, editorial overlay previews, and the SEO
sharing social preview — now render through it.
