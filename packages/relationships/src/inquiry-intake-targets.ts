import type { PublicInquiryTargetInput } from "@voyant-travel/relationships-contracts"
import type {
  InquiryMaterializedTargetKind,
  InquiryTargetAuthorityRuntime,
} from "@voyant-travel/relationships-contracts/inquiry-target-authority/runtime-port"

/**
 * A target reference the customer supplied that no owner could materialize.
 *
 * It is kept with the Inquiry rather than discarded: an operator who sees the
 * raw reference can still work the request, and a later reconciliation can
 * attach the target once the owning module can resolve it.
 */
export interface UnresolvedInquiryTarget {
  kind: InquiryMaterializedTargetKind
  targetId: string
  reason: "authority_unavailable" | "not_found"
}

export interface RequestedInquiryTarget {
  kind: InquiryMaterializedTargetKind
  targetId: string
}

/**
 * Resolve intake target references through their owning modules.
 *
 * Intake is a capture path: a storefront visitor who fills in a form has given
 * us their request, and a target we cannot resolve is our problem, not a reason
 * to discard it. Every unresolvable reference is returned separately so the
 * caller can retain it as provenance, and the submission still becomes an
 * Inquiry ([#4838]: a target refusal aborted the whole transaction and the
 * storefront got a 500).
 */
export async function resolveIntakeTargets(
  db: unknown,
  authorities: readonly InquiryTargetAuthorityRuntime[],
  requested: readonly RequestedInquiryTarget[],
): Promise<{ targets: PublicInquiryTargetInput[]; unresolved: UnresolvedInquiryTarget[] }> {
  const targets: PublicInquiryTargetInput[] = []
  const unresolved: UnresolvedInquiryTarget[] = []
  for (const target of requested) {
    const matches = authorities.filter((authority) => authority.kind === target.kind)
    const authority = matches.length === 1 ? matches[0] : undefined
    if (!authority?.resolveSnapshot) {
      unresolved.push({ ...target, reason: "authority_unavailable" })
      continue
    }
    const snapshot = await authority.resolveSnapshot(db, target.targetId)
    if (!snapshot) {
      unresolved.push({ ...target, reason: "not_found" })
      continue
    }
    targets.push({ ...target, snapshot })
  }
  return { targets, unresolved }
}
