---
"@voyant-travel/catalog-contracts": minor
"@voyant-travel/catalog": minor
"@voyant-travel/trips": minor
"@voyant-travel/inventory": minor
"@voyant-travel/commerce": minor
"@voyant-travel/framework": minor
---

Delete the beta booking-engine quote path (voyant#4188).

Voyant is beta: nothing below is aliased, deprecated, or kept for
compatibility.

**Deleted.** `quoteEntity` / `quoteEntitiesBatch` and the whole
`catalog/src/booking-engine/quote.ts` module, including `QuoteEntityRequest`,
`QuoteEntityResult`, `QuoteEntityDeps`, `QuoteContentEnricher`,
`QuoteContentEnrichmentInput`, `QuoteScope` and `DEFAULT_QUOTE_TTL_MS`;
`serializeQuoteResult`; the shape-enrichment seam
(`createProductQuoteShapeEnricher`, `CatalogProductQuoteEnricher`,
`inventory`'s `enrichProductQuoteShape`), superseded by the owned handler's
`computeRequirements`; the beta tax recompute
(`applyCatalogTaxToQuoteResult`, `applyOperatorTaxToQuoteResult`, and
`CatalogRuntimeServices.applyTaxToQuoteResult`, which was its only caller and
the last writer into `catalog_quotes`).

From the **published** `@voyant-travel/catalog-contracts`: `quoteResponseV1`,
`quoteRequestV1`, `quoteScopeV1`, `quoteBatchRequestV1`, `quoteBatchResultV1`,
`quoteBatchResponseV1`, `quoteBatchCriteriaV1`, `quoteBatchSelectionV1` and
their inferred types. No subpath changed. `bookRequestV1` / `bookResponseV1`
are untouched.

**Added.** `CatalogRuntimeServices.previewOffer(context, input)` — the v1
stateless Offer Preview, exposed on the runtime surface so a server-side
composer reaches the same `composeRequirements` / `composeQuote` ports the
Booking Session lifecycle uses instead of opening a second pricing path. It
replaces `applyTaxToQuoteResult` in the port's conformance set.

**Trips moved onto the v1 lifecycle.** `createCatalogComponentAdapter().quote`
prices a catalog-backed component through Offer Preview and returns
`OfferPreviewResultV1`; `PriceTripDeps.quoteCatalogComponent` and
`ReserveTripDeps.quoteCatalogComponentBeforeReserve` are retyped to match. The
adapter no longer takes `ownedHandlers`, `evaluatePromotions` or
`transformQuoteResult`. Because a preview is non-binding by construction, a
priced catalog component no longer records `catalogQuoteId` and its
`priceExpiresAt` is null — the binding price and its expiry are minted later by
the accepted-Proposal Booking Session.

**Kept, deliberately.** The `catalog_quotes` table. Commerce's
`booking.confirmed` redemption recorder still reads historical
`pricing_applied_offers` from it by `consumed_booking_id`; that subscriber is
mounted and sits outside the retired quote path, so dropping the table would
delete evidence read for already-shipped bookings. It now has no writer.
Consequently promotion codes are not evaluated at quote time — the v1 Session
`composeQuote` has no promotion hook yet, and adding one is separate work.
`createCatalogPromotionEvaluator` and `recordPromotionRedemptionsForBooking`
remain exported and are documented as unwired.

The deleted identifiers are pinned to nowhere by a new
`beta-quote-path-authority` entry in `symbol-policy.json`, and the deleted files
are pinned in `retired-paths.json`.
