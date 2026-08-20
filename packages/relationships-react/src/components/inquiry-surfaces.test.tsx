import { type InquiryRecord, inquiryRecordSchema } from "@voyant-travel/relationships-contracts"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { CrmUiMessagesProvider } from "../i18n/index.js"
import { buildInquiriesQueryString } from "../query-options.js"
import { InquiryQueue, withInquiryStatus } from "./inquiry-queue.js"
import { mergeSelectedProduct, targetSubtitle } from "./inquiry-targets-section.js"
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
  targets: [
    {
      linkId: "link_product_01",
      inquiryId: "inq_01",
      kind: "product",
      targetId: "prod_01",
      snapshot: { title: "Quiet Greece" },
      createdAt: "2026-08-18T10:00:00.000Z",
    },
  ],
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
  const refusedBookingSession = async () =>
    ({ kind: "refused", error: "refused", reason: "unsupported_target" }) as const

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
        activities={[
          {
            id: "act_01",
            subject: "Sent island options",
            type: "email",
            ownerId: "usr_sales",
            status: "done",
            dueAt: null,
            completedAt: "2026-08-18T13:00:00.000Z",
            location: null,
            description: "Three quieter islands",
            customFields: {
              relationships: { inquiryCommunication: { direction: "outbound" } },
            },
            createdAt: "2026-08-18T13:00:00.000Z",
            updatedAt: "2026-08-18T13:00:00.000Z",
          },
        ]}
        onRecordActivity={noOp}
        onBack={noOp}
        onUpdate={noOp}
        onAssign={noOp}
        onTransition={noOp}
        onRecordFirstResponse={noOp}
        onClose={noOp}
        onReopen={noOp}
        onConvertToProposal={refusedConversion}
        onConvertToBookingSession={refusedBookingSession}
        proposalPipelines={[{ id: "pipe_1", name: "Sales", isDefault: true }]}
      />,
    )
    expect(html).toContain("Customer request")
    expect(html).not.toContain("Record first response")
    expect(html).toContain("We would like a quiet island.")
    expect(html).toContain('for="inquiry-proposal-pipeline"')
    // A pipeline is CHOSEN, not typed: the control is a select trigger, and no
    // pipeline id reaches the markup. (The options themselves live in a portal
    // that only mounts on open, so static markup cannot see their labels.)
    expect(html).toMatch(/<button[^>]*id="inquiry-proposal-pipeline"/)
    expect(html).not.toMatch(/<input[^>]*id="inquiry-proposal-pipeline"/)
    expect(html).not.toContain("pipe_1")
    expect(html).toContain('for="keep-inquiry-open"')
    expect(html).toContain("Create proposal")
    expect(html).toContain("Start booking journey")
    expect(html).toContain("Quiet Greece")
    expect(html).toMatch(/<button[^>]*>Create booking session<\/button>/)
    expect(html).toContain("Activity timeline")
    expect(html).toContain("Sent island options")
    expect(html).toContain("Customer outbound")
    expect(html).toContain("Record activity")
  })

  it("routes attachment downloads through the configured API base", () => {
    const noOp = vi.fn().mockResolvedValue(undefined)
    const withAttachment = inquiryRecordSchema.parse({
      ...inquiry,
      attachments: [
        {
          linkId: "link_attachment_01",
          inquiryId: inquiry.id,
          assetId: "mast_01",
          name: "itinerary.pdf",
          mimeType: "application/pdf",
          caption: null,
          attachedBy: "usr_sales",
          createdAt: "2026-08-18T13:00:00.000Z",
          updatedAt: "2026-08-18T13:00:00.000Z",
          downloadPath:
            "/v1/admin/relationships/inquiries/inq_01/attachments/link_attachment_01/download",
        },
      ],
    })
    const html = renderToStaticMarkup(
      <InquiryWorkspace
        inquiry={withAttachment}
        apiBaseUrl="/api/"
        onBack={noOp}
        onUpdate={noOp}
        onAssign={noOp}
        onTransition={noOp}
        onRecordFirstResponse={noOp}
        onClose={noOp}
        onReopen={noOp}
        onConvertToProposal={refusedConversion}
        onConvertToBookingSession={refusedBookingSession}
      />,
    )

    expect(html).toContain(
      'href="/api/v1/admin/relationships/inquiries/inq_01/attachments/link_attachment_01/download"',
    )
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
          onRecordFirstResponse={noOp}
          onClose={noOp}
          onReopen={noOp}
          onConvertToProposal={refusedConversion}
          onConvertToBookingSession={refusedBookingSession}
          proposalPipelines={[{ id: "pipe_1", name: "Vânzări", isDefault: true }]}
        />
      </CrmUiMessagesProvider>,
    )

    expect(html).toContain("Fluxul propunerii")
    expect(html).toContain("Păstrează solicitarea deschisă după conversie")
    expect(html).toContain("Este necesară o solicitare calificată cu un client asociat.")
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Creează propunere<\/button>/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Creează sesiune de rezervare<\/button>/)
  })
  // A greyed-out button that will not say why is a dead end. The reasons used to
  // ride on `title`, which the shared Button suppresses with
  // `disabled:pointer-events-none`, so nothing ever showed them (#4838).
  it("states on the page why a lifecycle action is unavailable", () => {
    const untriaged = inquiryRecordSchema.parse({
      ...inquiry,
      status: "new",
      ownerId: null,
      unassignedReason: null,
      qualifiedAt: null,
    })
    const noOp = vi.fn().mockResolvedValue(undefined)
    const html = renderToStaticMarkup(
      <InquiryWorkspace
        inquiry={untriaged}
        onBack={noOp}
        onUpdate={noOp}
        onAssign={noOp}
        onTransition={noOp}
        onRecordFirstResponse={noOp}
        onClose={noOp}
        onReopen={noOp}
        onConvertToProposal={refusedConversion}
        onConvertToBookingSession={refusedBookingSession}
      />,
    )

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Mark triaged<\/button>/)
    expect(html).toContain("Assign an owner or enter a reason for leaving this inquiry unassigned.")
  })

  it("names the owner instead of printing an owner id in the queue", () => {
    const html = renderToStaticMarkup(
      <InquiryQueue
        inquiries={[inquiry]}
        filters={{}}
        onFiltersChange={() => undefined}
        onInquiryOpen={() => undefined}
        getInquiryHref={() => "/inquiries/inq_01"}
        total={1}
        limit={50}
        offset={0}
        onPageChange={() => undefined}
        ownerNames={{ usr_sales: "Dana Ionescu" }}
      />,
    )

    expect(html).toContain("Dana Ionescu")
    expect(html).not.toContain("usr_sales")
  })

  // The utility title-cases every word, so a translated sentence such as
  // "Waiting on customer" rendered as "Waiting On Customer".
  it("does not title-case translated status labels", () => {
    const waiting = inquiryRecordSchema.parse({ ...inquiry, status: "waiting_on_customer" })
    const html = renderToStaticMarkup(
      <InquiryQueue
        inquiries={[waiting]}
        filters={{}}
        onFiltersChange={() => undefined}
        onInquiryOpen={() => undefined}
        getInquiryHref={() => "/inquiries/inq_01"}
        total={1}
        limit={50}
        offset={0}
        onPageChange={() => undefined}
      />,
    )

    expect(html).toContain("Waiting on customer")
    expect(html).not.toMatch(/class="[^"]*\bcapitalize\b/)
  })

  it("reads the travel brief as a brief, not as its JSON", () => {
    const noOp = vi.fn().mockResolvedValue(undefined)
    const html = renderToStaticMarkup(
      <InquiryWorkspace
        inquiry={inquiry}
        onBack={noOp}
        onUpdate={noOp}
        onAssign={noOp}
        onTransition={noOp}
        onRecordFirstResponse={noOp}
        onClose={noOp}
        onReopen={noOp}
        onConvertToProposal={refusedConversion}
        onConvertToBookingSession={refusedBookingSession}
      />,
    )

    expect(html).toContain("Destinations")
    expect(html).toContain("Greece")
    expect(html).toContain("2 adults, 2 children")
    expect(html).not.toContain("durationNights")
    expect(html).not.toContain("&quot;version&quot;")
  })
})

