/**
 * The published public surface must be installable, not merely present.
 *
 * Issue #4086 found the same surface broken three different ways in one day,
 * and every weaker check passed on all three:
 *
 * - `@voyant-travel/graph-contracts@0.2.0` was bumped in the repo and never
 *   reached the registry — the first publish of a name needs an npm Trusted
 *   Publisher, and without one the release fails with an E404 that reads like a
 *   package.json problem.
 * - `custom-fields-contracts` and `app-manifest` shipped `catalog:` and
 *   `workspace:^` specifiers, which only pnpm rewrites, so `npm install` of a
 *   published version could not resolve.
 * - `webhook-delivery-contracts@0.1.0` published with `publishConfig` never
 *   applied, leaving `exports` at `./src/index.ts` while `files` shipped only
 *   `dist` — a path that looks plausible in the manifest and resolves to
 *   nothing.
 *
 * `verify:public-surface` asserts the dependency *graph* is closed, which
 * stayed true throughout. Closure and installability are different properties.
 * The functions here derive what a real consumer would exercise; the runner
 * beside them installs from the registry and exercises it.
 */

export const REGISTRY = "https://registry.npmjs.org"

/**
 * Ask the registry directly, over anonymous HTTP.
 *
 * Not `npm view`. The release job points `NPM_CONFIG_USERCONFIG` at an npmrc
 * carrying `NODE_AUTH_TOKEN`, which is a placeholder unless a secret is set, so
 * every npm call there fails on auth in under a millisecond. Reading that as
 * "the version is not published" reported all fourteen packages missing when
 * all fourteen were fine — a confident, specific, wrong diagnosis, which is
 * worse than no check at all. A raw fetch has no credentials to get wrong, and
 * it asks the truer question: this gate is about what a stranger can install.
 *
 * Only a clean 200 or a clean 404 is an answer. Anything else throws, because a
 * registry outage must never be indistinguishable from an unpublished package.
 */
