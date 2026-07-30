/** Shared source scanning for the schema checks. */
import { readdirSync } from "node:fs"
import { extname, join, sep } from "node:path"

import ts from "typescript"

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"])

export function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name).split(sep).join("/")
    if (entry.isDirectory()) {
      return entry.name === "dist" || entry.name === "node_modules" ? [] : collectSourceFiles(path)
    }
    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name))) return []
    return /\.(test|spec)\.tsx?$/.test(path) || path.includes("/tests/") ? [] : [path]
  })
}

/**
 * Blanks comment ranges, preserving offsets. Without this a `@example` JSDoc
 * declaring a pgTable is read as a real declaration — see ref-mirrors.
 */
export function stripComments(text: string): string {
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
