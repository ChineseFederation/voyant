#!/usr/bin/env node
/**
 * Boundary checker — see docs/adr/0016-modules-as-components-of-one-deployable.md.
 *
 * Rules live in .dependency-cruiser.cjs. This runner exists because a single
 * whole-graph reachability cruise exhausts the heap; cruising one package at a
 * time keeps each graph small and makes failures name the package.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"

const repoRoot = process.cwd()
const CONFIG = ".dependency-cruiser.cjs"

// `--only <name>` narrows the run to one package. Cruising all of them takes
// well over a minute, which is fine for verify:architecture but far too slow for
// the self-test in scripts/tests/boundary-checker.test.mjs to invoke repeatedly.
const onlyIndex = process.argv.indexOf("--only")
const only = onlyIndex === -1 ? undefined : process.argv[onlyIndex + 1]

const packagesDir = path.join(repoRoot, "packages")
const targets = readdirSync(packagesDir)
  .filter((name) => /(-react|-contracts)$/.test(name) || name === "ui")
  .filter((name) => existsSync(path.join(packagesDir, name, "src")))
  .filter((name) => only === undefined || name === only)
  .sort()

if (only !== undefined && targets.length === 0) {
  console.error(`verify:boundary: --only ${only} matched no target package`)
  process.exit(1)
}

if (targets.length === 0) {
  console.error("verify:boundary: no target packages found under packages/")
  process.exit(1)
}

const failures = []
for (const name of targets) {
  const target = `packages/${name}/src`
  try {
    execFileSync(
      process.execPath,
      [
        path.join(repoRoot, "node_modules", "dependency-cruiser", "bin", "dependency-cruise.mjs"),
        target,
        "--config",
        CONFIG,
        "--output-type",
        "err",
      ],
      {
        cwd: repoRoot,
        stdio: "pipe",
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=8192" },
      },
    )
  } catch (error) {
    failures.push({ name, output: `${error.stdout ?? ""}${error.stderr ?? ""}`.trim() })
  }
}

if (failures.length > 0) {
  for (const { name, output } of failures) {
    console.error(`\n=== packages/${name} ===\n${output}`)
  }
  console.error(
    `\nverify:boundary: ${failures.length} of ${targets.length} package(s) violate a boundary rule.`,
  )
  process.exit(1)
}

console.log(`verify:boundary: ${targets.length} packages checked, no boundary violations.`)
