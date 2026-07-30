#!/usr/bin/env node
/** Runner: extracts pgTable declarations from packages/ and checks *Ref mirrors. */
import { readFileSync } from "node:fs"

import { checkRefMirrors, type TableDecl } from "./ref-mirrors.ts"
import { collectSourceFiles, stripComments } from "./source-scan.ts"

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
  const declarations = collectSourceFiles("packages").flatMap((file) =>
    extractDeclarations(file, readFileSync(file, "utf8")),
  )

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
