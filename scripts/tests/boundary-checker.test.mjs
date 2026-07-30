import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

/**
 * Guards the boundary checker against going vacuous.
 *
 * Every rule in .dependency-cruiser.cjs depends on cross-package imports
 * actually resolving. They resolve only because `enhancedResolveOptions` is
 * told that workspace `exports` maps point at TypeScript source. Change or drop
 * that and every reachability rule keeps reporting success while checking
 * nothing — which is the failure mode these tests exist to catch. A green
 * `verify:boundary` is only meaningful if it can still go red.
 */

const repoRoot = process.cwd()
const CHECKER = path.join(repoRoot, "scripts", "checks", "boundary", "index.mjs")

function runChecker(only) {
  const args = only ? [CHECKER, "--only", only] : [CHECKER]
  try {
    const stdout = execFileSync(process.execPath, args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "pipe",
    })
    return { ok: true, output: stdout }
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}` }
  }
}

/** Drops a probe module into a real package so the real rule globs apply. */
function withProbe(relativePath, contents, assertion) {
  const absolute = path.join(repoRoot, relativePath)
  const pkg = relativePath.split("/")[1]
  writeFileSync(absolute, contents)
  try {
    assertion(runChecker(pkg))
  } finally {
    rmSync(absolute, { force: true })
  }
}

test("the checker passes on a clean tree", () => {
  const { ok, output } = runChecker("operations-react")
  assert.equal(ok, true, `expected a clean tree to pass:\n${output}`)
  assert.match(output, /no boundary violations/)
})

test("a browser package value-importing a server-runtime barrel is caught", () => {
  withProbe(
    "packages/operations-react/src/__boundary_probe__.ts",
    'import { operationsModule } from "@voyant-travel/operations"\nexport const probe = operationsModule\n',
    ({ ok, output }) => {
      assert.equal(ok, false, "a value import reaching Drizzle must fail")
      assert.match(output, /browser-no-server-runtime/)
    },
  )
})

test("a browser package type-importing the same barrel is allowed", () => {
  // import type is erased at compile time, so it cannot put anything in a
  // bundle. If this ever starts failing, tsPreCompilationDeps has been flipped.
  withProbe(
    "packages/operations-react/src/__boundary_probe__.ts",
    'import type { Module } from "@voyant-travel/operations"\nexport type Probe = Module\n',
    ({ ok, output }) => {
      assert.equal(ok, true, `a type-only import must pass:\n${output}`)
    },
  )
})

test("an unresolvable import is caught rather than silently ignored", () => {
  withProbe(
    "packages/operations-react/src/__boundary_probe__.ts",
    'import { nope } from "totally-not-installed"\nexport const probe = nope\n',
    ({ ok, output }) => {
      assert.equal(ok, false, "an unresolvable import must fail")
      assert.match(output, /no-unresolvable/)
    },
  )
})

test("a contracts package importing its runtime sibling is caught", () => {
  withProbe(
    "packages/bookings-contracts/src/__boundary_probe__.ts",
    'export { bookingsService } from "@voyant-travel/bookings"\n',
    ({ ok, output }) => {
      assert.equal(ok, false, "the ADR-0002 arrow must be enforced")
      assert.match(output, /contracts-no-runtime-sibling|no-unresolvable/)
    },
  )
})
