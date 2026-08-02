import type { EffectivePublicationResult } from "./service/types.js"

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
