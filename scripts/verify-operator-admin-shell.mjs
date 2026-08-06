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

for (const file of manifest.files ?? []) {
  const bytes = await readFile(path.join(root, "client", file.path))
  const digest = createHash("sha256").update(bytes).digest("hex")
  if (digest !== file.sha256 || bytes.byteLength !== file.bytes) {
    throw new Error(`Admin shell file identity mismatch: ${file.path}`)
  }
}

console.log(
  `Verified admin shell ${manifest.uiBuildId} for ${manifest.graphHash} (${manifest.files.length} files).`,
)
