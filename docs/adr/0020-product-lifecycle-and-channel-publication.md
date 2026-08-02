# ADR 0020: Product lifecycle and Channel publication

Status: Accepted

## Context

Products historically carried three overlapping publication controls:

- lifecycle `status` (`draft`, `active`, `archived`);
- `visibility` (`public`, `private`, `hidden`); and
- `activated`, presented in the operator as “Visible on site”.

Distribution models named Channels, explicit Publication rules, and optional
Channel Product Mappings. The duplicate Product flags allow contradictory states
and cannot express the normal requirement “sell this Product on our storefront
and one OTA, but not on another OTA”.

## Decision

Product lifecycle and distribution are separate axes:

1. `products.status` is the lifecycle authority. Only `active` Products are
   eligible for customer or partner catalog documents. Scheduled Products must
   still satisfy departure readiness before becoming active.
2. Distribution-owned effective Publication is the assortment authority for a
   Channel. Publication is default-deny, Product-specific rules override
   Supplier-specific rules, and a missing or inactive Channel denies sale.
3. Every active Storefront binds to exactly one active Channel. Storefront and
   Channel remain distinct concepts, and there is no implicit “site” publication
   switch.
4. Public and external catalog slices require an explicit server-derived
   Channel and effective Publication. Unchannelled compatibility slices are
   never an authorization fallback.
5. Product `visibility` and `activated` remain in storage and API contracts for
   compatibility, but are deprecated. Operator authoring and catalog facets do
   not expose them, catalog documents do not project them, and publish
   readiness/index listability do not read them.
6. The lifecycle tools are status transitions: publish → `active`, unpublish →
   `draft`, archive → `archived`. Removing a Product from one sales surface is a
   Publication operation, not an unpublish operation.
7. Channel Product Mappings store external identifiers, routing, and
   synchronization configuration. They are not Publication authority, and a
   direct Storefront does not require an external mapping.

Staff catalog slices continue to show active Products independently of
Publication so operators can find and configure undistributed inventory.

## Compatibility and migration

No destructive database migration is made in this change. Existing clients may
continue sending and reading `visibility` and `activated`; the values are not
authoritative and new code must ignore them for distribution decisions.

The legacy Inventory public-product endpoints cannot join Distribution without
breaking package boundaries. They retain their existing compatibility filters
temporarily. Channel-aware storefronts and external discovery must use the
Catalog plane with a Channel scope. Retiring those direct endpoints, or moving
them behind an injected Catalog listability port, is required before the
compatibility columns can be dropped.

A deployment adopting this decision must:

1. create an active Channel and Storefront binding for every direct storefront;
2. create Product- or Supplier-scoped Publication rules for each Channel's
   assortment;
3. keep Channel Product Mappings only where external routing or synchronization
   requires them;
4. run a catalog reindex so deprecated Product flags disappear from documents
   and Channel-scoped slices reflect effective Publication; and
5. migrate API clients away from writing or filtering by `visibility` and
   `activated`.

## Consequences

- A Product can remain active while being removed from one Channel.
- A newly active Product with no effective Publication is intentionally not
  customer/partner discoverable.
- Publication changes and Channel lifecycle changes trigger targeted or durable
  catalog reindexing without editing the Product.
- Mapping changes can trigger external synchronization work but do not change
  assortment permission.
- The compatibility columns cannot be removed until legacy public routes and
  external clients have migrated.
