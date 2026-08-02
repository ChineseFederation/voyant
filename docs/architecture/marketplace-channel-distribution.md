# Marketplace Channel Distribution

Status: planning reference
Audience: anyone designing how local experience providers can use Voyant as their reservation system while selling through Viator, GetYourGuide, and similar marketplaces.

This document covers the outbound-channel direction:

```txt
Voyant owned inventory
  -> Viator / GetYourGuide as sales channels
  -> marketplace customers book
  -> marketplace calls Voyant for availability, price, reservation, booking, cancellation, and status
```

This is the inverse of [Marketplace Experiences Sourcing](./marketplace-experiences-sourcing.md), where Viator/GetYourGuide inventory is sourced into Voyant for resale.

Primary references:

- Viator Supplier / Reservation System API: `https://docs.viator.com/supplier-api/technical/`
- Viator Supplier API overview: `https://docs.viator.com/supplier-api/technical/api-overview/`
- GetYourGuide reservation-system connectivity overview: `https://supply.getyourguide.support/hc/en-us/articles/20309311919773-Connecting-Your-Product-to-a-Reservation-System-Inbound-Outbound-Connectors`
- GetYourGuide API features overview: `https://supply.getyourguide.support/hc/en-us/articles/14150246193181-API-Features-and-Functionalities`

## 1. Core Distinction

In this direction, Voyant is the **operator system of record**.

The local provider owns and operates the experience:

- product content originates in Voyant
- availability and capacity originate in Voyant
- pricing can originate in Voyant, subject to channel capability
- bookings land in Voyant
- holds, confirmations, cancellations, fulfillment, and redemption are managed in Voyant

Viator/GetYourGuide are **channels**, not inventory sources.

In Voyant vocabulary:

- **Owned Product**: the local provider runs the experience.
- **Channel**: the sales and distribution context that controls assortment and
  commercial behavior. Third-party marketplaces are Channels, and direct
  storefronts also resolve to a Channel.
- **Publication**: Distribution-owned permission for a Channel to sell a
  Product. Publication can be authored at Product or Supplier scope and is
  default-deny.
- **Channel Product Mapping**: the external identifier, routing, and
  synchronization configuration between a Voyant product/option and the
  marketplace's product/option identifier. Mapping is not publication
  authority.
- **Channel Booking Link**: the relationship between a Voyant booking and the marketplace booking/reference.
- **Channel Adapter**: the integration package that exposes Voyant inventory and booking operations in the channel's required API shape.

## 2. Architectural Rule

Viator and GetYourGuide outbound integrations should be **distribution channel adapters**, not catalog source adapters.

They should sit on top of existing modules:

- `packages/inventory`
- `packages/operations`
- `packages/commerce`
- `packages/bookings`
- `packages/distribution`
- `packages/bookings/src/requirements`
- `packages/fulfillment` concepts inside bookings

The core modules should stay provider-agnostic. Channel-specific payloads, status codes, certification quirks, auth requirements, retries, and mapping rules belong in adapter packages.

Suggested packages:

- `@voyant-travel/channel-viator-supplier`
- `@voyant-travel/channel-getyourguide-supplier`

These packages may be distributed as plugins later, but their runtime role is adapter/extension, not a new domain module.

## 3. Current State

Voyant already has useful foundations:

- Products, options, units, media, locations, and content live in `packages/products`.
- Availability rules, start times, generated slots, pickup points, cutoff, and capacity live in `packages/availability`.
- Bookings support hold, confirm, expire, cancel, allocation, fulfillment, redemption, and audit activity.
- `packages/distribution` has channels, contracts, commission rules, product mappings, booking links, webhook events, allotments, release rules, settlement, and reconciliation structures.
- No production external channel facade is currently mounted. OCTO support is
  deferred until a deployment requires a certified adapter over these modules.

The missing part is a production-grade marketplace channel facade:

- Viator Supplier API-compatible endpoints.
- GetYourGuide reservation-system-compatible endpoints.
- channel-specific mapping and capability setup.
- certification-grade error handling, idempotency, auth, and test harnesses.
- operational jobs for availability notification, reconciliation, and sync health.

