import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { afterEach, test } from "node:test"
import { fileURLToPath } from "node:url"

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const checker = join(repoRoot, "scripts/check-standard-node-starter.mjs")
const standardNodeStarter = JSON.parse(
  readFileSync(join(repoRoot, "packages/framework/src/standard-node-starter.json"), "utf8"),
)
const roots = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

test("accepts the strict generated standard Node starter shape", () => {
  const root = fixture()
  assert.match(
    run(root),
    /packaged: 5 authored files; checked-in: no copied metadata or database authority; CLI-owned lifecycle/,
  )
})

test("packages the direct dependencies imported by generated frontend sources", () => {
  for (const dependency of [
    "@tanstack/react-query",
    "@tanstack/react-router",
    "react",
    "react-dom",
  ]) {
    assert.ok(standardNodeStarter.runtimeDependencies.includes(dependency), dependency)
  }
})

test("rejects a generated gitignore that does not protect disposable and local files", () => {
  const root = fixture({ extraFiles: { ".gitignore": "node_modules/\n" } })
  assert.throws(
    () => run(root),
    (error) =>
      String(error.stderr).includes(".gitignore must match the standard Node starter contract"),
  )
})

test("rejects an environment example without a DATABASE_URL assignment", () => {
  const root = fixture({
    extraFiles: { ".env.example": "postgresql://localhost/voyant\nPORT=8080\n" },
  })
  assert.throws(
    () => run(root),
    (error) => String(error.stderr).includes("generated .env.example must declare DATABASE_URL"),
  )
})

test("rejects standard modules, extensions, and plugins in generated config", () => {
  for (const property of ["modules", "extensions", "plugins"]) {
    const root = fixture({
      config: `export default defineConfig({ ${property}: [{ resolve: "@voyant-travel/identity" }] })\n`,
    })
    assert.throws(
      () => run(root),
      (error) => String(error.stderr).includes(`generated config must not declare ${property}`),
    )
  }
})

test("rejects SmartBill selection and configuration in the standard starter", () => {
  const root = fixture({
    config:
      'export default defineConfig({ plugins: [{ resolve: "@voyant-travel/plugin-smartbill" }] })\n',
  })
  assert.throws(
    () => run(root),
    (error) => String(error.stderr).includes("must not select or configure SmartBill by default"),
  )
})

test("rejects package-owned artifacts and non-empty project convention folders", () => {
  for (const path of [
    "openapi/admin/bookings.json",
    "migrations/0000_product.sql",
    "src/links/booking-customer.ts",
    "src/subscribers/booking-created.ts",
  ]) {
    const root = fixture({ extraFiles: { [path]: "export default {}\n" } })
    assert.throws(() => run(root), /generated authored tree|must not contain|must start empty/)
  }
})

test("rejects package-specific bootstrap dependencies and commands", () => {
  const root = fixture({
    packageJson: {
      scripts: { start: "tsx src/start.ts" },
      dependencies: {
        "@voyant-travel/framework": "1.0.0",
        "@voyant-travel/runtime": "1.0.0",
        "@voyant-travel/bookings": "1.0.0",
      },
      devDependencies: { "@voyant-travel/cli": "1.0.0" },
    },
  })
  assert.throws(
    () => run(root),
    (error) =>
      String(error.stderr).includes('script start must be exactly "voyant start"') &&
      String(error.stderr).includes("generic Node runtime"),
  )
})

test("rejects extra authored files beyond the small-tree ratchet", () => {
  const root = fixture({ extraFiles: { "src/start.ts": "export const product = true\n" } })
  assert.throws(
    () => run(root),
    (error) => String(error.stderr).includes("must contain exactly 5 files"),
  )
})

test("rejects first-party package IDs in the authored seed source", () => {
  const root = fixture({
    extraFiles: {
      "src/scripts/seed.ts": 'export const packageId = "@voyant-travel/bookings"\n',
    },
  })
  assert.throws(
    () => run(root),
    (error) => String(error.stderr).includes("must not name first-party packages"),
  )
})

