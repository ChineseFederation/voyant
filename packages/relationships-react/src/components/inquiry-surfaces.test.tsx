import { type InquiryRecord, inquiryRecordSchema } from "@voyant-travel/relationships-contracts"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { CrmUiMessagesProvider } from "../i18n/index.js"
import { buildInquiriesQueryString } from "../query-options.js"
import { InquiryQueue, withInquiryStatus } from "./inquiry-queue.js"
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
  contactSnapshot: { name: "Ana Pop", email: "ana@example.test" },
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
  createdAt: "2026-08-18T10:00:00.000Z",
  updatedAt: "2026-08-18T10:00:00.000Z",
  lastActivityAt: null,
  qualifiedAt: "2026-08-18T12:00:00.000Z",
  convertedAt: null,
  closedAt: null,
})

describe("Inquiry operator surfaces", () => {
  const refusedConversion = async () =>
    ({ kind: "refused", error: "refused", reason: "stage_closed" }) as const

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

  it("pairs terminal status selections with a compatible canonical view", () => {
    const converted = withInquiryStatus({ view: "mine" }, "converted")
    const closed = withInquiryStatus({ view: "actionable" }, "closed")
    const triaged = withInquiryStatus({ view: "closed" }, "triaged")

    expect(converted).toEqual({ view: "converted", status: "converted" })
    expect(closed).toEqual({ view: "closed", status: "closed" })
    expect(triaged).toEqual({ view: undefined, status: "triaged" })
    expect(buildInquiriesQueryString({ ...converted, limit: 50, offset: 0 })).toBe(
      "view=converted&status=converted&limit=50&offset=0",
    )
    expect(buildInquiriesQueryString(closed)).toBe("view=closed&status=closed")
  })

  it("renders an authoritative paginated mine response without client-side filtering", () => {
    const convertedInquiry = inquiryRecordSchema.parse({
      ...inquiry,
      id: "inq_converted",
      subject: "Converted server result",
      status: "converted",
      convertedAt: "2026-08-18T13:00:00.000Z",
    })
    const html = renderToStaticMarkup(
      <InquiryQueue
        inquiries={[convertedInquiry]}
        filters={{ view: "mine" }}
        onFiltersChange={vi.fn()}
        onInquiryOpen={vi.fn()}
        getInquiryHref={(row) => `/inquiries/${row.id}`}
        total={75}
        limit={50}
        offset={50}
        onPageChange={vi.fn()}
      />,
    )

    expect(html).toContain("Converted server result")
    expect(html).toContain("Showing 51 of 75")
    expect(buildInquiriesQueryString({ view: "mine", limit: 50, offset: 50 })).toBe(
      "view=mine&limit=50&offset=50",
    )
  })

  it("renders request and operational context in the detail workspace", () => {
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
        onConvertToProposal={refusedConversion}
      />,
    )
    expect(html).toContain("Customer request")
    expect(html).toContain("We would like a quiet island.")
    expect(html).toContain('for="inquiry-proposal-pipeline"')
    expect(html).toContain('for="inquiry-proposal-stage"')
    expect(html).toContain('for="keep-inquiry-open"')
    expect(html).toContain("Create proposal")
  })

  it("localizes the Proposal action and disables it for terminal inquiries", () => {
    const terminalInquiry = inquiryRecordSchema.parse({
      ...inquiry,
      status: "converted",
      convertedAt: "2026-08-18T13:00:00.000Z",
    })
    const noOp = vi.fn().mockResolvedValue(undefined)
    const html = renderToStaticMarkup(
      <CrmUiMessagesProvider locale="ro-RO">
        <InquiryWorkspace
          inquiry={terminalInquiry}
          onBack={noOp}
          onUpdate={noOp}
          onAssign={noOp}
          onTransition={noOp}
          onClose={noOp}
          onReopen={noOp}
          onConvertToProposal={refusedConversion}
        />
      </CrmUiMessagesProvider>,
    )

    expect(html).toContain("Fluxul propunerii")
    expect(html).toContain("Păstrează solicitarea deschisă după conversie")
    expect(html).toContain("Este necesară o solicitare calificată cu un client asociat.")
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Creează propunere<\/button>/)
  })
})
