// agent-quality: file-size exception -- owner: runtime; the isolated pack, install, build, start, browser, and HMR flow is one end-to-end acceptance contract.
import assert from "node:assert/strict"
import { execFile, execFileSync, spawn } from "node:child_process"
import { once } from "node:events"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import { createConnection, createServer as createNetServer } from "node:net"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const frontendSingletonRoots = [
  "@tanstack/react-query",
  "@tanstack/react-router",
  "react",
  "react-dom",
]

test("packaged minimal starter serves project API and SSR routes", {
  timeout: 420_000,
}, async (t) => {
  const keepArtifacts = process.env.VOYANT_KEEP_ARTIFACTS === "1"
  const keepRoot = join(tmpdir(), "voyant-minimal-starter-acceptance-keep")
  if (keepArtifacts) {
    rmSync(keepRoot, { recursive: true, force: true })
    mkdirSync(keepRoot, { recursive: true })
  }
  const root = keepArtifacts
    ? keepRoot
    : mkdtempSync(join(tmpdir(), "voyant-minimal-starter-acceptance-"))
  const out = join(root, "out")
  const app = join(root, "app")
  try {
    const publishedPackages = await packPublishedPackages(join(root, "published-packages"))
    exec(
      process.execPath,
      ["scripts/package-starters.mjs", "--version", "0.0.0-test", "--out-dir", out],
      repoRoot,
    )
    mkdirSync(app, { recursive: true })
    exec(
      "tar",
      ["-xzf", join(out, "voyant-starter-operator-0.0.0-test.tar.gz"), "-C", app],
      repoRoot,
    )
    const releasePeerFixtures = useInstalledToolingArtifacts(app, publishedPackages)
    exec(
      "pnpm",
      [
        "install",
        "--prefer-offline",
        "--ignore-scripts",
        "--ignore-workspace",
        "--config.frozen-lockfile=false",
      ],
      app,
    )
    removeReleasePeerFixtures(app, releasePeerFixtures)
    assertStrictConsumerLayout(app)
    assertPublishedPackageLayout(app)
    write(app, "src/api/admin/health/route.ts", "export const GET = (c) => c.json({ ok: true })\n")
    write(
      app,
      "src/api/public/starter-proof/route.ts",
      'export const GET = (c) => c.json({ route: "public" })\n',
    )
    write(app, "src/admin/dashboard/index.tsx", 'export default { id: "project.dashboard" }\n')
    write(
      app,
      "src/modules/concierge/index.ts",
      'export default { module: { name: "concierge" } }\n',
    )
    write(
      app,
      "src/subscribers/booking-created.ts",
      'export default { id: "booking.created.audit", eventType: "booking.created", register: () => undefined }\n',
    )
    write(app, "src/acceptance-proof.tsx", acceptanceProofSource("before"))
    write(
      app,
      "vite.config.ts",
      [
        'import { writeFileSync } from "node:fs"',
        "export default {",
        '  build: { outDir: "custom-dist" },',
        // The offline link fixture must expose dependencies of linked workspace sources.
        "  resolve: { alias: {",
        `    "@aws-sdk/client-s3": ${JSON.stringify(resolvePnpmStorePackageEntry("@aws-sdk/client-s3"))},`,
        `    "@aws-sdk/s3-request-presigner": ${JSON.stringify(resolvePnpmStorePackageEntry("@aws-sdk/s3-request-presigner"))},`,
        "  } },",
        "  plugins: [{",
        '    name: "project-vite-config-acceptance",',
        '    enforce: "pre",',
        '    configResolved() { writeFileSync(".voyant/project-vite-plugin.loaded", "ok\\n") },',
        "    transform(code, id) {",
        '      const normalizedId = id.replaceAll("\\\\", "/").split("?", 1)[0]',
        '      if (!normalizedId.endsWith("/.voyant/routes/__root.tsx")) return null',
        '      if (!code.includes("<Outlet />")) throw new Error("Acceptance hook could not find the root outlet")',
        `      return ${JSON.stringify('import AcceptanceProof from "@/acceptance-proof"\n')} + code.replace("<Outlet />", "<AcceptanceProof /><Outlet />")`,
        "    },",
        "  }],",
        "}",
      ].join("\n"),
    )
    const buildOutput = exec("pnpm", ["build"], app)
    assert.ok(!existsSync(join(app, "custom-dist")))
    assert.ok(
      existsSync(join(app, "dist/client")),
      `Build did not emit dist/client.\n${buildOutput}\nProject root: ${readdirSync(app).join(", ")}`,
    )
    assert.ok(existsSync(join(app, "dist/server/server.js")))
    assert.ok(existsSync(join(app, "dist/.voyant/deployment-graph.generated.json")))
    assert.ok(existsSync(join(app, "dist/server/.voyant/deployment-graph.generated.json")))
    assert.equal(readFileSync(join(app, ".voyant/project-vite-plugin.loaded"), "utf8"), "ok\n")

    const graph = JSON.parse(
      readFileSync(join(app, ".voyant/deployment-graph.generated.json"), "utf8"),
    )
    const bom = JSON.parse(readFileSync(join(app, ".voyant/product-bom.generated.json"), "utf8"))
    assert.equal(graph.schemaVersion, "voyant.resolved-graph.v1")
    assert.ok(graph.modules.length > 30)
    const projectApi = graph.modules.find((unit) => unit.localId === "project-api")
    assert.ok(projectApi)
    assert.ok(
      projectApi.api?.some(
        (api) =>
          api.id === "project.api.public.starter-proof" &&
          api.surface === "public" &&
          api.mount === "/starter-proof" &&
          api.methods?.includes("GET"),
      ),
    )
    assert.ok(graph.modules.some((unit) => unit.localId === "project-subscribers-links"))
    assert.ok(graph.modules.some((unit) => unit.localId === "concierge"))
    assert.ok(
      graph.modules.some(
        (unit) =>
          unit.localId === "public-api" &&
          unit.api?.some((api) => api.surface === "public" && api.mount === "/"),
      ),
    )
    assert.equal(bom.productBom.id, "@voyant-travel/operator-standard")
    assert.match(
      readFileSync(join(app, ".voyant/admin/project-admin.generated.ts"), "utf8"),
      /src\/admin\/dashboard\/index/,
    )
    assert.ok(existsSync(join(app, ".voyant/admin/selected-graph-admin.generated.js")))
    assert.ok(existsSync(join(app, ".voyant/admin/selected-graph-admin.generated.d.ts")))
    assert.ok(!existsSync(join(app, ".voyant/admin/selected-graph-admin.generated.ts")))
    const projectRuntime = readFileSync(
      join(app, ".voyant/runtime/project-runtime.generated.ts"),
      "utf8",
    )
    assert.match(projectRuntime, /createRuntimePorts: createGeneratedGraphRuntimePorts/)
    assert.match(projectRuntime, /GENERATED_GRAPH_RUNTIME_CONTRIBUTORS/)
    assert.match(projectRuntime, /@voyant-travel\/public-api\/dist\/runtime-contributor\.js/)
    assert.doesNotMatch(
      projectRuntime,
      /^import .* from "@voyant-travel\/accommodations\/runtime-contributor"/m,
    )
    assert.doesNotMatch(projectRuntime, /createVoyantGraphRuntimePortStubs/)
    assert.match(
      readFileSync(join(app, ".voyant/runtime/project-api.generated.ts"), "utf8"),
      /src\/api\/public\/starter-proof\/route/,
    )
    assert.doesNotMatch(
      readFileSync(join(app, ".voyant/runtime/project-links.generated.ts"), "utf8"),
      /from "@voyant-travel\/accommodations\/standard-links"/,
    )
    exec(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        [
          'import { projectApiModule } from "./.voyant/runtime/project-api.generated.ts"',
          'const response = await projectApiModule.publicRoutes.request("http://local/starter-proof")',
          "if (response.status !== 200) throw new Error('Unexpected status: ' + response.status)",
          "const body = await response.json()",
          "if (body.route !== 'public') throw new Error('Unexpected body: ' + JSON.stringify(body))",
        ].join("; "),
      ],
      app,
      { NODE_OPTIONS: "--conditions=development" },
    )
    exec("pnpm", ["db:migrate"], app, acceptanceEnvironment())

    await t.test("voyant start serves the authored route and rendered SSR", async (modeTest) => {
      await assertVoyantServerMode(app, "start", modeTest)
    })
    await t.test("voyant develop serves the authored route and rendered SSR", async (modeTest) => {
      await assertVoyantServerMode(app, "develop", modeTest)
    })
  } finally {
    if (!keepArtifacts) rmSync(root, { recursive: true, force: true })
    else console.log(`VOYANT_KEEP_ARTIFACTS: retained fixture at ${root}`)
  }
})

