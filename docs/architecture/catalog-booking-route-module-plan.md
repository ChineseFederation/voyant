# Catalog Booking route module

Status: completed and superseded by Booking Platform v1.

The package-owned Catalog route module now exposes Booking Sessions as the only
pre-commit booking lifecycle. The current contract and invariants live in
[booking-journey-architecture.md](./booking-journey-architecture.md) and
[ADR 0019](../adr/0019-booking-v1-commitment-point-policies.md).

`createCatalogBookingEngineApiModule(...)` composes:

- Booking Session v1 routes for staff and storefront callers;
- public/admin availability-slot reads;
- admin committed-order reads and cancellation;
- admin immutable catalog-snapshot reads.

The beta `createCatalogBookingRoutes(...)` factory and its parallel quote,
draft, and hold bootstrap endpoints were removed in the v1 transactional
cutover. Consumers must not recreate those endpoints as deployment-local
routes. SDKs, tools, storefronts, and admin flows all use Booking Sessions.
