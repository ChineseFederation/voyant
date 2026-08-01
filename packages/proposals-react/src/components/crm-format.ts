import type { useCrmUiI18nOrDefault } from "../i18n/index.js"

type CrmUiI18n = ReturnType<typeof useCrmUiI18nOrDefault>

export function formatCrmDate(i18n: CrmUiI18n, value: string | null | undefined): string {
  if (!value) return i18n.messages.common.none
  return i18n.formatDate(value, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function formatCrmMoney(
  i18n: CrmUiI18n,
  cents: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (cents == null) return i18n.messages.common.none
  const amount = cents / 100
  try {
    return i18n.formatNumber(amount, {
      style: "currency",
      currency: currency ?? "USD",
    })
  } catch {
    return `${amount.toFixed(2)} ${currency ?? ""}`.trim()
  }
}

export function formatCrmRelative(i18n: CrmUiI18n, value: string): string {
  const date = new Date(value)
  const diff = Date.now() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const messages = i18n.messages.common
  if (days < 1) return messages.today
  if (days < 7) return messages.relativeTime.daysAgo.replace("{count}", String(days))
  if (days < 30) {
    return messages.relativeTime.weeksAgo.replace("{count}", String(Math.floor(days / 7)))
  }
  if (days < 365) {
    return messages.relativeTime.monthsAgo.replace("{count}", String(Math.floor(days / 30)))
  }
  return messages.relativeTime.yearsAgo.replace("{count}", String(Math.floor(days / 365)))
}
