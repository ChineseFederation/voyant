/**
 * Target kinds Relationships can materialize as a standard link.
 *
 * `departure` is the dated availability slot a customer asked about. It was
 * briefly called `option_unit`, which named a different entity than the one it
 * resolved: the authority is Availability's slot reader, the link is the
 * departure linkable, and legacy Booking Inquiries populate it from
 * `departureId`. Callers that passed a real `option_units` id were refused
 * ([#4838]).
 */
export type InquiryMaterializedTargetKind = "product" | "departure"

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
    if (provider.kind !== "product" && provider.kind !== "departure") {
      throw new Error("Inquiry target authority must declare a supported kind.")
    }
    if (typeof provider.targetExists !== "function") {
      throw new Error("Inquiry target authority must implement targetExists().")
    }
  },
})
