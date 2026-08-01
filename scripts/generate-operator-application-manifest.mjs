#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const INTENT_PATH = "apps/operator/package.intent.json"
const MANIFEST_PATH = "apps/operator/package.json"
const PRODUCT_MANIFEST_PATH = "packages/operator-standard/package.json"

export function buildOperatorApplicationManifest(root = repoRoot) {
  const intent = readJson(join(root, INTENT_PATH))
  const productManifest = readJson(join(root, PRODUCT_MANIFEST_PATH))
  validateIntent(intent)

  const generatedDependencies = Object.fromEntries(
    Object.entries(productManifest.dependencies ?? {})
      .filter(([name]) => name.startsWith("@voyant-travel/"))
      .map(([name, version]) => [name, applicationWorkspaceRange(version)]),
  )
  const overlaps = Object.keys(intent.dependencies ?? {})
    .filter((name) => generatedDependencies[name] !== undefined)
    .sort()
  if (overlaps.length > 0) {
    throw new Error(
      `Operator manifest intent repeats standard product dependencies: ${overlaps.join(", ")}`,
    )
  }
  const missingExplicitThirdPartyDependencies = Object.keys(productManifest.dependencies ?? {})
    .filter(
      (name) =>
        !name.startsWith("@voyant-travel/") &&
        intent.dependencies?.[name] === undefined &&
        intent.devDependencies?.[name] === undefined,
    )
    .sort()
  if (missingExplicitThirdPartyDependencies.length > 0) {
    throw new Error(
      `Operator manifest intent must explicitly preserve standard product third-party dependencies: ${missingExplicitThirdPartyDependencies.join(", ")}`,
    )
  }

  return {
    ...intent.manifest,
    dependencies: sortRecord({ ...intent.dependencies, ...generatedDependencies }),
    devDependencies: sortRecord(intent.devDependencies),
  }
}

export function operatorApplicationManifestContents(root = repoRoot) {
  return `${JSON.stringify(buildOperatorApplicationManifest(root), null, 2)}\n`
}

export function writeOperatorApplicationManifest(root = repoRoot, { check = false } = {}) {
  const path = join(root, MANIFEST_PATH)
  const expected = operatorApplicationManifestContents(root)
  const current = existsSync(path) ? readFileSync(path, "utf8") : ""
  if (current === expected) return false
  if (!check) writeFileSync(path, expected)
  return true
}

function validateIntent(intent) {
  const keys = Object.keys(intent).sort()
  if (keys.join("\n") !== ["dependencies", "devDependencies", "manifest"].join("\n")) {
    throw new Error(
      "Operator manifest intent must contain exactly manifest, dependencies, and devDependencies",
    )
  }
  if (intent.manifest?.name !== "operator" || intent.manifest?.private !== true) {
    throw new Error('Operator manifest intent must describe the private "operator" workspace')
  }
  for (const field of ["dependencies", "devDependencies"]) {
    if (!intent[field] || Array.isArray(intent[field]) || typeof intent[field] !== "object") {
      throw new Error(`Operator manifest intent ${field} must be an object`)
    }
  }
}

function applicationWorkspaceRange(version) {
  return typeof version === "string" && version.startsWith("workspace:") ? "workspace:^" : version
}

function sortRecord(record = {}) {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  )
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const emit = process.argv.includes("--emit")
  const check = process.argv.includes("--check")
  if (emit === check) {
    console.error("Usage: generate-operator-application-manifest.mjs (--emit | --check)")
    process.exit(2)
  }
  try {
    const stale = writeOperatorApplicationManifest(repoRoot, { check })
    if (check && stale) {
      console.error(
        "Operator application manifest is stale; run `node scripts/generate-operator-application-manifest.mjs --emit`.",
      )
      process.exit(1)
    }
    console.log(
      emit ? "generated apps/operator/package.json" : "operator application manifest is up to date",
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
