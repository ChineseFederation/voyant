import { z } from "zod"

/**
 * Money in this package is always integer minor units plus the currency it is
 * denominated in, carried together in one object.
 *
 * A premium has to reconcile *exactly* with the amount printed on the policy
 * document the traveller receives; the two are read side by side and any drift
 * is visible. Decimal strings invite rounding at every hop, so the amount stays
 * an integer and the currency never travels in a separate field where a caller
 * can lose track of it.
 */
export const insuranceCurrencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "currency must be an ISO 4217 alphabetic code")

export const insuranceMoneySchema = z
  .object({
    /** Amount in the currency's minor unit (e.g. cents, bani). */
    amountMinor: z.number().int(),
    currency: insuranceCurrencySchema,
  })
  .strict()

export type InsuranceMoney = z.infer<typeof insuranceMoneySchema>

/** An ISO 3166-1 alpha-2 country code. */
export const insuranceCountryCodeSchema = z
  .string()
  .regex(/^[A-Z]{2}$/, "country must be an ISO 3166-1 alpha-2 code")

/** A calendar date with no time component, `YYYY-MM-DD`. */
export const insuranceDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be formatted YYYY-MM-DD")

/** An instant, always with an explicit offset. */
export const insuranceInstantSchema = z.iso.datetime({ offset: true })

/**
 * Adds two amounts, refusing to mix currencies.
 *
 * Returns `null` rather than throwing on a mismatch: callers reconciling a
 * premium against a policy are usually already on an error path, and a throw
 * there loses the context that made the mismatch worth reporting.
 */
export function addInsuranceMoney(
  left: InsuranceMoney,
  right: InsuranceMoney,
): InsuranceMoney | null {
  if (left.currency !== right.currency) return null
  return { amountMinor: left.amountMinor + right.amountMinor, currency: left.currency }
}

/** True when both sides denominate the same currency and the same amount. */
export function insuranceMoneyEquals(left: InsuranceMoney, right: InsuranceMoney): boolean {
  return left.currency === right.currency && left.amountMinor === right.amountMinor
}
