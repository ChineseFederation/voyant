export type InquiryMaterializedTargetKind = "product" | "option_unit"

/**
 * Owner-side authority for an Inquiry target kind.
 *
 * This contract is deliberately import-cheap: Inventory and Operations bind it
 * without importing Relationships runtime code, while Relationships consumes
 * every selected authority through a many-valued graph port.
 */
export interface InquiryTargetAuthorityRuntime {
  kind: InquiryMaterializedTargetKind
  targetExists(db: unknown, targetId: string): Promise<boolean>
  resolveSnapshot?(
    db: unknown,
    targetId: string,
  ): Promise<{
    title: string
    optionLabel?: string | null
    startDate?: string | null
    endDate?: string | null
  } | null>
}

export const inquiryTargetAuthorityRuntimePort = Object.freeze({
  id: "relationships.inquiry-target-authority.runtime",
  test(provider: InquiryTargetAuthorityRuntime) {
    if (provider === null || typeof provider !== "object") {
      throw new Error("Inquiry target authority must be an object.")
    }
    if (provider.kind !== "product" && provider.kind !== "option_unit") {
      throw new Error("Inquiry target authority must declare a supported kind.")
    }
    if (typeof provider.targetExists !== "function") {
      throw new Error("Inquiry target authority must implement targetExists().")
    }
  },
})
