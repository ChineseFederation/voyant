import type {
  CloseInquiryInput,
  InquiryCloseOutcome,
  InquiryRecord,
  InquiryStatus,
  TransitionInquiryInput,
} from "@voyant-travel/relationships-contracts"

export function buildTransitionInput(
  inquiry: InquiryRecord,
  status: TransitionInquiryInput["status"],
  options: {
    nextActionAt?: string | null
    noFollowUpExpected?: boolean
    unassignedReason?: string | null
  } = {},
): TransitionInquiryInput | null {
  if (!allowedInquiryTransitions(inquiry).includes(status)) return null
  const unassignedReason = options.unassignedReason?.trim() || inquiry.unassignedReason
  if (status === "triaged" && !inquiry.ownerId && !unassignedReason) return null
  if (status === "qualified" && !inquiry.personId && !inquiry.organizationId) return null
  if (
    (status === "in_progress" || status === "waiting_on_customer") &&
    !options.nextActionAt &&
    !options.noFollowUpExpected
  ) {
    return null
  }
  return {
    status,
    ...(options.nextActionAt ? { nextActionAt: options.nextActionAt } : {}),
    ...(options.noFollowUpExpected ? { noFollowUpExpected: true } : {}),
    ...(status === "triaged" && !inquiry.ownerId && options.unassignedReason?.trim()
      ? { unassignedReason: options.unassignedReason.trim() }
      : {}),
  }
}

export function inquiryPageState(total: number, limit: number, offset: number) {
  return {
    hasPrevious: offset > 0,
    hasNext: offset + limit < total,
    previousOffset: Math.max(0, offset - limit),
    nextOffset: offset + limit,
  }
}

export function buildCloseInput(
  outcome: InquiryCloseOutcome,
  options: { duplicateOfInquiryId?: string; note?: string } = {},
): CloseInquiryInput | null {
  const duplicateOfInquiryId = options.duplicateOfInquiryId?.trim()
  const note = options.note?.trim()
  if (outcome === "duplicate" && !duplicateOfInquiryId) return null
  if (outcome === "other" && !note) return null
  return {
    outcome,
    ...(outcome === "duplicate" ? { duplicateOfInquiryId } : {}),
    ...(outcome === "other" ? { note } : {}),
  }
}

export function allowedInquiryTransitions(inquiry: InquiryRecord): InquiryStatus[] {
  if (inquiry.status === "new") return ["triaged"]
  if (inquiry.status === "triaged") return ["in_progress", "qualified"]
  if (inquiry.status === "in_progress") return ["waiting_on_customer", "qualified"]
  if (inquiry.status === "waiting_on_customer") return ["in_progress", "qualified"]
  return []
}

/**
 * Target references intake kept but could not materialize as links.
 *
 * Storefront and legacy intake record a reference the owning module could not
 * resolve rather than dropping the submission, so the operator sees what the
 * customer actually named. Shape is validated loosely because it is provenance,
 * not a contract: an unreadable entry is skipped, never rendered as `[object Object]`.
 */
export function unresolvedInquiryTargets(
  inquiry: InquiryRecord,
): { kind: string; targetId: string; reason?: string }[] {
  const raw = inquiry.customFields?.relationships?.unresolvedTargets
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const { kind, targetId, reason } = entry as Record<string, unknown>
    if (typeof kind !== "string" || typeof targetId !== "string") return []
    return [{ kind, targetId, ...(typeof reason === "string" ? { reason } : {}) }]
  })
}
