/**
 * `@voyant-travel/operator-settings` — the operator-tenant settings domain:
 * profile + payment instructions/defaults + booking-tax configuration.
 *
 * Schema (`./schema`) + transport-agnostic readers/writers (`./service`). A
 * deployment lists this in `voyant.config` `additionalSchemas`, mounts HTTP
 * routes over the service, and injects the readers into the standard modules
 * that consume operator settings.
 */

export * from "./branding.js"
export * from "./payment-provider-registry.js"
export * from "./payment-provider-service.js"
export * from "./schema.js"
export * from "./service.js"