## 4. Directional Model

The target shape is:

```txt
Voyant product / option / unit
  -> publication decision + optional channel product mapping
  -> channel reads product/availability/price only when effectively published
  -> customer books on channel
  -> channel reserves or books through Voyant adapter
  -> Voyant creates local booking + allocation
  -> Voyant returns confirmation/Service Voucher/reference
  -> channel displays marketplace Service Voucher/customer confirmation
  -> post-book changes reconcile through channel booking links
```

Voyant remains the operational source of truth. The marketplace receives enough data to sell and service the booking, but does not own the operator's inventory.

## 5. Product And Option Mapping

Marketplace channels generally need explicit mapping.

Required mapping concepts:

```txt
channel_product_mappings
  channel_id
  product_id
  option_id
  external_product_id
  external_option_id
  external_rate_id
  external_category_id
  status
  capabilities
  last_validated_at
  validation_errors
```

The existing `channelProductMappings` table already covers the first part of this shape: channel, product, external product/rate/category, and active state. It likely needs option-level precision and richer validation/capability metadata for marketplace certification.

Mapping must support:

- one Voyant product to one channel product
- one Voyant product with multiple options to multiple channel options
- channel-specific ticket categories mapped to Voyant option units or pricing categories
- start-time/language/pickup variants when the channel treats them as separate options
- active/inactive mapping state
- validation feedback from the channel

Mapping answers "how do we identify and synchronize this Product with this
external Channel?" It does not answer "may this Channel sell this Product?"
After migration, an active Mapping without effective Publication may remain
useful for setup, validation, or reconciliation, but it cannot expose a Product
to public catalog, pricing, booking, or channel push. A direct Storefront may
sell an effectively published Product with no external Mapping.

## 5.1 Publication Authority

Distribution owns two publication rule types:

- Product publication: one include or exclude decision for a Channel and
  Product.
- Supplier publication: one include or exclude decision for a Channel and
  canonical Supplier.

Publication is default-deny. The effective decision is resolved in this order:

1. Missing or inactive Channel denies.
2. A Product-specific decision wins.
3. Otherwise a Supplier-specific decision applies when the Product has a
   canonical Supplier.
4. Otherwise the Product is unpublished.

A Product without a canonical Supplier can only be published explicitly. Product
eligibility stays outside this resolver: inactive lifecycle, private visibility,
availability, pricing, allotment, policy, and sellability gates may still deny a
published Product.

Supplier publication changes can affect many Products, so they hand off durable,
bounded, resumable reindex work. Product publication changes enqueue targeted
Channel/Product reindex work. The admin request completes after the durable
handoff rather than after traversing a supplier's full assortment.

The compatibility cutover follows the same rule. Its schema migration creates
one `catalog` reindex intent; it does not synchronously materialize the
Channels-by-Products Cartesian set. The publication-intent worker walks active,
public Products and active Channels in independently bounded ID-ordered pages,
inserts missing include rules with conflict-safe writes, and persists a
composite `afterProductId`/`productId`/`afterChannelId` cursor. A Product is
reindexed only after its final Channel page is materialized. Operators observe
progress through the intent's
`status`, `cursor`, `attempts`, `lastError`, `processingStartedAt`, and
`completedAt` fields. A checkpoint retains the processing lease; it never
returns the row to `pending`, where a concurrent enqueue could collide with the
pending-subject uniqueness constraint.

Product lifecycle intents may be Channel-independent. This is required for
Channel and Supplier deletion: the deleting transaction captures affected
Product IDs before cascading or clearing rules, records global Product intents,
and only then removes the subject. Supplier deletion also removes its
publication rules and clears the legacy canonical Supplier mirror, preventing
orphaned rules from remaining effective.

## 6. Channel Connectivity Modes

### 6.1 Viator Supplier / Reservation System API

Viator's supplier-side integration expects the reservation system to expose APIs that Viator calls.

Typical capabilities:

- tour/product list for mapping
- product validation/details
- calendar availability and pricing
- real-time availability check
- reserve/hold
- booking creation
- amendment
- cancellation
- redemption verification
- availability notification where supported

