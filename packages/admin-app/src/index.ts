/**
 * The core admin extension. Route and workspace types live in
 * `@voyant-travel/admin/app`, which this package no longer re-exports — it
 * aliased that surface without adding to it, so importers had two specifiers
 * for one API and no way to tell which was canonical.
 */
export * from "./core-extension/index.js"
