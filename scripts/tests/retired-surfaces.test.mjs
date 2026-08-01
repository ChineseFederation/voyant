import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const repoRoot = process.cwd()
const CHECKER = path.join(repoRoot, "scripts", "checks", "regression", "index.mjs")
const DATA = path.join(repoRoot, "scripts", "checks", "regression", "retired-paths.json")

function runChecker() {
  try {
    return {
      ok: true,
      output: execFileSync(process.execPath, [CHECKER], {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: "pipe",
      }),
    }
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}` }
  }
}

test("every declared retired path is absent", () => {
  const { ok, output } = runChecker()
  assert.equal(ok, true, `retired surfaces have come back:\n${output}`)
})

test("recreating a retired path fails the check", () => {
  const { retiredPaths } = JSON.parse(readFileSync(DATA, "utf8"))
  const target = path.join(repoRoot, retiredPaths[0].path)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, "// probe\n")
  try {
    const { ok, output } = runChecker()
    assert.equal(ok, false, "a resurrected path must fail")
    assert.match(output, /was retired but exists again/)
  } finally {
    rmSync(target, { force: true })
  }
})

/**
 * The list was extracted from the per-module `*authority*` scripts, which still
 * carry their own copies until they are collapsed onto this engine. Until then
 * the two can drift: someone adds an `existsSync` pin to a script and the
 * declarative list never learns about it. This catches that.
 */
test("the declared list still covers what the authority scripts pin", () => {
  const declared = new Set(
    JSON.parse(readFileSync(DATA, "utf8")).retiredPaths.map((entry) => entry.path),
  )
  const roots = /^(packages|apps|scripts|docs|examples|\.github|\.changeset)\//
  const scriptsDir = path.join(repoRoot, "scripts")

  const missing = []
  for (const name of readdirSync(scriptsDir).filter((file) => /authority.*\.mjs$/.test(file))) {
    const source = readFileSync(path.join(scriptsDir, name), "utf8")
    const pins = [
      ...source.matchAll(/existsSync\(\s*(?:path\.)?join\([^,]+,\s*"([^"]+)"\s*\)\s*\)/g),
      ...source.matchAll(/existsSync\(\s*"([^"]+)"\s*\)/g),
    ].map((match) => match[1])

    for (const pin of pins) {
      // Bare fragments come from loops whose directory is a variable; those
      // scripts are not yet collapsible and are out of scope for the list.
      if (!roots.test(pin) || declared.has(pin)) continue
      missing.push(`${name} pins ${pin}, which retired-paths.json does not declare`)
    }
  }

  assert.deepEqual(missing, [], missing.join("\n"))
})
