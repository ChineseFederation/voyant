import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import { createPostgresAdvisoryLockManager } from "@voyant-travel/db/runtime"
import { resolveEffectivePaymentLinkUrlTemplate } from "@voyant-travel/finance/payment-link"
import { resolveInvoicePayUrlTemplate } from "@voyant-travel/operator-settings/service"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  buildNotificationTaskRuntime,
  createDefaultBookingDocumentAttachment,
  type NotificationProvider,
  type NotificationsRuntimeProvider,
} from "./index.js"
import { createNotificationReminderJobRuntime } from "./job-runtime.js"

/** Build the standard Node Notifications runtime from domain-neutral host primitives. */
export function createNotificationsRuntime(
  primitives: VoyantRuntimeHostPrimitives,
): NotificationsRuntimeProvider {
  const resolveProviders = (bindings: Record<string, unknown>) =>
    notificationProviders(primitives, bindings)
  return {
    resolveProviders,
    resolveAdminDestination: (bindings, destination, params) => {
      if (destination !== "inquiry.detail" || !params.inquiryId) return null
      const template = nonEmpty(
        primitives.env(bindings).ADMIN_DESTINATION_INQUIRY_DETAIL_PATH_TEMPLATE,
      )
      if (!template?.includes("{inquiryId}") || !template.startsWith("/")) return null
      return template.replace("{inquiryId}", encodeURIComponent(params.inquiryId))
    },
    resolvePublicCheckoutBaseUrl: (bindings) => resolvePublicBaseUrl(primitives.env(bindings)),
    resolvePaymentLinkUrlTemplate: async (db, bindings) =>
      resolveEffectivePaymentLinkUrlTemplate(
        await resolveInvoicePayUrlTemplate(db),
        nonEmpty(primitives.env(bindings).PUBLIC_PAYMENT_LINK_URL_TEMPLATE),
      ),
    resolvePublicCustomerPortalBaseUrl: (bindings) =>
      resolvePublicCustomerPortalBaseUrl(primitives.env(bindings)),
    resolveDocumentAttachmentResolver: (bindings) => async (document) => {
      if (document.storageKey) {
        const contentBase64 = await primitives.storage.read(bindings, document.storageKey)
        if (contentBase64) {
          return {
            filename: document.name,
            contentBase64,
            contentType: document.mimeType ?? undefined,
          }
        }
        const path = await primitives.storage.downloadUrl(bindings, document.storageKey)
        if (path) {
          return {
            filename: document.name,
            path,
            contentType: document.mimeType ?? undefined,
          }
        }
      }
      return createDefaultBookingDocumentAttachment(document)
    },
    resolveDb: (bindings) => primitives.database.resolve(bindings),
    resolveReminderJobRuntime: (bindings) => {
      const env = resolveStringEnvironment(primitives.env(bindings))
      return createNotificationReminderJobRuntime({
        resolveDb: () => primitives.database.resolve<PostgresJsDatabase>(bindings),
        resolveEnv: () => env,
        resolveRuntimeOptions: (runtimeEnv) =>
          buildNotificationTaskRuntime(runtimeEnv, {
            resolveProviders: (taskEnv) => notificationProviders(primitives, taskEnv),
            publicCustomerPortalBaseUrl: resolvePublicCustomerPortalBaseUrl(runtimeEnv),
            reminderSweepLockManager: resolveReminderSweepLockManager(env),
          }),
      })
    },
  }
}

function notificationProviders(
  primitives: VoyantRuntimeHostPrimitives,
  bindings: unknown,
): ReadonlyArray<NotificationProvider> {
  const resolver = primitives.config.read(bindings, "notificationProviders")
  return typeof resolver === "function" ? resolver(primitives.env(bindings)) : []
}

function resolveReminderSweepLockManager(env: Readonly<Record<string, unknown>>) {
  const connectionString = nonEmpty(env.DATABASE_URL)
  return connectionString
    ? createPostgresAdvisoryLockManager(connectionString, { namespace: "operator" })
    : undefined
}

function resolvePublicBaseUrl(env: Readonly<Record<string, unknown>>): string | null {
  return nonEmpty(env.PUBLIC_CHECKOUT_BASE_URL) ?? null
}

function resolvePublicCustomerPortalBaseUrl(env: Readonly<Record<string, unknown>>): string | null {
  const value =
    nonEmpty(env.VOYANT_CUSTOMER_PORTAL_URL) ??
    nonEmpty(env.CUSTOMER_PORTAL_URL) ??
    nonEmpty(env.PUBLIC_CUSTOMER_PORTAL_URL) ??
    null
  return value ? value.replace(/\/+$/, "") : null
}

function nonEmpty(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function resolveStringEnvironment(
  bindings: Readonly<Record<string, unknown>>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(bindings).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  )
}
