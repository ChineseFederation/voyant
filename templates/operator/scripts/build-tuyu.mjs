import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { build } from "vite"

process.env.TUYU_BOOKING_RUNTIME = "1"
const require = createRequire(import.meta.url)
const nitroPackage = require.resolve("nitro/package.json")
const nitroCli = path.join(path.dirname(nitroPackage), "dist/cli/index.mjs")
const configuredOutput = process.env.TUYU_VOYANT_OUTPUT_DIR
if (!configuredOutput || !path.isAbsolute(configuredOutput)) {
  throw new Error("TUYU_VOYANT_OUTPUT_DIR must be an absolute Console work directory")
}
const outputDir = path.resolve(configuredOutput)
const sourceOutputDir = path.resolve(".output")

if (outputDir === sourceOutputDir) {
  throw new Error("Voyant output must not use the imported source directory")
}

await fs.rm(outputDir, { recursive: true, force: true })
await fs.mkdir(outputDir, { recursive: true })
await fs.rm(sourceOutputDir, { recursive: true, force: true })

// A plain Vite build emits TanStack assets but does not invoke Nitro's
// production bundler. The official CLI creates the self-contained Node entry.
try {
  execFileSync(
    process.execPath,
    [nitroCli, "build", "--preset=node-server", "--builder=vite", "."],
    { env: process.env, stdio: "inherit" },
  )
  await fs.access(path.join(outputDir, "server", "index.mjs"))
  await build({
    configFile: false,
    build: {
      ssr: path.resolve("scripts/migrate.ts"),
      outDir: path.join(outputDir, "migration"),
      emptyOutDir: false,
      rollupOptions: { output: { entryFileNames: "migrate.mjs" } },
    },
    ssr: { noExternal: true },
  })
  await fs.cp("migrations", path.join(outputDir, "migrations"), { recursive: true })
} finally {
  // A Nitro regression must never leave generated files in imported sources.
  await fs.rm(sourceOutputDir, { recursive: true, force: true })
}
