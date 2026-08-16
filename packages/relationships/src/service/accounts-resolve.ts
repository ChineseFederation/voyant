import { identityContactPoints } from "@voyant-travel/identity/schema"
import { and, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { people } from "../schema.js"
import { peopleAccountsService } from "./accounts-people.js"
import { personEntityType } from "./accounts-shared.js"
import { normalizeContactValue, toNullableTrimmed } from "./helpers.js"

/**
 * Best-effort contact snapshot used by booking/storefront flows to
 * resolve (or upsert) a CRM person from billing or traveler payloads.
 * Empty-string and whitespace-only fields are normalized to `null`.
 */
export interface PersonContactInput {
  firstName?: string | null
  lastName?: string | null
  /**
   * Single-string display name when first/last aren't provided
   * separately — split on whitespace.
   */
  name?: string | null
  email?: string | null
  phone?: string | null
  preferredLanguage?: string | null
}

export interface UpsertPersonFromContactOptions {
  /** `source` recorded on the `people` row (`"storefront-booking"`, etc.). */
  source?: string | null
  /** `source_ref` recorded on the `people` row — e.g. the session id. */
  sourceRef?: string | null
  /** Tags propagated to the new person when one is created. */
  tags?: string[]
  /** Status override; defaults to `"active"`. */
  status?: "active" | "inactive"
  /**
   * When true, returns `null` instead of creating a person if the
   * snapshot has no email or phone dedupe key.
   */
  requireContactPoint?: boolean
}

function splitName(name: string | null | undefined): {
  firstName?: string
  lastName?: string
} {
  if (!name) return {}
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return {}
  if (parts.length === 1) return { firstName: parts[0] }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
}

/**
 * Derives `{ firstName, lastName }` for a CRM person from whatever
 * contact bits the caller has. Mirrors the public-api-intake helpers
 * (`personNameFromContact` / `personNameFromNewsletter`) so identity
 * resolution from booking/traveler payloads stays symmetric. Falls
 * back to the email local-part before resorting to literal placeholders
 * — `people.first_name`/`last_name` are NOT NULL and the issue #961
 * acceptance criteria call out that the literal `"Unknown"` should
 * never be inserted.
 */
export function personNameFromContact(input: PersonContactInput): {
  firstName: string
  lastName: string
} {
  const split = splitName(input.name ?? null)
  const emailLocalPart = input.email
    ?.split("@")[0]
    ?.replace(/[._-]+/g, " ")
    .trim()
  const firstName =
    toNullableTrimmed(input.firstName) ?? split.firstName ?? emailLocalPart ?? "Customer"
  const lastName = toNullableTrimmed(input.lastName) ?? split.lastName ?? "Guest"
  return { firstName, lastName }
}

/**
 * Returns the first person whose normalized contact point matches
 * `(kind, value)`. Email and website are normalized to lowercase; phone
 * is trimmed. Returns `null` when no match exists, the value resolves to
 * an empty string, or the matching contact point is attached to a
 * non-person entity (organizations share the same table).
 */
export async function findPersonByContactPoint(
  db: PostgresJsDatabase,
  query: { kind: "email" | "phone" | "website"; value: string | null | undefined },
): Promise<typeof people.$inferSelect | null> {
  const value = toNullableTrimmed(query.value)
  if (!value) return null

  const normalized = normalizeContactValue(query.kind, value)
  const [row] = await db
    .select({ personId: identityContactPoints.entityId })
    .from(identityContactPoints)
    .where(
      and(
        eq(identityContactPoints.entityType, personEntityType),
        eq(identityContactPoints.kind, query.kind),
        eq(identityContactPoints.normalizedValue, normalized),
      ),
    )
    .limit(1)

  if (!row) return null
  return peopleAccountsService.getPersonById(db, row.personId)
}

/**
 * Finds an existing CRM person by normalized email (then phone as a
 * fallback) or creates a new one from the supplied contact snapshot.
 * Used by booking session bootstrap + confirm flows so storefront
 * bookings produce a real CRM record without each consumer reinventing
 * the dedupe key. The created row carries the supplied `source` /
 * `sourceRef` so the audit trail mirrors lead/newsletter signals.
 *
 * Lookup order: email → phone. The first hit wins; ties never happen
 * because identity contact points are unique per `(kind, normalized)`
 * for a given entity but consumers can re-use the same email across
 * people via the unique-by-person sync logic. In that case the first
 * person we see is returned — callers that need stricter ownership
 * semantics should resolve themselves and pass a `personId` directly.
 */
export async function upsertPersonFromContact(
  db: PostgresJsDatabase,
  contact: PersonContactInput,
  options: UpsertPersonFromContactOptions = {},
): Promise<typeof people.$inferSelect | null> {
  const email = toNullableTrimmed(contact.email)
  const phone = toNullableTrimmed(contact.phone)

  if (email) {
    const existing = await findPersonByContactPoint(db, { kind: "email", value: email })
    if (existing) return existing
  }
  if (phone) {
    const existing = await findPersonByContactPoint(db, { kind: "phone", value: phone })
    if (existing) return existing
  }

  if (options.requireContactPoint && !email && !phone) {
    return null
  }

  // No match — create a new person. `personNameFromContact` ensures
  // first/last name are populated even when only an email is on file.
  const { firstName, lastName } = personNameFromContact(contact)
  return peopleAccountsService.createPerson(db, {
    firstName,
    lastName,
    email,
    phone,
    website: null,
    status: options.status ?? "active",
    source: options.source ?? null,
    sourceRef: options.sourceRef ?? null,
    preferredLanguage: toNullableTrimmed(contact.preferredLanguage),
    tags: options.tags ?? [],
  })
}
