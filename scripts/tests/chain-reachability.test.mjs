import assert from "node:assert/strict"
import test from "node:test"

import { checkChainReachability, reachableScripts } from "../checks/chain/reachability.mjs"

/**
 * The two blind spots this checker exists for, both observed:
 *
 *  - a checker with a `verify:` entry that nothing appends to the chain runs
 *    never, passes locally, and rots (voyant#4272 — five of nine were already
 *    failing when this was written)
 *  - a checker reachable through SEVERAL references looks removable after
 *    deleting one of them (voyant#4320)
 *
 * Reachability is transitive, so a checker invoked by an aggregate that is
 * itself in the chain counts. Getting that wrong in the conservative direction
 * would flag scripts that do run; in the permissive direction it would miss the
 * ones that do not. Both are asserted.
 */

test("a checker invoked directly by the chain is reachable", () => {
  const scripts = {
    "verify:architecture": "node scripts/check-a-authority.mjs",
  }
  assert.deepEqual(checkChainReachability(scripts, ["check-a-authority.mjs"]), [])
})

test("a checker invoked through a chained aggregate is reachable", () => {
  // The case my own ad-hoc analysis got wrong: operator-domain-runtime is
  // reached via verify:runtime-ports, two hops from the root.
  const scripts = {
    "verify:architecture": "pnpm verify:ports",
    "verify:ports": "node scripts/check-x.mjs && pnpm verify:domain",
    "verify:domain": "node scripts/check-a-authority.mjs",
  }
  assert.deepEqual(checkChainReachability(scripts, ["check-a-authority.mjs"]), [])
})

test("a checker with a verify: entry nobody chains is a violation", () => {
  const scripts = {
    "verify:architecture": "pnpm verify:other",
    "verify:other": "node scripts/check-other.mjs",
    "verify:a-authority": "node scripts/check-a-authority.mjs",
  }
  const violations = checkChainReachability(scripts, ["check-a-authority.mjs"])
  assert.equal(violations.length, 1)
  assert.match(violations[0], /is never executed/)
})

test("a script name is not matched by a longer one that shares its prefix", () => {
  // `pnpm verify:a` must not make `verify:a-authority` look reached.
  const scripts = {
    "verify:architecture": "pnpm verify:a",
    "verify:a": "node scripts/check-unrelated.mjs",
    "verify:a-authority": "node scripts/check-a-authority.mjs",
  }
  assert.equal(checkChainReachability(scripts, ["check-a-authority.mjs"]).length, 1)
})

test("reachableScripts follows pnpm run as well as bare pnpm", () => {
  const scripts = {
    "verify:architecture": "pnpm run verify:mid",
    "verify:mid": "pnpm verify:leaf",
    "verify:leaf": "node scripts/x.mjs",
  }
  const reached = reachableScripts(scripts)
  assert.ok(reached.has("verify:mid") && reached.has("verify:leaf"), [...reached].join(","))
})

test("an allowlisted checker passes, and names its reason", () => {
  const scripts = { "verify:architecture": "pnpm verify:other", "verify:other": "true" }
  const violations = checkChainReachability(scripts, ["check-a-authority.mjs"], {
    "check-a-authority.mjs": "runs in the release workflow only",
  })
  assert.deepEqual(violations, [])
})

test("an allowlist entry for a checker that IS chained is stale and fails", () => {
  // Otherwise an exemption outlives its reason and quietly makes the checker
  // optional again.
  const scripts = { "verify:architecture": "node scripts/check-a-authority.mjs" }
  const violations = checkChainReachability(scripts, ["check-a-authority.mjs"], {
    "check-a-authority.mjs": "stale",
  })
  assert.equal(violations.length, 1)
  assert.match(violations[0], /allowlist entry is stale/)
})

test("an allowlist entry naming a checker that does not exist fails", () => {
  const scripts = { "verify:architecture": "true" }
  const violations = checkChainReachability(scripts, [], { "check-gone-authority.mjs": "why" })
  assert.equal(violations.length, 1)
  assert.match(violations[0], /not a checker here/)
})

test("the real repository has no unreachable authority checker", async () => {
  // The regression this exists to prevent. Runs against the live package.json.
  const { readScripts } = await import("../checks/chain/reachability.mjs")
  const { readdirSync, existsSync, readFileSync } = await import("node:fs")
  const path = await import("node:path")
  const repoRoot = process.cwd()
  const scripts = readScripts(path.join(repoRoot, "package.json"))
  const checkers = readdirSync(path.join(repoRoot, "scripts"))
    .filter((file) => /authority.*\.mjs$/.test(file))
    .sort()
  const allowlist = path.join(repoRoot, "scripts/checks/chain/runs-elsewhere.json")
  const allowed = existsSync(allowlist)
    ? (JSON.parse(readFileSync(allowlist, "utf8")).runsElsewhere ?? {})
    : {}
  assert.deepEqual(checkChainReachability(scripts, checkers, allowed), [])
})
