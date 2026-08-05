#!/usr/bin/env node
/** Runner: finds cross-package `.references()` and checks each against requiresSchemas. */
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  type CrossPackageReference,
  checkCrossPackageForeignKeys,
  FOUNDATION_PACKAGES,
} from "./cross-package-fk.ts"
import { collectSourceFiles, stripComments } from "./source-scan.ts"

const SCOPE = "@voyant-travel/"

/** Maps value-imported identifiers to the workspace package they come from. */
export function collectValueImports(text: string): Map<string, string> {
  const imports = new Map<string, string>()
  const pattern = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g
  for (const match of text.matchAll(pattern)) {
    if (match[1]) continue // `import type` is erased; it creates no constraint
    const source = match[3]
    if (!source.startsWith(SCOPE)) continue
    const target = source.slice(SCOPE.length).split("/")[0]
    for (const raw of match[2].split(",")) {
      const specifier = raw.trim()
      if (specifier === "" || specifier.startsWith("type ")) continue
      const local = specifier.includes(" as ")
        ? (specifier.split(" as ")[1]?.trim() ?? "")
        : specifier
      if (local !== "") imports.set(local, target)
    }
  }
  return imports
}

/** Finds `.references(() => symbol.column)` calls that resolve to another package. */
export function findCrossPackageReferences(file: string, rawText: string): CrossPackageReference[] {
  const text = stripComments(rawText)
  const owner = file.split(path.sep).join("/").split("/")[1]
  if (owner === undefined) return []

  const imports = collectValueImports(text)
  const found: CrossPackageReference[] = []
  for (const match of text.matchAll(/\.references\(\s*\(\)\s*=>\s*([A-Za-z_$][\w$]*)\s*\./g)) {
    const symbol = match[1] as string
    const target = imports.get(symbol)
    if (target === undefined || target === owner) continue
    found.push({
      pkg: owner,
      target,
      file: file.split(path.sep).join("/"),
      line: text.slice(0, match.index).split("\n").length,
      symbol,
    })
  }
  return found
}

/** Reads `voyant.requiresSchemas`, reduced to bare package directory names. */
function readRequiresSchemas(packages: Iterable<string>): Map<string, Set<string>> {
  const byPackage = new Map<string, Set<string>>()
  for (const pkg of packages) {
    const manifestPath = path.join("packages", pkg, "package.json")
    if (!existsSync(manifestPath)) continue
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
    const declared: unknown = manifest?.voyant?.requiresSchemas
    const names = Array.isArray(declared)
      ? declared
          .filter((entry): entry is string => typeof entry === "string")
          .filter((entry) => entry.startsWith(SCOPE))
          .map((entry) => entry.slice(SCOPE.length))
      : []
    byPackage.set(pkg, new Set(names))
  }
  return byPackage
}

function main(): void {
  const references = collectSourceFiles("packages").flatMap((file) =>
    findCrossPackageReferences(file, readFileSync(file, "utf8")),
  )

  const owners = new Set(references.map((reference) => reference.pkg))
  const { violations, allowed } = checkCrossPackageForeignKeys(
    references,
    readRequiresSchemas(owners),
  )

  if (violations.length > 0) {
    console.error("Cross-package foreign key check failed.\n")
    for (const violation of violations) console.error(`  - ${violation}`)
    console.error("\nSee docs/architecture/schema-discipline.md — The FK rule.")
    process.exit(1)
  }

  const pairs = new Set(allowed.map((reference) => `${reference.pkg}->${reference.target}`))
  console.log(
    `verify:cross-package-fk: ${allowed.length} cross-package foreign keys across ` +
      `${pairs.size} package pairs, every one backed by a declared requiresSchemas edge ` +
      `(foundation packages exempt: ${[...FOUNDATION_PACKAGES].sort().join(", ")}).`,
  )
}

// Only scan when invoked as the entry point. The test imports the helpers
// above, and an unguarded main() would run a full workspace scan on import —
// and process.exit(1) out of the test run the moment a real violation existed.
if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main()
}
