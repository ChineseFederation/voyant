import type {
  CustomFieldRegistryResolver,
  CustomFieldVisibilityChannel,
  NamespacedCustomFieldValues,
} from "./custom-fields.js"
import { definePort } from "./project.js"

export type {
  AnalyticsEmitter,
  AnalyticsEventName,
  AnalyticsPort,
  AnalyticsProperties,
  AnalyticsPropertyValue,
} from "./analytics.js"
export { analyticsPort, createSafeAnalytics, noopAnalytics } from "./analytics.js"
export type {
  DocumentRenderer,
  PdfPageFormat,
  PdfRenderRequest,
} from "./document-rendering-runtime-port.js"
export { documentRendererPort } from "./document-rendering-runtime-port.js"

/**
 * Database-backed custom-field runtime shared by graph-selected consumers.
 *
 * The package that owns persisted definitions provides this port. Consumers
 * receive both the fresh registry and visibility-filtered entity values without
 * accepting deployment-authored definition input.
 */
export interface CustomFieldsRuntime {
  resolveRegistry: CustomFieldRegistryResolver
  /**
   * Resolve definitions under a transaction-scoped shared lock before an
   * entity write. Definition rename/delete takes the conflicting update lock,
   * so validation and persistence observe one authoritative definition state.
   */
  resolveRegistryForWrite: (db: unknown, entity: string) => ReturnType<CustomFieldRegistryResolver>
  resolveVisibleValues(
    db: unknown,
    entity: string,
    entityId: string,
    channel: CustomFieldVisibilityChannel,
  ): Promise<NamespacedCustomFieldValues> | NamespacedCustomFieldValues
}

/** Additive owner read capability used by the generic custom-fields runtime. */
export interface CustomFieldValueReaderRuntime {
  resolveVisibleValues(
    db: unknown,
    entity: string,
    entityId: string,
    channel: CustomFieldVisibilityChannel,
  ): Promise<NamespacedCustomFieldValues | undefined> | NamespacedCustomFieldValues | undefined
}

export interface CustomFieldValueDefinitionIdentity {
  entityType: string
  namespace: string
  key: string
}

/**
 * Package-owned value lifecycle capability used when a persisted definition
 * changes identity or is removed. Each provider mutates only its own entity
 * tables and receives namespace/key identity from the trusted definition row.
 */
export interface CustomFieldValueLifecycleRuntime {
  supports(entityType: string): boolean
  renameDefinitionKey(
    db: unknown,
    definition: CustomFieldValueDefinitionIdentity,
    nextKey: string,
  ): Promise<void> | void
  deleteDefinitionValues(
    db: unknown,
    definition: CustomFieldValueDefinitionIdentity,
  ): Promise<void> | void
}

/**
 * Trusted definition-owner facts resolved by the generic custom-fields module.
 * Entity providers receive these facts only from the definition service, never
 * from HTTP input.
 */
export interface CustomFieldValueOwnerContext {
  kind: "platform" | "operator" | "app"
  namespace: string
  ownerId?: string
}

/** The locked definition identity supplied to entity-owned value operations. */
export interface CustomFieldValueDefinitionContext {
  id: string
  entityType: string
  namespace: string
  key: string
  fieldType: string
}

/** A complete entity JSON value returned by an owning package. */
export interface CustomFieldValueEntityValues {
  entityId: string
  customFields: Record<string, unknown>
}

/**
 * Additive entity-owned persistence capability for the generic custom-field
 * value API. Providers know only their own entity tables; definition lookup,
 * owner authorization, synthetic ids, and typed wire conversion stay generic.
 */
export interface CustomFieldValueOperationsRuntime {
  supports(entityType: string): boolean
  list(
    db: unknown,
    owner: CustomFieldValueOwnerContext,
    input: { entityType: string; entityId?: string },
  ): Promise<readonly CustomFieldValueEntityValues[]> | readonly CustomFieldValueEntityValues[]
  upsert(
    db: unknown,
    owner: CustomFieldValueOwnerContext,
    input: {
      definition: CustomFieldValueDefinitionContext
      entityId: string
      value: unknown
    },
  ): Promise<boolean> | boolean
  delete(
    db: unknown,
    owner: CustomFieldValueOwnerContext,
    input: { definition: CustomFieldValueDefinitionContext; entityId: string },
  ): Promise<boolean> | boolean
}

export const customFieldValueReaderRuntimePort = definePort<CustomFieldValueReaderRuntime>({
  id: "custom-fields.value-reader",
  test(provider) {
    if (
      !provider ||
      typeof provider !== "object" ||
      typeof provider.resolveVisibleValues !== "function"
    ) {
      throw new Error("custom-fields.value-reader provider must implement resolveVisibleValues().")
    }
  },
})

export const customFieldValueLifecycleRuntimePort = definePort<CustomFieldValueLifecycleRuntime>({
  id: "custom-fields.value-lifecycle",
  test(provider) {
    if (
      !provider ||
      typeof provider !== "object" ||
      typeof provider.supports !== "function" ||
      typeof provider.renameDefinitionKey !== "function" ||
      typeof provider.deleteDefinitionValues !== "function"
    ) {
      throw new Error(
        "custom-fields.value-lifecycle provider must implement supports(), renameDefinitionKey(), and deleteDefinitionValues().",
      )
    }
  },
})

export const customFieldValueOperationsRuntimePort = definePort<CustomFieldValueOperationsRuntime>({
  id: "custom-fields.value-operations",
  test(provider) {
    if (
      !provider ||
      typeof provider !== "object" ||
      typeof provider.supports !== "function" ||
      typeof provider.list !== "function" ||
      typeof provider.upsert !== "function" ||
      typeof provider.delete !== "function"
    ) {
      throw new Error(
        "custom-fields.value-operations provider must implement supports(), list(), upsert(), and delete().",
      )
    }
  },
})

export const customFieldsRuntimePort = definePort<CustomFieldsRuntime>({
  id: "custom-fields.runtime",
  test(provider) {
    if (
      provider === null ||
      typeof provider !== "object" ||
      typeof provider.resolveRegistry !== "function" ||
      typeof provider.resolveRegistryForWrite !== "function" ||
      typeof provider.resolveVisibleValues !== "function"
    ) {
      throw new Error(
        "custom-fields.runtime provider must implement resolveRegistry(), resolveRegistryForWrite(), and resolveVisibleValues().",
      )
    }
  },
})