async function assertVoyantServerMode(app, mode, t) {
  const port = await reservePort()
  const server = spawnVoyant(app, mode, port)
  const output = captureOutput(server)
  try {
    try {
      await waitForListening("127.0.0.1", port, server, output)
    } catch (error) {
      if (mode !== "start") throw error
      const diagnostic = await diagnosePackagedStart(app)
      throw new Error(`${String(error)}\nDirect packaged runtime diagnostic:\n${diagnostic}`)
    }

    const api = await readResponse(`http://127.0.0.1:${port}/api/v1/public/starter-proof`, {
      headers: { authorization: "Bearer starter-acceptance-internal-key" },
    })
    const ssr = await readResponse(`http://127.0.0.1:${port}/docs`)
    const failures = []

    if (api.status !== 200) {
      failures.push(`project API returned ${api.status}: ${api.body}`)
    } else {
      try {
        assert.deepEqual(JSON.parse(api.body), { route: "public" })
      } catch (error) {
        failures.push(`project API returned an unexpected body: ${api.body}\n${String(error)}`)
      }
    }
    if (ssr.status !== 200) {
      failures.push(`SSR route returned ${ssr.status}: ${ssr.body}`)
    } else {
      if (!ssr.contentType.includes("text/html")) {
        failures.push(`SSR route returned unexpected content-type: ${ssr.contentType}`)
      }
      if (!/<html[\s>]/i.test(ssr.body)) {
        failures.push("SSR route did not return an HTML document")
      }
      if (!/(?:Voyant API|No OpenAPI specs are available)/.test(ssr.body)) {
        failures.push("SSR route did not render the expected project docs content")
      }
    }

    assert.deepEqual(failures, [], `${mode} failed packaged starter HTTP acceptance.\n${output()}`)
    await t.test(
      mode === "develop"
        ? "hydrates and preserves one React identity across authored-source HMR"
        : "hydrates the production client bundle without browser errors",
      async (browserTest) => {
        await assertBrowserHydration(app, port, browserTest, output, { hmr: mode === "develop" })
      },
    )
  } finally {
    await stop(server)
  }
}

