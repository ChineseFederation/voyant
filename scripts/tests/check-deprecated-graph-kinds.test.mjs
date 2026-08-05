import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

/**
 * Guards the deprecated-kind checker against going vacuous.
 *
 * RFC #3395 retired "plugin" as a classification and every workspace package
 * has migrated, so this checker now passes trivially. A checker that passes
 * because there is nothing to find is indistinguishable from one that passes
 * because it stopped looking — these tests assert it can still go red.
 */

const repoRoot = process.cwd()
const CHECKER = path.join(repoRoot, "scripts", "check-deprecated-graph-kinds.mjs")

function runChecker(extraArgs = []) {
  try {
    const stdout = execFileSync(process.execPath, [CHECKER, ...extraArgs], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "pipe",
    })
    return { code: 0, output: stdout }
  } catch (error) {
    return {
      code: error.status ?? 1,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    }
  }
}

/** Builds a throwaway workspace so no probe file lands in a real package. */
function withWorkspace(packages, assertion) {
  const root = mkdtempSync(path.join(tmpdir(), "deprecated-kind-"))
  try {
    for (const [name, manifest] of Object.entries(packages)) {
      const directory = path.join(root, "packages", name)
      mkdirSync(directory, { recursive: true })
      writeFileSync(path.join(directory, "package.json"), JSON.stringify(manifest, null, 2))
    }
    assertion(runChecker(["--root", root]))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test("the real workspace declares no plugin graph kinds", () => {
  const result = runChecker()
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /no workspace packages declare voyant\.kind "plugin"/)
})

test('a package declaring voyant.kind "plugin" fails the check', () => {
  withWorkspace(
    { "plugin-example": { name: "@voyant-travel/plugin-example", voyant: { kind: "plugin" } } },
    (result) => {
      assert.equal(result.code, 1, result.output)
      assert.match(result.output, /@voyant-travel\/plugin-example declares voyant\.kind "plugin"/)
    },
  )
})

test("packages declaring a migrated kind pass", () => {
  withWorkspace(
    {
      "netopia-adapter": { name: "@voyant-travel/netopia-adapter", voyant: { kind: "adapter" } },
      bookings: { name: "@voyant-travel/bookings", voyant: { kind: "module" } },
    },
    (result) => {
      assert.equal(result.code, 0, result.output)
    },
  )
})

test("the suggested target reflects the package's role", () => {
  withWorkspace(
    { "plugin-smartbill": { name: "@voyant-travel/plugin-smartbill", voyant: { kind: "plugin" } } },
    (result) => {
      assert.equal(result.code, 1, result.output)
      assert.match(result.output, /remote app/)
    },
  )
})

test("--root without a directory argument is rejected rather than silently ignored", () => {
  const result = runChecker(["--root"])
  assert.equal(result.code, 2, result.output)
  assert.match(result.output, /--root requires a directory argument/)
})
