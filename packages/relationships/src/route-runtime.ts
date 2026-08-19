import type { CatalogInquiryBookingSessionRuntime } from "@voyant-travel/catalog/inquiry-booking-session-runtime-port"
import type { CustomFieldRegistryResolver } from "@voyant-travel/core/custom-fields"
import type { MediaInquiryAttachmentRuntime } from "@voyant-travel/media/runtime-port"
import type { ProposalInquiryConversionRuntime } from "@voyant-travel/proposals-contracts/inquiry-conversion"
import type { InquiryMaterializedTargetKind } from "@voyant-travel/relationships-contracts/inquiry-target-authority/runtime-port"
import { createKmsProviderFromEnv, type KmsProvider } from "@voyant-travel/utils"
import {
  createInquiryFirstResponseSlaPolicy,
  type InquiryFirstResponseSlaConfiguration,
  type InquiryFirstResponseSlaPolicy,
} from "./inquiry-sla-policy.js"
import type { RelationshipsPersonNotificationsRuntime } from "./runtime-port.js"

export const RELATIONSHIPS_ROUTE_RUNTIME_CONTAINER_KEY = "runtime.relationships.routes"

export type InquiryTargetValidationResult = "valid" | "not_found" | "unavailable"

export interface InquiryTargetValidationRuntime {
  validateTarget(
    db: unknown,
    kind: InquiryMaterializedTargetKind,
    targetId: string,
  ): Promise<InquiryTargetValidationResult>
}

/**
 * Hook for apps that source KMS keys from somewhere other than env
 * vars / wrangler secrets. Mirrors the same hook in
 * `@voyant-travel/bookings`.
 */
export type ResolveRelationshipsKmsProvider = (
  env: Record<string, string | undefined>,
) => KmsProvider | Promise<KmsProvider>

export interface RelationshipsRouteRuntime {
  /**
   * Returns the configured KMS provider, or `null` when no provider
   * is wired (e.g. dev environments without KMS keys). Routes that
   * require KMS gracefully reject with a 503 in that case.
   */
  getKmsProvider(): Promise<KmsProvider | null>
  /** Resolves the custom-field registry from persisted definitions for a request. */
  customFields?: CustomFieldRegistryResolver
  /** Resolves and locks persisted definitions for an entity write transaction. */
  customFieldsForWrite?: (db: unknown, entity: string) => ReturnType<CustomFieldRegistryResolver>
  /**
   * Reads messages a deployment actually delivered to a person, so the
   * Communications tab shows them alongside hand-logged entries. Absent when
   * the deployment selects no notifications module — the tab then lists only
   * what staff recorded, which is what it did before.
   */
  personNotifications?: RelationshipsPersonNotificationsRuntime
  proposalInquiryConversion?: ProposalInquiryConversionRuntime
  inquiryTargetValidation?: InquiryTargetValidationRuntime
  inquiryBookingSession?: CatalogInquiryBookingSessionRuntime
  inquiryAttachments?: MediaInquiryAttachmentRuntime
  inquiryFirstResponseSlaPolicy: InquiryFirstResponseSlaPolicy
}

export interface RelationshipsRouteRuntimeOptions {
  resolveKmsProvider?: ResolveRelationshipsKmsProvider
  customFields?: CustomFieldRegistryResolver
  customFieldsForWrite?: (db: unknown, entity: string) => ReturnType<CustomFieldRegistryResolver>
  personNotifications?: RelationshipsPersonNotificationsRuntime
  proposalInquiryConversion?: ProposalInquiryConversionRuntime
  inquiryTargetValidation?: InquiryTargetValidationRuntime
  inquiryBookingSession?: CatalogInquiryBookingSessionRuntime
  inquiryAttachments?: MediaInquiryAttachmentRuntime
  resolveInquiryFirstResponseSla?: (
    bindings: Record<string, unknown>,
  ) => InquiryFirstResponseSlaConfiguration | undefined
}

function buildRuntimeEnv(bindings: Record<string, unknown>): Record<string, string | undefined> {
  const processEnv =
    (
      globalThis as typeof globalThis & {
        process?: { env?: Record<string, string | undefined> }
      }
    ).process?.env ?? {}

  const flat: Record<string, string | undefined> = { ...processEnv }
  for (const [key, value] of Object.entries(bindings ?? {})) {
    if (typeof value === "string" || value === undefined) {
      flat[key] = value
    }
  }
  return flat
}

export function buildRelationshipsRouteRuntime(
  bindings: Record<string, unknown>,
  options: RelationshipsRouteRuntimeOptions = {},
): RelationshipsRouteRuntime {
  const runtimeEnv = buildRuntimeEnv(bindings)

  return {
    async getKmsProvider() {
      try {
        if (options.resolveKmsProvider) {
          return await options.resolveKmsProvider(runtimeEnv)
        }
        return await createKmsProviderFromEnv(runtimeEnv)
      } catch {
        return null
      }
    },
    customFields: options.customFields,
    customFieldsForWrite: options.customFieldsForWrite,
    personNotifications: options.personNotifications,
    proposalInquiryConversion: options.proposalInquiryConversion,
    inquiryTargetValidation: options.inquiryTargetValidation,
    inquiryBookingSession: options.inquiryBookingSession,
    inquiryAttachments: options.inquiryAttachments,
    inquiryFirstResponseSlaPolicy: createInquiryFirstResponseSlaPolicy(
      options.resolveInquiryFirstResponseSla?.(bindings),
    ),
  }
}
