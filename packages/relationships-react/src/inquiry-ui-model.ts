import type {
  InquiryCloseOutcome,
  InquiryRecord,
  InquiryStatus,
  InquiryTargetRecord,
} from "./inquiry-schemas.js"

export interface TransitionInquiryInput {
  status: "triaged" | "in_progress" | "waiting_on_customer" | "qualified"
  nextActionAt?: string | null
  noFollowUpExpected?: boolean
  unassignedReason?: string | null
}

export interface CloseInquiryInput {
  outcome: InquiryCloseOutcome
  duplicateOfInquiryId?: string | null
  note?: string | null
}

export function buildTransitionInput(
  inquiry: InquiryRecord,
  status: TransitionInquiryInput["status"],
  options: { nextActionAt?: string | null; noFollowUpExpected?: boolean } = {},
): TransitionInquiryInput | null {
  if (!allowedInquiryTransitions(inquiry).includes(status)) return null
  if (status === "triaged" && !inquiry.ownerId) return null
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

const bookingTargetKinds = new Set(["product", "option_unit", "departure"])

export function findBookingSessionTarget(targets: InquiryTargetRecord[]) {
  return targets.find((target) => bookingTargetKinds.has(target.kind))
}

export function filterInquiryQueue(
  inquiries: InquiryRecord[],
  view?: string,
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

export function createConversionRetryKeyStore(generate: () => string = () => crypto.randomUUID()) {
  const keys = new Map<string, string>()
  return {
    async run<T>(operation: string, execute: (idempotencyKey: string) => Promise<T>): Promise<T> {
      const key = keys.get(operation) ?? generate()
      keys.set(operation, key)
      const result = await execute(key)
      keys.delete(operation)
      return result
    },
  }
}

export function allowedInquiryTransitions(inquiry: InquiryRecord): InquiryStatus[] {
  if (inquiry.status === "new") return ["triaged"]
  if (inquiry.status === "triaged") return ["in_progress", "qualified"]
  if (inquiry.status === "in_progress") return ["waiting_on_customer", "qualified"]
  if (inquiry.status === "waiting_on_customer") return ["in_progress", "qualified"]
  return []
}
