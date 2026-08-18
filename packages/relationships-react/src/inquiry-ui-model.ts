import type {
  CloseInquiryInput,
  InquiryCloseOutcome,
  InquiryListQueryInput,
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

export function filterInquiryQueue(
  inquiries: InquiryRecord[],
  view?: InquiryListQueryInput["view"],
  status?: InquiryStatus,
) {
  if (status) return inquiries.filter((inquiry) => inquiry.status === status)
  if (view === "converted") return inquiries.filter((inquiry) => inquiry.status === "converted")
  if (view === "closed") return inquiries.filter((inquiry) => inquiry.status === "closed")
  if (view === "new") return inquiries.filter((inquiry) => inquiry.status === "new")
  if (view === "unassigned") return inquiries.filter((inquiry) => !inquiry.ownerId)
  if (view === "overdue") {
    const now = Date.now()
    return inquiries.filter(
      (inquiry) => inquiry.nextActionAt && new Date(inquiry.nextActionAt).getTime() < now,
    )
  }
  if (view === "waiting") {
    return inquiries.filter((inquiry) => inquiry.status === "waiting_on_customer")
  }
  if (view === "qualified") return inquiries.filter((inquiry) => inquiry.status === "qualified")
  return inquiries.filter(
    (inquiry) => inquiry.status !== "converted" && inquiry.status !== "closed",
  )
}

export function allowedInquiryTransitions(inquiry: InquiryRecord): InquiryStatus[] {
  if (inquiry.status === "new") return ["triaged"]
  if (inquiry.status === "triaged") return ["in_progress", "qualified"]
  if (inquiry.status === "in_progress") return ["waiting_on_customer", "qualified"]
  if (inquiry.status === "waiting_on_customer") return ["in_progress", "qualified"]
  return []
}
