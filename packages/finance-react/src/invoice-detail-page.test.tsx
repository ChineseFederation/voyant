import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { InvoiceAttachmentRecord, InvoiceRecord } from "./index.js"

const financeReactState = vi.hoisted(() => ({
  invoice: null as InvoiceRecord | null,
  attachments: [] as InvoiceAttachmentRecord[],
}))

vi.mock("./index.js", () => {
  const emptyListQuery = () => ({
    data: { data: [] },
    isPending: false,
    refetch: vi.fn(),
  })
  const mutation = () => ({
    isPending: false,
    mutateAsync: vi.fn(async () => undefined),
  })

  return {
    useInvoice: () => ({
      data: { data: financeReactState.invoice },
      isError: false,
      isPending: false,
    }),
    useInvoiceLineItems: emptyListQuery,
    useInvoicePayments: emptyListQuery,
    useInvoiceCreditNotes: emptyListQuery,
    useRefundSettlements: emptyListQuery,
    useInvoiceAttachments: () => ({
      data: { data: financeReactState.attachments },
      isPending: false,
      refetch: vi.fn(),
    }),
    useInvoiceNotes: emptyListQuery,
    useInvoiceMutation: () => ({
      convertToInvoice: mutation(),
      create: mutation(),
      remove: mutation(),
      update: mutation(),
      voidInvoice: mutation(),
    }),
    useInvoiceLineItemMutation: () => ({ remove: mutation() }),
    useInvoiceAttachmentMutation: () => ({
      create: mutation(),
      remove: mutation(),
      update: mutation(),
    }),
    useInvoiceNoteMutation: mutation,
    useVoyantFinanceContext: () => ({
      baseUrl: "/api",
      fetcher: vi.fn(),
    }),
  }
})

import { InvoiceDetailHeader, InvoiceDetailPage } from "./components/invoice-detail-page.js"

beforeEach(() => {
  financeReactState.invoice = null
  financeReactState.attachments = []
})

function invoice(data: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: "inv_123",
    invoiceNumber: "PF-2026-001",
    bookingId: "book_123",
    personId: null,
    organizationId: null,
    status: "draft",
    currency: "EUR",
    subtotalCents: 10000,
    taxCents: 1900,
    totalCents: 11900,
    paidCents: 0,
    balanceDueCents: 11900,
    issueDate: "2026-05-22",
    dueDate: "2026-06-01",
    notes: null,
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
    ...data,
  }
}

describe("InvoiceDetailHeader", () => {
  it("renders a localized type badge when invoiceType is present", () => {
    const html = renderToStaticMarkup(
      <InvoiceDetailHeader
        invoice={invoice({ invoiceType: "proforma" })}
        onEdit={() => {}}
        onVoid={async () => {}}
        onDelete={async () => {}}
      />,
    )

    expect(html).toContain('data-slot="invoice-type-badge"')
    expect(html).toContain('data-invoice-type="proforma"')
    expect(html).toContain("Proforma")
  })

  it("does not render a type badge for legacy invoices without invoiceType", () => {
    const html = renderToStaticMarkup(
      <InvoiceDetailHeader
        invoice={invoice()}
        onEdit={() => {}}
        onVoid={async () => {}}
        onDelete={async () => {}}
      />,
    )

    expect(html).not.toContain('data-slot="invoice-type-badge"')
  })
})

describe("InvoiceDetailPage", () => {
  it("uses the finance API base for default attachment download links", () => {
    financeReactState.invoice = invoice()
    financeReactState.attachments = [
      {
        id: "att_123",
        invoiceId: "inv_123",
        kind: "supporting_document",
        name: "boarding-pass.pdf",
        storageKey: "invoices/inv_123/boarding-pass.pdf",
        checksum: null,
        metadata: null,
        mimeType: "application/pdf",
        fileSize: 1234,
        createdAt: "2026-05-22T00:00:00.000Z",
      },
    ]

    const html = renderToStaticMarkup(<InvoiceDetailPage id="inv_123" />)

    expect(html).toContain('href="/api/v1/admin/finance/invoice-attachments/att_123/download"')
  })
})
