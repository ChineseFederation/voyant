import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, test } from "node:test"
import {
  checkAgainstBaseline,
  improvements,
  uncheckedTestFiles,
} from "../checks/typecheck/typecheck-coverage.mjs"
import { collectCiCheckedFiles, unresolvedCiProjects } from "../lib/ci-typecheck-selection.mjs"

const temporaryDirectories = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true })
  }
})

test("a test file covered by no project is unchecked", () => {
  assert.deepEqual(
    uncheckedTestFiles({
      testFiles: ["/a/tests/one.test.ts", "/a/src/two.test.ts"],
      checkedFiles: new Set(["/a/src/two.test.ts"]),
    }),
    ["/a/tests/one.test.ts"],
  )
})

test("a package with unchecked tests and no baseline entry is a violation", () => {
  const violations = checkAgainstBaseline(new Map([["pkg", ["tests/one.test.ts"]]]), [])

  assert.equal(violations.length, 1)
  assert.match(violations[0], /^pkg: 1 test file\(s\) that no CI job typechecks/)
})

test("a package with unchecked tests that is baselined is allowed", () => {
  assert.deepEqual(checkAgainstBaseline(new Map([["pkg", ["tests/one.test.ts"]]]), ["pkg"]), [])
})

test("the ratchet is on membership, so a baselined package may grow tests", () => {
  const files = ["tests/one.test.ts", "tests/two.test.ts", "tests/three.test.ts"]

  assert.deepEqual(checkAgainstBaseline(new Map([["pkg", files]]), ["pkg"]), [])
})

test("a baselined package that is now clean is reported as an improvement", () => {
  assert.deepEqual(improvements(new Map(), ["pkg"]), [
    "pkg: now fully typechecked — drop it from the baseline",
  ])
})

test("a package that could not be analysed is not mistaken for a clean one", () => {
  assert.deepEqual(improvements(new Map(), ["pkg"], ["pkg"]), [])
})

test("a package the build alone typechecks needs no typecheck job to be covered", () => {
  const directory = createWorkspace({ buildInclude: ["src/**/*", "tests/**/*"] })

  const checked = collectCiCheckedFiles({
    directory,
    manifest: { name: "fixture", scripts: { build: "tsc -p tsconfig.build.json" } },
  })

  assert.equal(checked.has(path.join(directory, "tests", "index.test.ts")), true)
})

test("a skipped typecheck project contributes no coverage, however wide", () => {
  // build and typecheck cover the same files, so classifyTypecheck skips the
  // typecheck job — widening only tsconfig.typecheck.json would not help.
  const directory = createWorkspace({
    buildInclude: ["src/**/*"],
    typecheckInclude: ["src/**/*"],
  })

  const checked = collectCiCheckedFiles({
    directory,
    manifest: {
      name: "fixture",
      scripts: { build: "tsc -p tsconfig.build.json", typecheck: "tsc -p tsconfig.typecheck.json" },
    },
  })

  assert.equal(checked.has(path.join(directory, "tests", "index.test.ts")), false)
})

test("a build that opts out of checking contributes no coverage", () => {
  const directory = createWorkspace({ buildInclude: ["src/**/*", "tests/**/*"] })

  const checked = collectCiCheckedFiles({
    directory,
    manifest: { name: "fixture", scripts: { build: "tsc -p tsconfig.build.json --noCheck" } },
  })

  assert.equal(checked.size, 0)
})

test("a referenced project that is not generated is reported, not assumed empty", () => {
  const directory = createWorkspace({ buildInclude: ["src/**/*"] })

  const unresolved = unresolvedCiProjects({
    directory,
    manifest: {
      name: "fixture",
      scripts: { build: "tsc -p tsconfig.build.json", typecheck: "tsc -p .voyant/tsconfig.json" },
    },
  })

  assert.deepEqual(unresolved, [path.join(directory, ".voyant", "tsconfig.json")])
})

function createWorkspace({ buildInclude, typecheckInclude }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "voyant-typecheck-coverage-"))
  temporaryDirectories.push(directory)
  fs.mkdirSync(path.join(directory, "src"))
  fs.mkdirSync(path.join(directory, "tests"))
  fs.writeFileSync(path.join(directory, "src", "index.ts"), "export const value = 1;\n")
  fs.writeFileSync(path.join(directory, "tests", "index.test.ts"), "void 0;\n")
  fs.writeFileSync(
    path.join(directory, "tsconfig.build.json"),
    JSON.stringify({ compilerOptions: { noEmit: true }, include: buildInclude }),
  )
  if (typecheckInclude) {
    fs.writeFileSync(
      path.join(directory, "tsconfig.typecheck.json"),
      JSON.stringify({ compilerOptions: { noEmit: true }, include: typecheckInclude }),
    )
  }
  return directory
}
