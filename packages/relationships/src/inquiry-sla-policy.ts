import type { InquiryPriority, InquirySource } from "@voyant-travel/relationships-contracts"

/**
 * Frozen first-response SLA policy. Source establishes the intake-channel
 * baseline and priority selects the deadline within that channel.
 */
export const DEFAULT_INQUIRY_FIRST_RESPONSE_SLA_MINUTES = {
  storefront: { low: 2_880, normal: 1_440, high: 240, urgent: 60 },
  phone: { low: 1_440, normal: 480, high: 120, urgent: 30 },
  email: { low: 2_880, normal: 1_440, high: 240, urgent: 60 },
  admin: { low: 1_440, normal: 480, high: 120, urgent: 30 },
  import: { low: 4_320, normal: 2_880, high: 480, urgent: 120 },
  api: { low: 2_880, normal: 1_440, high: 240, urgent: 60 },
} as const satisfies Record<InquirySource, Record<InquiryPriority, number>>

export type InquiryFirstResponseSlaPolicy = (
  source: InquirySource,
  priority: InquiryPriority,
) => number | null

export type InquiryFirstResponseSlaConfiguration = Partial<
  Record<InquirySource, Partial<Record<InquiryPriority, number | null>>>
>

/** Resolve deployment overrides over documented defaults; null disables SLA for one cell. */
export function createInquiryFirstResponseSlaPolicy(
  configuration: InquiryFirstResponseSlaConfiguration = {},
): InquiryFirstResponseSlaPolicy {
  return (source, priority) => {
    const sourceConfiguration = configuration[source]
    return sourceConfiguration && Object.hasOwn(sourceConfiguration, priority)
      ? (sourceConfiguration[priority] ?? null)
      : DEFAULT_INQUIRY_FIRST_RESPONSE_SLA_MINUTES[source][priority]
  }
}

export function firstResponseDueAtForInquiry(input: {
  source: InquirySource
  priority: InquiryPriority
  createdAt: Date
  policy?: InquiryFirstResponseSlaPolicy
}): Date | null {
  const minutes = (input.policy ?? createInquiryFirstResponseSlaPolicy())(
    input.source,
    input.priority,
  )
  if (minutes === null) return null
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error("Inquiry first-response SLA minutes must be positive and finite, or null.")
  }
  return new Date(input.createdAt.getTime() + minutes * 60_000)
}
