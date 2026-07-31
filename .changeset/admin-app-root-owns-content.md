---
"@voyant-travel/admin-app": minor
---

`@voyant-travel/admin-app` no longer re-exports `@voyant-travel/admin/app` from
its root.

The root export was half alias, half content: `export * from
"@voyant-travel/admin/app"` alongside its own core-extension surface. That gave
importers two specifiers for one API with nothing to indicate which was
canonical, and no code used the aliased half — the root specifier had no
importer anywhere in this repo, the operator starter, or the sibling
repositories.

The root now exports only what this package owns. Anything wanting the admin app
shell types imports `@voyant-travel/admin/app` directly, which is where they are
defined.
