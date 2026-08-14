---
"@voyant-travel/core": patch
"@voyant-travel/db": patch
"@voyant-travel/catalog": patch
---

Stop the event bus failing subscribers it was never going to be able to deliver.

Three faults, all of which showed up as `failed` outbox rows nobody read:

- **A subscriber's budget is now its own.** The bus timeout is sized for a
  handler that writes a row, and reindexing a product is legitimately longer, so
  it blew the same 15s on every attempt: the bus recorded a failure, the outbox
  retried into the identical wall, and eight attempts later the event was dead
  even though the work was very likely completing. Catalog reindexing now
  declares the budget it needs.
- **A timeout is reported separately from a throw.** They mean opposite things
  about a retry — a handler that threw is finished and did nothing, one that
  timed out is still running, so redelivering it duplicates the work rather than
  retrying it.
- **A deterministic failure stops retrying.** `PermanentSubscriberError` marks a
  failure no retry can fix; the drain dead-letters it on the spot. A
  misconfigured indexer no longer spends eight attempts, each overwriting
  `last_error`, until the configuration fault is reported as a timeout.

Delivery to zero subscribers is also counted and logged rather than recorded as
a clean delivery, so an event type nobody consumes can no longer look identical
to one every subscriber handled.
