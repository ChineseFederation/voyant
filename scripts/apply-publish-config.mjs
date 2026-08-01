#!/usr/bin/env node
// Apply each deployed workspace package's `publishConfig` to its own manifest.
//
// `pnpm deploy --prod --legacy` copies workspace manifests VERBATIM. It does
// not apply `publishConfig`, because that is a `pack`/`publish`-time transform.
// Our workspace manifests point `exports` at `./src/*.ts` so the monorepo can
// typecheck and hot-reload from source, while `files: ["dist"]` means `src/` is
// never shipped. The result is a deployed tree whose manifests reference files
// that were deliberately excluded — the server fails to resolve
// `@voyant-travel/*` at runtime (voyant#3994).
//
// npm consumers never see this, because `publishConfig.exports` already points
// at `dist` and is verified by the packaged-acceptance CI job. This script
// performs the same substitution for a deployed tree, so the image gets exactly
// what an npm consumer would.
//
//   node scripts/apply-publish-config.mjs <deploy-dir>
//
// Idempotent: a manifest with no `publishConfig` is left untouched.

import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join, relative, sep } from "node:path"

const TRANSFERRED = ["exports", "main", "types", "bin", "module"]

const rootArgument = process.argv[2]
if (!rootArgument) {
  console.error("usage: node scripts/apply-publish-config.mjs <deploy-dir>")
  process.exit(1)
}
const root = realpathSync(rootArgument)

/**
 * Refuse to rewrite anything outside the deploy tree.
 *
 * This is not paranoia. `pnpm deploy` links workspace dependencies with `file:`
 * specifiers, so entries under the deploy tree's `node_modules/.pnpm/` can
 * resolve straight back to the real `packages/<name>` directories in the
 * monorepo. Following those symlinks without a containment check rewrites the
 * SOURCE manifests — replacing their `./src/*.ts` exports with `dist` paths and
 * deleting `publishConfig` — which breaks the workspace for everyone.
 *
 * That is not hypothetical: an earlier revision of this script did exactly
 * that to three packages before the pre-push test run caught it.
 */
const containedInRoot = (path) => {
  const rel = relative(root, path)
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(`${sep}..`))
}

/** Every directory that could hold a workspace package manifest. */
function* manifestDirs(dir, depth = 0) {
  if (depth > 6) return
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    let real
    try {
      real = entry.isSymbolicLink() ? realpathSync(path) : path
      if (!statSync(real).isDirectory()) continue
    } catch {
      continue
    }
    // A symlink may point at the real workspace package. Never leave the tree.
    if (!containedInRoot(real)) continue
    yield real
    yield* manifestDirs(real, depth + 1)
  }
}

const seen = new Set()
let applied = 0
let skipped = 0

function manifestTargets(value) {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(manifestTargets)
  if (value && typeof value === "object") return Object.values(value).flatMap(manifestTargets)
  return []
}

function assertStaticTargetsExist(dir, manifest) {
  const targets = [
    ...manifestTargets(manifest.exports),
    ...manifestTargets(manifest.main),
    ...manifestTargets(manifest.module),
    ...manifestTargets(manifest.types),
    ...manifestTargets(manifest.bin),
  ]
  for (const target of new Set(targets)) {
    if (!target.startsWith("./") || target.includes("*")) continue
    if (!existsSync(join(dir, target))) {
      throw new Error(`${manifest.name} publishes missing runtime target ${target}`)
    }
  }
}

for (const dir of manifestDirs(join(root, "node_modules"))) {
  const manifestPath = join(dir, "package.json")
  if (seen.has(manifestPath)) continue
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  } catch {
    continue
  }
  seen.add(manifestPath)
  if (typeof manifest.name !== "string" || !manifest.name.startsWith("@voyant-travel/")) continue

  const publishConfig = manifest.publishConfig
  if (!publishConfig) {
    skipped += 1
    continue
  }
  for (const field of TRANSFERRED) {
    if (publishConfig[field] !== undefined) manifest[field] = publishConfig[field]
  }
  delete manifest.publishConfig
  assertStaticTargetsExist(dir, manifest)
  // Replace atomically to break the hardlink without first leaving the deploy
  // tree with a missing manifest.
  //
  // pnpm hardlinks package files rather than copying them, so the deployed
  // manifest and the workspace's own `packages/<name>/package.json` are the
  // SAME INODE (verified: matching st_ino, st_nlink of 2). `writeFileSync`
  // truncates that shared inode, so an in-place edit silently rewrites the
  // source manifest — replacing its `./src/*.ts` exports with `dist` paths and
  // deleting `publishConfig`, which breaks the workspace for everyone.
  //
  // No path check can catch this: the file genuinely is inside the deploy
  // tree. Renaming a new file over it forces a fresh inode, leaving the source
  // alone.
  const temporaryManifestPath = `${manifestPath}.${process.pid}.tmp`
  writeFileSync(temporaryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" })
  renameSync(temporaryManifestPath, manifestPath)
  applied += 1
}

console.log(
  `apply-publish-config: rewrote ${applied} workspace manifest(s), ${skipped} had no publishConfig`,
)
if (applied === 0) {
  console.error("apply-publish-config: no workspace manifests were rewritten — check the path")
  process.exit(1)
}