Newer Viator supplier APIs include v2 availability/check, calendar, reserve, and booking concepts. Older v1 endpoints exist but should be treated as legacy unless a certification path requires compatibility.

### 6.2 GetYourGuide Reservation-System Connectivity

GetYourGuide connectivity can involve inbound or outbound connector modes.

From Voyant's perspective, the relevant target is: GetYourGuide can read availability and prices and send reservations/bookings to the supplier reservation system.

Typical capabilities:

- product list
- product details
- option mapping
- pricing categories
- availability by ticket category
- price over API
- reservation expiration
- booking/reservation processing
- notify availability update
- deals/promotions where enabled
- reactivation and product validation workflows

Some capabilities are gated by GetYourGuide partner status, feature activation, or integrator portal approval.

## 7. Channel Adapter Surface

Voyant should define a shared outbound channel adapter contract before building provider-specific packages.

Possible contract:

```ts
interface MarketplaceChannelAdapter {
  readonly kind: "viator-supplier" | "getyourguide-supplier" | string
  readonly capabilities: MarketplaceChannelCapabilities

  listProducts(ctx, query): Promise<ChannelProductList>
  getProduct(ctx, mapping): Promise<ChannelProductDetail>
  getAvailability(ctx, request): Promise<ChannelAvailabilityResponse>
  getPrice(ctx, request): Promise<ChannelPriceResponse>
  reserve(ctx, request): Promise<ChannelReservationResponse>
  confirmBooking(ctx, request): Promise<ChannelBookingResponse>
  amendBooking?(ctx, request): Promise<ChannelAmendmentResponse>
  cancelBooking(ctx, request): Promise<ChannelCancellationResponse>
  getBookingStatus(ctx, request): Promise<ChannelBookingStatusResponse>
  redeem?(ctx, request): Promise<ChannelRedemptionResponse>
}
```

Provider packages then translate between:

- channel-specific request/response schemas
- Voyant internal services
- channel booking/mapping records
- channel-specific error codes

## 8. API Boundary

Channel APIs should not be mounted under customer-facing `/v1/public/*`.

They are machine-to-machine channel endpoints.

Possible route shape:

```txt
/v1/channels/viator-supplier/*
/v1/channels/getyourguide-supplier/*
```

or, when mounted per channel connection:

```txt
/v1/channel-connections/:connectionId/viator/*
/v1/channel-connections/:connectionId/getyourguide/*
```

Requirements:

- authentication per channel connection
- request signing or API key validation where required
- channel-specific content type support
- idempotency keys for reserve/book/cancel operations
- request/response audit logging
- deterministic error mapping
- correlation ids
- rate limiting and abuse protection

## 9. Availability And Pricing

Marketplace channels need two categories of availability/pricing data.

### 9.1 Calendar / Batch Availability

Used for marketplace browse calendars and date availability.

Voyant source:

- availability rules
- generated slots
- remaining capacity
- cutoff state
- pickup/resource constraints where needed
- public price catalogs or channel-specific price catalogs

Output:

- available/unavailable dates
- capacity or vacancy where supported
- from price
- per-ticket-category price where supported
- cutoff information
- unavailable reason where supported

### 9.2 Real-Time Availability / Price Check

Used during the booking funnel.

Voyant source:

- locked or live slot state
- requested traveler/category mix
- requested option/start time/date
- pricing catalog/rules
- sellability constraints
- pickup/meeting requirements

Output:

- available/unavailable
- exact price
- available capacity
- booking cutoff
- reservation/hold eligibility
- channel-specific unavailable reason

Real-time checks must not create local bookings unless the channel specifically calls a reserve/hold endpoint.

## 10. Reservation And Booking

Channels may separate reservation/hold from booking confirmation.

Voyant should preserve that distinction:

```txt
channel reserve
  -> provider/channel hold
  -> no local booking row

channel confirm/book
  -> admitted Finance booking-create command
  -> lease-gated Bookings settlement
  -> fulfillment artifacts issued asynchronously where applicable
  -> channel booking link updated
```

If a channel sends only a confirmed booking without a prior reserve, the adapter can perform reserve + confirm in one transaction-like flow.

