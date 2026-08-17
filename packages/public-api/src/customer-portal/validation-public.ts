/**
 * The customer-portal wire contracts moved to `@voyant-travel/public-api-contracts`
 * (voyant#4627). They are zod schemas over request and response shapes with no
 * server dependency, and a browser client needs them without pulling in this
 * package's eleven domain modules.
 *
 * Re-exported here so every in-repo consumer — routes, service, Tools — keeps
 * importing them from the module that owns the surface they describe.
 */
export * from "@voyant-travel/public-api-contracts"
