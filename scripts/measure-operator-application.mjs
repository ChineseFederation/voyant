import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, extname, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { gzipSync } from "node:zlib"

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const rootFlagIndex = process.argv.indexOf("--root")
const root =
  rootFlagIndex >= 0 && process.argv[rootFlagIndex + 1]
    ? resolve(process.argv[rootFlagIndex + 1])
    : scriptRoot
const operatorRoot = join(root, "apps/operator")
const requireBuild = process.argv.includes("--require-build") || process.argv.includes("--check")
const check = process.argv.includes("--check")
const serverEntry = join(operatorRoot, "dist/server/server.js")
const clientRoot = join(operatorRoot, "dist/client")
const portableShellEntry = join(operatorRoot, "dist/admin-shell/client/index.html")

if (requireBuild && (!existsSync(serverEntry) || !existsSync(clientRoot))) {
  console.error(
    "measure-operator-application: build output is missing; run the Operator build first",
  )
  process.exit(1)
}

const serverFiles = existsSync(dirname(serverEntry))
  ? walk(dirname(serverEntry)).filter((file) => extname(file) === ".js")
  : []
const clientFiles = existsSync(clientRoot)
  ? walk(clientRoot).filter((file) => extname(file) === ".js")
  : []
const adminChunks = clientFiles.filter((file) => /(?:admin|route|page|chunk)/i.test(file))
const configSource = readFileSync(join(operatorRoot, "voyant.config.ts"), "utf8")
const checkedInMetadataNames = [
  "env.d.ts",
  "tsconfig.json",
  "tsconfig.client.json",
  "tsconfig.server.json",
  "turbo.json",
  "vite.config.ts",
  "vitest.config.ts",
]
const generatedArtifactNames = [
  "deployment-artifacts.generated.json",
  "deployment-graph.generated.json",
  "migration-plan.generated.json",
  "product-bom.generated.json",
]
const generatedMetadataRoot = existsSync(join(operatorRoot, ".voyant"))
  ? join(operatorRoot, ".voyant")
  : join(operatorRoot, "dist/.voyant")
const checkedInMetadata = checkedInMetadataNames
  .map((file) => join(operatorRoot, file))
  .filter(existsSync)
const generatedMetadata = generatedArtifactNames
  .map((file) => join(generatedMetadataRoot, file))
  .filter(existsSync)

const report = {
  schemaVersion: "voyant.operator-application-performance.v1",
  authoredConfig: {
    lines: configSource.trim().split(/\r?\n/).length,
    repeatsStandardModules: /\bmodules\s*:/.test(configSource),
    repeatsStandardExtensions: /\bextensions\s*:/.test(configSource),
  },
  metadata: {
    checkedIn: summarizeMetadata(checkedInMetadata),
    generated: summarizeMetadata(generatedMetadata),
  },
  server: summarize(serverFiles),
  admin: summarize(adminChunks),
  client: summarize(clientFiles),
  portableShell: existsSync(portableShellEntry) ? summarizePortableShell(portableShellEntry) : null,
  boot: existsSync(serverEntry) ? measureBoot(serverEntry) : null,
}

console.log(JSON.stringify(report, null, 2))

if (check) {
  const failures = []
  if (report.authoredConfig.lines > 20) failures.push("voyant.config.ts exceeds 20 lines")
  if (report.authoredConfig.repeatsStandardModules) failures.push("config repeats standard modules")
  if (report.authoredConfig.repeatsStandardExtensions)
    failures.push("config repeats standard extensions")
  if (report.metadata.checkedIn.files > 0) failures.push("application copies checked-in metadata")
  if (report.metadata.generated.files !== generatedArtifactNames.length) {
    failures.push("generated .voyant metadata is incomplete")
  }
  if (report.server.gzipBytes > 25 * 1024 * 1024)
    failures.push("server gzip closure exceeds 25 MiB")
  if (report.admin.gzipBytes > 15 * 1024 * 1024) failures.push("admin gzip chunks exceed 15 MiB")
  if (report.admin.largestGzipBytes > 2 * 1024 * 1024) {
    failures.push("largest admin gzip chunk exceeds 2 MiB")
  }
  if (!report.portableShell) failures.push("portable admin shell is missing")
  if ((report.portableShell?.initialPreloads.gzipBytes ?? 0) > 430 * 1024) {
    failures.push("portable admin shell initial preloads exceed 430 KiB gzip")
  }
  if ((report.portableShell?.initialPreloads.files ?? Number.POSITIVE_INFINITY) > 20) {
    failures.push("portable admin shell initial preloads exceed 20 JavaScript requests")
  }
  if (
    report.portableShell?.initialPreloads.paths.some((path) => /\/recharts-[^/]+\.js$/.test(path))
  ) {
    failures.push("portable admin shell eagerly preloads Recharts")
  }
  if (!report.boot?.ok || report.boot.milliseconds > 5_000) {
    failures.push("cold Node module boot exceeds 5000 ms or failed")
  }
  if (failures.length > 0) {
    for (const failure of failures) console.error(`- ${failure}`)
    process.exit(1)
  }
}

function summarizeMetadata(files) {
  return {
    files: files.length,
    bytes: files.reduce((total, file) => total + statSync(file).size, 0),
    paths: files.map((file) => relative(operatorRoot, file)).sort(),
  }
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

function summarize(files) {
  const entries = files.map((file) => {
    const contents = readFileSync(file)
    return {
      file: relative(operatorRoot, file),
      bytes: statSync(file).size,
      gzipBytes: gzipSync(contents).byteLength,
    }
  })
  return {
    files: entries.length,
    bytes: entries.reduce((total, entry) => total + entry.bytes, 0),
    gzipBytes: entries.reduce((total, entry) => total + entry.gzipBytes, 0),
    largestGzipBytes: Math.max(0, ...entries.map((entry) => entry.gzipBytes)),
  }
}

function summarizePortableShell(entryDocument) {
  const document = readFileSync(entryDocument, "utf8")
  const hrefs = [...document.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g)].map(
    (match) => match[1],
  )
  const files = hrefs.map((href) => {
    const file = join(dirname(entryDocument), href.startsWith("/") ? href.slice(1) : href)
    if (!existsSync(file)) throw new Error(`portable shell preload is missing: ${href}`)
    return file
  })
  return {
    initialPreloads: {
      ...summarize(files),
      paths: files.map((file) => relative(operatorRoot, file)).sort(),
    },
  }
}

function measureBoot(entry) {
  const program = `const start=performance.now();await import(${JSON.stringify(
    pathToFileURL(entry).href,
  )});console.log(JSON.stringify({milliseconds:performance.now()-start}))`
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
    cwd: operatorRoot,
    encoding: "utf8",
    timeout: 15_000,
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ?? ["postgres", "://measure:measure@127.0.0.1/measure"].join(""),
    },
  })
  if (result.status !== 0) {
    return {
      ok: false,
      milliseconds: null,
      error: (result.stderr || result.error?.message || "unknown boot failure").trim(),
    }
  }
  try {
    const parsed = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1))
    return { ok: true, milliseconds: Math.round(parsed.milliseconds * 10) / 10 }
  } catch {
    return { ok: false, milliseconds: null, error: "boot probe returned invalid JSON" }
  }
}
