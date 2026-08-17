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
import type { FinanceDomainEvent, FinanceServiceRuntime } from "./service.js"
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
  return executeBookingCreateCommand("staff", input)
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
  return executeBookingCreateCommand(
    "staff",
    input,
    undefined,
    undefined,
    FINANCE_BOOK_PRODUCT_ACTION,
  )
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
    "customer",
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
 *
 * `audience` comes first and is required for the same reason. It is taken from
 * the entrypoint — each of which already pins exactly one policy — and never
 * derived from `input.context.actor`, which is an optional untyped string a
 * caller supplies. Reading it from there would make an omitted field grant the
 * staff-grade diagnostics, and silence must not be permission.
 */
async function executeBookingCreateCommand(
  audience: BookingCreateErrorAudience,
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
        const capturedTerms =
          input.commandInput.cancellationTermsEvidence == null
            ? await input.runtime?.captureBookingCancellationTerms?.(transaction, {
                productId: input.commandInput.productId,
              })
            : null
        const commandInput = capturedTerms
          ? { ...input.commandInput, cancellationTermsEvidence: capturedTerms }
          : input.commandInput
        const outcome = await createBookingMutation(transaction, commandInput, {
          commandIdempotencyKey: input.admitted.invocation.idempotencyKey!,
          ...(actionName ? { actionName } : {}),
          lease,
          runtime: input.runtime,
          userId: input.context.userId ?? undefined,
        })
        if (outcome.status !== "ok") throw bookingCreateCommandError(outcome, audience)
        const result = outcome.result
        await input.testHooks?.afterDomainCreate?.(transaction, result.booking.id)
        // Spend the draft, quote, hold, and challenge in the same transaction
        // as the booking graph. Throwing here rolls the whole create back.
        await consumeSources?.(transaction, result.booking.id)
        await insertBookingCreatedOutbox(
          transaction,
          input.commandInput,
          result,
          input.context,
          outcome.events,
        )
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
  /**
   * Finance events the mutation raised — `invoice.issued` and any
   * `invoice.payment.recorded` — handed up rather than emitted so they commit
   * or roll back with the booking that caused them (voyant#4653).
   */
  domainEvents: readonly FinanceDomainEvent[] = [],
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
        // Named field by field rather than spread: `documentGeneration` also
        // carries `externalInvoice`, the identity of a document in the
        // operator's accounting provider, and `booking.created` is externally
        // deliverable. The payload schema is `additionalProperties: false`, so
        // spreading it would also fail validation.
        documentGeneration: {
          contractDocument: command.documentGeneration?.contractDocument ?? false,
          invoiceDocument: command.documentGeneration?.invoiceDocument ?? false,
          invoiceType: command.documentGeneration?.invoiceType ?? "invoice",
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
  // voyant#4634: `booking.contract_document.requested` was pushed here when the
  // operator ticked "Generate invoice and contract", and nothing ever
  // subscribed to it. Legal generates the contract off `booking.confirmed`
  // above, so the request event was retired rather than given a second trigger
  // for the same idempotent operation. See scripts/checks/symbols.
  //
  // The finance events go last so a subscriber reading the outbox in order
  // sees the booking exist before it is told an invoice was issued for it.
  events.push(...domainEvents)
  await insertOutboxEvents(tx, events)
}

/**
 * Who is going to read the refusal.
 *
 * `customer` covers the self-service entrypoint, which is reachable from
 * `POST /v1/public/catalog/booking-sessions/:sessionId/commit` by an
 * unauthenticated storefront caller — the session's own capability is the
 * authority there, not a staff credential. It is the audience that may not own
 * the records a diagnostic would name.
 */
export type BookingCreateErrorAudience = "staff" | "customer"

/**
 * What a `customer` refusal may say.
 *
 * It may describe the caller's own request and the product they are booking —
 * that is the whole point of a typed refusal, and it is what makes the pricing
 * failure this file exists to surface legible to a shopper. It may not describe
 * **another party's records** or **the operator's account state**, neither of
 * which the caller is entitled to and neither of which they can act on.
 *
 * Two outcomes fail that test, and both use the sentence below rather than a
 * bespoke one, so the two are also indistinguishable from each other.
 */
const CUSTOMER_WITHHELD_REFUSAL =
  "This booking could not be completed. Contact the operator to continue."

export function bookingCreateCommandError(
  outcome: Exclude<Awaited<ReturnType<typeof createBookingMutation>>, { status: "ok" }>,
  audience: BookingCreateErrorAudience,
) {
  switch (outcome.status) {
    // voyant#3921: these were one message — "A booking-create dependency was not
    // found" — for three unrelated causes. An agent cannot act on that: it does
    // not say WHICH dependency, so the only move left is to guess or stop.
    // Observed ending a real booking journey after the product, option, unit and
    // departure had all been created successfully. The neighbouring cases below
    // already name their problem and their fix; these now do too.
    // The generic sentence remains only as a fallback. When the diagnostic ran it
    // names the actual cause, because "not found, or is not bookable, confirm it
    // is published" was a guess covering five unrelated failures. In the measured
    // run the publication was already correct, but the trace could not distinguish
    // the remaining causes; the diagnostic makes the next failure say which fired.
    case "product_not_found":
      return new ToolError(
        outcome.detail ??
          "The product being booked was not found, or is not bookable. Confirm the product id with inventory_query, and that the product is published with at least one option carrying a priced unit.",
        "NOT_FOUND",
        { outcome },
      )
    case "travel_credit_not_found":
      return new ToolError(
        "A travel credit referenced by this booking was not found. Remove it from the request, or confirm its id before retrying.",
        "NOT_FOUND",
        { outcome },
      )
    case "group_not_found":
      return new ToolError(
        "The group this booking was assigned to was not found. Confirm the group id, or omit it to book without one.",
        "NOT_FOUND",
        { outcome },
      )
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
    // voyant#4805: the third sibling of the two cases above had no case at all,
    // so a pricing refusal fell through to `default:` and became "The booking
    // command failed validation." with its `issues[]` discarded — a sentence
    // that repeats what the caller already knew and withholds the only part
    // that identifies the rule. Observed blocking a production operator from
    // creating a booking by any route, storefront or admin, with the pricing
    // diagnostic unrecoverable even from the server logs.
    case "invalid_pricing":
      return new ToolError(
        `The pricing is invalid: ${formatBookingCreateIssues(outcome.issues)}`,
        "INVALID_INPUT",
        { outcome },
      )
    // The domain's message names the operator's plan usage and renewal date
    // ("This workspace has reached its monthly booking limit (3/5). Upgrade the
    // plan..."). That is the operator's commercial state, it is not the
    // shopper's to see, and there is nothing they could do with it.
    case "monthly_booking_limit_reached":
      return new ToolError(
        audience === "staff" ? outcome.message : CUSTOMER_WITHHELD_REFUSAL,
        "INVALID_INPUT",
        { outcome },
      )
    // These six shared one sentence — "The booking command conflicts with
    // current state." — which is the same tautology in a different costume: it
    // names no record, no balance and no next step, and each of them carries
    // exactly the field that would.
    //
    // `duplicate_booking` is the one that cannot say so to everybody. The guard
    // resolves its person from the contact email on the request
    // (`upsertPersonFromContact` returns any existing CRM person matching it,
    // with no ownership check), so on the anonymous public Commit the match may
    // be a stranger the caller merely named. Naming their booking number and
    // status there would hand one customer's record to another. The full
    // outcome still reaches the server log through `meta`, which is where an
    // operator reads it.
    //
    // The other five are not audience-dependent: each describes the caller's
    // own request, or a record the request itself named. The travel-credit and
    // group outcomes are additionally unreachable for a customer, because the
    // self-service command carries neither a redemption nor a group — but that
    // is a second reason, not the one they rely on.
    case "duplicate_booking":
      return new ToolError(
        audience === "staff"
          ? `This customer already holds booking ${outcome.existingBooking.bookingNumber} (${outcome.existingBooking.status}) on the same Slot. Open that booking instead of creating another, or set allowDuplicate if a second booking on the same Slot is intended.`
          : CUSTOMER_WITHHELD_REFUSAL,
        "INVALID_INPUT",
        { outcome },
      )
    case "travel_credit_inactive":
      return new ToolError(
        "A travel credit referenced by this booking is not active. Reactivate it, or remove it from the request and settle the balance another way.",
        "INVALID_INPUT",
        { outcome },
      )
    case "travel_credit_not_started":
      return new ToolError(
        "A travel credit referenced by this booking cannot be spent yet — its validity period has not started. Remove it from the request, or retry once it is valid.",
        "INVALID_INPUT",
        { outcome },
      )
    case "travel_credit_expired":
      return new ToolError(
        "A travel credit referenced by this booking has expired and can no longer be spent. Remove it from the request and settle the balance another way.",
        "INVALID_INPUT",
        { outcome },
      )
    case "travel_credit_insufficient_balance":
      return new ToolError(
        "A travel credit referenced by this booking does not have enough balance to cover the amount requested from it. Lower the redeemed amount to the remaining balance, or remove the credit.",
        "INVALID_INPUT",
        { outcome },
      )
    case "booking_already_in_group":
      return new ToolError(
        `This booking is already a member of group ${outcome.currentGroupId}. Remove it from that group before assigning another, or omit the group from the request.`,
        "INVALID_INPUT",
        { outcome },
      )
    default: {
      // Exhaustive: every `BookingCreateOutcome` refusal above is named, so
      // adding a status to the union fails the build here instead of silently
      // degrading to a generic message — which is how `invalid_pricing` stayed
      // undiagnosable. The runtime arm still names the status it could not map,
      // because a published copy of this package may be paired with a newer
      // `service-booking-create` that returns one this build has never seen.
      const unmapped: never = outcome
      return new ToolError(
        `The booking command failed with an unrecognized outcome: ${(unmapped as { status?: string }).status ?? "unknown"}.`,
        "INVALID_INPUT",
        { outcome },
      )
    }
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
