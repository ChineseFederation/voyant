import { buildConfiguredPaymentLinkUrl } from "@voyant-travel/finance/payment-link"

import type { NotificationAttachment } from "./types.js"

export function normalizeDeliveryAttachments(
  attachments:
    | ReadonlyArray<{
        filename: string
        contentBase64?: string | null
        path?: string | null
        contentType?: string | null
        disposition?: "attachment" | "inline" | null
        contentId?: string | null
      }>
    | null
    | undefined,
): NotificationAttachment[] | undefined {
  if (!attachments || attachments.length === 0) {
    return undefined
  }

  return attachments.map((attachment) => ({
    filename: attachment.filename,
    ...(attachment.contentBase64 ? { contentBase64: attachment.contentBase64 } : {}),
    ...(attachment.path ? { path: attachment.path } : {}),
    ...(attachment.contentType ? { contentType: attachment.contentType } : {}),
    ...(attachment.disposition ? { disposition: attachment.disposition } : {}),
    ...(attachment.contentId ? { contentId: attachment.contentId } : {}),
  }))
}

function truncateLogValue(value: string, maxLength = 4000) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}…`
}

function readErrorField(error: unknown, field: string) {
  if (!error || typeof error !== "object" || !(field in error)) return null
  const value = (error as Record<string, unknown>)[field]
  if (typeof value === "string") return truncateLogValue(value)
  if (typeof value === "number" || typeof value === "boolean") return value
  if (value == null) return null
  try {
    return truncateLogValue(JSON.stringify(value))
  } catch {
    return String(value)
  }
}

export function serializeNotificationError(error: unknown) {
  const base =
    error instanceof Error
      ? {
          name: error.name,
          message: truncateLogValue(error.message),
          stack: error.stack ? truncateLogValue(error.stack) : null,
          cause:
            error.cause instanceof Error
              ? {
                  name: error.cause.name,
                  message: truncateLogValue(error.cause.message),
                  stack: error.cause.stack ? truncateLogValue(error.cause.stack) : null,
                }
              : readErrorField(error, "cause"),
        }
      : {
          name: typeof error,
          message: truncateLogValue(String(error)),
          stack: null,
          cause: null,
        }

  return {
    ...base,
    code: readErrorField(error, "code"),
    status: readErrorField(error, "status"),
    statusCode: readErrorField(error, "statusCode"),
    responseStatus: readErrorField(error, "responseStatus"),
    responseBody: readErrorField(error, "responseBody") ?? readErrorField(error, "body"),
    data: readErrorField(error, "data"),
    notificationRequest: readErrorField(error, "notificationRequest"),
  }
}

export function resolveNotificationPaymentUrl(
  paymentSessionId: string,
  options: {
    paymentLinkBaseUrl?: string | null
    paymentLinkUrlTemplate?: string | null
    redirectUrl?: string | null
  } = {},
) {
  const configured = buildConfiguredPaymentLinkUrl(paymentSessionId, {
    paymentLinkUrlTemplate: options.paymentLinkUrlTemplate,
    publicCheckoutBaseUrl: options.paymentLinkBaseUrl,
  })
  if (configured) return configured

  return normalizeAbsolutePaymentUrl(options.redirectUrl)
}

function normalizeAbsolutePaymentUrl(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed)
    return url.protocol === "http:" || url.protocol === "https:" ? trimmed : null
  } catch {
    return null
  }
}

export function metadataWithoutFailureLog(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return null
  const rest = { ...metadata }
  delete rest.failureLog
  return rest
}

function isAttachmentSummary(value: unknown): value is NotificationAttachment {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.filename === "string" &&
    record.filename.length > 0 &&
    (typeof record.path === "string" || typeof record.contentBase64 === "string")
  )
}

export function attachmentsFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  const rawAttachments = metadata?.attachments
  if (!Array.isArray(rawAttachments)) return undefined
  const attachments = rawAttachments.filter(isAttachmentSummary).map((attachment) => ({
    filename: attachment.filename,
    ...(attachment.contentBase64 ? { contentBase64: attachment.contentBase64 } : {}),
    ...(attachment.path ? { path: attachment.path } : {}),
    ...(attachment.contentType ? { contentType: attachment.contentType } : {}),
    ...(attachment.disposition ? { disposition: attachment.disposition } : {}),
    ...(attachment.contentId ? { contentId: attachment.contentId } : {}),
  }))
  return attachments.length > 0 ? attachments : undefined
}
