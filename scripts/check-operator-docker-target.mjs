/**
 * Validates the reference operator Docker/Node deploy target.
 *
 * The Docker image must be built through the operator package build lane so it
 * delegates the complete build to the public Voyant CLI. The runtime image
 * boots through the same generic CLI contract used by generated projects.
 */
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")

const DOCKERFILE = "apps/operator/Dockerfile"
const OPERATOR_PACKAGE_JSON = "apps/operator/package.json"
const PRODUCT_PACKAGE_JSON = "packages/operator-standard/package.json"
const MIGRATION_RUNNER = "scripts/run-generated-migrations.mjs"

const violations = []

if (!existsSync(join(ROOT, OPERATOR_PACKAGE_JSON))) {
  violations.push({
    file: OPERATOR_PACKAGE_JSON,
    check: "missing-operator-package-json",
    message: "The operator package manifest is missing.",
  })
} else {
  const packageJson = JSON.parse(readFileSync(join(ROOT, OPERATOR_PACKAGE_JSON), "utf8"))
  const scripts =
    packageJson.scripts && typeof packageJson.scripts === "object" ? packageJson.scripts : {}
  const buildScript = typeof scripts.build === "string" ? scripts.build : ""
  if (buildScript !== "voyant build") {
    violations.push({
      file: OPERATOR_PACKAGE_JSON,
      check: "operator-build-bypasses-cli",
      message: 'The operator build script must be exactly "voyant build".',
    })
  }
  if (scripts["copy:deployment-artifacts"] !== undefined || scripts["graph:emit"] !== undefined) {
    violations.push({
      file: OPERATOR_PACKAGE_JSON,
      check: "operator-build-internals-exposed",
      message: "The operator package must not expose graph emission or artifact-copy internals.",
    })
  }
  const productPackageJson = JSON.parse(readFileSync(join(ROOT, PRODUCT_PACKAGE_JSON), "utf8"))
  const missingRuntimeDependencies = Object.entries(productPackageJson.dependencies ?? {})
    .filter(
      ([name, version]) =>
        name.startsWith("@voyant-travel/") &&
        typeof version === "string" &&
        packageJson.dependencies?.[name] === undefined,
    )
    .map(([name]) => name)
  if (missingRuntimeDependencies.length > 0) {
    violations.push({
      file: OPERATOR_PACKAGE_JSON,
      check: "operator-production-runtime-closure-incomplete",
      message: `The operator production manifest is missing product runtime dependencies: ${missingRuntimeDependencies.join(", ")}.`,
    })
  }
}

if (!existsSync(join(ROOT, DOCKERFILE))) {
  violations.push({
    file: DOCKERFILE,
    check: "missing-operator-dockerfile",
    message: "The reference operator Dockerfile is missing.",
  })
} else {
  const source = readFileSync(join(ROOT, DOCKERFILE), "utf8")
  if (!source.includes("pnpm --filter operator build")) {
    violations.push({
      file: DOCKERFILE,
      check: "docker-build-not-using-operator-build",
      message: "The Docker build stage must use the operator build script.",
    })
  }
  if (source.includes("vite build")) {
    violations.push({
      file: DOCKERFILE,
      check: "docker-build-bypasses-package-build",
      message: "The Dockerfile must not bypass the operator build with a raw Vite build.",
    })
  }
  if (!source.includes("COPY --from=build /repo/apps/operator/dist ./dist")) {
    violations.push({
      file: DOCKERFILE,
      check: "docker-runtime-dist-copy-missing",
      message: "The runtime image must copy the built operator dist directory.",
    })
  }
  for (const [fragment, check, message] of [
    [
      "RUN pnpm build",
      "docker-workspace-build-missing",
      "The Docker build must compile workspace packages.",
    ],
    [
      "deploy --prod",
      "docker-production-deploy-missing",
      "The Docker build must create a production-only deploy tree.",
    ],
    [
      "apply-publish-config.mjs /deploy",
      "docker-publish-config-missing",
      "The deployed workspace manifests must resolve built publish targets.",
    ],
    [
      "run-generated-migrations.mjs",
      "docker-migration-runner-missing",
      "The runtime image must include the generated-plan migration command.",
    ],
  ]) {
    if (!source.includes(fragment)) violations.push({ file: DOCKERFILE, check, message })
  }
  if (!source.includes('CMD ["node", "dist/server/server.js"]')) {
    violations.push({
      file: DOCKERFILE,
      check: "docker-runtime-cmd-missing",
      message: "The runtime image must boot the checked Node server entry.",
    })
  }
}

if (!existsSync(join(ROOT, MIGRATION_RUNNER))) {
  violations.push({
    file: MIGRATION_RUNNER,
    check: "missing-generated-migration-runner",
    message: "The image migration entry is missing.",
  })
}

if (violations.length > 0) {
  console.error("Operator Docker target violation.")
  console.error("See docs/architecture/deployment-targets.md for the rule.\n")
  for (const violation of violations) {
    console.error(`  ${violation.file} (${violation.check})`)
    console.error(`    ${violation.message}`)
  }
  process.exit(1)
}

console.log("check-operator-docker-target: OK (Docker/Node target uses the CLI lifecycle)")
