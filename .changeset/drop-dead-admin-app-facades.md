---
"@voyant-travel/admin-app": minor
---

Remove four unused subpath exports from `@voyant-travel/admin-app`: `./root`,
`./router`, `./workspace`, and `./extension-routes`.

Each was a one-line module re-exporting the matching `@voyant-travel/admin/app/*`
subpath, and none had a consumer anywhere — in this repo, in the operator
starter, or in the sibling repositories. The only references were generated
tsconfig `paths` entries, which regenerate.

The subpaths that carry real code are unchanged: `.`, `./core-extension`, and
`./runtime`. Anything that did want the removed surfaces should import
`@voyant-travel/admin/app/*` directly, which is what these forwarded to.