export async function registryHasVersion(name, version, options = {}) {
  const { fetch: fetchImpl = fetch, registry = REGISTRY } = options

  const response = await fetchImpl(`${registry}/${name.replace("/", "%2f")}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  })

  if (response.status === 404) return false
  if (!response.ok) {
    throw new Error(`registry returned ${response.status} ${response.statusText} for ${name}`)
  }

  const packument = await response.json()
  return Object.hasOwn(packument.versions ?? {}, version)
}

/** publishConfig keys whose survival proves publishConfig was never applied. */
const OVERRIDE_KEYS = ["exports", "main", "module", "types", "typings", "files", "bin"]

/** pnpm-only dependency protocols. npm cannot resolve either one. */
const WORKSPACE_PROTOCOLS = ["workspace:", "catalog:"]

const DEPENDENCY_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies"]

/** Node resolution conditions, most specific first, as a consumer would hit them. */
const IMPORT_CONDITIONS = ["import", "node", "default", "require"]

export function selectPublishedPackages(manifests) {
  return manifests
    .filter((manifest) => manifest.private !== true)
    .sort((left, right) => left.name.localeCompare(right.name))
}

function resolveConditionalTarget(value) {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return undefined
  for (const condition of IMPORT_CONDITIONS) {
    const resolved = resolveConditionalTarget(value[condition])
    if (resolved) return resolved
  }
  return undefined
}

/**
 * Expand one wildcard export against the files a package actually shipped.
 *
 * `"./lib/*": "./dist/lib/*.js"` is not a specifier a consumer can import; the
 * specifiers are whatever `dist/lib/*.js` turned out to be. Probing the pattern
 * would assert nothing, and skipping it silently would leave the subpaths a
 * consumer really uses — `@voyant-travel/ui/lib/utils` — unexercised.
 */
export function expandExportPattern(subpath, target, files) {
  const starIndex = target.indexOf("*")
  if (starIndex === -1) return []

  const prefix = target.slice(0, starIndex)
  const suffix = target.slice(starIndex + 1)

  return files
    .filter(
      (file) =>
        file.startsWith(prefix) &&
        file.endsWith(suffix) &&
        file.length > prefix.length + suffix.length,
    )
    .map((file) => subpath.replace("*", file.slice(prefix.length, file.length - suffix.length)))
    .sort()
}

/** Assets a bundler consumes and Node cannot; skipping these asserts nothing either way. */
const ASSET_EXTENSIONS = /\.(css|json|wasm|svg|png|woff2?)$/

/**
 * The specifiers a consumer can `import()` from a published package, plus the
 * export targets that are defects in themselves.
 *
 * A target such as `./src/index.ts` is the second kind. Node cannot import it,
 * the tarball does not ship `src`, and no amount of probing the *other*
 * subpaths would say so — `webhook-delivery-contracts@0.1.0` published exactly
 * that and read as a package with nothing to check.
 *
 * `files` are package-relative paths (`./dist/lib/utils.js`) as shipped in the
 * tarball; pass an empty list when the tarball is not available and wildcard
 * exports will simply contribute nothing.
 */
export function importProbeSpecifiers(manifest, files = []) {
  const exports = manifest.exports

  // No exports map: the package root is the only entry point a consumer has.
  if (!exports || typeof exports !== "object") {
    return { specifiers: [manifest.name], unsupported: [] }
  }

  const specifiers = []
  const unsupported = []

  for (const [subpath, value] of Object.entries(exports)) {
    if (!subpath.startsWith(".")) continue
    if (subpath === "./package.json") continue

    // A `null` target is a deliberate block, not an omission.
    const target = resolveConditionalTarget(value)
    if (!target) continue
    if (ASSET_EXTENSIONS.test(target)) continue

    if (!/\.(js|mjs|cjs)$/.test(target)) {
      unsupported.push(
        `${manifest.name}@${manifest.version} exports "${subpath}" as "${target}", which Node ` +
          `cannot import. A published package must point at built output; a source path here ` +
          `means the manifest describes the repository rather than the tarball.`,
      )
      continue
    }

    const resolved = subpath.includes("*") ? expandExportPattern(subpath, target, files) : [subpath]

    for (const entry of resolved) {
      specifiers.push(entry === "." ? manifest.name : `${manifest.name}/${entry.slice(2)}`)
    }
  }

  return { specifiers, unsupported }
}

/**
 * Dependency specifiers no npm consumer can resolve.
 *
 * Only `pnpm publish` rewrites `workspace:` and `catalog:` into concrete
 * ranges. A package published any other way carries them through to the
 * registry, where they abort every consumer install.
 */
export function unresolvedProtocolViolations(manifest) {
  const violations = []
  for (const field of DEPENDENCY_FIELDS) {
    for (const [dependency, range] of Object.entries(manifest[field] ?? {})) {
      if (!WORKSPACE_PROTOCOLS.some((protocol) => String(range).startsWith(protocol))) continue
      violations.push(
        `${manifest.name}@${manifest.version} published ${field}.${dependency} as "${range}". ` +
          `Only pnpm rewrites that protocol, so npm consumers cannot install this version. ` +
          `Republish through the release pipeline rather than \`npm publish\`.`,
      )
    }
  }
  return violations
}

/**
 * `publishConfig` overrides that survived into the published manifest.
 *
 * A published manifest keeps `publishConfig.access`, which is inert. What it
 * must not keep is an override of `exports` or `files`: those exist precisely
 * to be folded into the manifest at publish time, and their survival means the
 * published package points at source paths it never shipped.
 */
export function unappliedPublishConfigViolations(manifest) {
  const overrides = OVERRIDE_KEYS.filter((key) => manifest.publishConfig?.[key] !== undefined)
  if (overrides.length === 0) return []

  return [
    `${manifest.name}@${manifest.version} published with publishConfig.${overrides.join(", publishConfig.")} ` +
      `still unapplied, so its manifest describes the source tree rather than the tarball. ` +
      `This is what \`npm publish\` does to a pnpm workspace package; republish through the release pipeline.`,
  ]
}

export function formatMissingVersion(name, version) {
  return (
    `${name}@${version} is the version in the repository and is not on the registry. ` +
    `A first publish of a new package name fails with E404 until npm Trusted Publishers ` +
    `is configured for it — see #4048 and #4086.`
  )
}

export function formatImportFailure(specifier, error) {
  return `import("${specifier}") failed: ${error}`
}