Hard requirements:

- idempotency by channel booking/reference key
- no double allocation on retries
- deterministic response if the same request is replayed
- hold expiry alignment with channel rules
- release held capacity when channel reservation expires or is abandoned
- clear mapping of channel status to Voyant status

## 11. Booking Requirements

Voyant must expose the fields a channel needs to complete a booking.

Potential sources:

- `packages/bookings/src/requirements`
- product settings
- product option/unit constraints
- pickup/meeting configuration
- ticket/fulfillment requirements
- legal/waiver requirements

Needed outputs:

- traveler names required
- traveler ages/date of birth required
- lead traveler/contact required
- hotel pickup field required
- language selection required
- Service Voucher delivery constraints
- accessibility/dietary/free-text fields

The adapter should normalize these into the channel-specific contract and validate incoming booking payloads against the active requirements.

## 12. Fulfillment, Vouchers, And Redemption

For channel bookings, Voyant may need to return:

- supplier confirmation number
- booking reference
- barcode or QR code
- Service Voucher URL
- ticket URL
- per-traveler ticket artifacts
- meeting/pickup instructions
- emergency contact
- redemption validation result

Voyant should store channel-delivered references in `channelBookingLinks` and store actual fulfillment artifacts in booking fulfillment records.

If the channel owns the customer Service Voucher, Voyant still needs a supplier-side confirmation reference and operational check-in view.

## 13. Post-Book Operations

Adapters should support, by capability:

- cancellation
- amendment
- reservation expiration
- booking status lookup
- Service Voucher reissue
- redemption verification
- no-show or check-in status where applicable

Post-book operations must update:

- local booking status
- allocation status/capacity
- channel booking link
- booking activity log
- reconciliation state
- refund/finance state where applicable

## 14. Reconciliation And Settlement

Marketplace bookings need reconciliation because channel-side truth and local truth can drift.

Reconciliation should compare:

- booking existence
- booking status
- cancellation status
- booked date/time/option
- traveler/category counts
- gross amount
- commission/net amount
- payout/remittance amount
- Service Voucher/reference state

The existing distribution reconciliation and settlement tables are the right home for this, but provider-specific processors are needed.

Settlement concerns:

- commission rate
- net-rate resale
- channel-collected payment
- operator-collected payment
- refund liability
- chargeback liability
- payout timing
- tax/fee treatment

## 15. Admin Experience

Operators should be able to:

- create Viator/GetYourGuide channels
- configure API credentials and endpoint exposure
- set contract/payment/cancellation ownership
- map products/options/categories
- validate mappings
- choose whether availability/pricing is exposed
- configure channel price catalog/markups where supported
- define allotments or channel caps
- inspect sync health and channel API logs
- inspect incoming reservations/bookings
- reconcile booking/status/payment mismatches
- pause or disable a channel without deleting history

Admin language should be explicit:

- "Sell this owned product on Viator"
- "Map this Voyant option to a GetYourGuide option"
- "Channel booking"
- "Channel reference"

Avoid language such as "import from Viator" in this direction.

## 16. Storefront Impact

Direct Storefronts and external marketplace Channels use the same Channel
assortment authority.

The marketplace is the customer-facing surface for channel bookings. Voyant may
also run one or more direct Storefronts in parallel. Each active Storefront binds
to exactly one active Channel through deployment-composed link data; a Channel
may serve many Storefronts. Public Storefront requests derive Channel from the
resolved Storefront API key or approved origin, not from caller-submitted
Channel input.

The DB package migration owns only the link-table DDL and Storefront-local
origin-overlap validation. Channel creation, binding backfill, and the
fail-closed active-binding check run as a Distribution-owned setup migration
after the DB, Storefront, and Distribution schema migration facets. This keeps
fresh installs independent of package migration ordering while preserving one
transactional, idempotent cutover.

The prior-visible publication snapshot is also a Distribution-owned setup
migration, never a hard `requiresSchemas` edge to operated Inventory. It runs
after all selected schema facets: operated deployments snapshot active public
Products when the Inventory table is present, while sourced-only deployments
record an explicit empty Product snapshot. Active Channels are snapshotted in
both modes, and the two linear sets are stamped atomically before workers run.