function spawnVoyant(app, mode, port) {
  const args = [join(app, "node_modules/@voyant-travel/cli/bin/voyant.mjs"), mode]
  if (mode === "develop") args.push("--host", "127.0.0.1")
  args.push("--port", String(port))
  const env = acceptanceEnvironment()
  assert.doesNotMatch(env.NODE_OPTIONS, /conditions=development|tsx/)
  return spawn(process.execPath, args, {
    cwd: app,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  })
}

async function diagnosePackagedStart(app) {
  const projectRequire = createRequire(join(app, "package.json"))
  const cliStartEntry = projectRequire.resolve("@voyant-travel/cli/commands/start")
  const diagnostic = [
    'import { readFile } from "node:fs/promises"',
    'import { fileURLToPath, pathToFileURL } from "node:url"',
    "const { loadProjectRuntime } = await import(pathToFileURL(process.argv[1]).href)",
    "const runtime = await loadProjectRuntime(process.cwd())",
    "try {",
    "  const handle = await runtime.startVoyantProject({",
    "    projectRoot: process.cwd(),",
    "    port: 0,",
    "    preferBuiltAdminAssets: true,",
    "  })",
    "  await handle.close()",
    '  console.error("Direct packaged runtime start unexpectedly succeeded.")',
    "} catch (error) {",
    "  const stack = error instanceof Error ? error.stack : String(error)",
    "  console.error(stack)",
    "  const frame = stack?.match(/at (file:\\/\\/[^:\\n]+):(\\d+):(\\d+)/)",
    "  if (frame) {",
    '    const lines = (await readFile(fileURLToPath(frame[1]), "utf8")).split("\\n")',
    "    const line = Number(frame[2])",
    "    const start = Math.max(0, line - 9)",
    "    const end = Math.min(lines.length, line + 8)",
    '    console.error("Failing bundled module excerpt:")',
    "    for (let index = start; index < end; index += 1) {",
    '      console.error(String(index + 1).padStart(5, " ") + " | " + lines[index])',
    "    }",
    "  }",
    "  process.exitCode = 1",
    "}",
  ].join("\n")

  return new Promise((resolvePromise) => {
    execFile(
      process.execPath,
      ["--input-type=module", "--eval", diagnostic, cliStartEntry],
      {
        cwd: app,
        env: acceptanceEnvironment(),
        encoding: "utf8",
        timeout: 30_000,
      },
      (error, stdout, stderr) => {
        resolvePromise(
          [stdout, stderr, error && !stderr.includes(error.message) ? error.stack : ""]
            .filter(Boolean)
            .join("\n")
            .trim(),
        )
      },
    )
  })
}

