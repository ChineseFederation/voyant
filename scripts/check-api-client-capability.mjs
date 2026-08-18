#!/usr/bin/env node
/**
 * The PK/SK capability line must be a COMPILE error, not a runtime 403.
 *
 * `verify:openapi-drift` already regenerates the client and diffs it, so this
 * does not re-check the derivation. It checks the property the derivation
 * exists for, which no data rule can express: that a secret-only operation is
 * absent from the publishable client's type, so calling it does not compile.
 *
 * Both polarities, because only the pair means anything — a `PublishablePaths`
 * that resolved to `never` would reject the violation and the allowed call
 * alike, and would look exactly like success if only the violation were run.
 *
 * The fixtures are held in memory rather than written into the package. A
 * killed run must not leave a stray `.ts` behind for `git add -A` to commit
 * (voyant#4627 lost time to exactly that with a boundary probe).
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import ts from "typescript"

import { clientDocuments } from "./lib/api-client-documents.mjs"
import { keyKindForPath, readApiBundles } from "./lib/openapi-key-kind.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const { clients } = JSON.parse(readFileSync(path.join(root, "scripts/api-clients.json"), "utf8"))

const COMPILER_OPTIONS = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  noUncheckedIndexedAccess: true,
  noEmit: true,
  skipLibCheck: true,
}

/** Compile `source` as if it sat at `filePath`, without creating that file. */
function compile(filePath, source) {
  const host = ts.createCompilerHost(COMPILER_OPTIONS, true)
  const readFile = host.readFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  const getSourceFile = host.getSourceFile.bind(host)

  host.fileExists = (name) => (name === filePath ? true : fileExists(name))
  host.readFile = (name) => (name === filePath ? source : readFile(name))
  host.getSourceFile = (name, languageVersion, ...rest) =>
    name === filePath
      ? ts.createSourceFile(name, source, languageVersion, true)
      : getSourceFile(name, languageVersion, ...rest)

  const program = ts.createProgram([filePath], COMPILER_OPTIONS, host)
  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file?.fileName === filePath)
}

const format = (diagnostics) =>
  diagnostics
    .map((d) => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`)
    .join("\n    ")

/** A publishable and a secret-only path that share an HTTP method. */
function pickProbePaths(client, bundles) {
  // Resolved through the shared module, so this exercises the same surface the
  // client is generated from rather than a document that merely resembles it.
  const [document] = clientDocuments(client).documents
  const parsed =
    typeof document === "object"
      ? document
      : JSON.parse(readFileSync(path.join(root, document), "utf8"))
  const byKind = { publishable: [], secret: [] }
  for (const [route, item] of Object.entries(parsed.paths ?? {})) {
    for (const method of Object.keys(item ?? {})) {
      if (!["get", "post", "put", "patch", "delete"].includes(method.toLowerCase())) continue
      byKind[keyKindForPath(bundles, route)]?.push({ route, method: method.toLowerCase() })
    }
  }
  for (const secret of byKind.secret) {
    const allowed = byKind.publishable.find((entry) => entry.method === secret.method)
    if (allowed) return { allowed, secret }
  }
  return null
}

const bundles = readApiBundles(
  JSON.parse(
    readFileSync(path.join(root, "apps/operator/.voyant/deployment-graph.generated.json"), "utf8"),
  ),
)

let checked = 0
for (const client of clients) {
  if (!client.keyKinds) continue
  const probes = pickProbePaths(client, bundles)
  if (!probes) {
    console.error(
      `check-api-client-capability: ${client.outDir} has no secret and publishable path sharing a ` +
        `method, so the boundary cannot be exercised. Widen the probe or drop keyKinds.`,
    )
    process.exit(1)
  }

  const { allowed, secret } = probes
  const fixturePath = path.join(root, client.outDir, "__capability_probe__.ts")
  const preamble = `import createClient from "openapi-fetch"
import type { PublishablePaths } from "./key-kind.js"
const pk = createClient<PublishablePaths>({ baseUrl: "https://example.invalid" })
`
  // The PATH must stay a literal — it is the thing under test. Only the options
  // are cast, so a required body or param cannot fail the allowed case for a
  // reason that has nothing to do with credentials. Casting the path instead
  // made this check pass against a client that enforced nothing.
  const call = (entry) =>
    `void pk.${entry.method.toUpperCase()}(${JSON.stringify(entry.route)}, {} as never)\n`

  const allowedDiagnostics = compile(fixturePath, preamble + call(allowed))
  if (allowedDiagnostics.length > 0) {
    console.error(
      `check-api-client-capability: a PUBLISHABLE operation does not compile against ` +
        `${client.outDir}. The subset is too narrow, which would make the violation check vacuous.\n` +
        `  ${allowed.method.toUpperCase()} ${allowed.route}\n    ${format(allowedDiagnostics)}`,
    )
    process.exit(1)
  }

  const violationDiagnostics = compile(fixturePath, preamble + call(secret))
  if (violationDiagnostics.length === 0) {
    console.error(
      `check-api-client-capability: ${secret.method.toUpperCase()} ${secret.route} is secret-only, ` +
        `but it COMPILES against the publishable client in ${client.outDir}. The capability line ` +
        `is not enforced in the types — a browser credential can reach it with no type error.`,
    )
    process.exit(1)
  }

  checked += 1
  console.log(
    `  ${client.outDir}: ${allowed.method.toUpperCase()} ${allowed.route} compiles; ` +
      `${secret.method.toUpperCase()} ${secret.route} does not`,
  )
}

console.log(`check-api-client-capability: ${checked} client(s) enforce the PK/SK line in types`)
