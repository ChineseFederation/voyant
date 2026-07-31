/**
 * Request-scoped booking tool services: `create_booking` and the intent-level
 * `book_product` (voyant#3933). Both compose Finance's durable booking-create
 * command; `book_product` additionally resolves the booking reference and the
 * action-ledger idempotency key server-side, so the caller carries neither.
 *
 * Split out of `mcp-runtime.ts` to keep that module reviewable; it is spread
 * into the Finance tool-context contribution there.
 */
import {
  bookingsService,
  bookingToolDetailSchema,
  redactBookingContact,
  redactTravelerIdentity,
  shouldRevealBookingPii,
} from "@voyant-travel/bookings"
import { isStaffRbacEnforced } from "@voyant-travel/hono"
import { ToolError, withServerResolvedIdempotencyKey } from "@voyant-travel/tools"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import {
  type BookProductInput,
  type BookProductOutput,
  collectBookProductIssues,
  deriveBookProductIdempotencyKey,
  mapBookProductIntentToCommand,
} from "./book-product.js"
import {
  executeFinanceBookProductCommand,
  executeFinanceStaffBookingCreateCommand,
} from "./booking-create-command.js"
import { allocateBookingNumber } from "./booking-number.js"
import { financeToolActionLedgerContext } from "./mcp-runtime-shared.js"
import { getFinanceRouteRuntime } from "./routes-runtime.js"
import type { Env } from "./routes-shared.js"
import type { BookingCreateInput } from "./service-booking-create.js"
import { toJsonValue } from "./tool-json.js"

type BookingRuntimeDb = PostgresJsDatabase

export function financeBookingToolServices(db: BookingRuntimeDb, c: Context<Env>) {
  return {
    createBooking: async (
      input: Omit<BookingCreateInput, "bookingNumber"> & { bookingNumber?: string | null },
      admitted: Parameters<typeof executeFinanceStaffBookingCreateCommand>[0]["admitted"],
    ) => {
      // The reference is resolved server-side (voyant#3933): allocate one when
      // the caller omits it, and replay a provided one unchanged.
      const commandInput: BookingCreateInput = {
        ...input,
        bookingNumber: input.bookingNumber ?? (await allocateBookingNumber(db)),
      }
      const result = await executeFinanceStaffBookingCreateCommand({
        db,
        context: financeToolActionLedgerContext(c),
        commandInput,
        admitted,
        runtime: getFinanceRouteRuntime(c),
      })
      return readBookingCreateResult(db, c, result.value.bookingId, result.replayed)
    },
    async bookProduct(
      input: BookProductInput,
      admitted: Parameters<typeof executeFinanceBookProductCommand>[0]["admitted"],
    ): Promise<BookProductOutput> {
      // Validate before writing: an incomplete request returns actionable
      // issues and allocates nothing, exactly like compose_product.
      const issues = collectBookProductIssues(input)
      if (issues) return { status: "invalid", issues }

      // Resolve both the reference and the idempotency key server-side so the
      // model never carries a token across turns. An identical retry derives the
      // same key, so the durable claim replays the original booking.
      const idempotencyKey = await deriveBookProductIdempotencyKey(input)
      const bookingNumber = await allocateBookingNumber(db)
      const commandInput = mapBookProductIntentToCommand(input, bookingNumber)
      const result = await executeFinanceBookProductCommand({
        db,
        context: financeToolActionLedgerContext(c),
        commandInput,
        admitted: withServerResolvedIdempotencyKey(admitted, idempotencyKey),
        runtime: getFinanceRouteRuntime(c),
      })
      const detail = await readBookingCreateResult(db, c, result.value.bookingId, result.replayed)
      return {
        status: "created",
        bookingId: detail.bookingId,
        // The persisted reference — on an idempotent replay this is the ORIGINAL
        // booking's number, not the one just allocated and discarded.
        bookingNumber: detail.booking.bookingNumber,
        replayed: detail.replayed,
        booking: detail.booking,
      }
    },
  }
}

/**
 * Read a freshly created (or replayed) booking back into the tool detail shape,
 * applying the same PII redaction the caller's scope allows.
 */
async function readBookingCreateResult(
  db: BookingRuntimeDb,
  c: Context<Env>,
  bookingId: string,
  replayed: boolean,
) {
  const booking = await bookingsService.getBookingById(db, bookingId)
  if (!booking) {
    throw new ToolError("The created booking could not be read back.", "NOT_FOUND", { bookingId })
  }
  const [items, travelers] = await Promise.all([
    bookingsService.listItems(db, booking.id),
    bookingsService.listTravelers(db, booking.id),
  ])
  const reveal = shouldRevealBookingPii({
    actor: c.var.actor,
    scopes: c.var.scopes,
    callerType: c.var.callerType,
    isInternalRequest: c.var.isInternalRequest,
    enforceRbac: isStaffRbacEnforced(c.env),
  })
  const detail = {
    ...(reveal ? booking : redactBookingContact(booking)),
    items,
    travelers: reveal ? travelers : travelers.map((traveler) => redactTravelerIdentity(traveler)),
  }
  return {
    bookingId: booking.id,
    replayed,
    booking: bookingToolDetailSchema.parse(toJsonValue(detail)),
  }
}
