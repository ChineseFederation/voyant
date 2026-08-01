#!/usr/bin/env node
/**
 * Ratchets the count of "legacy execute+tools" actions: execute actions bound
 * to a callable tool that declare none of the safety-contract facets
 * (availability / effectBoundary / durability / existingTarget).
 *
 * This requires the current deployment graph. Regenerate it first with:
 *   pnpm --filter operator prepare:verify
 *
 * Enforcement:
 * - Any current legacy execute+tools action that is not already in the
 *   allowlist is a NEW grandfather and fails the check. New execute+tools
 *   actions must declare safety-contract metadata instead of being added
 *   here.
 * - Any allowlist entry that is no longer a legacy execute+tools action in
 *   the graph (migrated with safety metadata, or removed entirely) is stale
 *   and fails the check, so the allowlist is forced to shrink in the same PR
 *   that does the migration.
 */
import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  currentLegacyExecuteToolsActionIds,
  diffLegacyExecuteToolsRatchet,
  isSortedUniqueStringArray,
} from "./lib/legacy-execute-tools-ratchet.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function argValue(flag) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const graphPath = path.resolve(
  argValue("--graph") ??
    path.join(repoRoot, "apps/operator/.voyant/deployment-graph.generated.json"),
)
const allowlistPath = path.resolve(
  argValue("--allowlist") ??
    path.join(repoRoot, "scripts/fixtures/legacy-execute-tools-allowlist.json"),
)

const graph = await readJson(graphPath, {
  hint: "Generate it with: pnpm --filter operator prepare:verify",
})
const allowlist = await readJson(allowlistPath, {})

if (!isSortedUniqueStringArray(allowlist)) {
  console.error(
    `${path.relative(repoRoot, allowlistPath)} must be a sorted, de-duplicated JSON array of action ids.`,
  )
  process.exit(1)
}

const currentIds = currentLegacyExecuteToolsActionIds(graph)
const { newGrandfathers, staleAllowlistEntries } = diffLegacyExecuteToolsRatchet(
  currentIds,
  allowlist,
)

const failures = []
if (newGrandfathers.length > 0) {
  failures.push(
    [
      `${newGrandfathers.length} new legacy execute+tools action(s) are not in the allowlist:`,
      ...newGrandfathers.map((id) => `  - ${id}`),
      "",
      "New execute actions bound to a tool must declare safety-contract metadata",
      "(availability / effectBoundary / durability / existingTarget). Do not add",
      `new entries to ${path.relative(repoRoot, allowlistPath)}; the allowlist is frozen.`,
    ].join("\n"),
  )
}
if (staleAllowlistEntries.length > 0) {
  const plural = staleAllowlistEntries.length === 1 ? "entry is" : "entries are"
  failures.push(
    [
      `${staleAllowlistEntries.length} allowlist ${plural} stale (no longer a legacy execute+tools`,
      "action in the deployment graph -- migrated with safety metadata, or removed):",
      ...staleAllowlistEntries.map((id) => `  - ${id}`),
      "",
      `Remove the migrated id(s) from ${path.relative(repoRoot, allowlistPath)} in the same PR`,
      "that adds the safety-contract metadata (or removes the action).",
    ].join("\n"),
  )
}

if (failures.length > 0) {
  console.error("Legacy execute+tools safety-contract ratchet failed:\n")
  console.error(failures.join("\n\n"))
  process.exit(1)
}

console.log(
  `Legacy execute+tools safety-contract ratchet: OK (${currentIds.length} grandfathered action(s) frozen)`,
)

async function readJson(filePath, { hint }) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"))
  } catch (error) {
    const relative = path.relative(repoRoot, filePath)
    console.error(`Failed to read ${relative}: ${error.message}`)
    if (hint) console.error(hint)
    process.exit(1)
  }
}
