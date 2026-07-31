#!/usr/bin/env node
/** Runner for the package-description gate. See descriptions.ts. */
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { checkDescriptions, type PackageManifest } from "./descriptions.ts"

const here = dirname(fileURLToPath(import.meta.url))
const allowlistPath = join(here, "missing-descriptions.json")

function main(): void {
  const manifests: PackageManifest[] = readdirSync("packages", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join("packages", entry.name, "package.json"))
    .flatMap((file) => {
      try {
        return [JSON.parse(readFileSync(file, "utf8")) as PackageManifest]
      } catch {
        return []
      }
    })

  const { packages: allowlist } = JSON.parse(readFileSync(allowlistPath, "utf8")) as {
    packages: string[]
  }

  if (process.argv.includes("--update-allowlist")) {
    const remaining = manifests
      .filter((manifest) => !manifest.private && !(manifest.description ?? "").trim())
      .map((manifest) => manifest.name)
      .sort()
    writeFileSync(
      allowlistPath,
      `${JSON.stringify({ $comment: ALLOWLIST_COMMENT, packages: remaining }, null, 2)}\n`,
    )
    console.log(`descriptions: allowlist rewritten with ${remaining.length} packages`)
    return
  }

  const { violations, fixed, checked } = checkDescriptions(manifests, allowlist)

  if (violations.length > 0) {
    console.error("Package description check failed.\n")
    for (const violation of violations) console.error(`  - ${violation}`)
    console.error(
      "\nAdd a one-line `description` to the package. Do not add it to the allowlist — " +
        "that list only shrinks.",
    )
    process.exit(1)
  }

  if (fixed.length > 0) {
    console.log(`descriptions: ${fixed.length} allowlisted package(s) now described — remove them:`)
    for (const name of fixed) console.log(`  - ${name}`)
  }
  console.log(
    `verify:package-descriptions: ${checked} published packages, ${allowlist.length} still awaiting a description.`,
  )
}

const ALLOWLIST_COMMENT = [
  "Published packages with no description yet. This list may only SHRINK.",
  "New packages must ship a description; do not add entries here.",
  "The backfill rides a release wave because description lives in package.json",
  "and needs a changeset per package — see issue #3902 item 5.",
]

main()
