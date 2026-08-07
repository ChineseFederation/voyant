import { createHash } from "node:crypto"
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const OPERATOR = path.join(ROOT, "apps/operator")
const CLIENT = path.join(OPERATOR, "dist/client")
const OUTPUT = path.join(OPERATOR, "dist/admin-shell")
const GRAPH = path.join(OPERATOR, ".voyant/deployment-graph.generated.json")
const SERVER_ASSETS = path.join(OPERATOR, "dist/server/assets")

const revision = process.env.VOYANT_IMAGE_REVISION?.trim() || "unknown"
const imageVersion = process.env.VOYANT_IMAGE_VERSION?.trim() || "development"
const graph = JSON.parse(await readFile(GRAPH, "utf8"))

await rm(OUTPUT, { recursive: true, force: true })
await mkdir(OUTPUT, { recursive: true })
await cp(CLIENT, path.join(OUTPUT, "client"), { recursive: true })
await writePortableEntryDocument(path.join(OUTPUT, "client/index.html"))

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
        mediaType: mediaTypeFor(entry.name),
      })
    }
  }
}

async function writePortableEntryDocument(output) {
  const entries = await readdir(SERVER_ASSETS)
  const manifestFiles = entries.filter((entry) => /^_tanstack-start-manifest.*\.js$/.test(entry))
  if (manifestFiles.length !== 1) {
    throw new Error(`Expected one TanStack Start manifest, found ${manifestFiles.length}.`)
  }

  const manifestModule = await import(
    `${pathToFileURL(path.join(SERVER_ASSETS, manifestFiles[0])).href}?admin-shell`
  )
  const rootRoute = manifestModule.tsrStartManifest()?.routes?.__root__
  if (!rootRoute) throw new Error("TanStack Start manifest has no root route assets.")

  const styles = (rootRoute.css ?? []).map(assetHref)
  const preloads = rootRoute.preloads ?? []
  const scripts = (rootRoute.scripts ?? []).map((script) => script.attrs?.src).filter(Boolean)
  if (scripts.length === 0) throw new Error("TanStack Start manifest has no client entry script.")

  const referenced = ["/favicon.png", ...styles, ...preloads, ...scripts]
  for (const href of referenced) {
    const relative = href.startsWith("/") ? href.slice(1) : href
    if (!relative || relative.includes("?") || relative.includes("#")) {
      throw new Error(`Admin shell document has a non-file asset reference: ${href}`)
    }
    await readFile(path.join(CLIENT, relative))
  }

  const document = [
    "<!doctype html>",
    '<html lang="en" data-voyant-portable-shell="1">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="robots" content="noindex,nofollow">',
    '<meta name="theme-color" content="#ffffff">',
    "<title>Voyant</title>",
    '<link rel="icon" type="image/png" href="/favicon.png">',
    ...styles.map((href) => `<link rel="stylesheet" href="${escapeAttribute(href)}">`),
    ...preloads.map((href) => `<link rel="modulepreload" href="${escapeAttribute(href)}">`),
    '<script>(function(){globalThis.__zod_globalConfig=Object.assign({},globalThis.__zod_globalConfig,{jitless:true});var t=localStorage.getItem("theme");if(t==="dark"||(!t||t==="system")&&matchMedia("(prefers-color-scheme:dark)").matches){document.documentElement.classList.add("dark")}var l=localStorage.getItem("admin-locale")||(navigator.language||"en");l=l.toLowerCase().split("-")[0];document.documentElement.lang=l==="ro"?"ro":"en"})()</script>',
    "</head>",
    '<body class="min-h-screen bg-background font-sans antialiased">',
    ...scripts.map((src) => `<script type="module" src="${escapeAttribute(src)}"></script>`),
    "</body>",
    "</html>",
    "",
  ].join("\n")
  await writeFile(output, document)
}

function assetHref(asset) {
  return typeof asset === "string" ? asset : asset.href
}

function escapeAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
}

function mediaTypeFor(fileName) {
  const extension = path.extname(fileName).toLowerCase()
  return (
    {
      ".css": "text/css",
      ".html": "text/html",
      ".js": "text/javascript",
      ".json": "application/json",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
    }[extension] ?? "application/octet-stream"
  )
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}
