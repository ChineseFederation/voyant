import {
  type ActionLedgerRequestContextValues,
  executeAdmittedCreatedTargetCommand,
} from "@voyant-travel/action-ledger"
import { insertOutboxEvents } from "@voyant-travel/db/outbox"
import {
  assertAdmittedActionPolicy,
  ToolError,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  FINANCE_BOOK_PRODUCT_ACTION,
  FINANCE_BOOK_PRODUCT_HANDLER_POLICY,
  FINANCE_BOOKING_CREATE_HANDLER_POLICY,
  FINANCE_BOOKING_CREATE_POLICY,
  FINANCE_BOOKING_CREATE_SELF_SERVICE_ACTION,
  FINANCE_BOOKING_CREATE_SELF_SERVICE_HANDLER_POLICY,
} from "./booking-create-policy.js"
import type { FinanceServiceRuntime } from "./service.js"
import {
  type BookingCreateInput,
  type BookingCreateResult,
  createBookingMutation,
} from "./service-booking-create.js"

export interface FinanceBookingCreateCommandInput {
  db: PostgresJsDatabase
  context: ActionLedgerRequestContextValues
  commandInput: BookingCreateInput
  admitted: ToolHandlerActionPolicyContext
  runtime?: FinanceServiceRuntime
  testHooks?: {
    afterDomainCreate?: (tx: PostgresJsDatabase, bookingId: string) => Promise<void>
  }
}

export interface FinanceSelfServiceBookingCreateCommandInput
  extends FinanceBookingCreateCommandInput {
  /**
   * Audit principal for a verified guest, who has no user account. Required —
   * a self-service create must never ledger as an anonymous request.
   */
  fallbackPrincipalId: string
  /**
   * Runs inside the command transaction, immediately after the booking graph
   * is created and before the claim commits. This is where the draft, quote,
   * hold, and verification challenge are spent, so all of it either commits
   * with the booking or rolls back with it.
   *
   * Deliberately inside rather than around: an exact idempotent retry
   * short-circuits at the claim and never reaches this, so a legitimate retry
   * replays the original booking instead of failing as already-consumed.
   */
  consumeSources?: (tx: PostgresJsDatabase, bookingId: string) => Promise<void>
}

/**
 * Staff creation through the `create_booking` Tool.
 *
 * Pins the staff policy expectation and nothing else, so a self-service
 * admission cannot drive it even though both compose the same command.
 */
export async function executeFinanceStaffBookingCreateCommand(
  input: FinanceBookingCreateCommandInput,
) {
  assertAdmittedActionPolicy(input.admitted, FINANCE_BOOKING_CREATE_HANDLER_POLICY)
  return executeBookingCreateCommand(input)
}

/**
 * Intent-level `book_product` creation (voyant#3933).
 *
 * Pins the `book_product` staff policy expectation. It composes the exact same
 * durable command as `executeFinanceStaffBookingCreateCommand` — only the
 * admission identity differs — so the two entrypoints stay unconfusable while
 * the workflow tool resolves the booking reference and idempotency key
 * server-side before this runs.
 */
export async function executeFinanceBookProductCommand(input: FinanceBookingCreateCommandInput) {
  assertAdmittedActionPolicy(input.admitted, FINANCE_BOOK_PRODUCT_HANDLER_POLICY)
  // book_product mints its lease under its OWN action identity; the domain must
  // check against that, not against create_booking's (voyant#3992).
  return executeBookingCreateCommand(input, undefined, undefined, FINANCE_BOOK_PRODUCT_ACTION)
}

/**
 * Verified-guest or authenticated-customer creation through the public route.
 *
 * Pins the self-service policy expectation, which is bound to the route
 * transport and to the customer actor — the mirror image of the staff
 * entrypoint above, and the reason neither can be confused for the other.
 */
export async function executeFinanceSelfServiceBookingCreateCommand(
  input: FinanceSelfServiceBookingCreateCommandInput,
) {
  assertAdmittedActionPolicy(input.admitted, FINANCE_BOOKING_CREATE_SELF_SERVICE_HANDLER_POLICY)
  // The ledger mints the lease under the action it admitted, which for this
  // entrypoint is the self-service action -- so settlement has to expect that
  // one. Leaving it to the default named the staff action and failed every
  // guest booking closed with `invalid_mutation_lease`, after the shopper had
  // verified a contact, chosen a room and been quoted. Same defect voyant#3992
  // fixed for `book_product`; this entrypoint was missed.
  return executeBookingCreateCommand(
    input,
    input.fallbackPrincipalId,
    input.consumeSources,
    FINANCE_BOOKING_CREATE_SELF_SERVICE_ACTION,
  )
}

/**
 * The shared mutation core. Deliberately not exported: an exported executor
 * that selected its expectation from caller-supplied admission metadata would
 * be exactly the confused deputy the two entrypoints above prevent.
 */
