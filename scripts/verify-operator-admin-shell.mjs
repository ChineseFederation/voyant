import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

const root = path.resolve(process.argv[2] ?? "admin-shell")
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"))

if (manifest.schemaVersion !== "voyant.admin-shell-artifact.v1") {
  throw new Error(`Unexpected admin shell schema ${String(manifest.schemaVersion)}.`)
}
if (!/^sha256:[a-f0-9]{64}$/.test(manifest.graphHash ?? "")) {
  throw new Error("Admin shell manifest has no valid graph hash.")
}
if (!/^sha256:[a-f0-9]{64}$/.test(manifest.uiBuildId ?? "")) {
  throw new Error("Admin shell manifest has no valid UI build ID.")
}
if (manifest.apiBasePath !== "/api") {
  throw new Error("Admin shell must use the same-origin /api contract.")
}
if (
  manifest.routing?.documentFallback !== manifest.entryDocument ||
  !manifest.routing?.passthroughPrefixes?.includes("/api/")
) {
  throw new Error("Admin shell routing must preserve API passthrough and document fallback.")
}
if (manifest.shellBootstrap?.current !== 1 || manifest.shellBootstrap?.minimum !== 1) {
  throw new Error("Admin shell compatibility range must describe bootstrap v1.")
}

const entryDocument = validateDocumentPath(manifest.entryDocument, "entryDocument")
const documentFallback = validateDocumentPath(
  manifest.routing?.documentFallback,
  "routing.documentFallback",
)
if (entryDocument !== documentFallback) {
  throw new Error("Admin shell entry document and document fallback must match.")
}

const files = manifest.files ?? []
const paths = new Set()
for (const file of files) {
  validateReceiptPath(file.path)
  if (paths.has(file.path)) throw new Error(`Duplicate admin shell receipt path: ${file.path}`)
  paths.add(file.path)
}

const entryReceiptPath = entryDocument.slice("client/".length)
const entryReceipt = files.find((file) => file.path === entryReceiptPath)
if (!entryReceipt) throw new Error("Admin shell entry document is absent from the receipt.")
if (entryReceipt.mediaType !== "text/html") {
  throw new Error("Admin shell entry document must have media type text/html.")
}

for (const file of files) {
  const bytes = await readFile(path.join(root, "client", file.path))
  const digest = createHash("sha256").update(bytes).digest("hex")
  if (digest !== file.sha256 || bytes.byteLength !== file.bytes) {
    throw new Error(`Admin shell file identity mismatch: ${file.path}`)
  }
}

const document = await readFile(path.join(root, entryDocument), "utf8")
if (!/^\s*<!doctype html>/i.test(document)) {
  throw new Error("Admin shell entry document is not HTML.")
}
for (const reference of document.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
  const resolved = new URL(reference[1], "https://admin-shell.invalid")
  const pathname = resolved.pathname
  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    throw new Error(`Admin shell document has a non-local reference: ${reference[1]}`)
  }
  if (resolved.origin !== "https://admin-shell.invalid") {
    throw new Error(`Admin shell document has a cross-origin reference: ${reference[1]}`)
  }
  const receiptPath = decodeURIComponent(pathname.slice(1))
  if (!paths.has(receiptPath)) {
    throw new Error(
      `Admin shell document references a file absent from the receipt: ${receiptPath}`,
    )
  }
}

console.log(
  `Verified admin shell ${manifest.uiBuildId} for ${manifest.graphHash} (${manifest.files.length} files).`,
)

function validateDocumentPath(value, field) {
  if (
    typeof value !== "string" ||
    !value.startsWith("client/") ||
    value === "client/" ||
    path.posix.normalize(value) !== value ||
    path.posix.extname(value).toLowerCase() !== ".html"
  ) {
    throw new Error(`Admin shell ${field} must be a normalized HTML path inside client/.`)
  }
  return value
}

function validateReceiptPath(value) {
  if (
    typeof value !== "string" ||
    !value ||
    value.startsWith("/") ||
    path.posix.normalize(value) !== value ||
    value.startsWith("../")
  ) {
    throw new Error(`Invalid admin shell receipt path: ${String(value)}`)
  }
}
