import { z } from "zod"

import {
  notificationChannelSchema,
  notificationDeliveryStatusSchema,
  notificationTargetTypeSchema,
  notificationTemplateStatusSchema,
} from "./validation.js"

const isoTimestamp = z.string()
const jsonMetadata = z.record(z.string(), z.unknown())

/** Notification-delivery wire shape shared by HTTP and Tool surfaces. */
export const notificationDeliverySchema = z.object({
  id: z.string(),
  templateId: z.string().nullable(),
  templateSlug: z.string().nullable(),
  targetType: notificationTargetTypeSchema,
  targetId: z.string().nullable(),
  personId: z.string().nullable(),
  organizationId: z.string().nullable(),
  bookingId: z.string().nullable(),
  invoiceId: z.string().nullable(),
  paymentSessionId: z.string().nullable(),
  channel: notificationChannelSchema,
  provider: z.string(),
  providerMessageId: z.string().nullable(),
  status: notificationDeliveryStatusSchema,
  toAddress: z.string(),
  fromAddress: z.string().nullable(),
  subject: z.string().nullable(),
  htmlBody: z.string().nullable(),
  textBody: z.string().nullable(),
  payloadData: jsonMetadata.nullable(),
  metadata: jsonMetadata.nullable(),
  errorMessage: z.string().nullable(),
  scheduledFor: isoTimestamp.nullable(),
  sentAt: isoTimestamp.nullable(),
  failedAt: isoTimestamp.nullable(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

/**
 * Notification-template metadata without the message bodies. A list can return
 * up to 200 rows, and template bodies are unbounded HTML — returning them per
 * row would let a lookup meant to find a slug exhaust the response budget
 * before the caller ever reaches {@link notificationTemplateDetailSchema}.
 */
export const notificationTemplateSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  channel: notificationChannelSchema,
  provider: z.string().nullable(),
  status: notificationTemplateStatusSchema,
  fromAddress: z.string().nullable(),
  isSystem: z.boolean(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
})

/** One notification template including the copy a recipient actually sees. */
export const notificationTemplateDetailSchema = notificationTemplateSummarySchema.extend({
  subjectTemplate: z.string().nullable(),
  htmlTemplate: z.string().nullable(),
  textTemplate: z.string().nullable(),
  metadata: jsonMetadata.nullable(),
})
