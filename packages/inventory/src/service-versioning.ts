/**
 * Publication versioning — turning a successful publish into an immutable
 * Product Version.
 *
 * Per the parent RFC (#4027) every operated Departure must be able to name the
 * exact Product definition it was sold from, and later Product edits must not
 * silently rewrite it. That starts here: publishing an operationally changed
 * Product freezes a snapshot. Binding a Departure to that snapshot is #4032.
 *
 * Two rules matter:
 *
 *   1. Only a Product that is *active* mints versions. Draft churn is not
 *      history worth keeping.
 *   2. Re-publishing a Product whose operationally relevant fields are
 *      unchanged does not mint a version. Without this the version list fills
 *      with duplicates and "which definition was this sold from" stops being
 *      answerable.
 */

import { desc, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { productVersions } from "./schema.js"
import { itineraryHistoryProductsService } from "./service-itinerary-history.js"
import { hasOperationalChange } from "./service-readiness.js"

export interface EnsureProductVersionInput {
  productId: string
  /** Acting user; stored as the version's author. */
  authorId: string
  /** Product lifecycle status *after* the mutation that triggered this. */
  status: string
  /** Optional operator note explaining the publication. */
  notes?: string | null
}

export type EnsureProductVersionOutcome =
  | { created: false; reason: "not_active" | "no_operational_change" | "product_not_found" }
  | { created: true; versionNumber: number; versionId: string }

/**
 * Create a Product Version if publication warrants one.
 *
 * Returns why it declined rather than silently doing nothing, so callers and
 * tests can assert the suppression rule instead of inferring it from an
 * unchanged row count.
 */
export async function ensureProductVersionOnPublish(
  db: PostgresJsDatabase,
  input: EnsureProductVersionInput,
): Promise<EnsureProductVersionOutcome> {
  if (input.status !== "active") {
    return { created: false, reason: "not_active" }
  }

  const [latest] = await db
    .select({ snapshot: productVersions.snapshot })
    .from(productVersions)
    .where(eq(productVersions.productId, input.productId))
    .orderBy(desc(productVersions.versionNumber))
    .limit(1)

  const previousSnapshot = toRecord(latest?.snapshot)

  // Build the candidate snapshot first and compare, so an unchanged
  // re-publication never writes a row it would have to take back.
  const candidate = await itineraryHistoryProductsService.buildSnapshot(db, input.productId)
  if (!candidate) {
    return { created: false, reason: "product_not_found" }
  }

  if (previousSnapshot && !hasOperationalChange(previousSnapshot, candidate)) {
    return { created: false, reason: "no_operational_change" }
  }

  const created = await itineraryHistoryProductsService.createVersion(
    db,
    input.productId,
    input.authorId,
    { notes: input.notes ?? null },
  )

  if (!created) {
    return { created: false, reason: "product_not_found" }
  }

  return { created: true, versionNumber: created.versionNumber, versionId: created.id }
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
