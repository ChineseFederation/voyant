/**
 * `checkoutFinalize` saga — runs on `payment.completed` for
 * bookings created through the storefront's checkout-start path.
 *
 * Steps:
 *   1. assert_booking_committed — verify checkout targets the durable Booking
 *      created by canonical Booking Session Commit.
 *   2. issue_invoice — explicit fallback when finance auto-generation
 *      isn't wired. Idempotent — checks if an invoice already exists.
 *
 * Compensation: if `issue_invoice` fails after the booking is
 * already committed, we don't mutate Booking lifecycle — the payment and
 * Booking are separate durable facts. The saga leaves the
 * booking in `confirmed` and rethrows so operations can surface the failure.
 *
 * This is an in-process compensation saga. It is not a background job or
 * durable execution surface; the payment subscriber invokes it inline.
 */

import type { EventBus } from "@voyant-travel/core"
import { createSaga, sagaStep } from "@voyant-travel/core/saga"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export interface CheckoutFinalizeInput {
  bookingId: string
  /** Optional payment metadata for audit logging. */
  paymentSessionId?: string
  paymentIntent?: "card" | "bank_transfer" | "hold" | "ticket_on_credit"
}

/**
 * Optional step-lifecycle hooks the caller can wire to an observability sink.
 * Catalog stays neutral — it just emits the events.
 */
export interface CheckoutFinalizeStepRecorder {
  startStep(name: string): Promise<void> | void
  completeStep(name: string, output?: Record<string, unknown> | null): Promise<void> | void
  failStep(name: string, error: unknown): Promise<void> | void
}

export interface CheckoutFinalizeDeps {
  db: PostgresJsDatabase
  eventBus?: EventBus
  /** Optional observability sink — see CheckoutFinalizeStepRecorder. */
  recorder?: CheckoutFinalizeStepRecorder
  /** Verify that the payment belongs to an already committed Booking. */
  assertBookingCommitted: (bookingId: string) => Promise<void>
  /**
   * Issues the final invoice for the booking. When `convertedFromInvoiceId`
   * is supplied (proforma → invoice path), implementations should
   * preserve the linkage. Returning `null` is treated as "skipped"
   * (e.g. invoice already issued) and not an error.
   */
  issueInvoice: (input: {
    bookingId: string
    convertedFromInvoiceId?: string | null
  }) => Promise<{ invoiceId: string } | null>
  /**
   * Look up an existing proforma for this booking so we can pass
   * its id into `issueInvoice` (for the conversion linkage). Return
   * `null` if there isn't one — the Booking used card collection rather
   * than bank transfer.
   */
  findProformaForBooking?: (bookingId: string) => Promise<{ invoiceId: string } | null>
  /**
   * Reconcile paid `payment_sessions` for the booking against the
   * just-issued invoice: update each paid session's `invoice_id`
   * pointer and write a `payments` row so the invoice flips to paid.
   *
   * The session was created at storefront-checkout time with
   * `target_type: "booking"` and `invoice_id: NULL` because the
   * invoice didn't exist yet. Without this back-link, the invoice
   * permanently reads as unpaid even though the customer's money is
   * sitting in the paid session.
   *
   * Idempotency: implementations should skip sessions that already
   * have an `invoice_id` set or already have a `payment_id`. Returns
   * the count of newly-linked sessions for observability.
   */
  linkPaymentToInvoice?: (input: {
    bookingId: string
    invoiceId: string
    /** Hint from the saga input — when set, prefer linking this session. */
    paymentSessionId?: string
  }) => Promise<{ paymentId: string | null; sessionsLinked: number }>
}