test("rejects a missing optional project convention directory", () => {
  const root = fixture()
  rmSync(join(root, "src/extensions"), { recursive: true })
  assert.throws(
    () => run(root),
    (error) =>
      String(error.stderr).includes("must expose optional project directory src/extensions"),
  )
})

test("rejects database authority in the checked-in starter", () => {
  const starter = fixture()
  const root = mkdtempSync(join(tmpdir(), "voyant-standard-node-repository-"))
  roots.push(root)
  const artifact = join(root, "starters/operator/drizzle.schemas.generated.ts")
  mkdirSync(dirname(artifact), { recursive: true })
  writeFileSync(artifact, "export const schema = []\n")
  assert.throws(
    () => run(starter, root),
    (error) =>
      String(error.stderr).includes(
        "checked-in starter must not own database artifact starters/operator/drizzle.schemas.generated.ts",
      ),
  )
})

test("rejects restored checked-in starter compatibility authority", () => {
  for (const relativePath of [
    "starters/operator/scripts/backfill-custom-fields.ts",
    "starters/operator/src/api/lib/catalog-context.ts",
    "starters/operator/src/api/lib/storage.ts",
    "starters/operator/src/api/runtime/payment-config.ts",
    "starters/operator/src/api/runtime/booking-payment-policy-runtime.ts",
    "starters/operator/src/api/runtime/media-runtime.ts",
    "starters/operator/src/api/lib/db.ts",
    "starters/operator/src/api/lib/db.test.ts",
    "starters/operator/src/api/auth/cookie-domain.ts",
    "starters/operator/src/api/auth/cookie-domain.test.ts",
  ]) {
    const starter = fixture()
    const root = mkdtempSync(join(tmpdir(), "voyant-standard-node-repository-"))
    roots.push(root)
    const facade = join(root, relativePath)
    mkdirSync(dirname(facade), { recursive: true })
    writeFileSync(facade, "export const compatibilityAuthority = true\n")
    assert.throws(
      () => run(starter, root),
      (error) =>
        String(error.stderr).includes(
          relativePath === "starters/operator/scripts/backfill-custom-fields.ts"
            ? `checked-in starter authority must stay deleted: ${relativePath}`
            : `checked-in starter authority must stay deleted: ${relativePath}`,
        ),
    )
  }
})

test("rejects restored starter-owned Flights reference fixtures", () => {
  const starter = fixture()
  const root = mkdtempSync(join(tmpdir(), "voyant-standard-node-repository-"))
  roots.push(root)
  const fixturePath = join(root, "starters/operator/scripts/seed-flights-reference-airlines.ts")
  mkdirSync(dirname(fixturePath), { recursive: true })
  writeFileSync(fixturePath, "export const airlines = []\n")

  assert.throws(
    () => run(starter, root),
    (error) =>
      String(error.stderr).includes(
        "Flights reference fixture must remain package-owned: starters/operator/scripts/seed-flights-reference-airlines.ts",
      ),
  )
})

test("rejects restored Catalog operational authority in the checked-in starter", () => {
  for (const relativePath of [
    "starters/operator/scripts/reindex.ts",
    "starters/operator/scripts/sync-sources.ts",
    "starters/operator/scripts/lib/reindex-stale-documents.ts",
    "starters/operator/scripts/lib/typesense-sdk-client.ts",
    "starters/operator/scripts/lib/build-sync-source-registry.ts",
  ]) {
    const starter = fixture()
    const root = mkdtempSync(join(tmpdir(), "voyant-standard-node-repository-"))
    roots.push(root)
    const script = join(root, relativePath)
    mkdirSync(dirname(script), { recursive: true })
    writeFileSync(script, "export const catalogAuthority = true\n")
    assert.throws(
      () => run(starter, root),
      (error) =>
        String(error.stderr).includes(
          `Catalog operational authority must stay package-owned: ${relativePath}`,
        ),
    )
  }
})