function acceptanceEnvironment() {
  return {
    ...process.env,
    BETTER_AUTH_ADMIN_SECRET: "starter-acceptance-admin-auth-secret",
    BETTER_AUTH_CUSTOMER_SECRET: "starter-acceptance-customer-auth-secret",
    DATABASE_URL:
      process.env.TEST_DATABASE_URL ??
      ["postgresql", "://postgres:postgres@127.0.0.1:5432/voyant_starter_acceptance"].join(""),
    INTERNAL_API_KEY: "starter-acceptance-internal-key",
    NODE_OPTIONS: "--max-old-space-size=6144",
    SESSION_CLAIMS_ADMIN_SECRET: "starter-acceptance-admin-claims-secret",
    SESSION_CLAIMS_CUSTOMER_SECRET: "starter-acceptance-customer-claims-secret",
    VOYANT_CHECKOUT_CAPABILITY_SECRET: "starter-acceptance-checkout-capability-secret",
  }
}

async function readResponse(url, init) {
  const response = await fetch(url, init)
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    body: await response.text(),
  }
}

function useInstalledToolingArtifacts(app, publishedPackages) {
  const packageJsonPath = join(app, "package.json")
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  const authoredDependencies = new Set(Object.keys(packageJson.dependencies))
  for (const dependency of frontendSingletonRoots) {
    assert.equal(
      typeof packageJson.dependencies[dependency],
      "string",
      `Supported packaged starter must directly own ${dependency}`,
    )
  }
  // A Changesets PR references versions that do not exist on npm yet. Admit
  // the complete local candidate closure for install-time peer resolution,
  // then remove synthetic manifest declarations before topology assertions.
  for (const [dependency, archive] of publishedPackages) {
    packageJson.dependencies[dependency] = `file:${archive}`
  }
  packageJson.pnpm = {
    ...packageJson.pnpm,
    overrides: {
      ...packageJson.pnpm?.overrides,
      ...Object.fromEntries(
        [...publishedPackages].map(([name, archive]) => [name, `file:${archive}`]),
      ),
    },
  }
  for (const dependency of ["pg"]) {
    packageJson.dependencies[dependency] = `link:${realpathSync(
      join(repoRoot, "apps/operator/node_modules", dependency),
    )}`
  }
  for (const dependency of ["@voyant-travel/cli", "tsx", "typescript"]) {
    packageJson.devDependencies[dependency] = `link:${realpathSync(
      join(repoRoot, "apps/operator/node_modules", dependency),
    )}`
  }
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)
  return [...publishedPackages.keys()].filter((dependency) => !authoredDependencies.has(dependency))
}

function removeReleasePeerFixtures(app, dependencies) {
  const packageJsonPath = join(app, "package.json")
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  for (const dependency of dependencies) delete packageJson.dependencies[dependency]
  for (const dependency of ["@voyant-travel/admin-app"]) {
    rmSync(join(app, "node_modules", ...dependency.split("/")), { force: true })
  }
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)
}

function assertStrictConsumerLayout(app) {
  const packageJson = JSON.parse(readFileSync(join(app, "package.json"), "utf8"))

  assert.ok(packageJson.dependencies["@voyant-travel/operator-standard"])
  assert.ok(
    packageJson.dependencies["@voyant-travel/admin"],
    "Generated admin runtime imports require the starter to directly own @voyant-travel/admin",
  )
  for (const dependency of frontendSingletonRoots) {
    assert.equal(
      typeof packageJson.dependencies[dependency],
      "string",
      `Packaged starter must directly declare ${dependency}`,
    )
    assert.ok(
      existsSync(join(app, "node_modules", dependency)),
      `Packaged starter did not install ${dependency} at the application root`,
    )
  }
  assert.ok(
    existsSync(join(app, "node_modules/@voyant-travel/admin")),
    "Packaged consumer did not install its direct @voyant-travel/admin runtime dependency",
  )
}

