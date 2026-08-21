import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const standardNodeStarter = JSON.parse(
  readFileSync(join(repoRoot, "packages/framework/src/standard-node-starter.json"), "utf8"),
)

test("operator release archive contains only the minimal authored project", () => {
  assert.equal(
    existsSync(join(repoRoot, "packages/cli")),
    false,
    "CLI implementation must remain in the separate voyant-travel/cli repository",
  )
  const fixture = packageAndExtract()
  try {
    const files = listFiles(fixture.extractDir)
    assert.deepEqual(
      files,
      [...standardNodeStarter.rootFiles, standardNodeStarter.seedEntry].sort(),
    )

    for (const directory of standardNodeStarter.optionalDirectories) {
      assert.equal(existsSync(join(fixture.extractDir, directory)), true, directory)
    }

    assert.equal(
      readFileSync(join(fixture.extractDir, ".gitignore"), "utf8"),
      `${standardNodeStarter.gitignoreEntries.join("\n")}\n`,
    )

    const config = readFileSync(join(fixture.extractDir, "voyant.config.ts"), "utf8")
    assert.doesNotMatch(config, /\b(?:modules|extensions|plugins|access)\s*:/)
    assert.doesNotMatch(config, /smartbill/i)
    assert.match(config, new RegExp(`target:\\s*"${standardNodeStarter.deploymentTarget}"`))
    assert.match(config, new RegExp(`database:\\s*"${standardNodeStarter.databaseProvider}"`))

    const packageJson = JSON.parse(readFileSync(join(fixture.extractDir, "package.json"), "utf8"))
    assert.deepEqual(packageJson.scripts, standardNodeStarter.packageScripts)
    assert.equal(packageJson.scripts["graph:emit"], undefined)
    assert.deepEqual(packageJson.dependencies, standardNodeStarter.runtimeDependencyCoordinates)
    assert.equal(packageJson.dependencies["@voyant-travel/plugin-smartbill"], undefined)
    assert.deepEqual(
      packageJson.devDependencies,
      standardNodeStarter.developmentDependencyCoordinates,
    )
    const dependencySpecs = Object.values({
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    })
    assert.equal(
      dependencySpecs.some((specifier) => /^(?:workspace|file|link):/.test(specifier)),
      false,
    )
  } finally {
    rmSync(fixture.tempDir, { recursive: true, force: true })
  }
})

test("operator release archive pins the current core package releases", () => {
  const fixture = packageAndExtract()
  try {
    const packageJson = JSON.parse(readFileSync(join(fixture.extractDir, "package.json"), "utf8"))
    for (const packageName of [
      "@voyant-travel/framework",
      "@voyant-travel/runtime",
      "@voyant-travel/operator-standard",
    ]) {
      const packageDirectory = packageName.replace("@voyant-travel/", "")
      const manifest = JSON.parse(
        readFileSync(join(repoRoot, "packages", packageDirectory, "package.json"), "utf8"),
      )

      assert.equal(
        packageJson.dependencies[packageName],
        manifest.version,
        `${packageName} starter coordinate must match its current published version`,
      )
    }
  } finally {
    rmSync(fixture.tempDir, { recursive: true, force: true })
  }
})

test("standard operator keeps the coupled Better Auth packages exact and in lockstep", () => {
  const packageJson = JSON.parse(
    readFileSync(join(repoRoot, "packages/operator-standard/package.json"), "utf8"),
  )
  const betterAuthVersion = packageJson.dependencies["better-auth"]
  const apiKeyVersion = packageJson.dependencies["@better-auth/api-key"]

  assert.match(betterAuthVersion, /^\d+\.\d+\.\d+$/)
  assert.equal(apiKeyVersion, betterAuthVersion)
})

function packageAndExtract(extraArgs = []) {
  const tempDir = mkdtempSync(join(tmpdir(), "voyant-package-starters-test-"))
  const outDir = join(tempDir, "out")
  const extractDir = join(tempDir, "extract")
  execFileSync(
    process.execPath,
    ["scripts/package-starters.mjs", "--version", "0.0.0-test", "--out-dir", outDir, ...extraArgs],
    { cwd: repoRoot, stdio: "pipe" },
  )
  mkdirSync(extractDir, { recursive: true })
  execFileSync(
    "tar",
    ["-xzf", join(outDir, "voyant-starter-operator-0.0.0-test.tar.gz"), "-C", extractDir],
    { stdio: "pipe" },
  )
  return { tempDir, outDir, extractDir }
}

function listFiles(root) {
  return walk(root)
    .filter((path) => !path.endsWith("/.DS_Store"))
    .map((path) => relative(root, path))
    .sort()
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}