test("rejects copied checked-in starter metadata", () => {
  for (const relativePath of [
    "starters/operator/env.d.ts",
    "starters/operator/tsconfig.json",
    "starters/operator/tsconfig.client.json",
    "starters/operator/tsconfig.server.json",
    "starters/operator/turbo.json",
    "starters/operator/vite.config.ts",
    "starters/operator/vitest.config.ts",
  ]) {
    const starter = fixture()
    const root = mkdtempSync(join(tmpdir(), "voyant-standard-node-repository-"))
    roots.push(root)
    const metadata = join(root, relativePath)
    mkdirSync(dirname(metadata), { recursive: true })
    writeFileSync(metadata, "{}\n")
    assert.throws(
      () => run(starter, root),
      (error) =>
        String(error.stderr).includes(
          `checked-in starter metadata must stay generated under .voyant: ${relativePath}`,
        ),
    )
  }
})

test("rejects restored generic or demo operational scripts in the checked-in starter", () => {
  for (const relativePath of [
    "apps/scripts/package.json",
    "starters/operator/scripts/seed.ts",
    "starters/operator/scripts/seed-catalog-verticals.ts",
    "starters/operator/scripts/seed-catalog-verticals.test.ts",
    "starters/operator/scripts/migrate.ts",
    "starters/operator/scripts/migrate.test.ts",
    "starters/operator/scripts/check-deployment-graph-env.ts",
    "starters/operator/scripts/emit-cloud-scheduler.ts",
    "starters/operator/scripts/env-preload.cjs",
  ]) {
    const starter = fixture()
    const root = mkdtempSync(join(tmpdir(), "voyant-standard-node-repository-"))
    roots.push(root)
    const script = join(root, relativePath)
    mkdirSync(dirname(script), { recursive: true })
    writeFileSync(script, "export const starterOperationalAuthority = true\n")
    assert.throws(
      () => run(starter, root),
      (error) =>
        String(error.stderr).includes(
          `standard starter operational authority must stay deleted: ${relativePath}`,
        ),
    )
  }
})

test("rejects undeclared first-party imports in checked-in starter tests", () => {
  const starter = fixture()
  const root = mkdtempSync(join(tmpdir(), "voyant-standard-node-repository-"))
  roots.push(root)
  const packageJsonPath = join(root, "starters/operator/package.json")
  mkdirSync(dirname(packageJsonPath), { recursive: true })
  writeFileSync(
    packageJsonPath,
    `${JSON.stringify({ devDependencies: { "@voyant-travel/framework": "workspace:^" } })}\n`,
  )
  const testPath = join(root, "starters/operator/tests/runtime.test.ts")
  mkdirSync(dirname(testPath), { recursive: true })
  writeFileSync(
    testPath,
    'import { notificationsRuntimePort } from "@voyant-travel/notifications/voyant"\n',
  )

  assert.throws(
    () => run(starter, root),
    (error) =>
      String(error.stderr).includes(
        "checked-in starter imports undeclared direct dependency @voyant-travel/notifications: tests/runtime.test.ts",
      ),
  )
})

test("rejects an incomplete checked-in operator production runtime closure", () => {
  const starter = fixture()
  const root = mkdtempSync(join(tmpdir(), "voyant-standard-node-repository-"))
  roots.push(root)
  writeJson(root, "packages/operator-standard/package.json", {
    dependencies: { "@voyant-travel/bookings": "workspace:*" },
  })
  writeFile(root, "packages/operator-standard/src/index.ts", 'resolve: "@voyant-travel/bookings"\n')
  writeJson(root, "starters/operator/package.json", {
    scripts: {
      dev: "voyant develop",
      build: "voyant build",
      start: "voyant start",
      "db:migrate": "voyant migrate",
    },
    dependencies: { "@voyant-travel/operator-standard": "workspace:^" },
  })

  assert.throws(
    () => run(starter, root),
    (error) =>
      String(error.stderr).includes(
        "checked-in operator production deploy must declare product runtime package @voyant-travel/bookings",
      ),
  )
})

