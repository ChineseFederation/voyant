import { bookingItems, bookingTravelers } from "@voyant-travel/bookings/schema"
import type { bookingPaymentSchedules } from "@voyant-travel/finance/schema"
import { listResponse } from "@voyant-travel/types"
import { and, desc, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { SQLWrapper } from "drizzle-orm/sql"
import type { z } from "zod"
import { renderLiquidTemplate } from "./liquid.js"
import type { notificationReminderRules } from "./schema.js"
import { enrichBookingItem, normalizeNotificationTemplateData } from "./service-template-data.js"
import type { NotificationAttachment, NotificationChannel, NotificationProvider } from "./types.js"
import type {
  bookingDocumentBundleItemSchema,
  insertNotificationReminderRuleSchema,
  insertNotificationTemplateSchema,
  notificationDeliveryListQuerySchema,
  notificationReminderRuleListQuerySchema,
  notificationReminderRunListQuerySchema,
  notificationReminderRunRecordSchema,
  notificationTemplateListQuerySchema,
  previewNotificationTemplateSchema,
  runDueRemindersSchema,
  updateNotificationReminderRuleSchema,
  updateNotificationTemplateSchema,
} from "./validation.js"

export type NotificationTemplateListQuery = z.infer<typeof notificationTemplateListQuerySchema>
export type NotificationDeliveryListQuery = z.infer<typeof notificationDeliveryListQuerySchema>
export type CreateNotificationTemplateInput = z.infer<typeof insertNotificationTemplateSchema>
export type UpdateNotificationTemplateInput = z.infer<typeof updateNotificationTemplateSchema>
export type NotificationReminderRuleListQuery = z.infer<
  typeof notificationReminderRuleListQuerySchema
>
export type NotificationReminderRunListQuery = z.infer<
  typeof notificationReminderRunListQuerySchema
>
export type NotificationReminderRunRecord = z.infer<typeof notificationReminderRunRecordSchema>
export type CreateNotificationReminderRuleInput = z.infer<
  typeof insertNotificationReminderRuleSchema
>
export type UpdateNotificationReminderRuleInput = z.infer<
  typeof updateNotificationReminderRuleSchema
>
export type RunDueRemindersInput = z.infer<typeof runDueRemindersSchema>
export type PreviewNotificationTemplateInput = z.infer<typeof previewNotificationTemplateSchema>
export interface SendPaymentSessionNotificationInput {
  idempotencyKey: string
  templateId?: string | null
  templateSlug?: string | null
  scheduledFor?: string | null
}

export type SendInvoiceNotificationInput = SendPaymentSessionNotificationInput

export interface SendBookingDocumentsNotificationInput {
  idempotencyKey: string
  templateId?: string | null
  templateSlug?: string | null
  scheduledFor?: string | null
  documentTypes?: Array<z.infer<typeof bookingDocumentBundleItemSchema>["documentType"]> | null
}
export type BookingDocumentBundleItem = z.infer<typeof bookingDocumentBundleItemSchema>

export type ReminderSweepResult = {
  processed: number
  sent: number
  skipped: number
  failed: number
}

export type ReminderQueueResult = {
  processed: number
  queued: number
  skipped: number
  failed: number
}

export type NotificationReminderRuleRow = typeof notificationReminderRules.$inferSelect
export type BookingPaymentScheduleRow = typeof bookingPaymentSchedules.$inferSelect

export class NotificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NotificationError"
  }
}

export class NotificationIdempotencyConflictError extends NotificationError {
  constructor() {
    super("Notification idempotency key was already used for a different command")
    this.name = "NotificationIdempotencyConflictError"
  }
}

export interface NotificationService {
  getProvider(channel: NotificationChannel): NotificationProvider | undefined
  getProviderByName(providerName: string): NotificationProvider | undefined
}

export function createNotificationService(
  providers: ReadonlyArray<NotificationProvider>,
): NotificationService {
  const byChannel = new Map<NotificationChannel, NotificationProvider>()
  const byName = new Map<string, NotificationProvider>()
  for (const provider of providers) {
    byName.set(provider.name, provider)
    for (const channel of provider.channels) {
      byChannel.set(channel, provider)
    }
  }

  return {
    getProvider(channel) {
      return byChannel.get(channel)
    },
    getProviderByName(providerName) {
      return byName.get(providerName)
    },
  }
}

