export const VOYANT_GRAPH_OPENAPI_COVERAGE_REPORT_SCHEMA_VERSION =
  "voyant.graph-openapi-coverage-report.v1"

export function buildDeploymentGraphOpenApiCoverageReport(input, relativePath) {
  const bundleSummary = (bundle) => ({
    id: bundle.apiId,
    graphSurface: bundle.graphSurface,
    surface: bundle.surface,
    moduleId: bundle.moduleId,
    localId: bundle.localId,
    packageName: bundle.packageName,
    mount: bundle.mount,
    ...(bundle.openapiDocument ? { openapiDocument: bundle.openapiDocument } : {}),
  })
  const sortedBundles = (bundles) =>
    [...bundles].sort((left, right) => left.apiId.localeCompare(right.apiId))
  const diagnostics = input.failures
    .map((failure) => {
      if (failure.kind === "authority-regression") {
        return {
          code: "VOYANT_GRAPH_OPENAPI_AUTHORITY_REGRESSION",
          severity: "error",
          actual: failure.actual,
          minimum: failure.minimum,
          message: `Selected graph owns ${failure.actual} OpenAPI route bundles; expected at least ${failure.minimum}.`,
        }
      }
      if (failure.kind === "missing-docs") {
        return {
          code: "VOYANT_GRAPH_OPENAPI_MISSING_DOCS",
          severity: "error",
          ...bundleSummary(failure.bundle),
          expected: expectedKey(failure.bundle),
          ...(failure.nearby?.length ? { foundOnOtherSurfaces: failure.nearby } : {}),
          message: `No OpenAPI document ${expectedKey(failure.bundle)} for ${failure.bundle.apiId}.`,
        }
      }
      if (failure.kind === "unknown-docs") {
        return {
          code: "VOYANT_GRAPH_OPENAPI_UNKNOWN_AUTHORITY",
          severity: "error",
          id: failure.apiId,
          files: failure.files,
          message: `${failure.apiId} is documented but is not selected by the deployment graph.`,
        }
      }
      if (failure.kind === "mismatched-docs") {
        return {
          code: "VOYANT_GRAPH_OPENAPI_MISMATCHED_AUTHORITY",
          severity: "error",
          id: failure.apiId,
          expected: failure.expected,
          files: failure.files,
          message: `${failure.apiId} is stamped into an artifact outside its manifest document claim.`,
        }
      }
      if (failure.kind === "unknown-document") {
        return {
          code: "VOYANT_GRAPH_OPENAPI_UNKNOWN_DOCUMENT",
          severity: "error",
          id: failure.document,
          files: failure.files,
          message: `${failure.document} has no selected graph document claim.`,
        }
      }
      if (failure.kind === "duplicate-docs") {
        return {
          code: "VOYANT_GRAPH_OPENAPI_DUPLICATE_AUTHORITY",
          severity: "error",
          id: failure.apiId,
          files: failure.files,
          message: `${failure.apiId} is documented by multiple artifacts.`,
        }
      }
      if (failure.kind === "duplicate-document-owner") {
        return {
          code: "VOYANT_GRAPH_OPENAPI_DUPLICATE_DOCUMENT_OWNER",
          severity: "error",
          id: failure.document,
          owners: failure.owners,
          message: `${failure.document} is owned by multiple packages.`,
        }
      }
      if (failure.bundle) {
        return {
          code: "VOYANT_GRAPH_OPENAPI_STALE_ALLOWLIST",
          severity: "error",
          ...bundleSummary(failure.bundle),
          expected: expectedKey(failure.bundle),
          message: `${failure.bundle.apiId} is allowlisted but now has documented OpenAPI paths.`,
        }
      }
      return {
        code: "VOYANT_GRAPH_OPENAPI_STALE_ALLOWLIST",
        severity: "error",
        id: failure.apiId,
        message: `${failure.apiId} is allowlisted but no longer appears in the deployment graph.`,
      }
    })
    .sort((left, right) => (left.id ?? "").localeCompare(right.id ?? ""))

  return {
    schemaVersion: VOYANT_GRAPH_OPENAPI_COVERAGE_REPORT_SCHEMA_VERSION,
    ok: diagnostics.length === 0,
    graph: {
      path: relativePath(input.graphPath),
      ...(typeof input.graph.schemaVersion === "string"
        ? { schemaVersion: input.graph.schemaVersion }
        : {}),
      ...(typeof input.graph.contentHash === "string"
        ? { contentHash: input.graph.contentHash }
        : {}),
    },
    openapi: {
      directory: relativePath(input.openapiDir),
      documents: [...input.docs.files].sort(),
      documentedSurfaceModules: input.docs.keys.size,
    },
    bundles: {
      covered: sortedBundles(input.coveredBundles).map(bundleSummary),
      allowlistedGaps: [...input.allowlistedGaps]
        .sort((left, right) => left.bundle.apiId.localeCompare(right.bundle.apiId))
        .map(({ bundle, reason }) => ({ ...bundleSummary(bundle), reason })),
      missingDocs: input.failures
        .filter((failure) => failure.kind === "missing-docs")
        .map((failure) => bundleSummary(failure.bundle))
        .sort((left, right) => left.id.localeCompare(right.id)),
    },
    diagnostics,
  }
}

