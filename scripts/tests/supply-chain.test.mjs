import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

const repoRoot = process.cwd()
const CHECKER = path.join(repoRoot, "scripts", "checks", "supply-chain", "index.mjs")
const DATA = path.join(repoRoot, "scripts", "checks", "supply-chain", "compromised-packages.json")

function runChecker(cwd = repoRoot) {
  try {
    return {
      ok: true,
      output: execFileSync(process.execPath, [CHECKER], { cwd, encoding: "utf8", stdio: "pipe" }),
    }
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}` }
  }
}

/**
 * The checker scans tracked lockfiles, so fixtures need their own git repo
 * rather than a file planted in this one — a killed run must not be able to
 * leave a fake compromised entry behind in the real lockfile.
 */
function withLockfile(body, contents) {
  const dir = mkdtempSync(path.join(tmpdir(), "voyant-supply-chain-"))
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: dir })
    writeFileSync(path.join(dir, "pnpm-lock.yaml"), contents)
    execFileSync("git", ["add", "pnpm-lock.yaml"], { cwd: dir })
    return body(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const lockfile = (entries) =>
  `lockfileVersion: '9.0'\n\npackages:\n\n${entries
    .map((entry) => `  '${entry}':\n    resolution: {integrity: sha512-deadbeef}\n`)
    .join("")}`

test("the repository's tracked lockfiles are clean", () => {
  const { ok, output } = runChecker()
  assert.equal(ok, true, `a compromised release is resolved:\n${output}`)
})

test("a compromised release in a lockfile fails the check", () => {
  const result = withLockfile((dir) => runChecker(dir), lockfile(["keyv@6.0.0"]))
  assert.equal(result.ok, false, "a compromised release must fail")
  assert.match(result.output, /keyv@6\.0\.0/)
  assert.match(result.output, /keyv-cacheable-2026-08-04/)
})

test("a scope wildcard matches any member of the scope", () => {
  const result = withLockfile((dir) => runChecker(dir), lockfile(["@keyv/redis@6.0.0"]))
  assert.equal(result.ok, false, "@keyv/* at a compromised version must fail")
  assert.match(result.output, /@keyv\/redis@6\.0\.0/)
})

test("peer-suffixed snapshot keys are still matched", () => {
  const result = withLockfile((dir) => runChecker(dir), lockfile(["cacheable@2.5.1(react@19.0.0)"]))
  assert.equal(result.ok, false, "a peer-suffixed key must still match")
  assert.match(result.output, /cacheable@2\.5\.1/)
})

/**
 * `idb-keyval` is an unrelated IndexedDB library that this repo does depend on.
 * A substring match on "keyv" flags it, which is exactly the false positive that
 * makes a security check get ignored.
 */
test("idb-keyval is not mistaken for keyv", () => {
  const result = withLockfile(
    (dir) => runChecker(dir),
    lockfile(["idb-keyval@6.0.0", "idb-keyval@6.2.2"]),
  )
  assert.equal(result.ok, true, `idb-keyval must not be flagged:\n${result.output}`)
})

test("uncompromised versions of a listed package pass", () => {
  const result = withLockfile(
    (dir) => runChecker(dir),
    lockfile(["keyv@4.5.4", "flat-cache@4.0.1", "file-entry-cache@8.0.0"]),
  )
  assert.equal(result.ok, true, `safe versions must pass:\n${result.output}`)
})

test("every advisory carries the provenance needed to act on a hit", () => {
  const { advisories } = JSON.parse(readFileSync(DATA, "utf8"))
  assert.ok(advisories.length > 0, "the ledger must declare at least one advisory")
  for (const advisory of advisories) {
    assert.match(advisory.id, /^[a-z0-9-]+$/, "id must be a kebab-case slug")
    assert.match(advisory.published, /^\d{4}-\d{2}-\d{2}$/, `${advisory.id} needs a published date`)
    assert.match(advisory.url, /^https:\/\//, `${advisory.id} needs a source URL`)
    assert.ok(advisory.summary?.length > 0, `${advisory.id} needs a summary`)
    for (const [name, versions] of Object.entries(advisory.packages)) {
      assert.ok(versions.length > 0, `${advisory.id} lists ${name} with no versions`)
      for (const version of versions) {
        assert.match(version, /^\d/, `${advisory.id} ${name} version must be exact, got ${version}`)
      }
    }
  }
})
