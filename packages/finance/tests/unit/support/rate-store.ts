import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

/**
 * The narrow read shape `resolveDocumentFxRate` uses against `exchange_rates`:
 * `select(...).from(...).where(...).orderBy(...).limit(1)`.
 *
 * Unit tests that only exercise the resolver leg still have to answer it,
 * because looking for an already-captured rate before reaching for the source
 * is the whole point of the ordering (voyant#4703).
 */
export function fakeRateStore(rows: readonly unknown[] = []): PostgresJsDatabase {
  const rowsFor = async () => [...rows]
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: rowsFor }),
          limit: rowsFor,
        }),
      }),
    }),
  } as unknown as PostgresJsDatabase
}

/**
 * A store that answers each successive lookup differently, so a test can say
 * "nothing for the document's own day, but an older rate exists". The order is
 * the resolution order itself: same-day direct, same-day inverse, then — only
 * when the resolver leg did not already answer — standing direct and inverse.
 * Lookups past the end of the script return nothing.
 */
export function scriptedRateStore(answers: ReadonlyArray<readonly unknown[]>): PostgresJsDatabase {
  let call = 0
  const next = async () => [...(answers[call++] ?? [])]
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: next }),
          limit: next,
        }),
      }),
    }),
  } as unknown as PostgresJsDatabase
}
