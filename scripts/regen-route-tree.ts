// @ts-nocheck -- router-generator types do not expose this CLI composition seam yet.
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Generator, getConfig } from "@tanstack/router-generator"

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, "..")
const dirs = ["apps/operator"]

async function run() {
  for (const dir of dirs) {
    const root = resolve(repoRoot, dir)
    console.log(`→ ${dir}`)
    try {
      const config = await getConfig(
        {
          routesDirectory: "./src/routes",
          generatedRouteTree: "./src/routeTree.gen.ts",
        },
        root,
      )
      const generator = new Generator({ config, root })
      await generator.run()
      console.log("   ✓ done")
    } catch (error) {
      console.error("   ✗", (error as Error).message)
    }
  }
}

void run()
