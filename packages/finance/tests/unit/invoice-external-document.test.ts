import {
  formatExternalDocumentLabel,
  invoiceFromBookingSchema,
  isCancelledExternalDocumentStatus,
  supersedeInvoiceExternalRefSchema,
} from "@voyant-travel/finance-contracts"
import { describe, expect, it } from "vitest"

import {
  describeDuplicateExternalDocument,
  EXTERNAL_DOCUMENT_METADATA_KEY,
  externalDocumentToRefInput,
} from "../../src/invoice-external-document.js"
import { applyExternalDocumentDeclaration } from "../../src/service-issue.js"

const document = {
  provider: "smartbill",
  series: "VOY",
  number: "1042",
  externalId: "sb_9",
  externalUrl: "https://provider.example/doc/9",
  issuedAt: "2026-08-14",
  note: "Issued by hand after the settlement commit failed.",
}

describe("externalDocumentToRefInput", () => {
  it("puts the document number in external_number and the series in metadata", () => {
    const ref = externalDocumentToRefInput(document, {
      recordedAt: new Date("2026-08-15T09:00:00Z"),
    })

    expect(ref.provider).toBe("smartbill")
    expect(ref.externalNumber).toBe("1042")
    expect(ref.externalId).toBe("sb_9")
    expect(ref.externalUrl).toBe("https://provider.example/doc/9")
    expect(ref.metadata?.[EXTERNAL_DOCUMENT_METADATA_KEY]).toEqual({
      series: "VOY",
      number: "1042",
      issuedAt: "2026-08-14",
      note: "Issued by hand after the settlement commit failed.",
      recordedAt: "2026-08-15T09:00:00.000Z",
    })
  })

  it("does not claim a successful sync, because none ran", () => {
    const ref = externalDocumentToRefInput(document)

    expect(ref.syncedAt).toBeNull()
    expect(ref.syncError).toBeNull()
    expect(ref.status).toBe("recorded_externally")
  })
})

describe("isCancelledExternalDocumentStatus", () => {
  it.each([
    "cancelled",
    "Canceled",
    " VOID ",
    "storno",
    "reversed",
  ])("treats %s as a retracted provider document", (status) => {
    expect(isCancelledExternalDocumentStatus(status)).toBe(true)
  })

  it.each([
    "issued",
    "paid",
    "recorded_externally",
    "",
    null,
    undefined,
  ])("treats %s as a document that still exists", (status) => {
    expect(isCancelledExternalDocumentStatus(status)).toBe(false)
  })
})

describe("formatExternalDocumentLabel", () => {
  it("joins series and number", () => {
    expect(formatExternalDocumentLabel({ series: "VOY", number: "1042" })).toBe("VOY 1042")
  })

  it("falls back to the stored external number when there is no series", () => {
    expect(formatExternalDocumentLabel({ externalNumber: "1042" })).toBe("1042")
  })

  it("says so rather than rendering an empty label", () => {
    expect(formatExternalDocumentLabel({ series: "VOY" })).toBe("an unnumbered document")
  })
})

describe("applyExternalDocumentDeclaration", () => {
  const base = {
    bookingId: "bkg_1",
    issueDate: "2026-08-15",
    dueDate: "2026-08-15",
    invoiceType: "invoice" as const,
  }

  it("suppresses the mirror and writes the reference together", () => {
    const applied = applyExternalDocumentDeclaration({ ...base, externalDocument: document })

    expect(applied.skipExternalSync).toBe(true)
    expect(applied.externalRefs).toHaveLength(1)
    expect(applied.externalRefs?.[0]?.externalNumber).toBe("1042")
  })

  it("keeps references the caller supplied for other providers", () => {
    const applied = applyExternalDocumentDeclaration({
      ...base,
      externalDocument: document,
      externalRefs: [{ provider: "stripe", externalId: "in_1" }],
    })

    expect(applied.externalRefs?.map((ref) => ref.provider)).toEqual(["stripe", "smartbill"])
  })

  it("leaves an input without a declaration untouched", () => {
    const input = { ...base, skipExternalSync: false }
    expect(applyExternalDocumentDeclaration(input)).toBe(input)
  })
})

describe("invoiceFromBookingSchema external-document refinements", () => {
  const base = { bookingId: "bkg_1", issueDate: "2026-08-15", dueDate: "2026-08-15" }

  it("accepts a declaration on its own", () => {
    expect(
      invoiceFromBookingSchema.safeParse({ ...base, externalDocument: document }).success,
    ).toBe(true)
  })

  it("rejects declaring an external document while asking for the mirror", () => {
    const result = invoiceFromBookingSchema.safeParse({
      ...base,
      externalDocument: document,
      skipExternalSync: false,
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain("skipExternalSync")
  })

  it("rejects declaring the same provider twice", () => {
    const result = invoiceFromBookingSchema.safeParse({
      ...base,
      externalDocument: document,
      externalRefs: [{ provider: "smartbill", externalNumber: "1042" }],
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain(
      "externalDocument.provider",
    )
  })

  it("only accepts `true` for the duplicate acknowledgement", () => {
    expect(
      invoiceFromBookingSchema.safeParse({ ...base, acknowledgeExistingExternalDocument: true })
        .success,
    ).toBe(true)
    expect(
      invoiceFromBookingSchema.safeParse({ ...base, acknowledgeExistingExternalDocument: false })
        .success,
    ).toBe(false)
  })
})

describe("supersedeInvoiceExternalRefSchema", () => {
  it("accepts a cancellation on its own", () => {
    expect(
      supersedeInvoiceExternalRefSchema.safeParse({ reason: "Cancelled in the provider." }).success,
    ).toBe(true)
  })

  it("accepts a replacement that names a document", () => {
    expect(
      supersedeInvoiceExternalRefSchema.safeParse({
        reason: "Reissued under the correct series.",
        replacement: { externalNumber: "1043" },
      }).success,
    ).toBe(true)
  })

  it("rejects a replacement with no identity", () => {
    // An empty replacement leaves the reference reading as live while carrying
    // no number the guard can match, which releases the guard without anyone
    // recording that the old document was retracted.
    const result = supersedeInvoiceExternalRefSchema.safeParse({
      reason: "Cancelled in the provider.",
      replacement: {},
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain("replacement")
  })

  it("rejects a replacement carrying only a status", () => {
    expect(
      supersedeInvoiceExternalRefSchema.safeParse({
        reason: "Cancelled in the provider.",
        replacement: { status: "issued" },
      }).success,
    ).toBe(false)
  })
})

describe("describeDuplicateExternalDocument", () => {
  it("names the provider, the document and the invoice that already has it", () => {
    const message = describeDuplicateExternalDocument({
      invoiceId: "inv_1",
      invoiceNumber: "INV-7",
      invoiceStatus: "paid",
      provider: "smartbill",
      externalId: "sb_9",
      externalNumber: "1042",
      externalUrl: null,
      status: "issued",
      label: "VOY 1042",
    })

    expect(message).toContain("smartbill")
    expect(message).toContain("VOY 1042")
    expect(message).toContain("INV-7")
  })
})
