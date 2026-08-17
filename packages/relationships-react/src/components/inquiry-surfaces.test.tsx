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
  priority: "high",
  personId: null,
  organizationId: null,
  contactSnapshot: { name: "Ana Pop", email: "ana@example.test", phone: null },
  ownerId: "usr_sales",
  teamId: null,
  nextActionAt: "2026-08-20T09:00:00.000Z",
  firstResponseDueAt: "2026-08-18T14:00:00.000Z",
  firstRespondedAt: null,
  travelBrief: { destinations: ["Greece"], adults: 2, children: 2 },
  customerMessage: "We would like a quiet island.",
  internalSummary: "Needs two connected rooms.",
  source: "storefront",
  sourceRef: "submission_01",
  sourceUrl: null,
  locale: "en",
  tags: ["family"],
  metadata: null,
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
      />,
    )
    expect(html).toContain("Inquiry queue")
    expect(html).toContain("Family holiday in Greece")
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
