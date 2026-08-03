---
"@voyant-travel/utils": minor
"@voyant-travel/db": minor
"@voyant-travel/framework": patch
---

Add an optional conditional-write `putIfAbsent` to the shared KV contract.

Coalescing concurrent misses onto one origin computation needs a way to elect a
single revalidator across processes: exactly one caller gets `true` and performs
the origin work, every other caller gets `false` and serves what it already has.
`KVStore` gains `putIfAbsent(key, value, options?)` for that, and it never
blocks — a loser is told it lost rather than made to wait.

The member is optional because it is only worth having when the backend decides
it atomically. Each store that implements it does so in one round trip:

- `createMemoryKvNamespace` reads and writes without awaiting in between, which
  a single-threaded isolate cannot interleave.
- `createRedisKvStore` issues `SET key value NX [EX ttl]` and reports the write
  only on the `OK` reply, never on a nil one.
- `createPostgresKvStore` issues one `INSERT … ON CONFLICT (key) DO UPDATE …
  WHERE kv_store.expires_at IS NOT NULL AND kv_store.expires_at <= now()
  RETURNING`, so the conflicting caller re-reads the committed expiry under the
  row lock and `RETURNING` yields a row only to the caller that wrote.

All three treat an entry that exists but has expired as absent, matching how
`get` already treats it, so a lapsed slot can be won again rather than
deadlocking behind a holder that is gone.

`createTieredKvStore` exposes `putIfAbsent` only when its L2 does, and delegates
the decision there. L1 is per-process and would hand every process its own
winner, so it cannot arbitrate; it only mirrors the winner's value, still capped
by `l2PromotionTtlSeconds`. A tier over an L2 that cannot elect omits the member
entirely, degrading callers to no coalescing rather than to a false election.

The node-redis TCP adapter in `@voyant-travel/framework` now forwards `nx` as
the SET `NX` condition. It previously dropped unrecognised options, which would
have turned a conditional write into an unconditional one that always reported
success — every caller a winner, which is the failure this contract exists to
prevent.

See ADR 0021 §5.
