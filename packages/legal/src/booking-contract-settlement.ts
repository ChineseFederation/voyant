import {
  type BookingSettlement,
  financeBookingSettlementService,
} from "@voyant-travel/finance/booking-settlement"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

/**
 * The settlement half of a booking contract's variable bag.
 *
 * Kept as an explicit input to `bookingContractVariables` rather than read
 * inside it: the bag is a pure projection, and a payment clause that renders
 * from whatever the function happened to have in scope is exactly how the
 * auto-generated contract came to tell settled customers they owed an
 * unspecified balance (voyant#4690).
 */
export interface BookingContractSettlement {
  paidAmountCents: number
  /** Payment-aware remaining amount. 0 once the booking is settled. */
  amountDueCents: number
  isPaidInFull: boolean
  /** Gross scheduled deposit installment. Not reduced by payments. */
  depositAmountCents: number
  depositDueDate: string
  /** Gross scheduled balance installment. Not the remaining amount owed. */
  balanceAmountCents: number
  balanceDueDate: string
  schedule: Array<{
    index: number
    type: string
    status: string
    amountCents: number
    currency: string
    dueDate: string
  }>
  latestCompleted: {
    method: string
    methodLabel: string
    date: string
  } | null
}

/**
 * A booking with nothing settled and nothing scheduled. Used when the
 * contract is prepared without a settlement lookup — every field is present
 * and numeric, so the payment clause renders "0 paid" rather than the
 * missing-value placeholder.
 */
export const EMPTY_BOOKING_CONTRACT_SETTLEMENT: BookingContractSettlement = {
  paidAmountCents: 0,
  amountDueCents: 0,
  isPaidInFull: false,
  depositAmountCents: 0,
  depositDueDate: "",
  balanceAmountCents: 0,
  balanceDueDate: "",
  schedule: [],
  latestCompleted: null,
}

/**
 * Settlement as the shopper saw it when they accepted the terms at checkout:
 * nothing paid, the whole price outstanding, and every installment still
 * pending. That is what `resolveContractVariables` emits in the storefront
 * preview, and the acceptance evidence is a digest over the body rendered
 * from it.
 *
 * The canonical contract must state the truth at confirmation — a booking
 * paid by card is paid by the time `booking.confirmed` lands. So the two
 * bodies legitimately differ, and matching the stored digest needs a
 * candidate rendered the shopper's way, not the settled bag with a few
 * fields deleted (voyant#4700 review).
 */
export function bookingContractPreviewSettlement(
  settlement: BookingContractSettlement,
  totalAmountCents: number | null | undefined,
): BookingContractSettlement {
  return {
    ...settlement,
    paidAmountCents: 0,
    amountDueCents: totalAmountCents ?? 0,
    isPaidInFull: false,
    latestCompleted: null,
    schedule: settlement.schedule.map((installment) => ({
      ...installment,
      status: "pending",
    })),
  }
}

/**
 * Read the booking's settlement state through Finance and shape it for the
 * contract renderer. Finance owns what is paid and what is owed; this only
 * localizes the method label and flattens nulls to the empty string the
 * renderer already treats as "missing".
 */
export async function resolveBookingContractSettlement(
  db: PostgresJsDatabase,
  bookingId: string,
  options: { currency?: string | null; totalAmountCents?: number | null; language: string },
): Promise<BookingContractSettlement> {
  const settlement = await financeBookingSettlementService.getBookingSettlement(db, bookingId, {
    currency: options.currency ?? undefined,
    bookingTotalCents: options.totalAmountCents ?? 0,
  })
  return toBookingContractSettlement(settlement, options.language)
}

export function toBookingContractSettlement(
  settlement: BookingSettlement,
  language: string,
): BookingContractSettlement {
  return {
    paidAmountCents: settlement.paidAmountCents,
    amountDueCents: settlement.amountDueCents,
    isPaidInFull: settlement.isPaidInFull,
    depositAmountCents: settlement.depositAmountCents,
    depositDueDate: settlement.depositDueDate ?? "",
    balanceAmountCents: settlement.balanceAmountCents,
    balanceDueDate: settlement.balanceDueDate ?? "",
    schedule: settlement.installments.map((installment, index) => ({
      index: index + 1,
      type: installment.type,
      status: installment.status,
      amountCents: installment.amountCents,
      currency: installment.currency,
      dueDate: installment.dueDate,
    })),
    latestCompleted: settlement.latestCompletedPayment
      ? {
          method: settlement.latestCompletedPayment.method,
          methodLabel: formatPaymentMethodLabel(settlement.latestCompletedPayment.method, language),
          date: settlement.latestCompletedPayment.date,
        }
      : null,
  }
}

const paymentMethodLabelsByLanguage: Record<string, Record<string, string>> = {
  en: {
    bank_transfer: "Bank Transfer",
    credit_card: "Credit Card",
    debit_card: "Debit Card",
    cash: "Cash",
    cheque: "Cheque",
    wallet: "Wallet",
    direct_bill: "Direct Bill",
    voucher: "Voucher",
    other: "Other",
  },
  ro: {
    bank_transfer: "Transfer bancar",
    credit_card: "Card de credit",
    debit_card: "Card de debit",
    cash: "Numerar",
    cheque: "Cec",
    wallet: "Portofel",
    direct_bill: "Facturare directa",
    voucher: "Voucher",
    other: "Alta",
  },
}

export function formatPaymentMethodLabel(method: string, language: string): string {
  const locale = language.trim().toLowerCase().split(/[-_]/)[0] || "en"
  const localizedLabel = paymentMethodLabelsByLanguage[locale]?.[method]
  if (localizedLabel) return localizedLabel

  return method
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
}