function assertPublishedPackageLayout(app) {
  for (const name of ["@voyant-travel/operator-standard", "@voyant-travel/runtime"]) {
    const packageRoot = realpathSync(join(app, "node_modules", name))
    assert.ok(
      packageRoot.startsWith(`${realpathSync(app)}/`),
      `${name} resolved outside the isolated consumer fixture: ${packageRoot}`,
    )
    assert.ok(existsSync(join(packageRoot, "dist")), `${name} is missing its published dist layout`)
  }
  const operatorRoot = realpathSync(join(app, "node_modules/@voyant-travel/operator-standard"))
  const resolveFromOperator = createRequire(join(operatorRoot, "package.json"))
  assert.doesNotThrow(
    () => resolveFromOperator.resolve("@voyant-travel/identity-react"),
    "Standard Operator consumer cannot resolve its required identity React runtime",
  )
  const dbRuntimeEntry = resolveFromOperator.resolve("@voyant-travel/db/runtime")
  const dbRoot = resolve(dirname(dbRuntimeEntry), "../..")
  const dbManifest = JSON.parse(readFileSync(join(dbRoot, "package.json"), "utf8"))
  assert.equal(dbManifest.exports["./runtime"].import, "./dist/runtime/index.js")
  assert.ok(existsSync(join(dbRoot, "dist/runtime/index.js")))
}

async function packPublishedPackages(root) {
  const selected = JSON.parse(
    exec(
      "pnpm",
      [
        "--filter-prod",
        "@voyant-travel/framework...",
        "--filter-prod",
        "@voyant-travel/runtime...",
        "--filter-prod",
        "@voyant-travel/operator-standard...",
        "--filter-prod",
        "operator...",
        "list",
        "--depth",
        "-1",
        "--json",
      ],
      repoRoot,
    ),
  )
  const workspacePackages = selected.filter(
    (entry) => entry.name?.startsWith("@voyant-travel/") && entry.path,
  )
  assert.ok(workspacePackages.length > 80, "Published Operator closure is unexpectedly small")

  mkdirSync(root, { recursive: true })
  const publishedPackages = new Map(
    await mapConcurrent(workspacePackages, 8, async (entry) => [
      entry.name,
      await packPublishedPackage(root, entry.path),
    ]),
  )
  assert.ok(
    publishedPackages.has("@voyant-travel/identity-react"),
    "Published Operator closure is missing its required identity React runtime",
  )
  return publishedPackages
}

async function packPublishedPackage(root, source) {
  const stdout = await execAsync(
    "pnpm",
    ["--config.ignore-scripts=true", "pack", "--json", "--pack-destination", root],
    source,
  )
  const packResult = JSON.parse(stdout)
  const packed = Array.isArray(packResult) ? packResult[0] : packResult
  assert.equal(
    typeof packed?.filename,
    "string",
    `pnpm pack did not return a filename for ${source}`,
  )
  const archive = join(root, basename(packed.filename))
  assert.ok(existsSync(archive), `pnpm pack did not create ${archive}`)
  return archive
}

async function mapConcurrent(items, concurrency, operation) {
  const results = new Array(items.length)
  let nextIndex = 0

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex
        nextIndex += 1
        results[index] = await operation(items[index])
      }
    }),
  )

  return results
}

function acceptanceProofSource(marker) {
  return `import * as React from "react"

const marker = ${JSON.stringify(marker)}

export default function AcceptanceProof() {
  React.useEffect(() => {
    const previous = Reflect.get(globalThis, "__voyantAcceptance")
    Reflect.set(globalThis, "__voyantAcceptance", {
      pageId: previous?.pageId ?? crypto.randomUUID(),
      marker,
      hydrated: true,
    })
  }, [marker])
  return <output data-voyant-acceptance-hmr>{marker}</output>
}
`
}

