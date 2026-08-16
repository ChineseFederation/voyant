#!/usr/bin/env node
import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

const root = process.cwd()
const forbiddenApplicationFiles = [
  "apps/operator/src/api/openapi.ts",
  "apps/operator/src/api/openapi.test.ts",
]
for (const file of forbiddenApplicationFiles) {
  assert(!existsSync(path.join(root, file)), `${file} must remain package-owned`)
}

const runtimeFile = "packages/runtime/src/openapi.ts"
const runtimeSource = readFileSync(path.join(root, runtimeFile), "utf8")

const prohibited = [
  "PACKAGE_OPENAPI_ROOTS",
  "partitionByModule",
  "mergeOperatorOpenApiModuleDocuments",
  "compatibilityModules",
  "REPO_ROOT",
]
for (const token of prohibited) {
  assert(
    !runtimeSource.includes(token),
    `${runtimeFile} must not restore OpenAPI compatibility token ${token}`,
  )
}
assert(
  !runtimeSource.includes("packages/"),
  `${runtimeFile} must not map package-owned OpenAPI roots`,
)
assert(
  runtimeSource.includes("buildSelectedGraphOpenApiDocuments"),
  `${runtimeFile} must build from selected graph claims`,
)
assert(
  runtimeSource.includes("mergeSelectedGraphOpenApiDocuments"),
  `${runtimeFile} must merge selected graph documents`,
)

const applicationOpenApi = path.join(root, "apps/operator/openapi")
if (existsSync(applicationOpenApi)) {
  assert.equal(
    findJsonFiles(applicationOpenApi).length,
    0,
    "Operator must not own committed OpenAPI JSON",
  )
}

const packageRoots = readdirSync(path.join(root, "packages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(root, "packages", entry.name))
  .filter((packageRoot) => existsSync(path.join(packageRoot, "openapi")))

let documentCount = 0
const artifacts = new Map()
for (const packageRoot of packageRoots) {
  const packageJson = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"))
  const relativeRoot = path.relative(root, packageRoot)
  assert(packageJson.files?.includes("openapi"), `${relativeRoot} must publish its OpenAPI root`)
  const sourceExports = new Set(flattenStrings(packageJson.exports))
  const publishedExports = new Set(flattenStrings(packageJson.publishConfig?.exports))

  for (const file of findJsonFiles(path.join(packageRoot, "openapi"))) {
    JSON.parse(readFileSync(file, "utf8"))
    const artifact = `./${path.relative(packageRoot, file).replaceAll(path.sep, "/")}`
    assert(sourceExports.has(artifact), `${relativeRoot} must export ${artifact}`)
    assert(publishedExports.has(artifact), `${relativeRoot} must publish ${artifact}`)
    const [surface, filename] = path
      .relative(path.join(packageRoot, "openapi"), file)
      .split(path.sep)
    const document = filename?.replace(/\.json$/, "")
    const key = `${surface}:${document}`
    assert(!artifacts.has(key), `${key} is owned by both ${artifacts.get(key)} and ${relativeRoot}`)
    artifacts.set(key, relativeRoot)
    documentCount += 1
  }
}

assert(documentCount > 0, "expected package-owned OpenAPI documents")
const manifestClaims = readManifestOpenApiClaims(
  readdirSync(path.join(root, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const sourceRoot = path.join(root, "packages", entry.name, "src")
      if (!existsSync(sourceRoot)) return []
      return readdirSync(sourceRoot, { withFileTypes: true })
        .filter(
          (sourceEntry) =>
            sourceEntry.isFile() && /^voyant(?:-[a-z0-9-]+)?\.ts$/.test(sourceEntry.name),
        )
        .map((sourceEntry) => path.join(sourceRoot, sourceEntry.name))
    }),
)
for (const document of manifestClaims) {
  assert(artifacts.has(document), `selected graph manifest document ${document} has no artifact`)
}
for (const document of artifacts.keys()) {
  assert(manifestClaims.has(document), `package OpenAPI artifact ${document} has no manifest claim`)
}
console.log(
  `check-operator-openapi-authority: OK (${documentCount} package-owned documents, ${manifestClaims.size} selected graph claims)`,
)

function findJsonFiles(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return findJsonFiles(target)
    return entry.isFile() && entry.name.endsWith(".json") ? [target] : []
  })
}

function flattenStrings(value) {
  if (typeof value === "string") return [value]
  if (!value || typeof value !== "object") return []
  return Object.values(value).flatMap(flattenStrings)
}

function readManifestOpenApiClaims(files) {
  const claims = new Set()
  const declaration =
    /(^\s*)\{\n\1 {2}id: "[^"]+",[\s\S]*?^\1 {2}surface: "([^"]+)",[\s\S]*?^\1 {2}openapi: \{ document: "([^"]+)" \},/gm
  for (const file of files) {
    const source = readFileSync(file, "utf8")
    for (const match of source.matchAll(declaration)) {
      // The public surface's documents live under `openapi/public-api/`
      // since the storefront entity was retired (voyant#4624).
      const surface = match[2] === "public" ? "public-api" : match[2]
      if (surface === "admin" || surface === "public-api") {
        claims.add(`${surface}:${match[3]}`)
      }
    }
  }
  return claims
}
