import type {
  EffectivePublicationResult,
  EffectiveSourcePublicationResult,
} from "./service/types.js"

export type PublicationDecision = "include" | "exclude"
export type PublicationChannelStatus = "active" | "inactive" | "pending" | "archived" | null

export interface PublicationRuleInput {
  id: string
  decision: PublicationDecision
}

export interface ResolveEffectivePublicationInput {
  channelId: string
  productId: string
  canonicalSupplierId?: string | null
  channelStatus: PublicationChannelStatus
  productRule?: PublicationRuleInput | null
  supplierRule?: PublicationRuleInput | null
}

export function resolveEffectivePublication(
  input: ResolveEffectivePublicationInput,
): EffectivePublicationResult {
  const canonicalSupplierId = input.canonicalSupplierId ?? null

  if (!input.channelStatus) {
    return {
      channelId: input.channelId,
      productId: input.productId,
      canonicalSupplierId,
      published: false,
      decision: null,
      reason: "channel_missing",
      source: "channel",
      ruleId: null,
      message: "Channel does not exist.",
    }
  }

  if (input.channelStatus !== "active") {
    return {
      channelId: input.channelId,
      productId: input.productId,
      canonicalSupplierId,
      published: false,
      decision: null,
      reason: "channel_inactive",
      source: "channel",
      ruleId: null,
      message: "Channel is not active.",
    }
  }

  if (input.productRule) {
    return {
      channelId: input.channelId,
      productId: input.productId,
      canonicalSupplierId,
      published: input.productRule.decision === "include",
      decision: input.productRule.decision,
      reason: "product_decision",
      source: "product",
      ruleId: input.productRule.id,
      message: `Product publication ${input.productRule.decision} rule applies.`,
    }
  }

  if (canonicalSupplierId && input.supplierRule) {
    return {
      channelId: input.channelId,
      productId: input.productId,
      canonicalSupplierId,
      published: input.supplierRule.decision === "include",
      decision: input.supplierRule.decision,
      reason: "supplier_decision",
      source: "supplier",
      ruleId: input.supplierRule.id,
      message: `Supplier publication ${input.supplierRule.decision} rule applies.`,
    }
  }

  return {
    channelId: input.channelId,
    productId: input.productId,
    canonicalSupplierId,
    published: false,
    decision: null,
    reason: canonicalSupplierId ? "default_deny" : "product_missing_supplier",
    source: "default",
    ruleId: null,
    message: canonicalSupplierId
      ? "No product or supplier publication rule exists."
      : "Product has no canonical Supplier and no product publication rule.",
  }
}

export interface ResolveEffectiveSourcePublicationInput {
  channelId: string
  sourceKind: string
  sourceConnectionId?: string | null
  channelStatus: PublicationChannelStatus
  /** Rule addressing this exact `(kind, connection)` pair. */
  connectionRule?: PublicationRuleInput | null
  /**
   * Rule addressing the kind with no connection id. Acts as the default for
   * every connection of that kind, so an operator can suppress a connector
   * wholesale without enumerating connections it has not seen yet.
   */
  kindRule?: PublicationRuleInput | null
}

/**
 * Channel publication for a sourced catalog entry, resolved from its
 * provenance rather than from a `products` row.
 *
 * Same default-deny posture and same most-specific-wins ordering as
 * {@link resolveEffectivePublication}, one rung coarser: connection beats
 * kind, and absent both the entry is unpublished. Connecting a supplier is
 * therefore never sufficient to merchandise it — see issue #4089.
 */
export function resolveEffectiveSourcePublication(
  input: ResolveEffectiveSourcePublicationInput,
): EffectiveSourcePublicationResult {
  const sourceConnectionId = input.sourceConnectionId ?? null
  const subject = {
    channelId: input.channelId,
    sourceKind: input.sourceKind,
    sourceConnectionId,
  }

  if (!input.channelStatus) {
    return {
      ...subject,
      published: false,
      decision: null,
      reason: "channel_missing",
      source: "channel",
      ruleId: null,
      message: "Channel does not exist.",
    }
  }

  if (input.channelStatus !== "active") {
    return {
      ...subject,
      published: false,
      decision: null,
      reason: "channel_inactive",
      source: "channel",
      ruleId: null,
      message: "Channel is not active.",
    }
  }

  if (input.connectionRule) {
    return {
      ...subject,
      published: input.connectionRule.decision === "include",
      decision: input.connectionRule.decision,
      reason: "connection_decision",
      source: "connection",
      ruleId: input.connectionRule.id,
      message: `Connection publication ${input.connectionRule.decision} rule applies.`,
    }
  }

  if (input.kindRule) {
    return {
      ...subject,
      published: input.kindRule.decision === "include",
      decision: input.kindRule.decision,
      reason: "source_kind_decision",
      source: "source_kind",
      ruleId: input.kindRule.id,
      message: `Source kind publication ${input.kindRule.decision} rule applies.`,
    }
  }

  return {
    ...subject,
    published: false,
    decision: null,
    reason: "default_deny",
    source: "default",
    ruleId: null,
    message: "No connection or source kind publication rule exists.",
  }
}