async function assertBrowserHydration(app, port, t, serverOutput, { hmr }) {
  const { chromium } = await import("playwright")
  const executable = chromium.executablePath()
  if (!existsSync(executable)) {
    t.skip(`Playwright Chromium executable is unavailable: ${executable}`)
    return
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const browserErrors = []
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`)
  })
  page.on("pageerror", (error) =>
    browserErrors.push(`pageerror: ${error.message}\n${error.stack ?? "(no stack)"}`),
  )
  page.on("requestfailed", (request) => {
    browserErrors.push(
      `requestfailed: ${request.url()} (${request.failure()?.errorText ?? "unknown error"})`,
    )
  })
  try {
    await page.goto(`http://127.0.0.1:${port}/docs`, { waitUntil: "domcontentloaded" })
    await page
      .locator("[data-voyant-acceptance-hmr]")
      .getByText("before", { exact: true })
      .waitFor({ timeout: 10_000 })
    await waitForBrowserState(
      page,
      () => Reflect.get(globalThis, "__voyantAcceptance")?.hydrated,
      browserErrors,
      "Browser did not hydrate the SSR-rendered acceptance probe",
      serverOutput,
    )
    const initial = await page.evaluate(() => {
      const evidence = Reflect.get(globalThis, "__voyantAcceptance")
      return {
        pageId: evidence.pageId,
        marker: evidence.marker,
      }
    })
    assert.equal(initial.marker, "before")

    if (!hmr) {
      assert.deepEqual(
        browserErrors,
        [],
        `Production browser hydration errors:\n${browserErrors.join("\n")}`,
      )
      return
    }

    writeFileSync(join(app, "src/acceptance-proof.tsx"), acceptanceProofSource("after"))
    await page
      .locator("[data-voyant-acceptance-hmr]")
      .getByText("after", { exact: true })
      .waitFor({ timeout: 10_000 })
    await waitForBrowserState(
      page,
      () => Reflect.get(globalThis, "__voyantAcceptance")?.marker === "after",
      browserErrors,
      "Authored-source HMR did not run the updated acceptance probe",
      serverOutput,
    )
    const updated = await page.evaluate(() => {
      const evidence = Reflect.get(globalThis, "__voyantAcceptance")
      return {
        pageId: evidence.pageId,
        marker: evidence.marker,
      }
    })
    assert.equal(updated.marker, "after")
    assert.equal(updated.pageId, initial.pageId, "HMR performed a full browser reload")
    assert.deepEqual(
      browserErrors,
      [],
      `Browser hydration/HMR errors:\n${browserErrors.join("\n")}`,
    )
  } finally {
    await browser.close()
  }
}

async function waitForBrowserState(page, predicate, browserErrors, message, serverOutput) {
  try {
    await page.waitForFunction(predicate, undefined, { timeout: 10_000 })
  } catch (error) {
    assert.fail(
      `${message}.\n${browserErrors.join("\n")}\n${String(error)}\nDev server:\n${serverOutput()}`,
    )
  }
}

function resolvePnpmStorePackageEntry(name) {
  const store = join(repoRoot, "node_modules/.pnpm")
  const directoryPrefix = `${name.replace("/", "+")}@`
  const directory = readdirSync(store).find((entry) => entry.startsWith(directoryPrefix))
  assert.ok(directory, `Missing ${name} from the pnpm virtual store`)
  const packageRoot = realpathSync(join(store, directory, "node_modules", name))
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"))
  const entry = manifest.exports?.["."]?.import ?? manifest.module ?? manifest.main
  assert.equal(typeof entry, "string", `Missing ESM entry for ${name}`)
  return join(packageRoot, entry)
}

function exec(command, args, cwd, env = {}, timeout = 240_000) {
  return execFileSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: "pipe",
    timeout,
  })
}

function execAsync(command, args, cwd, env = {}, timeout = 240_000) {
  return new Promise((resolvePromise, reject) => {
    execFile(
      command,
      args,
      {
        cwd,
        env: { ...process.env, ...env },
        encoding: "utf8",
        timeout,
      },
      (error, stdout) => {
        if (error) reject(error)
        else resolvePromise(stdout)
      },
    )
  })
}

function write(root, relativePath, contents) {
  const destination = join(root, relativePath)
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, contents)
}

function captureOutput(child) {
  let output = ""
  child.stdout.setEncoding("utf8")
  child.stderr.setEncoding("utf8")
  child.stdout.on("data", (chunk) => {
    output += chunk
  })
  child.stderr.on("data", (chunk) => {
    output += chunk
  })
  return () => output
}

async function waitForListening(host, port, child, output) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Node host exited before it became ready.\n${output()}`)
    }
    if (await canConnect(host, port)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for ${host}:${port}.\n${output()}`)
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port })
    socket.once("connect", () => {
      socket.destroy()
      resolve(true)
    })
    socket.once("error", () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function stop(child) {
  if (child.exitCode !== null) return
  const exited = once(child, "exit")
  child.kill("SIGTERM")
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ])
  if (stopped) return
  child.kill("SIGKILL")
  await exited
}

async function reservePort() {
  const listener = createNetServer()
  await new Promise((resolve, reject) => {
    listener.once("error", reject)
    listener.listen(0, "127.0.0.1", resolve)
  })
  const address = listener.address()
  await new Promise((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  )
  assert.ok(address && typeof address === "object")
  return address.port
}