export function formatDeploymentGraphOpenApiCoverageFailure(failure) {
  if (failure.kind === "authority-regression") {
    return `[deployment-graph-openapi-coverage:authority-regression] selected graph owns ${failure.actual} OpenAPI route bundles; expected at least ${failure.minimum}`
  }
  if (failure.kind === "missing-docs") return formatGap(failure)
  if (failure.kind === "unknown-docs") {
    return `[deployment-graph-openapi-coverage:unknown-authority] ${failure.apiId} is documented by ${failure.files.join(", ")} but is absent from the selected graph`
  }
  if (failure.kind === "mismatched-docs") {
    return `[deployment-graph-openapi-coverage:mismatched-authority] ${failure.apiId} expected ${failure.expected} but is stamped into ${failure.files.join(", ")}`
  }
  if (failure.kind === "unknown-document") {
    return `[deployment-graph-openapi-coverage:unknown-document] ${failure.document} has no selected graph claim: ${failure.files.join(", ")}`
  }
  if (failure.kind === "duplicate-docs") {
    return `[deployment-graph-openapi-coverage:duplicate-authority] ${failure.apiId} is documented by multiple artifacts: ${failure.files.join(", ")}`
  }
  if (failure.kind === "duplicate-document-owner") {
    return `[deployment-graph-openapi-coverage:duplicate-document-owner] ${failure.document} is owned by multiple packages: ${failure.owners.join(", ")}`
  }
  if (failure.bundle) {
    return `[deployment-graph-openapi-coverage:stale-allowlist] ${failure.bundle.apiId} is allowlisted but ${expectedKey(failure.bundle)} now exists`
  }
  return `[deployment-graph-openapi-coverage:stale-allowlist] ${failure.apiId} is allowlisted but no longer appears in the deployment graph`
}

/**
 * The one document key a bundle asks for. The lookup is exact, so this is the
 * whole question — anything vaguer sends the reader looking for a document that
 * was never being searched for.
 */
function expectedKey(bundle) {
  return `${bundle.surface}:${bundle.openapiDocument || "(no document declared)"}`
}

/**
 * A missing or allowlisted document gap, in one line.
 *
 * Shared by the failure path and the warning path so an allowlisted gap and a
 * hard failure describe the same thing the same way; they differed before, and
 * only one of them named the surface.
 */
export function formatDeploymentGraphOpenApiCoverageGap(bundle, { reason, nearby } = {}) {
  const code = reason ? "allowlisted-gap" : "missing-docs"
  const where = `${bundle.graphSurface} -> ${bundle.surface}, ${bundle.localId || bundle.moduleId}`
  const hint = nearby?.length
    ? ` It exists on another surface: ${nearby.join(", ")}.`
    : bundle.openapiDocument
      ? " No document of that name exists on any surface."
      : ""
  const suffix = reason ? ` Allowlist reason: ${reason}.` : ""
  return `  - [deployment-graph-openapi-coverage:${code}] ${bundle.apiId} (${where}) expects OpenAPI document ${expectedKey(bundle)}, which is not present.${hint}${suffix}`
}

function formatGap(failure) {
  return formatDeploymentGraphOpenApiCoverageGap(failure.bundle, { nearby: failure.nearby })
}