function normalizeSenderAddress(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

export function resolveDeliverySender(input: {
  channel: string
  provider: NotificationProvider
  inputFrom?: string | null
  templateFrom?: string | null
}) {
  const explicitFrom =
    normalizeSenderAddress(input.inputFrom) ?? normalizeSenderAddress(input.templateFrom)
  if (explicitFrom) return explicitFrom
  if (input.channel !== "email") return null

  const from = normalizeSenderAddress(input.provider.defaultFromAddress)
  if (!from) {
    throw new NotificationError(
      `No email sender configured for notification provider "${input.provider.name}". Configure a verified sending domain/sender or pass \`from\`.`,
    )
  }
  return from
}

export function summarizeNotificationAttachments(
  attachments: ReadonlyArray<NotificationAttachment> | null | undefined,
) {
  if (!attachments || attachments.length === 0) {
    return []
  }

  return attachments.map((attachment) => ({
    filename: attachment.filename,
    path: attachment.path ?? null,
    contentType: attachment.contentType ?? null,
    disposition: attachment.disposition ?? null,
    contentId: attachment.contentId ?? null,
  }))
}

export function renderNotificationTemplate(
  template: string | null | undefined,
  data: Record<string, unknown>,
) {
  return renderLiquidTemplate(template, normalizeNotificationTemplateData(data))
}

export function previewNotificationTemplate(input: PreviewNotificationTemplateInput) {
  const data = normalizeNotificationTemplateData(input.data ?? {})
  return {
    channel: input.channel,
    provider: input.provider ?? null,
    fromAddress: input.fromAddress ?? null,
    subject: renderNotificationTemplate(input.subjectTemplate, data),
    html: renderNotificationTemplate(input.htmlTemplate, data),
    text: renderNotificationTemplate(input.textTemplate, data),
  }
}

export function toTimestamp(value?: string | Date | null) {
  return value instanceof Date ? value : value ? new Date(value) : null
}

export function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

export function addUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000)
}

export function toDateString(value: Date) {
  return value.toISOString().slice(0, 10)
}

export function buildReminderDedupeKey(ruleId: string, targetId: string, runDate: string) {
  return `${ruleId}:${targetId}:${runDate}`
}

export function resolveReminderRecipient(
  booking: {
    contactFirstName: string | null
    contactLastName: string | null
    contactEmail: string | null
    contactPhone: string | null
    contactPreferredLanguage: string | null
  } | null,
  participants: Array<{
    email: string | null
    isPrimary: boolean
    participantType: string
    firstName: string
    lastName: string
  }>,
) {
  if (booking?.contactEmail) {
    return {
      email: booking.contactEmail,
      firstName: booking.contactFirstName ?? "",
      lastName: booking.contactLastName ?? "",
      participantType: "booking_contact",
      isPrimary: true,
    }
  }

  const withEmail = participants.filter((traveler) => traveler.email)
  if (withEmail.length === 0) {
    return null
  }

  const nonStaffWithEmail = withEmail.filter((traveler) => traveler.participantType !== "staff")
  const primary =
    nonStaffWithEmail.find((traveler) => traveler.isPrimary) ??
    withEmail.find((traveler) => traveler.isPrimary)
  if (primary) {
    return primary
  }

  const preferredTypes = ["traveler", "occupant", "other"]
  for (const type of preferredTypes) {
    const match = nonStaffWithEmail.find((traveler) => traveler.participantType === type)
    if (match) {
      return match
    }
  }

  return nonStaffWithEmail[0] ?? withEmail[0] ?? null
}

export async function listBookingNotificationParticipants(
  db: PostgresJsDatabase,
  bookingId: string,
) {
  return db
    .select({
      id: bookingTravelers.id,
      firstName: bookingTravelers.firstName,
      lastName: bookingTravelers.lastName,
      email: bookingTravelers.email,
      participantType: bookingTravelers.participantType,
      isPrimary: bookingTravelers.isPrimary,
    })
    .from(bookingTravelers)
    .where(eq(bookingTravelers.bookingId, bookingId))
    .orderBy(desc(bookingTravelers.isPrimary), bookingTravelers.createdAt)
}

export async function listBookingNotificationItems(db: PostgresJsDatabase, bookingId: string) {
  const rows = await db
    .select({
      id: bookingItems.id,
      title: bookingItems.title,
      description: bookingItems.description,
      quantity: bookingItems.quantity,
      itemType: bookingItems.itemType,
      serviceDate: bookingItems.serviceDate,
      sellCurrency: bookingItems.sellCurrency,
      unitSellAmountCents: bookingItems.unitSellAmountCents,
      totalSellAmountCents: bookingItems.totalSellAmountCents,
      productId: bookingItems.productId,
    })
    .from(bookingItems)
    .where(eq(bookingItems.bookingId, bookingId))
    .orderBy(bookingItems.createdAt)

  return rows.map((row) => ({
    ...(enrichBookingItem(row) as Record<string, unknown>),
    productId: row.productId,
  }))
}

export async function paginate<T>(
  rowsPromise: Promise<T[]>,
  totalPromise: Promise<Array<{ count: number }>>,
  limit: number,
  offset: number,
) {
  const [data, totalRows] = await Promise.all([rowsPromise, totalPromise])
  return listResponse(data, { total: totalRows[0]?.count ?? 0, limit, offset })
}

export function buildWhereClause<T extends SQLWrapper>(conditions: Array<T | undefined>) {
  const filtered = conditions.filter((condition): condition is T => Boolean(condition))
  return filtered.length > 0 ? and(...filtered) : undefined
}
