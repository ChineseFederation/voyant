/**
 * Finance's provider for `bookings.self-service-create.runtime`.
 *
 * Bookings owns the `/v1/public/bookings` resource; Finance owns the durable
 * command that composes a booking with its payment schedules, tax lines, and
 * documents. Finance depends on Bookings and not the reverse, so the command
 * reaches the route through this port rather than the route reaching into
 * Finance.
 *
 * Everything in the command is derived server-side. The caller named a draft
 * and a quote; it never names a booking number, price, tax line, relationship
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
   * Resolves and verifies the public draft + quote, and spends them.
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
    async createFromDraft(input: {
      db: PostgresJsDatabase
      draftId: string
      quoteId: string
      caller: { personId?: string; verifiedEmail?: string; verifiedPhone?: string }
      idempotencyKey: string
      /** Proves the caller holds the draft; verified by the source provider. */
      draftCapabilityToken?: string
      /**
       * The challenge that authorized a guest create. Absent for an
       * authenticated customer, who is identified by their account instead.
       */
      guestChallengeId?: string
      /** The authenticated customer's user id, when they have an account. */
      userId?: string
      consumeSources?(tx: PostgresJsDatabase, bookingId: string): Promise<void>
    }) {
      const source = await deps.resolveSource()
      const resolved = await source.resolveBookingSource({
        db: input.db,
        draftId: input.draftId,
        quoteId: input.quoteId,
        caller: input.caller,
        ...(input.draftCapabilityToken ? { draftCapabilityToken: input.draftCapabilityToken } : {}),
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
        commandInput: { ...resolved.command, bookingNumber } as never,
        admitted: deps.admit("customer", input.idempotencyKey),
        ...(deps.runtime ? { runtime: deps.runtime } : {}),
        async consumeSources(tx, bookingId) {
          await source.consumeBookingSource(tx, {
            draftId: input.draftId,
            quoteId: input.quoteId,
            bookingId,
          })
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
