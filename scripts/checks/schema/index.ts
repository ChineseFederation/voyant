#!/usr/bin/env node
/** Runner: extracts pgTable declarations from packages/ and checks *Ref mirrors. */
import { readdirSync, readFileSync } from "node:fs"
import { extname, join, sep } from "node:path"

import ts from "typescript"

import { checkRefMirrors, type TableDecl } from "./ref-mirrors.ts"

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name).split(sep).join("/")
    if (entry.isDirectory()) {
      return entry.name === "dist" || entry.name === "node_modules" ? [] : sourceFiles(path)
    }
    return entry.isFile() && extname(entry.name) === ".ts" ? [path] : []
  })
}

/**
 * Comments must be removed before matching: `packages/db/src/lib/typeid-column.ts`
 * carries a `@example` JSDoc containing `pgTable("products", { ... })`, which a
 * naive text scan reads as the owner of the products table and then reports
 * every real mirror column as unknown. Blanking comment ranges with the
 * TypeScript scanner keeps offsets stable so the brace matching below still works.
 */
function stripComments(text: string): string {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text)
  const out = text.split("")
  let token = scanner.scan()
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      for (let i = scanner.getTokenStart(); i < scanner.getTokenEnd(); i += 1) {
        if (out[i] !== "\n") out[i] = " "
      }
    }
    token = scanner.scan()
  }
  return out.join("")
}

/** Matches the `{...}` column object of a pgTable call, brace-balanced. */
export function extractDeclarations(file: string, rawText: string): TableDecl[] {
  const text = stripComments(rawText)
  const out: TableDecl[] = []
  const pattern = /export const (\w+) = pgTable\(\s*"([^"]+)"\s*,\s*\{/g
  for (const match of text.matchAll(pattern)) {
    const open = match.index + match[0].length - 1
    let depth = 0
    for (let i = open; i < text.length; i += 1) {
      if (text[i] === "{") depth += 1
      else if (text[i] === "}") {
        depth -= 1
        if (depth === 0) {
          const body = text.slice(open + 1, i)
          const columns: Record<string, string> = {}
          for (const column of body.matchAll(/(?:^|\n)\s*(\w+)\s*:\s*([A-Za-z_$][\w.$]*)\s*\(/g)) {
            columns[column[1]] = column[2]
          }
          out.push({ constName: match[1], tableName: match[2], file, columns })
          break
        }
      }
    }
  }
  return out
}

function main(): void {
  const declarations = sourceFiles("packages")
    .filter((file) => !file.includes("/tests/") && !/\.test\.ts$/.test(file))
    .flatMap((file) => extractDeclarations(file, readFileSync(file, "utf8")))

  const { violations, checked } = checkRefMirrors(declarations)

  if (violations.length > 0) {
    console.error("Ref mirror check failed.\n")
    for (const violation of violations) console.error(`  - ${violation}`)
    process.exit(1)
  }

  console.log(
    `verify:ref-mirrors: ${checked} mirrors agree with their owning tables (${declarations.length} tables scanned).`,
  )
}

main()
