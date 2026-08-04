#!/usr/bin/env node
/**
 * Runner for the published-surface installability gate. See lib/published-surface.mjs
 * for why "exists on the registry" is not the property worth asserting.
 *
 * This runs *after* publish, because it asks a question only the registry can
 * answer: can an outside consumer install what we just shipped and import it?
 * It installs every non-private workspace package at the version the checked-out
 * commit declares into a scratch directory and exercises each declared entry
 * point.
 *
 * Usage: node scripts/verify-published-surface.mjs [--keep] [--attempts <n>]
 *        node scripts/verify-published-surface.mjs [--tree <commit-ish>]
 */
import { execFile, execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { parse as parseYaml } from "yaml"

import {
  formatImportFailure,
  formatMissingVersion,
  importProbeSpecifiers,
  parseAttempts,
  parseTree,
  REGISTRY,
  registryHasVersion,
  selectPublishedPackages,
  unappliedPublishConfigViolations,
  unresolvedProtocolViolations,
  workspaceManifestPaths,
} from "./lib/published-surface.mjs"

const execFileAsync = promisify(execFile)

const KEEP = process.argv.includes("--keep")
const ATTEMPTS = parseAttempts(process.argv)
const TREE = parseTree(process.argv)
/** The registry is read-your-writes only eventually; a fresh publish can 404 briefly. */
const RETRY_DELAY_MS = 10_000

const git = (args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })

const readFromTree = (file) => git(["show", `${TREE}:${file}`])

/**
 * The manifests as `TREE` committed them, not as they sit on disk. See
 * `workspaceManifestPaths` for why the working directory is the wrong source:
 * the release job rewrites every releasable version before this gate runs.
 */
function workspaceManifests() {
  const patterns = parseYaml(readFromTree("pnpm-workspace.yaml")).packages ?? []
  const roots = patterns
    .filter((pattern) => pattern.endsWith("/*"))
    .map((pattern) => pattern.slice(0, -2))

  const treePaths = git(["ls-tree", "-r", "--name-only", TREE, "--", ...roots]).split("\n")
  return workspaceManifestPaths(patterns, treePaths).map((file) => JSON.parse(readFromTree(file)))
}

/**
 * Wait for every version to appear rather than failing the first one that has
 * not propagated. A missing version and a slow CDN look identical for a few
 * seconds after a release, and only one of them is a defect.
 */
async function awaitRegistry(packages) {
  let pending = packages
  let asked = false
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    asked = true
    const results = await Promise.all(
      pending.map(async (entry) => {
        try {
          return { entry, published: await registryHasVersion(entry.name, entry.version) }
        } catch (error) {
          return { entry, published: false, error }
        }
      }),
    )

    // A transient failure is worth another attempt, but it must never be
    // reported as an unpublished version. If it is still failing on the last
    // attempt, surface the registry's own error instead of a verdict.
    const failure = results.find((result) => result.error)
    if (failure && attempt === ATTEMPTS) throw failure.error

    pending = results.filter((result) => !result.published).map((result) => result.entry)
    if (pending.length === 0) return []
    if (attempt === ATTEMPTS) break
    console.log(
      `  ${pending.length} version(s) not resolvable yet; retrying in ${RETRY_DELAY_MS / 1000}s ` +
        `(attempt ${attempt}/${ATTEMPTS})`,
    )
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
  }

  // Returning `pending` untouched would name every package as unpublished
  // without a single request having been made. That is precisely the shape the
  // `NaN` attempt count produced, so the impossible case gets an assertion
  // rather than a silent verdict.
  if (!asked) throw new Error(`the registry was never queried (attempts=${ATTEMPTS})`)

  return pending
}