async function executeBookingCreateCommand(
  input: FinanceBookingCreateCommandInput,
  fallbackPrincipalId?: string,
  consumeSources?: (tx: PostgresJsDatabase, bookingId: string) => Promise<void>,
  actionName?: string,
) {
  return executeAdmittedCreatedTargetCommand(
    {
      db: input.db,
      context: input.context,
      admitted: input.admitted,
      ...(fallbackPrincipalId ? { fallbackPrincipalId } : {}),
      commandTargetType: FINANCE_BOOKING_CREATE_POLICY.commandTargetType,
      canonicalTargetType: FINANCE_BOOKING_CREATE_POLICY.canonicalTargetType,
      resultReferenceType: FINANCE_BOOKING_CREATE_POLICY.resultReferenceType,
      commandInput: input.commandInput,
      evaluatedRisk: FINANCE_BOOKING_CREATE_POLICY.evaluatedRisk,
    },
    {
      async create(tx, lease) {
        const transaction = tx as PostgresJsDatabase
        const outcome = await createBookingMutation(transaction, input.commandInput, {
          commandIdempotencyKey: input.admitted.invocation.idempotencyKey!,
          ...(actionName ? { actionName } : {}),
          lease,
          runtime: input.runtime,
          userId: input.context.userId ?? undefined,
        })
        if (outcome.status !== "ok") throw bookingCreateCommandError(outcome)
        const result = outcome.result
        await input.testHooks?.afterDomainCreate?.(transaction, result.booking.id)
        // Spend the draft, quote, hold, and challenge in the same transaction
        // as the booking graph. Throwing here rolls the whole create back.
        await consumeSources?.(transaction, result.booking.id)
        await insertBookingCreatedOutbox(transaction, input.commandInput, result, input.context)
        return {
          value: { bookingId: result.booking.id },
          targetId: result.booking.id,
        }
      },
      async replay(_tx, result) {
        return { bookingId: result.reference.id }
      },
    },
  )
}

async function insertBookingCreatedOutbox(
  tx: PostgresJsDatabase,
  command: BookingCreateInput,
  result: BookingCreateResult,
  context: ActionLedgerRequestContextValues,
) {
  const events: Array<Parameters<typeof insertOutboxEvents>[1][number]> = [
    {
      name: "booking.created",
      data: {
        bookingId: result.booking.id,
        bookingNumber: result.booking.bookingNumber,
        productId: command.productId,
        travelerCount: result.travelers.length,
        paymentScheduleCount: result.paymentSchedules.length,
        travelCreditRedeemedCents: result.travelCreditRedemption
          ? result.travelCreditRedemption.redemption.amountCents
          : null,
        groupId: result.groupMembership?.groupId ?? null,
        documentGeneration: command.documentGeneration ?? {
          contractDocument: false,
          invoiceDocument: false,
          invoiceType: "invoice",
        },
        createdByUserId: context.userId ?? null,
        occurredAt: new Date(),
        suppressNotifications: command.suppressNotifications === true ? true : undefined,
      },
      metadata: {
        category: "domain",
        source: "service",
        eventId: financeBookingCreatedEventId(result.booking.id),
      },
    },
  ]
  events.push({
    name: "booking.confirmed",
    data: {
      bookingId: result.booking.id,
      bookingNumber: result.booking.bookingNumber,
      actorId: context.userId ?? null,
      suppressNotifications: command.suppressNotifications === true ? true : undefined,
    },
    metadata: {
      category: "domain",
      source: "service",
      eventId: `evt_finance_booking_confirmed_${result.booking.id}`,
    },
  })
  if (command.documentGeneration?.contractDocument) {
    events.push({
      name: "booking.contract_document.requested",
      data: {
        bookingId: result.booking.id,
        bookingNumber: result.booking.bookingNumber,
        createdByUserId: context.userId ?? null,
        occurredAt: new Date(),
      },
      metadata: {
        category: "internal",
        source: "service",
        eventId: `evt_finance_booking_contract_requested_${result.booking.id}`,
      },
    })
  }
  await insertOutboxEvents(tx, events)
}

export function bookingCreateCommandError(
  outcome: Exclude<Awaited<ReturnType<typeof createBookingMutation>>, { status: "ok" }>,
) {
  switch (outcome.status) {
    case "product_not_found":
    case "travel_credit_not_found":
    case "group_not_found":
      return new ToolError("A booking-create dependency was not found.", "NOT_FOUND", { outcome })
    case "booking_items_unresolved":
      // Surfaced verbatim to the operator, so it has to read as a next step
      // rather than an internal failure.
      return new ToolError(outcome.message, "INVALID_INPUT", { outcome })
    case "room_occupancy_insufficient":
      return new ToolError(
        `The selected rooms fit ${outcome.occupancyMax} traveler(s), but the booking has ${outcome.pax}. Add room capacity for ${outcome.shortfall} more traveler(s), then assign every traveler to a room.`,
        "INVALID_INPUT",
        { outcome },
      )
    case "payload_resolver_mismatch":
      return new ToolError(
        "The traveler-to-room assignments do not match the selected booking items. Rebuild the room item lines, assign each traveler key to exactly one selected room, and try again.",
        "INVALID_INPUT",
        { outcome },
      )
    case "invalid_payment_schedules":
      return new ToolError(
        `The payment schedule is invalid: ${formatBookingCreateIssues(outcome.issues)}`,
        "INVALID_INPUT",
        { outcome },
      )
    case "invalid_tax_lines":
      return new ToolError(
        `The tax lines are invalid: ${formatBookingCreateIssues(outcome.issues)}`,
        "INVALID_INPUT",
        { outcome },
      )
    case "monthly_booking_limit_reached":
      return new ToolError(outcome.message, "INVALID_INPUT", { outcome })
    case "duplicate_booking":
    case "travel_credit_inactive":
    case "travel_credit_not_started":
    case "travel_credit_expired":
    case "travel_credit_insufficient_balance":
    case "booking_already_in_group":
      return new ToolError("The booking command conflicts with current state.", "INVALID_INPUT", {
        outcome,
      })
    default:
      return new ToolError("The booking command failed validation.", "INVALID_INPUT", { outcome })
  }
}

function formatBookingCreateIssues(
  issues: Array<{ path: Array<string | number>; message: string }>,
) {
  return issues
    .map((issue) => `${issue.path.length > 0 ? `${issue.path.join(".")}: ` : ""}${issue.message}`)
    .join("; ")
}

export function financeBookingCreatedEventId(bookingId: string) {
  return `evt_finance_booking_created_${bookingId}`
}