test("rejects checked-in starter lifecycle scripts that bypass the CLI", () => {
  const starter = fixture()
  const root = mkdtempSync(join(tmpdir(), "voyant-standard-node-repository-"))
  roots.push(root)
  const packageJsonPath = join(root, "starters/operator/package.json")
  mkdirSync(dirname(packageJsonPath), { recursive: true })
  writeFileSync(
    packageJsonPath,
    `${JSON.stringify({
      scripts: {
        dev: "vite dev",
        build: "vite build",
        start: "node --env-file-if-exists=.env dist/server/server.js",
        "db:migrate": "pnpm run graph:emit && voyant migrate",
      },
      dependencies: {},
      devDependencies: {},
    })}\n`,
  )

  assert.throws(
    () => run(starter, root),
    (error) => {
      const stderr = String(error.stderr)
      return (
        stderr.includes('script dev must be exactly "voyant develop"') &&
        stderr.includes('script build must be exactly "voyant build"') &&
        stderr.includes('script start must be exactly "voyant start"') &&
        stderr.includes('script db:migrate must be exactly "voyant migrate"')
      )
    },
  )
})

test("rejects generated starter graph lifecycle aliases", () => {
  const root = fixture()
  const packageJsonPath = join(root, "package.json")
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
  packageJson.scripts["graph:emit"] = "voyant build --artifacts-only"
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson)}\n`)

  assert.throws(
    () => run(root),
    (error) => String(error.stderr).includes("must not expose graph emission"),
  )
})

test("accepts CLI-owned lifecycle scripts without a dotenv bootstrap dependency", () => {
  const starter = fixture()
  const checkedIn = JSON.parse(
    readFileSync(join(repoRoot, "starters/operator/package.json"), "utf8"),
  )
  assert.equal(checkedIn.dependencies?.dotenv, undefined)
  assert.doesNotThrow(() => run(starter))
})

function writeFile(root, relativePath, contents) {
  const destination = join(root, relativePath)
  mkdirSync(dirname(destination), { recursive: true })
  writeFileSync(destination, contents)
}

function writeJson(root, relativePath, value) {
  writeFile(root, relativePath, `${JSON.stringify(value, null, 2)}\n`)
}

function run(starterDir, root = repoRoot) {
  if (root !== repoRoot) {
    const gitignore = join(root, "starters/operator/.gitignore")
    mkdirSync(dirname(gitignore), { recursive: true })
    writeFileSync(gitignore, ".voyant/\n")
  }
  return execFileSync(process.execPath, [checker, "--root", root, "--starter-dir", starterDir], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  })
}

function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "voyant-standard-node-starter-"))
  roots.push(root)
  const packageJson = overrides.packageJson ?? {
    scripts: standardNodeStarter.packageScripts,
    dependencies: {
      "@voyant-travel/framework": "1.0.0",
      "@voyant-travel/runtime": "1.0.0",
      "@voyant-travel/operator-standard": "1.0.0",
      "@tanstack/react-query": "1.0.0",
      "@tanstack/react-router": "1.0.0",
      react: "1.0.0",
      "react-dom": "1.0.0",
    },
    devDependencies: { "@voyant-travel/cli": "1.0.0" },
  }
  const files = {
    ".env.example": "DATABASE_URL=postgresql://localhost/voyant\n",
    ".gitignore": `${standardNodeStarter.gitignoreEntries.join("\n")}\n`,
    "package.json": `${JSON.stringify(packageJson, null, 2)}\n`,
    "src/scripts/seed.ts": 'console.info("Add project seed data here.")\n',
    "voyant.config.ts":
      overrides.config ??
      `import { defineConfig } from "@voyant-travel/framework/project"

export default defineConfig({
  deployment: {
    target: "node",
    providers: { database: "postgres" },
  },
})
`,
    ...overrides.extraFiles,
  }
  for (const directory of standardNodeStarter.optionalDirectories) {
    mkdirSync(join(root, directory), { recursive: true })
  }
  for (const [path, contents] of Object.entries(files)) {
    const destination = join(root, path)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, contents)
  }
  return root
}
