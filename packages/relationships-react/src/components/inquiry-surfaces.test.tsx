import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { type InquiryRecord, inquiryRecordSchema } from "../inquiry-schemas.js"
import { InquiryQueue } from "./inquiry-queue.js"
import { InquiryWorkspace } from "./inquiry-workspace.js"

const inquiry: InquiryRecord = inquiryRecordSchema.parse({
  id: "inq_01",
  subject: "Family holiday in Greece",
  kind: "custom_trip",
  status: "qualified",
  closeOutcome: null,
  closeNote: null,
  duplicateOfInquiryId: null,
  priority: "high",
  personId: "per_01",
  organizationId: null,
  contactSnapshot: { name: "Ana Pop", email: "ana@example.test", phone: null },
  ownerId: "usr_sales",
  teamId: null,
  unassignedReason: null,
  nextActionAt: "2026-08-20T09:00:00.000Z",
  firstResponseDueAt: "2026-08-18T14:00:00.000Z",
  firstRespondedAt: null,
  travelBrief: {
    version: 1,
    destinations: [{ label: "Greece" }],
    adults: 2,
    children: [{ age: 8 }, { age: 11 }],
  },
  customerMessage: "We would like a quiet island.",
  internalSummary: "Needs two connected rooms.",
  source: "storefront",
  sourceRef: "submission_01",
  sourceUrl: null,
  locale: "en",
  consentSnapshot: null,
  tags: ["family"],
  customFields: {},
  targets: [],
  createdAt: "2026-08-18T10:00:00.000Z",
  updatedAt: "2026-08-18T10:00:00.000Z",
  lastActivityAt: null,
  qualifiedAt: "2026-08-18T12:00:00.000Z",
  convertedAt: null,
  closedAt: null,
})

describe("Inquiry operator surfaces", () => {
  it("renders an actionable work queue", () => {
    const html = renderToStaticMarkup(
      <InquiryQueue
        inquiries={[inquiry]}
        filters={{ view: "qualified" }}
        onFiltersChange={vi.fn()}
        onInquiryOpen={vi.fn()}
        getInquiryHref={(row) => `/inquiries/${row.id}`}
        total={1}
        limit={50}
        offset={0}
        onPageChange={vi.fn()}
      />,
    )
    expect(html).toContain("Inquiry queue")
    expect(html).toContain("Family holiday in Greece")
    expect(html).toContain('href="/inquiries/inq_01"')
    expect(html).toContain('aria-label="Search inquiries"')
    expect(html).toContain("Showing 1 of 1")
  })

  it("renders request, operational, and conversion context in the detail workspace", () => {
    const noOp = vi.fn().mockResolvedValue(undefined)
    const html = renderToStaticMarkup(
      <InquiryWorkspace
        inquiry={inquiry}
        onBack={noOp}
        onUpdate={noOp}
        onAssign={noOp}
        onTransition={noOp}
        onClose={noOp}
        onReopen={noOp}
        onConvertToProposal={noOp}
        onConvertToBookingSession={noOp}
      />,
    )
    expect(html).toContain("Customer request")
    expect(html).toContain("We would like a quiet island.")
    expect(html).toContain("Create proposal")
    expect(html).toContain("Start booking session")
  })
})
