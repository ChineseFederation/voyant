import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import {
  currentLegacyExecuteToolsActionIds,
  diffLegacyExecuteToolsRatchet,
  isLegacyExecuteToolsAction,
  isSortedUniqueStringArray,
} from "../lib/legacy-execute-tools-ratchet.mjs"

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..")
const checkerPath = path.join(repoRoot, "scripts/check-legacy-execute-tools-ratchet.mjs")

function executeAction(overrides = {}) {
  return {
    id: "@voyant-travel/example#action.do-thing",
    kind: "execute",
    from: { tools: ["@voyant-travel/example#tool.do-thing"] },
    ...overrides,
  }
}

function graphWithActions(actions) {
  return { modules: [{ id: "@voyant-travel/example", actions }] }
}

describe("isLegacyExecuteToolsAction", () => {
  it("flags an execute action bound to a tool with no safety-contract facets", () => {
    assert.equal(isLegacyExecuteToolsAction(executeAction()), true)
  })

  it("ignores non-execute actions", () => {
    assert.equal(isLegacyExecuteToolsAction(executeAction({ kind: "read" })), false)
  })

  it("ignores execute actions with no bound tools", () => {
    assert.equal(isLegacyExecuteToolsAction(executeAction({ from: { tools: [] } })), false)
    assert.equal(isLegacyExecuteToolsAction(executeAction({ from: undefined })), false)
  })

  it("ignores execute actions that declare any safety-contract facet", () => {
    for (const facet of ["availability", "effectBoundary", "durability", "existingTarget"]) {
      assert.equal(
        isLegacyExecuteToolsAction(executeAction({ [facet]: { status: "available" } })),
        false,
        `expected ${facet} to exempt the action`,
      )
    }
  })
})

describe("currentLegacyExecuteToolsActionIds", () => {
  it("collects sorted, de-duplicated ids across all unit collections", () => {
    const graph = {
      modules: [{ id: "@voyant-travel/b", actions: [executeAction({ id: "b.action.two" })] }],
      extensions: [{ id: "@voyant-travel/a", actions: [executeAction({ id: "a.action.one" })] }],
      plugins: [{ id: "@voyant-travel/dup", actions: [executeAction({ id: "b.action.two" })] }],
    }
    assert.deepEqual(currentLegacyExecuteToolsActionIds(graph), ["a.action.one", "b.action.two"])
  })

  it("excludes actions with safety-contract facets or without tools", () => {
    const graph = graphWithActions([
      executeAction({ id: "legacy.action" }),
      executeAction({ id: "safe.action", availability: { status: "available" } }),
      executeAction({ id: "no-tool.action", from: { tools: [] } }),
      executeAction({ id: "read.action", kind: "read" }),
    ])
    assert.deepEqual(currentLegacyExecuteToolsActionIds(graph), ["legacy.action"])
  })
})

describe("diffLegacyExecuteToolsRatchet", () => {
  it("reports no differences when current ids match the allowlist exactly", () => {
    const result = diffLegacyExecuteToolsRatchet(["a", "b"], ["a", "b"])
    assert.deepEqual(result, { newGrandfathers: [], staleAllowlistEntries: [] })
  })

  it("reports a new grandfather for an id missing from the allowlist", () => {
    const result = diffLegacyExecuteToolsRatchet(["a", "b", "c"], ["a", "b"])
    assert.deepEqual(result, { newGrandfathers: ["c"], staleAllowlistEntries: [] })
  })

  it("reports a stale allowlist entry no longer present in the graph", () => {
    const result = diffLegacyExecuteToolsRatchet(["a"], ["a", "b"])
    assert.deepEqual(result, { newGrandfathers: [], staleAllowlistEntries: ["b"] })
  })
})

describe("isSortedUniqueStringArray", () => {
  it("accepts a sorted, de-duplicated string array", () => {
    assert.equal(isSortedUniqueStringArray(["a", "b", "c"]), true)
    assert.equal(isSortedUniqueStringArray([]), true)
  })

  it("rejects unsorted, duplicate, or non-string input", () => {
    assert.equal(isSortedUniqueStringArray(["b", "a"]), false)
    assert.equal(isSortedUniqueStringArray(["a", "a"]), false)
    assert.equal(isSortedUniqueStringArray(["a", 1]), false)
    assert.equal(isSortedUniqueStringArray("a"), false)
  })
})

async function writeFixture({ actions, allowlist }) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-legacy-execute-tools-ratchet-"))
  const graphPath = path.join(root, "deployment-graph.generated.json")
  const allowlistPath = path.join(root, "legacy-execute-tools-allowlist.json")
  await mkdir(root, { recursive: true })
  await writeFile(graphPath, JSON.stringify(graphWithActions(actions)))
  await writeFile(allowlistPath, JSON.stringify(allowlist))
  return { graphPath, allowlistPath }
}

async function runChecker({ graphPath, allowlistPath }) {
  return execFileAsync(process.execPath, [
    checkerPath,
    "--graph",
    graphPath,
    "--allowlist",
    allowlistPath,
  ])
}

describe("check-legacy-execute-tools-ratchet CLI", () => {
  it("passes when the graph's legacy actions exactly match the allowlist", async () => {
    const fixture = await writeFixture({
      actions: [executeAction({ id: "legacy.one" }), executeAction({ id: "legacy.two" })],
      allowlist: ["legacy.one", "legacy.two"],
    })
    const result = await runChecker(fixture)
    assert.match(result.stdout, /OK \(2 grandfathered action\(s\) frozen\)/)
  })

  it("fails on a new legacy execute+tools action outside the allowlist", async () => {
    const fixture = await writeFixture({
      actions: [executeAction({ id: "legacy.one" }), executeAction({ id: "legacy.new" })],
      allowlist: ["legacy.one"],
    })
    await assert.rejects(runChecker(fixture), (error) => {
      assert.match(error.stderr, /1 new legacy execute\+tools action\(s\)/)
      assert.match(error.stderr, /legacy\.new/)
      assert.match(error.stderr, /allowlist is frozen/)
      return true
    })
  })

  it("fails on a stale allowlist entry no longer legacy in the graph", async () => {
    const fixture = await writeFixture({
      actions: [executeAction({ id: "legacy.one" })],
      allowlist: ["legacy.migrated", "legacy.one"],
    })
    await assert.rejects(runChecker(fixture), (error) => {
      assert.match(error.stderr, /1 allowlist entry is stale/)
      assert.match(error.stderr, /legacy\.migrated/)
      assert.match(error.stderr, /same PR/)
      return true
    })
  })

  it("fails when the allowlist file is not sorted", async () => {
    const fixture = await writeFixture({
      actions: [executeAction({ id: "legacy.one" }), executeAction({ id: "legacy.two" })],
      allowlist: ["legacy.two", "legacy.one"],
    })
    await assert.rejects(runChecker(fixture), (error) => {
      assert.match(error.stderr, /sorted, de-duplicated JSON array/)
      return true
    })
  })
})
