#!/usr/bin/env node
/**
 * Supply-chain check — no tracked lockfile may resolve a known-compromised
 * release. Rules live in compromised-packages.json.
 *
 * Why a checker rather than a pnpm setting: pnpm's `minimumReleaseAge` cooldown
 * is the general defence against this class of attack, but it is silently
 * ignored by pnpm 10.x — it only takes effect from pnpm 11. Until the repo moves
 * its pinned `packageManager`, declaring it would look like protection while
 * doing nothing. This check works on any pnpm version because it reads the
 * committed lockfile rather than asking the resolver to behave.
 *
 * Scope is deliberately "tracked lockfiles" via `git ls-files`, so untracked
 * scratch worktrees are not scanned and a lockfile added anywhere in the repo
 * is picked up without being registered here.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = process.cwd()
const dataPath = path.join(here, "compromised-packages.json")

const { advisories } = JSON.parse(readFileSync(dataPath, "utf8"))

if (!Array.isArray(advisories) || advisories.length === 0) {
  console.error("verify:supply-chain: compromised-packages.json declares no advisories")
  process.exit(1)
}

/** Flatten the ledger into lookups: exact `name` and scope prefixes (`@scope/`). */
const exact = new Map()
const scopes = new Map()

for (const advisory of advisories) {
  if (!advisory?.id || !advisory?.packages) {
    console.error(`verify:supply-chain: malformed advisory: ${JSON.stringify(advisory)}`)
    process.exit(1)
  }
  for (const [name, versions] of Object.entries(advisory.packages)) {
    if (!Array.isArray(versions) || versions.length === 0) {
      console.error(`verify:supply-chain: ${advisory.id} declares no versions for ${name}`)
      process.exit(1)
    }
    const target = name.endsWith("/*") ? scopes : exact
    const key = name.endsWith("/*") ? `${name.slice(0, -1)}` : name
    for (const version of versions) target.set(`${key} ${version}`, { advisory, name })
  }
}

function lookup(name, version) {
  const direct = exact.get(`${name} ${version}`)
  if (direct) return direct
  const slash = name.lastIndexOf("/")
  if (name.startsWith("@") && slash > 0) {
    return scopes.get(`${name.slice(0, slash + 1)} ${version}`)
  }
  return undefined
}

/**
 * pnpm lockfile keys look like `'@scope/name@1.2.3':`, and under `snapshots:`
 * carry a peer suffix — `name@1.2.3(react@19.0.0)`. Split on the last `@` that
 * is not the scope's leading one, after dropping the suffix.
 */
function parseKey(raw) {
  const key = raw
    .trim()
    .replace(/:$/, "")
    .replace(/^['"]|['"]$/g, "")
  const withoutPeers = key.split("(")[0]
  const at = withoutPeers.lastIndexOf("@")
  if (at <= 0) return undefined
  const name = withoutPeers.slice(0, at)
  const version = withoutPeers.slice(at + 1)
  if (!name || !version || !/^\d/.test(version)) return undefined
  return { name, version }
}

const lockfiles = execFileSync("git", ["ls-files", "*pnpm-lock.yaml", "*package-lock.json"], {
  cwd: repoRoot,
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean)

const findings = []

for (const relative of lockfiles) {
  const contents = readFileSync(path.join(repoRoot, relative), "utf8")

  if (relative.endsWith("package-lock.json")) {
    const tree = JSON.parse(contents)
    for (const [pkgPath, meta] of Object.entries(tree.packages ?? {})) {
      const name = meta?.name ?? pkgPath.split("node_modules/").pop()
      if (!name || !meta?.version) continue
      const hit = lookup(name, meta.version)
      if (hit) findings.push({ relative, name, version: meta.version, advisory: hit.advisory })
    }
    continue
  }

  for (const line of contents.split("\n")) {
    // Lockfile entry keys are indented and end in a colon; skip nested fields.
    if (!/^\s{2,}\S.*:\s*$/.test(line)) continue
    const parsed = parseKey(line)
    if (!parsed) continue
    const hit = lookup(parsed.name, parsed.version)
    if (hit) {
      findings.push({
        relative,
        name: parsed.name,
        version: parsed.version,
        advisory: hit.advisory,
      })
    }
  }
}

if (findings.length > 0) {
  console.error("Supply-chain verification failed — a compromised release is resolved:\n")
  const seen = new Set()
  for (const finding of findings) {
    const key = `${finding.relative} ${finding.name}@${finding.version}`
    if (seen.has(key)) continue
    seen.add(key)
    console.error(`- ${finding.relative}: ${finding.name}@${finding.version}`)
    console.error(
      `  ${finding.advisory.id} (${finding.advisory.published}) ${finding.advisory.url}`,
    )
  }
  console.error(
    "\nDo not resolve this by regenerating the lockfile alone. Treat any machine that " +
      "installed it as credential-exposed and rotate before rebuilding.",
  )
  process.exit(1)
}

const pinned = exact.size + scopes.size
console.log(
  `verify:supply-chain: ${lockfiles.length} tracked lockfile(s) clean against ` +
    `${pinned} compromised release(s) across ${advisories.length} advisory(ies).`,
)
