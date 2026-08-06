import type { StaffAlertMoney } from "../staff-alert-registry.js"

/**
 * Money for display. Amounts cross the wire in MINOR units (cents), matching
 * the rest of the product, and are divided here rather than by each template.
 */
export function formatMoney(money: StaffAlertMoney | null | undefined, locale: string): string {
  if (!money) return ""
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: money.currency,
    }).format(money.amountCents / 100)
  } catch {
    // An unknown currency code makes Intl throw rather than degrade. A staff
    // alert must still send, so fall back to a plain amount + code.
    return `${(money.amountCents / 100).toFixed(2)} ${money.currency}`
  }
}

export function formatDate(value: string | null | undefined, locale: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date)
}

export function formatDateTime(value: string | null | undefined, locale: string): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

/** `12 Mar 2027 – 19 Mar 2027`, collapsing to one date when they match. */
export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
  locale: string,
): string | null {
  const from = formatDate(start, locale)
  const to = formatDate(end, locale)
  if (!from && !to) return null
  if (from && !to) return from
  if (!from && to) return to
  return from === to ? from : `${from} – ${to}`
}
