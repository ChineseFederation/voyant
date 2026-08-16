# @voyant-travel/cruises

Opt-in cruises module for OTA, tour-operator, and DMC deployments. Provides the
canonical schema, services, and admin/public surface/booking integration for cruise
inventory - both self-managed (a tour operator or DMC publishes its own
small-scale or specialized cruises) and external (sourced from a registered
adapter package).

Cruises are an inventory and operations capability inside the target scenarios,
not a separate cruise-line implementation scenario.

See [docs/architecture/cruises-module.md](../../docs/architecture/cruises-module.md)
for the full design and
[docs/architecture/cruise-adapter-contract.md](../../docs/architecture/cruise-adapter-contract.md)
for external adapter implementation requirements.

## External Adapter Contract

`@voyant-travel/cruises` exports the provider-neutral `CruiseAdapter` contract from
`@voyant-travel/cruises/adapters`. Adapter packages register at application startup
and keep upstream clients, credentials, and provider-specific mappings outside
the framework package.

Install `@voyant-travel/cruises-contracts` when an external adapter or validation
package only needs the `cruises/v1` rich content schema, schema version, Zod
validator, and inferred content types. Use `@voyant-travel/cruises` when you also
need Drizzle schema, routes, services, booking integration, adapter registry
helpers, or runtime content resolution.

Adapter packages can run
`assertCruiseAdapterCompatibility(...)` against a sandbox fixture to verify full
`SourceRef` round-tripping, multi-connection identity, detail lookup, pricing
lookup, and booking commit payload handling.

## Status

Early development. Phase 1 (canonical schema + core service for self-managed cruises) is in progress.

## Domain Events

`@voyant-travel/cruises` exports stable cruise lifecycle event constants for catalog
and search subscribers:

- `CRUISE_CREATED_EVENT` = `cruise.created`
- `CRUISE_UPDATED_EVENT` = `cruise.updated`
- `CRUISE_DELETED_EVENT` = `cruise.deleted`

Each event carries `{ id }`, where `id` is the local cruise id. Treat the
payload as an invalidation trigger and re-read current cruise state before
updating downstream indexes.

## Agent Tools

Selecting the module contributes provider-neutral Tools for indexed cruise
search, cruise/sailing/ship detail, cabin quotes, and the core cruise, sailing,
and ship lifecycle. The Tools call the module's services and selected
`CruiseAdapter` implementations; provider-specific calls, search projection
maintenance, price-row replacement, and cabin/deck/itinerary mechanics are not
exposed.

Read and quote Tools require `cruises:read` and are available to staff and
customer actors. Local lifecycle writes require `cruises:write`, are staff
only, and are ledgered. `create_cruise` is a handler-owned created-target
command: its canonical row, required local search projection, deterministic
`cruise.created` outbox envelope, command ledger, and immutable result reference
commit in one transaction. Exact idempotency replays return that reference;
reuse with different input conflicts. Booking creation is intentionally absent
until the cruise vertical owns a durable admitted command. Archive/delete and
party booking operations remain outside the Tool surface.
