/**
 * The V1 booking-engine contract schemas (requirements, selection,
 * pricing, session) now live in
 * `@voyant-travel/catalog-contracts` so external consumers (Voyant Connect, adapter
 * authors, the Admin SDK) can validate booking-engine payloads without the
 * catalog runtime. Re-exported here to keep existing `@voyant-travel/catalog`
 * import paths stable. See `docs/adr/0002-contract-packages.md`.
 */
export * from "@voyant-travel/catalog-contracts/booking-engine/contracts"
