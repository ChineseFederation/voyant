import { readdirSync, readFileSync } from "node:fs"
import { extname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const ignoredDirectories = new Set([
  // Gitignored agent scratch and worktrees. A checkout of another branch
  // living here is not this tree's source, and scanning it fails the check
  // locally for content that CI never sees.
  ".claude",
  ".git",
  ".next",
  ".turbo",
  ".wrangler",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
])
const ignored = new Set([
  "docs/adr/0013-single-server-api-runtime.md",
  "scripts/check-api-runtime-vocabulary.mjs",
])
const textExtensions = new Set([
  ".cjs",
  ".js",
  ".json",
  ".jsonc",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
])
const forbidden = [
  new RegExp(`\\b[A-Za-z0-9_]*${"Hono"}(?:Module|Extension|Bundle)[A-Za-z0-9_]*\\b`),
  new RegExp(`\\bLazy${"Hono"}Routes\\b`),
  new RegExp(`\\b(?:Graph)?Mcp${"Hono"}App(?:Options)?\\b`),
  new RegExp(`${"hono"}-module`),
  new RegExp(`${"hono"}-api-dispatch`),
  new RegExp(`\\b${"Hono"} (?:module|extension|bundle|route contribution)s?\\b`),
  /\bdefault HTTP transport adapter\b/,
  new RegExp(`\\b${"Hono"} transport contributions?\\b`),
  new RegExp(`\\bsuch as ${"Hono"} or Next\\.js\\b`),
  new RegExp(`\\b${"Hono"} variant\\b`),
]

function findTextFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...findTextFiles(join(directory, entry.name)))
      }
      continue
    }
    if (entry.isFile() && textExtensions.has(extname(entry.name))) {
      files.push(relative(root, join(directory, entry.name)))
    }
  }
  return files
}

const files = findTextFiles(root)
  .filter((file) => !file.endsWith("/CHANGELOG.md"))
  .filter((file) => !ignored.has(file))

const violations = []
for (const file of files) {
  const source = readFileSync(join(root, file), "utf8")
  const lines = source.split("\n")
  for (let index = 0; index < lines.length; index += 1) {
    if (forbidden.some((pattern) => pattern.test(lines[index]))) {
      violations.push(`${file}:${index + 1}: ${lines[index].trim()}`)
    }
  }
}

if (violations.length > 0) {
  console.error("Server API vocabulary check failed:")
  for (const violation of violations) console.error(`  - ${violation}`)
  console.error(
    "Use ApiModule, ApiExtension, ApiBundle, LazyApiRoutes, and ./api-runtime. " +
      "Reserve Hono names for the concrete implementation.",
  )
  process.exit(1)
}

console.log("check-api-runtime-vocabulary: OK")
