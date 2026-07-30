/**
 * Options for the in-memory TTL cache decorator that wraps cruise adapters.
 *
 * This is a pure options contract with no runtime dependency — the
 * `memoizeCruiseAdapter` implementation that consumes it lives in the
 * `@voyant-travel/cruises` runtime package. It is placed here so external
 * consumers (e.g. Voyant Connect) can reference the option shape without
 * taking a runtime dependency on the cruises module (ADR-0002).
 */
export type MemoizeOptions = {
  /** Cache TTL in milliseconds. Default 60_000 (60 seconds). */
  ttlMs?: number
  /**
   * Maximum cache entries before LRU eviction kicks in. Default 1000.
   * Set to 0 to disable size cap (only TTL evicts).
   */
  maxEntries?: number
}
