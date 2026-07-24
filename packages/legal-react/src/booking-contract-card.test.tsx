import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { LegalContractAttachmentRecord, LegalContractRecord } from "./index.js"

const legalState = vi.hoisted(() => ({
  contracts: [] as LegalContractRecord[],
  attachmentsByContractId: {} as Record<string, LegalContractAttachmentRecord[]>,
}))

vi.mock("./index.js", () => ({
  useLegalContractAttachments: ({ contractId }: { contractId: string }) => ({
    data: legalState.attachmentsByContractId[contractId] ?? [],
  }),
  useLegalContracts: () => ({
    data: { data: legalState.contracts },
    isLoading: false,
  }),
  useVoyantLegalContext: () => ({
    baseUrl: "/api",
    fetcher: vi.fn(),
  }),
}))

import { BookingContractCard } from "./components/booking-contract-card.js"

beforeEach(() => {
  legalState.contracts = []
  legalState.attachmentsByContractId = {}
})

function contract(data: Partial<LegalContractRecord> = {}): LegalContractRecord {
  return {
    id: "contract_123",
    bookingId: "book_123",
    contractNumber: "CTR-2026-001",
    title: "Travel contract",
    status: "issued",
    stage: "issued",
    stageHistory: [],
    templateId: "template_123",
    templateVersionId: "version_123",
    seriesId: null,
    personId: null,
    organizationId: null,
    supplierId: null,
    channelId: null,
    targetKind: "booking",
    targetId: "book_123",
    targetProvider: null,
    targetSourceRef: null,
    legacyTransactionOfferId: null,
    legacyTransactionOrderId: null,
    renderedBodyFormat: "html",
    renderedBody: null,
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-22T00:00:00.000Z",
    ...data,
  } as LegalContractRecord
}

function contractAttachment(
  data: Partial<LegalContractAttachmentRecord> = {},
): LegalContractAttachmentRecord {
  return {
    id: "contract_att_123",
    contractId: "contract_123",
    kind: "document",
    name: "contract.pdf",
    mimeType: "application/pdf",
    fileSize: 2048,
    storageKey: "contracts/contract_123/contract.pdf",
    checksum: null,
    metadata: null,
    createdAt: "2026-05-22T00:00:00.000Z",
    ...data,
  }
}

describe("BookingContractCard", () => {
  it("uses the legal API base for default attachment download links", () => {
    legalState.contracts = [contract()]
    legalState.attachmentsByContractId.contract_123 = [contractAttachment()]

    const html = renderToStaticMarkup(<BookingContractCard bookingId="book_123" />)

    expect(html).toContain(
      'href="/api/v1/admin/legal/contracts/attachments/contract_att_123/download"',
    )
  })

  it("lets callers override the attachment download API base", () => {
    legalState.contracts = [contract()]
    legalState.attachmentsByContractId.contract_123 = [contractAttachment()]

    const html = renderToStaticMarkup(
      <BookingContractCard bookingId="book_123" apiBaseUrl="https://admin.example/api" />,
    )

    expect(html).toContain(
      'href="https://admin.example/api/v1/admin/legal/contracts/attachments/contract_att_123/download"',
    )
  })
})
