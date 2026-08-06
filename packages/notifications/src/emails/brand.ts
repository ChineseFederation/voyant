/**
 * The operator identity a staff alert renders with.
 *
 * Resolved once per dispatch from `operator_profile` and passed down, rather
 * than read per recipient — one event fanning out to eight staff must not cost
 * eight profile reads.
 */
export interface StaffAlertBrand {
  /** Trading name shown in the header and footer. */
  operatorName: string
  /** Hex brand colour driving buttons and accents. */
  brandColor: string
  /** CSS length from the operator's corner-radius choice. */
  cornerRadius: string
  /**
   * Absolute, publicly reachable logo URL, or null.
   *
   * Null is normal and must stay renderable: `operator_profile` stores an asset
   * KEY, which only becomes a URL once storage resolves it, and Gmail blocks
   * remote images by default regardless. The header therefore falls back to the
   * operator's name as a wordmark, and the logo is never the only thing
   * carrying identity.
   */
  logoUrl: string | null
  supportEmail: string | null
  /** Absolute admin origin, used to build deep links. No trailing slash. */
  adminBaseUrl: string
  locale: string
}

export const DEFAULT_STAFF_ALERT_BRAND_COLOR = "#f26522"
export const DEFAULT_STAFF_ALERT_CORNER_RADIUS = "0.625rem"

/**
 * Email clients understand `px`, not `rem` — Outlook in particular resolves
 * `rem` against nothing useful. The operator's radius choice is stored in `rem`
 * for the admin UI, so convert on the way into an email.
 */
export function cornerRadiusToPx(value: string): string {
  const match = /^(-?[\d.]+)rem$/.exec(value.trim())
  if (!match?.[1]) return value.trim() || "10px"
  const rem = Number.parseFloat(match[1])
  if (Number.isNaN(rem)) return "10px"
  return `${Math.round(rem * 16)}px`
}

/** Guards against a malformed stored colour reaching an inline style. */
export function normalizeBrandColor(value: string | null | undefined): string {
  const candidate = value?.trim() ?? ""
  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(candidate)
    ? candidate
    : DEFAULT_STAFF_ALERT_BRAND_COLOR
}

/**
 * Readable foreground for a brand-coloured button.
 *
 * An operator who picks a pale brand colour would otherwise get white-on-pale
 * button text, which is the kind of thing nobody notices until a customer-facing
 * screenshot. Uses the standard sRGB luminance threshold.
 */
export function readableTextOn(backgroundHex: string): string {
  const hex = normalizeBrandColor(backgroundHex).slice(1)
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex
  const r = Number.parseInt(full.slice(0, 2), 16) / 255
  const g = Number.parseInt(full.slice(2, 4), 16) / 255
  const b = Number.parseInt(full.slice(4, 6), 16) / 255
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  return luminance > 0.55 ? "#1a1a1a" : "#ffffff"
}

/**
 * Font stack for emails.
 *
 * Deliberately ignores the operator's `headingFont`/`bodyFont` choice: those are
 * webfonts, and every major client except Apple Mail either strips `@font-face`
 * or blocks the fetch. Declaring one would produce an inconsistent render rather
 * than a branded one, so emails commit to system fonts and let colour and logo
 * carry the brand.
 */
export const EMAIL_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

export function buildAdminUrl(brand: StaffAlertBrand, adminPath: string): string {
  const base = brand.adminBaseUrl.replace(/\/+$/, "")
  const path = adminPath.startsWith("/") ? adminPath : `/${adminPath}`
  return `${base}${path}`
}