async function installSurface(packages, installDir) {
  const manifest = {
    name: "voyant-published-surface-verification",
    version: "0.0.0",
    private: true,
    dependencies: Object.fromEntries(packages.map(({ name, version }) => [name, version])),
  }
  fs.writeFileSync(path.join(installDir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`)

  // Install as a stranger would. The scratch project's own `.npmrc` names the
  // public registry, and the user and global configs are pointed at empty files
  // so the release job's credentials and any developer's `~/.npmrc` drop out.
  // That is what an external consumer has, and it is the only way to notice a
  // package published `restricted` by accident. npm refuses to load one file
  // under two config scopes, so these are three distinct paths.
  fs.writeFileSync(path.join(installDir, ".npmrc"), `registry=${REGISTRY}/\n`)
  const userConfig = path.join(installDir, "npmrc-user")
  const globalConfig = path.join(installDir, "npmrc-global")
  fs.writeFileSync(userConfig, "")
  fs.writeFileSync(globalConfig, "")

  // `--no-legacy-peer-deps` pins the modern resolver explicitly. A developer
  // whose ~/.npmrc sets `legacy-peer-deps=true` would otherwise skip peer
  // installation and see entry points fail here that resolve fine for a
  // consumer on npm's defaults — `@voyant-travel/ui/components/chart` needs the
  // `recharts` peer to load at all.
  await execFileAsync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-legacy-peer-deps",
      "--loglevel",
      "error",
    ],
    {
      cwd: installDir,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        NPM_CONFIG_USERCONFIG: userConfig,
        NPM_CONFIG_GLOBALCONFIG: globalConfig,
      },
    },
  )
}

/** Package-relative paths of everything the tarball shipped, for wildcard exports. */
function shippedFiles(packageDir) {
  const files = []
  const walk = (directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue
      const relative = `${prefix}${entry.name}`
      if (entry.isDirectory()) walk(path.join(directory, entry.name), `${relative}/`)
      else files.push(`./${relative}`)
    }
  }
  walk(packageDir, "")
  return files
}

async function probeImports(installDir, specifiers) {
  const probeFile = path.join(installDir, "probe.mjs")
  fs.writeFileSync(
    probeFile,
    `const specifiers = ${JSON.stringify(specifiers, null, 2)}\n` +
      `const failures = []\n` +
      `for (const specifier of specifiers) {\n` +
      `  try {\n` +
      `    await import(specifier)\n` +
      `  } catch (error) {\n` +
      `    failures.push({ specifier, code: error?.code ?? "", message: String(error?.message ?? error).split("\\n")[0] })\n` +
      `  }\n` +
      `}\n` +
      `process.stdout.write(JSON.stringify(failures))\n`,
  )

  const { stdout } = await execFileAsync(process.execPath, [probeFile], {
    cwd: installDir,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
  return JSON.parse(stdout)
}

/**
 * A specifier that does not resolve is the defect this gate exists for. A
 * specifier that resolves and then throws is a different claim — a package may
 * legitimately need a browser global — so it is reported without failing.
 */
const RESOLUTION_ERROR_CODES = new Set([
  "ERR_MODULE_NOT_FOUND",
  "ERR_PACKAGE_PATH_NOT_EXPORTED",
  "ERR_PACKAGE_IMPORT_NOT_DEFINED",
  "ERR_UNSUPPORTED_DIR_IMPORT",
  "ERR_INVALID_PACKAGE_TARGET",
  "ERR_INVALID_PACKAGE_CONFIG",
  "ERR_UNKNOWN_FILE_EXTENSION",
])

function report(violations, warnings) {
  for (const warning of warnings) console.warn(`  ! ${warning}`)

  if (violations.length > 0) {
    console.error("\nPublished surface check failed.\n")
    for (const violation of violations) console.error(`  - ${violation}`)
    console.error(
      "\nThese packages are published for external consumers. See issue #4086 for why this " +
        "gate installs from the registry instead of inspecting manifests.",
    )
    process.exit(1)
  }
}

async function main() {
  const packages = selectPublishedPackages(workspaceManifests())
  if (packages.length === 0) {
    console.log("verify:published-surface: no publishable workspace packages.")
    return
  }

  console.log(
    `verify:published-surface: ${packages.length} publishable packages at ` +
      `${TREE} (${git(["rev-parse", "--short", TREE]).trim()}).`,
  )

  const unpublished = await awaitRegistry(packages)
  if (unpublished.length > 0) {
    report(
      unpublished.map((entry) => formatMissingVersion(entry.name, entry.version)),
      [],
    )
  }

  const installDir = fs.mkdtempSync(path.join(os.tmpdir(), "voyant-published-surface-"))
  const violations = []
  const warnings = []

  try {
    try {
      await installSurface(packages, installDir)
    } catch (error) {
      const detail =
        error.stderr?.toString().trim() || error.stdout?.toString().trim() || error.message
      report([`npm could not install the published surface: ${detail}`], [])
    }

    const specifiers = []
    for (const { name } of packages) {
      const packageDir = path.join(installDir, "node_modules", ...name.split("/"))
      const installed = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"))

      violations.push(...unresolvedProtocolViolations(installed))
      violations.push(...unappliedPublishConfigViolations(installed))

      const probes = importProbeSpecifiers(installed, shippedFiles(packageDir))
      violations.push(...probes.unsupported)
      if (probes.specifiers.length === 0 && probes.unsupported.length === 0) {
        warnings.push(`${name}: no importable entry point declared; nothing to exercise.`)
      }
      specifiers.push(...probes.specifiers)
    }

    console.log(`  installed; exercising ${specifiers.length} entry points.`)

    for (const failure of await probeImports(installDir, specifiers)) {
      const message = formatImportFailure(failure.specifier, `${failure.code} ${failure.message}`)
      if (RESOLUTION_ERROR_CODES.has(failure.code)) violations.push(message)
      else warnings.push(`${message} (resolved, then threw — not treated as a publish defect)`)
    }
  } finally {
    if (KEEP) console.log(`  scratch install kept at ${installDir}`)
    else fs.rmSync(installDir, { recursive: true, force: true })
  }

  report(violations, warnings)
  console.log("verify:published-surface: every published entry point installs and resolves.")
}

await main()
