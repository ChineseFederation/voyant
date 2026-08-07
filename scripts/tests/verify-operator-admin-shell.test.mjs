import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { describe, it } from "vitest"

const execFileAsync = promisify(execFile)
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..")
const VERIFIER = path.join(ROOT, "scripts/verify-operator-admin-shell.mjs")
const HTML =
  '<!doctype html><link rel="icon" href="/favicon.png"><script type="module" src="/assets/client.js"></script>\n'

describe("operator admin shell verifier", () => {
  it("accepts a receipt-backed portable HTML document", async () => {
    const root = await fixture()
    await assert.doesNotReject(() => verify(root))
  })

  it("rejects an entry document absent from the receipt", async () => {
    const root = await fixture((manifest) => {
      manifest.files = manifest.files.filter((file) => file.path !== "index.html")
    })
    await rejects(root, "entry document is absent from the receipt")
  })

  it("rejects a mismatched document fallback", async () => {
    const root = await fixture((manifest) => {
      manifest.routing.documentFallback = "client/other.html"
    })
    await rejects(root, "routing must preserve API passthrough and document fallback")
  })

  it("rejects an entry document outside client", async () => {
    const root = await fixture((manifest) => {
      manifest.entryDocument = "../index.html"
      manifest.routing.documentFallback = "../index.html"
    })
    await rejects(root, "must be a normalized HTML path inside client")
  })

  it("rejects an entry document not declared as text/html", async () => {
    const root = await fixture((manifest) => {
      manifest.files.find((file) => file.path === "index.html").mediaType = "text/plain"
    })
    await rejects(root, "must have media type text/html")
  })

  it("rejects document assets absent from the receipt", async () => {
    const root = await fixture((manifest) => {
      manifest.files = manifest.files.filter((file) => file.path !== "assets/client.js")
    })
    await rejects(root, "references a file absent from the receipt: assets/client.js")
  })

  it("rejects cross-origin document assets even when their path is receipted", async () => {
    const root = await fixture(
      () => {},
      HTML.replace("/assets/client.js", "https://evil.test/assets/client.js"),
    )
    await rejects(root, "has a cross-origin reference")
  })
})

async function fixture(mutate = () => {}, html = HTML) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-admin-shell-"))
  await mkdir(path.join(root, "client/assets"), { recursive: true })
  const contents = new Map([
    ["index.html", html],
    ["favicon.png", "png"],
    ["assets/client.js", "console.log('boot')\n"],
  ])
  for (const [relative, contentsForFile] of contents) {
    await writeFile(path.join(root, "client", relative), contentsForFile)
  }
  const files = [...contents].map(([filePath, contentsForFile]) => {
    const bytes = Buffer.from(contentsForFile)
    return {
      path: filePath,
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      mediaType: filePath === "index.html" ? "text/html" : "application/octet-stream",
    }
  })
  const manifest = {
    schemaVersion: "voyant.admin-shell-artifact.v1",
    graphHash: `sha256:${"a".repeat(64)}`,
    uiBuildId: `sha256:${"b".repeat(64)}`,
    apiBasePath: "/api",
    shellBootstrap: { current: 1, minimum: 1 },
    entryDocument: "client/index.html",
    routing: {
      passthroughPrefixes: ["/api/"],
      documentFallback: "client/index.html",
    },
    files,
  }
  mutate(manifest)
  await writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest))
  return root
}

async function verify(root) {
  return execFileAsync(process.execPath, [VERIFIER, root])
}

async function rejects(root, message) {
  await assert.rejects(
    () => verify(root),
    (error) => {
      assert.match(error.stderr, new RegExp(message))
      return true
    },
  )
}
