/**
 * The migration collector's view of this module.
 *
 * The enums are re-exported alongside the tables on purpose. Drizzle emits a
 * `CREATE TYPE` only for a pgEnum it can reach from the schema entrypoint, so a
 * barrel that exports the tables but not their enums generates a `CREATE TABLE`
 * referencing a type nothing created — a migration that passes generation and
 * fails on the first `migrate`.
 */
export * from "./schema-applications.js"
export * from "./schema-insured-persons.js"
export * from "./schema-policies.js"
export * from "./schema-shared.js"
