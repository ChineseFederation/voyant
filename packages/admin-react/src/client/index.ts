/**
 * The admin HTTP client, previously `@voyant-travel/admin-client`.
 *
 * It was a single-export package whose only consumer was this one, which already
 * re-exported all of it — so the split cost a package and a published version
 * line without giving anyone a smaller surface to depend on.
 */
// Re-exported here, as the standalone package did, so descriptors, types and
// AdminApiError still arrive from one place for callers of this subpath.
export * from "@voyant-travel/admin-contracts"
export * from "./auth.js"
export * from "./client.js"
export * from "./http.js"
