#!/usr/bin/env node
/** Runner for the public npm surface closure gate. See public-surface.ts. */
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import {
  checkPublicSurface,
  formatSurfaceViolations,
  type SurfaceManifest,
} from "./public-surface.ts"

const here = dirname(fileURLToPath(import.meta.url))
const allowlistPath = join(here, "public-surface.json")

function main(): void {
  const manifests: SurfaceManifest[] = readdirSync("packages", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join("packages", entry.name, "package.json"))
    .flatMap((file) => {
      try {
        return [JSON.parse(readFileSync(file, "utf8")) as SurfaceManifest]
      } catch {
        return []
      }
    })

  const allowlistFile = JSON.parse(readFileSync(allowlistPath, "utf8")) as {
    extensionSurface: string[]
    connectContractSurface: string[]
  }
  const allowlist = [...allowlistFile.extensionSurface, ...allowlistFile.connectContractSurface]

  const report = checkPublicSurface(manifests, allowlist)
  const violations = formatSurfaceViolations(report)

  if (violations.length > 0) {
    console.error("Public npm surface check failed.\n")
    for (const violation of violations) console.error(`  - ${violation}`)
    console.error("\nSee issue #4059 for what this surface is and why it is closed.")
    process.exit(1)
  }

  console.log(
    `verify:public-surface: ${allowlist.length} packages on the public surface, ` +
      `closure is ${report.closureSize} — closed.`,
  )
}

main()
