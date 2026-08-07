import { resolve } from "node:path"
import { pathToFileURL } from "node:url"

// Docker copies this entrypoint from apps/operator/scripts to /app while the
// local packaged layout executes it with apps/operator as the working
// directory. Resolve the built server from that stable project/image root;
// an import relative to this file points at /dist after the Docker copy.
const serverEntry = pathToFileURL(resolve("dist/server/server.js")).href
const server = (await import(serverEntry)).default

if (typeof server?.start !== "function") {
  throw new Error("The built operator server does not expose its start contract.")
}

await server.start({ hostProfile: "api-only" })
