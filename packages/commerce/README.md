# Commerce

`@voyant-travel/commerce` defines the narrow commercial decision Interface and owns
the quote-time markets, pricing, promotions, and sellability runtime sources.

The root call is:

```ts
const decision = await evaluator.evaluateCommercialDecision(input)
```

The question it answers is: can this buyer or channel buy this Catalog Item or
vertical item, for this date, party, market, channel, and currency, and at what
price?

## Public Surface

The package intentionally exposes the Commerce Interface from the root:

- `createCommercialDecisionEvaluator(...)`
- `evaluateCommercialDecision(input, context)`
- `createCommerceAdapterRegistry(...)`
- `recordCommercialSnapshot(decision, target, repository)`
- `createCommerceApiModules()`
- `createCommercePublicApiOfferResolvers()`
- decision, adapter, trace, pricing, promotion, FX, and snapshot types

Pricing, markets, promotions, and sellability source folders are internal
organization behind the root Commerce API. Public runtime consumers import from
`@voyant-travel/commerce` or `@voyant-travel/commerce/schema`.

React/admin consumers should prefer `@voyant-travel/commerce-react` for Commerce-owned
UI wiring. That package owns the reusable Markets, Pricing, Promotions, and
Sellability React/admin source under owner-path subpaths:

- `@voyant-travel/commerce-react/markets`
- `@voyant-travel/commerce-react/pricing`
- `@voyant-travel/commerce-react/promotions`
- `@voyant-travel/commerce-react/promotions/admin`
- `@voyant-travel/commerce-react/sellability`

## Runtime Mounting

Templates should declare one Commerce runtime entry and expand it through
`createCommerceApiModules()`:

```ts
const modules = createCommerceApiModules()
```

The returned modules preserve the existing route prefixes:

- `/v1/pricing` and `/v1/public/pricing`
- `/v1/markets`
- `/v1/sellability`
- `/v1/admin/promotions`

This keeps route compatibility while moving template runtime wiring to the
Commerce Module.

## Input

`CommercialDecisionInput` carries:

- `item`: a Catalog Item or vertical item reference. Operated inventory and
  sourced verticals both enter Commerce through this item reference.
- `date`: the local service date being priced and sold.
- `party`: traveler counts and optional unit counts.
- `currency`: requested sell currency.
- `market`, `channel`, and `buyer`: commercial context.
- `promotionCodes`: requested promotion codes.
- `idempotencyKey`: optional caller key used to replay the same decision or
  snapshot target without minting conflicting evidence. When supplied, Commerce
  derives the decision id from this key instead of the evaluation clock.
- `requestedAt`: optional clock value for deterministic evaluation tests and
  replay.

## Output

`CommercialDecision` returns:

- `status` and `buyable`: `buyable`, `unbuyable`, or `error`.
- `reason`: canonical unbuyable or error code and details.
- `pricing`: currency, minor-unit totals, components, tax/fee facts, and source
  price facts.
- `fx`: requested currency, source currency, rate, rate set, and provider
  handle when conversion was applied.
- `promotions`: applied and rejected promotions, requested codes, total
  discount, and stacking facts.
- `availability` and `sellability`: capacity and policy facts supplied by the
  selected adapter.
- `traces`: applied, skipped, blocked, and error rule traces. Rule ids, market
  facts, promotion ids, FX facts, and adapter calls belong here.
- `handles`: adapter, provider, source, live quote, offer, or reservation
  handles. Commerce records these handles but does not import source-native
  fare tables.
- `validFrom` and `validUntil`: validity bounds for using the decision.

## Error Modes

Unsupported items return an `unbuyable` decision with
`unsupported_item`. Commerce did not find a registered adapter for the item.

Adapter lookup ambiguity returns an `error` decision with `adapter_ambiguous`.
Registry misuse, such as duplicate adapter ids, throws `CommercialDecisionError`
during registration.

Adapter execution failures return an `error` decision with `adapter_failed`.
The decision includes the selected adapter handle and an error trace.

Malformed adapter output returns an `error` decision with
`adapter_invalid_result`. A buyable decision must include pricing facts.

## Side Effects

`evaluateCommercialDecision` is side-effect-free from Commerce's perspective. It
may call registered adapters, and those adapters may read operational or source
state, but the call must not create offers, orders, reservations, holds,
snapshots, ledgers, or audit records.

Persisted evidence is explicit:

```ts
await recordCommercialSnapshot(decision, target, repository)
```

The snapshot repository owns writes and idempotency enforcement for its storage
backend. Commerce passes the decision, target, and idempotency key through a
separate snapshot command instead of writing during evaluation.

## Adapter Registration

Optional Inventory, vertical modules, and source integrations register
price-availability adapters at boot:

```ts
const evaluator = createCommercialDecisionEvaluator()

evaluator.registerPriceAvailabilityAdapter(operatedInventoryAdapter)
evaluator.registerPriceAvailabilityAdapter(cruiseSourceAdapter)
```

An adapter declares `id`, `kind`, `supports(input)`, and `evaluate(input,
context)`. Inventory is just another adapter kind; Commerce does not depend on
Product or Inventory schemas to evaluate sourced or vertical items.
