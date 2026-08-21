/**
 * Finance's durable Booking settlement helper for Catalog Booking Session v1.
 *
 * Catalog owns the public Session Commit route; Finance owns the durable
 * command that composes a Booking with its payment schedules, tax lines, and
 * documents. Catalog derives the command from the exact Session revision,
 * Quote, and Hold before invoking this helper inside the root transaction.
 *
 * Everything in the command is derived server-side. The caller named a Session
 * and Quote; it never names a booking number, price, tax line, relationship
 * id, or status.
 */
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { executeFinanceSelfServiceBookingCreateCommand } from "./booking-create-command.js"
import { FINANCE_BOOKING_CREATE_SELF_SERVICE_ACTION } from "./booking-create-policy.js"
import { allocateBookingNumber } from "./booking-number.js"
import type { SelfServiceBookingSourceRuntime } from "./self-service-booking-source.js"
import type { FinanceServiceRuntime } from "./service.js"

export interface SelfServiceCreateRuntimeDeps {
  /**
   * Resolves and verifies the Booking Session + Quote, and spends them.
   *
   * Resolved per call because the deployment supplies it as a runtime port,
   * whose value may still be a promise when this runtime is constructed.
   */
  resolveSource(): SelfServiceBookingSourceRuntime | Promise<SelfServiceBookingSourceRuntime>
  /**
   * Mints the route admission against the graph-registered action. The route
   * never fabricates one; this is the only way it can be obtained.
   */
  admit(
    actor: string,
    idempotencyKey: string,
  ): Parameters<typeof executeFinanceSelfServiceBookingCreateCommand>[0]["admitted"]
  runtime?: FinanceServiceRuntime
  grantCustomerAccess?(
    tx: PostgresJsDatabase,
    input: {
      bookingId: string
      buyerAccountId: string
      buyerAccountKind: "personal" | "business"
      grantedByPrincipalId: string
      grantedByMembershipId?: string
      grantedByMembershipRole?: string
      idempotencyKey: string
      proofRef: string
    },
  ): Promise<void>
  /**
   * Read the persisted booking's reference and status. Used after the command
   * so an idempotent replay reports the ORIGINAL booking's number rather than
   * the one this call speculatively allocated and never persisted, and so the
   * response states the booking's real status instead of assuming one.
   */
  readBookingSummary?(
    db: PostgresJsDatabase,
    bookingId: string,
  ): Promise<{ bookingNumber: string; status: string } | null>
}

export function createSelfServiceCreateRuntime(deps: SelfServiceCreateRuntimeDeps) {
  return {
    async createFromSession(input: {
      db: PostgresJsDatabase
      sessionId: string
      quoteId: string
      caller: { personId?: string; verifiedEmail?: string; verifiedPhone?: string }
      /** Required by public callers; omitted by trusted staff workflows. */
      publicApiOrigin?: { channelId: string }
      idempotencyKey: string
      /** Proves the caller holds the anonymous Session. */
      sessionCapability?: string
      /**
       * The challenge that authorized a guest create. Absent for an
       * authenticated customer, who is identified by their account instead.
       */
      guestChallengeId?: string
      /** The authenticated customer's user id, when they have an account. */
      userId?: string
      customerAccess?: {
        buyerAccountId: string
        buyerAccountKind: "personal" | "business"
        membershipId?: string
        membershipRole?: string
      }
      consumeSources?(tx: PostgresJsDatabase, bookingId: string): Promise<void>
    }) {
      const source = await deps.resolveSource()
      const resolved = await source.resolveBookingSource({
        db: input.db,
        sessionId: input.sessionId,
        quoteId: input.quoteId,
        caller: input.caller,
        ...(input.sessionCapability ? { sessionCapability: input.sessionCapability } : {}),
      })
      if (resolved.status !== "ok") {
        return { status: "rejected" as const, reason: resolved.reason }
      }

      // Allocated here, never accepted from the caller.
      const bookingNumber = await allocateBookingNumber(input.db)

      // A verified guest audits as a challenge-derived non-user principal; an
      // authenticated customer audits as their own account. Conflating the two
      // would erase exactly the distinction this shape exists to preserve, and
      // would leave every booking attributed to nobody.
      const guest = input.guestChallengeId
      const result = await executeFinanceSelfServiceBookingCreateCommand({
        db: input.db,
        context: {
          actor: "customer",
          callerType: "session",
          ...(guest
            ? { principalSubtype: "verified_guest", sessionId: guest }
            : { userId: input.userId }),
        },
        // Only consulted when the context carries no userId, so an
        // authenticated customer keeps their own principal.
        fallbackPrincipalId: guest ? `storefront-verification:${guest}` : "self-service-customer",
        commandInput: {
          ...resolved.command,
          bookingNumber,
          ...(input.publicApiOrigin ? { publicApiOrigin: input.publicApiOrigin } : {}),
        } as never,
        admitted: deps.admit("customer", input.idempotencyKey),
        ...(deps.runtime ? { runtime: deps.runtime } : {}),
        async consumeSources(tx, bookingId) {
          await source.consumeBookingSource(tx, {
            sessionId: input.sessionId,
            quoteId: input.quoteId,
            bookingId,
          })
          if (input.customerAccess && input.userId) {
            await deps.grantCustomerAccess?.(tx, {
              bookingId,
              buyerAccountId: input.customerAccess.buyerAccountId,
              buyerAccountKind: input.customerAccess.buyerAccountKind,
              grantedByPrincipalId: input.userId,
              ...(input.customerAccess.membershipId
                ? { grantedByMembershipId: input.customerAccess.membershipId }
                : {}),
              ...(input.customerAccess.membershipRole
                ? { grantedByMembershipRole: input.customerAccess.membershipRole }
                : {}),
              idempotencyKey: `${input.idempotencyKey}:customer-access`,
              proofRef: input.sessionId,
            })
          }
          await input.consumeSources?.(tx, bookingId)
        },
      })

      // On replay the command returns the ORIGINAL booking, so the number
      // allocated above was never persisted. Reading it back keeps a retry
      // from reporting a reference that does not exist.
      const persisted = await deps.readBookingSummary?.(input.db, result.value.bookingId)

      return {
        status: "ok" as const,
        bookingId: result.value.bookingId,
        bookingNumber: persisted?.bookingNumber ?? bookingNumber,
        bookingStatus: persisted?.status ?? null,
      }
    },
  }
}

export { FINANCE_BOOKING_CREATE_SELF_SERVICE_ACTION }
