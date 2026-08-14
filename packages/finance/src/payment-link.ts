export interface BuildPaymentLinkUrlOptions {
  /**
   * Customer-facing site base URL. When omitted in a browser, the current
   * origin is used; outside a browser, the helper returns a root-relative URL.
   */
  baseUrl?: string | null
  /**
   * Full customer-facing payment-session URL template. Supports `{sessionId}`.
   * When supplied, it takes precedence over `baseUrl`.
   */
  invoicePayUrlTemplate?: string | null
}

export const PAYMENT_LINK_SESSION_PLACEHOLDER = "{sessionId}"

export function normalizePaymentLinkUrlTemplate(value: string | null | undefined): string | null {
  const template = value?.trim()
  if (!template) return null
  if (template.split(PAYMENT_LINK_SESSION_PLACEHOLDER).length !== 2) return null
  if (/[{}]/.test(template.replace(PAYMENT_LINK_SESSION_PLACEHOLDER, ""))) return null
  try {
    const url = new URL(template.replace(PAYMENT_LINK_SESSION_PLACEHOLDER, "pmss_sample"))
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return null
    }
  } catch {
    return null
  }
  return template
}

export function resolveEffectivePaymentLinkUrlTemplate(
  configuredTemplate: string | null | undefined,
  defaultTemplate: string | null | undefined,
): string | null {
  if (configuredTemplate?.trim()) {
    const configured = normalizePaymentLinkUrlTemplate(configuredTemplate)
    if (!configured) throw new Error("Configured payment link URL template is invalid")
    return configured
  }
  if (!defaultTemplate?.trim()) return null
  const fallback = normalizePaymentLinkUrlTemplate(defaultTemplate)
  if (!fallback) throw new Error("Default payment link URL template is invalid")
  return fallback
}

export function buildPaymentLinkUrl(
  paymentSessionId: string,
  options: BuildPaymentLinkUrlOptions = {},
): string {
  const template = normalizePaymentLinkUrlTemplate(options.invoicePayUrlTemplate)
  if (template) {
    return template.replace(PAYMENT_LINK_SESSION_PLACEHOLDER, encodeURIComponent(paymentSessionId))
  }

  const baseUrl = trimPaymentLinkBaseUrl(options.baseUrl ?? getBrowserOrigin())
  const { basePath, suffix } = splitPaymentLinkBaseUrl(baseUrl)
  const sessionPath = `/${encodeURIComponent(paymentSessionId)}`
  const path = basePath?.endsWith("/pay") ? sessionPath : `/pay${sessionPath}`

  return basePath ? `${basePath}${path}${suffix}` : `${path}${suffix}`
}

/**
 * Build an admin-shareable customer URL only when the deployment supplied its
 * customer-facing checkout base. Unlike {@link buildPaymentLinkUrl}, this
 * intentionally has no browser-origin fallback: an admin origin is not proof
 * that a public `/pay/:sessionId` route exists there.
 */
export function buildConfiguredPaymentLinkUrl(
  paymentSessionId: string,
  options: {
    paymentLinkUrlTemplate?: string | null
    publicCheckoutBaseUrl?: string | null
  },
): string | null {
  if (options.paymentLinkUrlTemplate !== null && options.paymentLinkUrlTemplate !== undefined) {
    const template = normalizePaymentLinkUrlTemplate(options.paymentLinkUrlTemplate)
    if (!template) return null
    return template.replace(PAYMENT_LINK_SESSION_PLACEHOLDER, encodeURIComponent(paymentSessionId))
  }
  if (!options.publicCheckoutBaseUrl?.trim()) return null
  return buildPaymentLinkUrl(paymentSessionId, {
    baseUrl: options.publicCheckoutBaseUrl,
  })
}

export interface BookingCheckoutUrlSettings {
  bookingCheckoutUrlTemplate?: string | null
}

export interface BuildBookingCheckoutUrlOptions {
  bookingId?: string | null
  bookingCode?: string | null
  settings?: BookingCheckoutUrlSettings | null
}

export function buildBookingCheckoutUrl(options: BuildBookingCheckoutUrlOptions): string | null {
  const template = options.settings?.bookingCheckoutUrlTemplate?.trim()
  if (!template) return null

  if (template.includes("{bookingCode}") && !options.bookingCode) return null
  if (template.includes("{bookingId}") && !options.bookingId) return null

  return template
    .replaceAll("{bookingCode}", encodeURIComponent(options.bookingCode ?? ""))
    .replaceAll("{bookingId}", encodeURIComponent(options.bookingId ?? ""))
}

function trimPaymentLinkBaseUrl(baseUrl: string | null | undefined): string | null {
  const trimmed = baseUrl?.trim()
  return trimmed || null
}

function splitPaymentLinkBaseUrl(baseUrl: string | null): {
  basePath: string | null
  suffix: string
} {
  if (!baseUrl) return { basePath: null, suffix: "" }

  const queryIndex = baseUrl.indexOf("?")
  const fragmentIndex = baseUrl.indexOf("#")
  const suffixIndex =
    queryIndex === -1
      ? fragmentIndex
      : fragmentIndex === -1
        ? queryIndex
        : Math.min(queryIndex, fragmentIndex)
  if (suffixIndex === -1) {
    const basePath = baseUrl.replace(/\/+$/, "")
    return { basePath: basePath || null, suffix: "" }
  }

  const basePath = baseUrl.slice(0, suffixIndex).replace(/\/+$/, "")
  return {
    basePath: basePath || null,
    suffix: baseUrl.slice(suffixIndex),
  }
}

function getBrowserOrigin(): string | null {
  const location = (globalThis as { location?: { origin?: unknown } }).location
  return typeof location?.origin === "string" && location.origin.length > 0 ? location.origin : null
}
