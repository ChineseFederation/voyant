import { staffAlertEmailMessagesEn } from "./en.js"
import { staffAlertEmailMessagesRo } from "./ro.js"
import type { StaffAlertEmailLocale, StaffAlertEmailMessages } from "./types.js"

export { staffAlertEmailMessagesEn } from "./en.js"
export { staffAlertEmailMessagesRo } from "./ro.js"
export type { StaffAlertEmailLocale, StaffAlertEmailMessages } from "./types.js"

const catalogs: Record<StaffAlertEmailLocale, StaffAlertEmailMessages> = {
  en: staffAlertEmailMessagesEn,
  ro: staffAlertEmailMessagesRo,
}

/**
 * Copy for a locale, falling back to English.
 *
 * Accepts a full BCP-47 tag and matches on the primary subtag, so `ro-RO` from
 * `operator_profile.default_locale` resolves rather than silently falling back.
 */
export function staffAlertEmailMessagesFor(locale: string | null | undefined) {
  const primary = (locale ?? "en").toLowerCase().split("-")[0]
  return catalogs[primary as StaffAlertEmailLocale] ?? staffAlertEmailMessagesEn
}