async function runStep<T>(
  name: string,
  recorder: CheckoutFinalizeStepRecorder | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  await recorder?.startStep(name)
  try {
    const result = await fn()
    await recorder?.completeStep(name, asRecord(result))
    return result
  } catch (err) {
    await recorder?.failStep(name, err)
    throw err
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

export const checkoutFinalizeSaga = createSaga("checkout-finalize", [
  sagaStep<CheckoutFinalizeInput, void>("assert_booking_committed").run(async (input, ctx) => {
    const deps = ctx.results.__deps as CheckoutFinalizeDeps | undefined
    if (!deps) throw new Error("checkout-finalize: deps not seeded into context")
    await runStep("assert_booking_committed", deps.recorder, () =>
      deps.assertBookingCommitted(input.bookingId),
    )
  }),

  sagaStep<CheckoutFinalizeInput, { invoiceId: string } | null>("issue_invoice").run(
    async (input, ctx) => {
      const deps = ctx.results.__deps as CheckoutFinalizeDeps | undefined
      if (!deps) throw new Error("checkout-finalize: deps not seeded into context")
      return runStep("issue_invoice", deps.recorder, async () => {
        const proforma = deps.findProformaForBooking
          ? await deps.findProformaForBooking(input.bookingId)
          : null
        return deps.issueInvoice({
          bookingId: input.bookingId,
          convertedFromInvoiceId: proforma?.invoiceId ?? null,
        })
      })
    },
  ),

  sagaStep<CheckoutFinalizeInput, { paymentId: string | null; sessionsLinked: number } | null>(
    "link_payment_to_invoice",
  ).run(async (input, ctx) => {
    const deps = ctx.results.__deps as CheckoutFinalizeDeps | undefined
    if (!deps) throw new Error("checkout-finalize: deps not seeded into context")
    if (!deps.linkPaymentToInvoice) return null

    const issueOutput = ctx.results.issue_invoice as { invoiceId: string } | null | undefined
    if (!issueOutput?.invoiceId) {
      // Invoice generation was skipped (returned null) — there's
      // nothing to link a payment to. Skip silently rather than
      // throwing so the saga continues for "hold"-only checkouts.
      return null
    }

    return runStep("link_payment_to_invoice", deps.recorder, () =>
      deps.linkPaymentToInvoice!({
        bookingId: input.bookingId,
        invoiceId: issueOutput.invoiceId,
        paymentSessionId: input.paymentSessionId,
      }),
    )
  }),
])

export interface RunCheckoutFinalizeOptions {
  /**
   * For resume runs — name of the step to resume from. Steps before
   * this one are skipped and their outputs hydrated from
   * {@link RunCheckoutFinalizeOptions.seedResults}.
   */
  skipUntil?: string
  /** Step outputs from the parent run, keyed by step name. */
  seedResults?: Record<string, unknown>
}

/**
 * Run the saga with deps seeded. Wraps `checkoutFinalizeSaga.run`
 * with the dependency-injection plumbing — the saga primitive
 * doesn't carry a "deps" concept on its own, so we pass them through
 * `ctx.results` keyed under `__deps`.
 *
 * Resume support: when `skipUntil` is set, the seeded `__deps` step
 * is added to `seedResults` automatically so the resumed step still
 * sees `ctx.results.__deps`. The caller doesn't need to know about
 * the deps-injection mechanism.
 */
export async function runCheckoutFinalize(
  input: CheckoutFinalizeInput,
  deps: CheckoutFinalizeDeps,
  options: RunCheckoutFinalizeOptions = {},
): Promise<void> {
  // Seed deps into ctx.results before the first step runs by passing
  // them as a synthetic step output. The step name MUST match the
  // key the downstream steps read (`__deps`) — a previous spelling
  // (`__seed_deps`) silently broke this because step outputs are
  // keyed by name.
  const seeded = createSaga("checkout-finalize", [
    sagaStep<CheckoutFinalizeInput, CheckoutFinalizeDeps>("__deps").run(() => deps),
    ...checkoutFinalizeSaga.steps,
  ])
  // For resume: the synthetic "__deps" step would otherwise be
  // skipped (and produce no value), starving downstream steps of
  // their dependencies. Inject deps into seedResults so the skipped
  // path still hydrates them.
  const seedResults =
    options.skipUntil !== undefined
      ? { ...(options.seedResults ?? {}), __deps: deps }
      : options.seedResults
  await seeded.run({
    input,
    skipUntil: options.skipUntil,
    seedResults,
  })
}
