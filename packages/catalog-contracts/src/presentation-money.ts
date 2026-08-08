import { z } from "zod"

const decimalAmountPattern = /^\d+(?:\.\d+)?$/
const positiveDecimalPattern = /^(?:0*\.[0-9]*[1-9][0-9]*|0*[1-9][0-9]*(?:\.[0-9]+)?)$/

/** Provider-native or shopper-presentation money in major currency units. */
export const catalogMoneySchema = z
  .object({
    amount: z.string().regex(decimalAmountPattern),
    currency: z.string().regex(/^[A-Z]{3}$/),
  })
  .strict()

export type CatalogMoney = z.infer<typeof catalogMoneySchema>

/** Audit metadata for a display-only currency conversion. */
export const presentationFxProvenanceSchema = z
  .object({
    /** Positive decimal multiplier from native currency to presentation currency. */
    rate: z.string().regex(positiveDecimalPattern),
    /** Stable provider/source identifier; never a credential or connection id. */
    provider: z.string().trim().min(1).max(128),
    quotedAt: z.iso.datetime({ offset: true }),
    validUntil: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict()

export type PresentationFxProvenance = z.infer<typeof presentationFxProvenanceSchema>

/**
 * A provider-native price together with the single currency selected for the
 * shopper. `native` remains authoritative for re-pricing and booking;
 * `presentation` is display/ranking data only.
 */
export const presentationMoneySchema = z
  .object({
    native: catalogMoneySchema,
    presentation: catalogMoneySchema,
    fx: presentationFxProvenanceSchema.optional(),
  })
  .strict()
  .superRefine((money, context) => {
    if (money.native.currency !== money.presentation.currency && !money.fx) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fx"],
        message: "FX provenance is required when native and presentation currencies differ",
      })
    }
  })

export type PresentationMoney = z.infer<typeof presentationMoneySchema>

/** Provider-neutral quote returned by a server-side FX authority. */
export interface PresentationFxQuote extends PresentationFxProvenance {}

/**
 * Server-side FX seam. Implementations own credentials; themes and browsers
 * receive only the resulting presentation money and provenance.
 */
export type PresentationFxQuoter = (
  sourceCurrency: string,
  targetCurrency: string,
) => Promise<PresentationFxQuote>

export type PriceRankingStatus =
  | "ranked_native"
  | "ranked_presentation"
  | "unranked_mixed_currency"
  | "unranked_fx_unavailable"

/** Explains whether a merged fan-out is safe to order by price. */
export interface PriceRanking {
  status: PriceRankingStatus
  /** The one currency used for a meaningful rank, when ranking succeeded. */
  currency?: string
  /** Native currencies for which presentation conversion was unavailable. */
  unavailableCurrencies?: readonly string[]
}
