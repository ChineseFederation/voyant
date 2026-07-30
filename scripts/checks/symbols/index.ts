#!/usr/bin/env node
/**
 * Runner for the declarative symbol policy. See assertions.ts.
 *
 * Parses packages/ once (~6s) and evaluates every package's rules against that
 * one source map. The shared parse is the point: the same rules split across
 * per-module scripts would pay it repeatedly.
 */
import { readdirSync, readFileSync } from "node:fs"
import { dirname, extname, join, sep } from "node:path"
import { fileURLToPath } from "node:url"

import ts from "typescript"

import { checkSymbolPolicy, type SymbolPolicy } from "./assertions.ts"

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"])

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name).split(sep).join("/")
    if (entry.isDirectory()) {
      return entry.name === "dist" || entry.name === "node_modules" ? [] : sourceFiles(path)
    }
    return entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : []
  })
}

const isProductionSource = (file: string) =>
  !file.includes("/tests/") && !/\.test\.[^.]+$/.test(file) && !/\.spec\.[^.]+$/.test(file)

function parse(file: string): ts.SourceFile {
  const extension = extname(file)
  const kind = extension === ".tsx" ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, kind)
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url))
  const { policies } = JSON.parse(readFileSync(join(here, "symbol-policy.json"), "utf8")) as {
    policies: Record<string, SymbolPolicy>
  }

  const sources = new Map(
    sourceFiles("packages")
      .filter(isProductionSource)
      .map((file) => [file, parse(file)] as const),
  )

  const violations = Object.entries(policies).flatMap(([owner, policy]) =>
    checkSymbolPolicy(sources, policy).map((violation) => `[${owner}] ${violation}`),
  )

  if (violations.length > 0) {
    console.error("Symbol policy check failed.\n")
    for (const violation of violations) console.error(`  - ${violation}`)
    process.exit(1)
  }

  console.log(
    `verify:symbol-policy: ${Object.keys(policies).length} policy set(s) hold across ${sources.size} sources.`,
  )
}

main()