Storefront publication is still Distribution policy. Frontend composition may
choose layout, content placement, and routes, but it never grants Product
publication.

Shared inventory must remain consistent across:

- direct storefront bookings
- admin/manual bookings
- Viator bookings
- GetYourGuide bookings
- other channel bookings

The allocation layer is the point of consistency.

## 17. Required Platform Changes

To make this production-ready, Voyant needs:

1. Shared outbound marketplace channel adapter contract.
2. Viator Supplier API adapter package.
3. GetYourGuide reservation-system adapter package.
4. Channel connection credentials and auth middleware.
5. Product/option/category mapping enhancements.
6. Channel-specific product/detail serializers.
7. Availability/calendar/check serializers.
8. Channel-specific reserve/book/cancel/amend handlers.
9. Idempotency store keyed by channel request identifiers.
10. Booking requirement export and inbound payload validation.
11. Fulfillment/Service Voucher/barcode mapping.
12. Channel booking reconciliation processors.
13. Availability/pricing notification jobs where supported.
14. Certification test harnesses for each channel.
15. Operational logging and support diagnostics.

## 18. Implementation Slices

### Slice 1: Channel Foundation

Goal: represent Viator/GetYourGuide as channels and map products.

Deliver:

- channel setup guidance
- mapping UI extensions
- option-level mapping
- credential/config storage
- provider capability display
- audit log for channel API calls

No live channel booking yet.

### Slice 2: Read APIs

Goal: channel can validate mapped products and read availability/pricing.

Deliver:

- product list/detail endpoint shape
- availability calendar endpoint shape
- real-time availability/price endpoint shape
- channel-specific error mapping
- certification fixtures for read flows

### Slice 3: Reservation And Booking

Goal: channel can reserve and confirm owned inventory in Voyant.

Deliver:

- reserve endpoint
- booking endpoint
- idempotency
- channel booking link creation
- hold expiry/release behavior
- booking activity log integration

### Slice 4: Post-Book Operations

Goal: channel-originated bookings can be managed after confirmation.

Deliver:

- cancellation
- amendment where supported
- booking status lookup
- Service Voucher/reference response
- redemption verification where supported

### Slice 5: Reconciliation And Operations

Goal: operator can support channel bookings at scale.

Deliver:

- reconciliation runs
- settlement matching
- health dashboard
- failed request replay
- mapping validation reports
- certification checklist

## 19. Open Questions

- Should the outbound adapter contract live in `packages/distribution` or a new `packages/channel-adapters` package?
- Should Viator and GetYourGuide be mounted as public internet endpoints by default, or only through explicit template configuration?
- Do we support direct API connectivity first, or OCTO first where channels can consume it?
- Which product fields must be source-of-truth in Voyant versus still configured in the marketplace supplier portal?
- Do we model channel-specific ticket categories as pricing categories, option units, or a mapping layer over both?
- How much pricing control should channels have versus Voyant price catalogs?
- What is the minimum cancellation/amendment support required for first certification?
- How do channel-specific booking questions map back into Voyant's booking requirements?
- Should availability notifications be push jobs from Voyant or pulled by channels only?
- What support tools are needed before operators can rely on this in production?

## 20. Non-Goals

For this direction, do not build:

- sourced inventory ingestion from Viator/GetYourGuide
- a new experiences vertical separate from `products`
- channel-specific forks of product, availability, or booking core logic
- marketplace-specific booking tables that bypass local bookings
- storefront-specific routes for machine-to-machine marketplace connectivity
- fake local bookings that do not allocate capacity

## 21. Design Bar

This direction is correct when:

- Voyant remains the operator's inventory source of truth.
- Viator/GetYourGuide can sell mapped products without manual rekeying.
- Marketplace bookings create real Voyant bookings and allocations.
- Retries do not double-book inventory.
- Channel references are preserved for support and reconciliation.
- Operators can pause, validate, and troubleshoot each channel.
- Adding another marketplace later does not require rewriting products, availability, bookings, or distribution core.
