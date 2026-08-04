#!/usr/bin/env node
// Generates per-package tsconfig.build.json + tsconfig.typecheck.json so every
// buildable workspace package's BUILD and TYPECHECK resolve its @voyant-travel/*
// deps to prebuilt dist/*.d.ts instead of re-inferring dependency SOURCE. As the
// @hono/zod-openapi route surfaces grew (voyant#2114), source re-inference pushed
// dependent packages past the 8 GB CI heap; reading declarations bounds it.
//
//   - A shared paths map (packages/typescript-config/dep-paths.json) is extended
//     by most packages (paths resolve relative to that file per TS 5.0).
//   - SELF-IMPORTING packages (those that import their own @voyant-travel/<name>/…)
//     get an INLINE map with their own specifiers excluded — else tsc reports
//     TS5055 "would overwrite input file" (the self path points at build output).
//   - turbo `typecheck` dependsOn `^build` (set in turbo.json) so the declarations
//     exist before any typecheck runs.
//
// dev/editor/vite/vitest are untouched — they use each package's tsconfig.json +
// `exports` (source). Re-run after changing any package's `exports`:
//   node scripts/gen-package-dist-configs.mjs

import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { packageSelfImports } from "./lib/package-self-imports.mjs"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const CONFIG_DIR = join(ROOT, "packages/typescript-config")
// Own composition configs (operator) / custom paths (db, ui) / no dist.
const SKIP = new Set(["db", "ui", "framework", "typescript-config"])
// Packages that must self-exclude even though they don't `from`-import their own
// name: they sit in a dependency CYCLE (a dep's emitted .d.ts references back
// into them), so the shared map would point that back-reference at their own
// dist output → TS5055 "would overwrite input file". Detected empirically.
const FORCE_SELF_EXCLUDE = new Set(["finance-react", "inventory-react"])
const SHARED_REL = "../typescript-config/dep-paths.json"

function sourceTarget(value) {
  if (typeof value === "string") return value
  if (value && typeof value === "object") {
    for (const cond of ["types", "development", "import", "default", "node"]) {
      const v = value[cond]
      if (typeof v === "string" && v.startsWith("./src/")) return v
    }
  }
  return undefined
}

// Collect every buildable package's dist declaration entries.
const entries = []
const pkgDirs = []
for (const base of ["packages"]) {
  const baseAbs = join(ROOT, base)
  if (!existsSync(baseAbs)) continue
  for (const entry of readdirSync(baseAbs, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const pkgPath = join(baseAbs, entry.name, "package.json")
    if (!existsSync(pkgPath)) continue
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
    if (!pkg.name || !pkg.scripts?.build) continue
    pkgDirs.push({ name: pkg.name, dir: join(baseAbs, entry.name), simple: entry.name, base })
    for (const [key, value] of Object.entries(pkg.exports ?? {})) {
      const target = sourceTarget(value)
      if (!target) continue
      if (!target.startsWith("./src/") || !/\.tsx?$/.test(target)) continue
      if ((key.match(/\*/g) ?? []).length > 1 || (target.match(/\*/g) ?? []).length > 1) continue
      const specifier = key === "." ? pkg.name : `${pkg.name}${key.slice(1)}`
      const distAbs = join(
        join(baseAbs, entry.name),
        target.replace(/^\.\/src\//, "dist/").replace(/\.tsx?$/, ".d.ts"),
      )
      entries.push({ specifier, distAbs, owner: pkg.name })
    }
  }
}

// Shared map (relative to packages/typescript-config/).
const sharedPaths = {}
for (const e of entries) {
  const rel = relative(CONFIG_DIR, e.distAbs).split(sep).join("/")
  sharedPaths[e.specifier] = [rel.startsWith(".") ? rel : `./${rel}`]
}
const sortedShared = Object.fromEntries(
  Object.keys(sharedPaths)
    .sort()
    .map((k) => [k, sharedPaths[k]]),
)
writeFileSync(
  join(CONFIG_DIR, "dep-paths.json"),
  `${JSON.stringify({ compilerOptions: { paths: sortedShared } }, null, 2)}\n`,
)

const touched = []
const formatFiles = []
for (const pkg of pkgDirs) {
  if (pkg.base !== "packages" || SKIP.has(pkg.simple)) continue
  const dir = pkg.dir
  let buildConfig
  let typecheckConfig
  if (FORCE_SELF_EXCLUDE.has(pkg.simple) || packageSelfImports(dir, pkg.name)) {
    // Inline map with own specifiers excluded.
    const paths = {}
    for (const e of entries) {
      if (e.owner === pkg.name) continue
      const rel = relative(dir, e.distAbs).split(sep).join("/")
      paths[e.specifier] = [rel.startsWith(".") ? rel : `./${rel}`]
    }
    const sorted = Object.fromEntries(
      Object.keys(paths)
        .sort()
        .map((k) => [k, paths[k]]),
    )
    const existing = existsSync(join(dir, "tsconfig.build.json"))
      ? JSON.parse(readFileSync(join(dir, "tsconfig.build.json"), "utf8"))
      : { extends: "./tsconfig.json" }
    existing.extends = Array.isArray(existing.extends)
      ? existing.extends.filter((x) => !x.includes("dep-paths"))
      : existing.extends
    if (Array.isArray(existing.extends) && existing.extends.length === 1) {
      existing.extends = existing.extends[0]
    }
    existing.compilerOptions = { ...(existing.compilerOptions ?? {}), paths: sorted }
    buildConfig = existing
    typecheckConfig = {
      extends: "./tsconfig.json",
      compilerOptions: { noEmit: true, paths: sorted },
    }
  } else {
    const existing = existsSync(join(dir, "tsconfig.build.json"))
      ? JSON.parse(readFileSync(join(dir, "tsconfig.build.json"), "utf8"))
      : { extends: "./tsconfig.json" }
    const ext = Array.isArray(existing.extends)
      ? [...existing.extends]
      : [existing.extends].filter(Boolean)
    if (!ext.includes(SHARED_REL)) ext.push(SHARED_REL)
    existing.extends = ext.length === 1 ? ext[0] : ext
    // Clear any stale inline dep-paths (e.g. a package previously classified as
    // self-excluding) — a shared-config package must not also carry an inline map.
    if (existing.compilerOptions?.paths) delete existing.compilerOptions.paths
    buildConfig = existing
    typecheckConfig = {
      extends: ["./tsconfig.json", SHARED_REL],
      compilerOptions: { noEmit: true },
    }
  }
  writeFileSync(join(dir, "tsconfig.build.json"), `${JSON.stringify(buildConfig, null, 2)}\n`)
  writeFileSync(
    join(dir, "tsconfig.typecheck.json"),
    `${JSON.stringify(typecheckConfig, null, 2)}\n`,
  )
  formatFiles.push(
    `packages/${pkg.simple}/tsconfig.build.json`,
    `packages/${pkg.simple}/tsconfig.typecheck.json`,
  )
  touched.push(pkg.simple)
}

execFileSync(
  "pnpm",
  ["biome", "format", "--write", "packages/typescript-config/dep-paths.json", ...formatFiles],
  {
    cwd: ROOT,
    stdio: "ignore",
  },
)
console.log(
  `shared map: ${Object.keys(sortedShared).length} paths; configured ${touched.length} packages`,
)
