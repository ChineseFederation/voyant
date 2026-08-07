import { createHash } from "node:crypto"
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const OPERATOR = path.join(ROOT, "apps/operator")
const CLIENT = path.join(OPERATOR, "dist/client")
const OUTPUT = path.join(OPERATOR, "dist/admin-shell")
const GRAPH = path.join(OPERATOR, ".voyant/deployment-graph.generated.json")

const revision = process.env.VOYANT_IMAGE_REVISION?.trim() || "unknown"
const imageVersion = process.env.VOYANT_IMAGE_VERSION?.trim() || "development"
const graph = JSON.parse(await readFile(GRAPH, "utf8"))

await rm(OUTPUT, { recursive: true, force: true })
await mkdir(OUTPUT, { recursive: true })
await cp(CLIENT, path.join(OUTPUT, "client"), { recursive: true })

const files = await fingerprintFiles(path.join(OUTPUT, "client"))
const uiBuildId = `sha256:${sha256(JSON.stringify(files))}`
const manifest = {
  schemaVersion: "voyant.admin-shell-artifact.v1",
  sourceRevision: revision,
  imageVersion,
  graphHash: graph.contentHash,
  uiBuildId,
  apiBasePath: "/api",
  shellBootstrap: { current: 1, minimum: 1 },
  entryDocument: "client/index.html",
  routing: {
    passthroughPrefixes: ["/api/", "/.well-known/", "/healthz", "/__voyant/"],
    documentFallback: "client/index.html",
  },
  files,
}
await writeFile(path.join(OUTPUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)

async function fingerprintFiles(root) {
  const files = []
  await walk(root, root, files)
  return files.sort((left, right) => left.path.localeCompare(right.path))
}

async function walk(root, directory, files) {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) await walk(root, absolute, files)
    else if (entry.isFile()) {
      const bytes = await readFile(absolute)
      files.push({
        path: path.relative(root, absolute).split(path.sep).join("/"),
        bytes: bytes.byteLength,
        sha256: sha256(bytes),
      })
    }
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}
