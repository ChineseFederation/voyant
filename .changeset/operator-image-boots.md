---
"@voyant-travel/vite-config": minor
"@voyant-travel/runtime": minor
"@voyant-travel/framework": minor
---

Build and install relocatable workspace packages for production instead of
inlining their source.

The operator Docker image built cleanly and had never booted (voyant#3994). The
root cause was that `ssr.noExternal: [/^@voyant-travel\//]` inlined workspace
packages from source into the server bundle. That absorbs their **code** but not
their **dependencies**, and `pnpm deploy --prod` prunes to what the application
itself declares — so every external dependency reached only through an inlined
package became undeclared and unresolvable. 36 were, including
`@pdf-lib/fontkit`, `@aws-sdk/client-s3`, `@neondatabase/serverless`, `exceljs`
and `liquidjs`. The image would have failed progressively, one feature at a
time; booting was simply the first path exercised.

`voyantStartViteConfig` gains `bundleWorkspaceSource` (default `true`). The
development server keeps inlining from source, because that is what makes a
`packages/*/src` edit a member of the Vite module graph and therefore
hot-reloadable. A build now passes `false`, so `@voyant-travel/*` stay external,
`pnpm deploy` installs them as real packages, and their own dependency trees
come with them. Both directions are pinned by tests — only one of them is
visible in a production failure.

This also makes the complete production artifact explicit:

- the workspace dists are built before the app build (~7 minutes, ~80MB, once
  per release), with `NODE_OPTIONS=--max-old-space-size=8192` because `tsc`
  needs more than the default 2GB for the larger packages
- `scripts/apply-publish-config.mjs` runs after `pnpm deploy`, because
  `pnpm deploy` copies workspace manifests verbatim and does **not** apply
  `publishConfig` — a pack/publish-time transform. Our manifests point
  `exports` at `./src/*.ts` while `files: ["dist"]` means `src/` is never
  shipped, so without it every deployed package references files that do not
  exist. The script performs the same substitution npm consumers already get.
- generated package references use relocatable bare specifiers when the package
  is a declared production dependency, while transitive selections stay
  project-relative to the location selected through the product BOM and prefer
  built `publishConfig` targets. This preserves strict pnpm nesting without
  capturing absolute build-machine paths; generated link definitions are
  compiled into the server alongside the graph runtime
- TanStack Start's core virtual-module hosts remain bundled so its Vite plugin
  can replace the `#tanstack-*` imports required by the production server
- the operator manifest declares the product BOM runtime closure as production
  dependencies, and the image includes an explicit graph-native migration
  command for use before rollout