describe("Inquiry target picker", () => {
  const product = { id: "prod_1", name: "Maldives Dream Retreat" }

  it("keeps the chosen product available when the search no longer returns it", () => {
    expect(mergeSelectedProduct([], product)).toEqual([product])
  })

  it("does not duplicate a chosen product the search still returns", () => {
    expect(mergeSelectedProduct([product], product)).toEqual([product])
  })

  it("passes the results through when nothing is chosen", () => {
    expect(mergeSelectedProduct([product], null)).toEqual([product])
  })
})

describe("Inquiry target rows", () => {
  const format = (value: string) =>
    new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value))

  it("drops a date the title already states", () => {
    const title = format("2026-09-19")
    expect(targetSubtitle({ snapshot: { title, startDate: "2026-09-19" } }, format)).toBe("")
  })

  it("keeps a date the title does not state", () => {
    expect(
      targetSubtitle({ snapshot: { title: "Quiet Greece", startDate: "2026-09-19" } }, format),
    ).toBe(format("2026-09-19"))
  })

  it("keeps an option label alongside the date", () => {
    expect(
      targetSubtitle(
        { snapshot: { title: "Quiet Greece", optionLabel: "Sea view", startDate: "2026-09-19" } },
        format,
      ),
    ).toBe(`Sea view · ${format("2026-09-19")}`)
  })
})

describe("Proposal conversion overrides", () => {
  const noOp = vi.fn().mockResolvedValue(undefined)
  const refused = async () =>
    ({ kind: "refused", error: "refused", reason: "stage_closed" }) as const
  const refusedSession = async () =>
    ({ kind: "refused", error: "refused", reason: "unsupported_target" }) as const

  // A deployment without Proposals reachable should not show an override that
  // can only ever be empty.
  it("hides the pipeline override when no pipeline is reachable", () => {
    const html = renderToStaticMarkup(
      <InquiryWorkspace
        inquiry={inquiry}
        onBack={noOp}
        onUpdate={noOp}
        onAssign={noOp}
        onTransition={noOp}
        onRecordFirstResponse={noOp}
        onClose={noOp}
        onReopen={noOp}
        onConvertToProposal={refused}
        onConvertToBookingSession={refusedSession}
      />,
    )

    expect(html).not.toContain("Advanced: choose a pipeline and stage")
    expect(html).not.toContain('for="inquiry-proposal-pipeline"')
    // The conversion itself stays available — the override is what is optional.
    expect(html).toContain("Create proposal")
  })

  it("keeps the override behind a disclosure when pipelines exist", () => {
    const html = renderToStaticMarkup(
      <InquiryWorkspace
        inquiry={inquiry}
        onBack={noOp}
        onUpdate={noOp}
        onAssign={noOp}
        onTransition={noOp}
        onRecordFirstResponse={noOp}
        onClose={noOp}
        onReopen={noOp}
        onConvertToProposal={refused}
        onConvertToBookingSession={refusedSession}
        proposalPipelines={[{ id: "pipe_1", name: "Sales", isDefault: true }]}
      />,
    )

    expect(html).toContain("<details")
    expect(html).toContain("Advanced: choose a pipeline and stage")
  })
})
