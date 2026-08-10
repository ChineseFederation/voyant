import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { describe, expect, it, vi } from "vitest"

import {
  type AcceptanceSignatureLegalPort,
  persistAcceptanceSignature,
} from "../../src/checkout/acceptance-signature.js"

describe("acceptance-signature Legal port", () => {
  it("waits for document generation when payment confirmation arrives first", async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                id: "booking_early_payment",
                bookingNumber: "BK-EARLY",
                contactFirstName: "Ada",
                contactLastName: "Lovelace",
                contactEmail: "ada@example.com",
                internalNotes: null,
              },
            ],
          }),
        }),
      }),
    } as PostgresJsDatabase
    const legal: AcceptanceSignatureLegalPort = {
      getContract: vi.fn(async () => ({
        id: "contract_early_payment",
        bookingId: "booking_early_payment",
        metadata: {
          paymentConfirmation: { paymentSessionId: "session_early" },
          acceptance: {
            templateId: "template_1",
            templateSlug: "terms",
            acceptedAt: "2026-07-11T12:00:00.000Z",
            acceptedMarketing: false,
            renderedHtmlLength: 1200,
          },
        },
        status: "draft",
      })),
      getBookingContract: vi.fn(),
      recordBookingPaymentConfirmation: vi.fn(),
      listSignatures: vi.fn(async () => []),
      issueContract: vi.fn(),
      sendContract: vi.fn(),
      signContract: vi.fn(),
    }

    await persistAcceptanceSignature(db, "contract_early_payment", undefined, legal)

    expect(legal.issueContract).not.toHaveBeenCalled()
    expect(legal.sendContract).not.toHaveBeenCalled()
    expect(legal.signContract).not.toHaveBeenCalled()
  })

  it("promotes a generated paid-checkout draft through issue, send, and electronic signature", async () => {
    const booking = {
      id: "booking_1",
      bookingNumber: "BK-1",
      contactFirstName: "Ada",
      contactLastName: "Lovelace",
      contactEmail: "ada@example.com",
      internalNotes: null,
    }
    const db = {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [booking] }) }),
      }),
    } as PostgresJsDatabase
    const legal: AcceptanceSignatureLegalPort = {
      getContract: vi.fn(async () => ({
        id: "contract_1",
        bookingId: "booking_1",
        metadata: {
          bookingContractWorkflow: { revision: 1 },
          paymentConfirmation: { paymentSessionId: "session_1" },
          acceptance: {
            templateId: "template_1",
            templateSlug: "terms",
            acceptedAt: "2026-07-11T12:00:00.000Z",
            acceptedMarketing: false,
            renderedHtmlLength: 1200,
          },
        },
        status: "draft",
      })),
      getBookingContract: vi.fn(),
      recordBookingPaymentConfirmation: vi.fn(),
      listSignatures: vi.fn(async () => []),
      issueContract: vi.fn(async () => ({ status: "issued" })),
      sendContract: vi.fn(async () => ({ status: "sent" })),
      signContract: vi.fn(async () => ({ status: "signed" })),
    }

    await persistAcceptanceSignature(db, "contract_1", undefined, legal)

    expect(legal.issueContract).toHaveBeenCalledWith(db, "contract_1", undefined)
    expect(legal.sendContract).toHaveBeenCalledWith(db, "contract_1", undefined)
    expect(legal.signContract).toHaveBeenCalledWith(
      db,
      "contract_1",
      expect.objectContaining({
        signerName: "Ada Lovelace",
        signerEmail: "ada@example.com",
        method: "electronic",
        metadata: expect.objectContaining({ source: "storefront-checkout" }),
      }),
      undefined,
    )
  })

  it("keeps signature promotion idempotent when Legal already has a signature", async () => {
    const booking = {
      id: "booking_1",
      bookingNumber: "BK-1",
      contactFirstName: "Ada",
      contactLastName: "Lovelace",
      contactEmail: "ada@example.com",
      internalNotes: null,
    }
    const limit = vi.fn(async () => [booking])
    const db = {
      select: () => ({
        from: () => ({ where: () => ({ limit }) }),
      }),
    } as PostgresJsDatabase
    const legal: AcceptanceSignatureLegalPort = {
      getContract: vi.fn(async () => ({
        id: "contract_1",
        bookingId: "booking_1",
        metadata: {
          acceptance: {
            templateId: "template_1",
            templateSlug: "terms",
            acceptedAt: "2026-07-11T12:00:00.000Z",
            acceptedMarketing: false,
            renderedHtmlLength: 1200,
          },
        },
        status: "issued",
      })),
      getBookingContract: vi.fn(),
      recordBookingPaymentConfirmation: vi.fn(),
      listSignatures: vi.fn(async () => [{ id: "signature_1" }]),
      issueContract: vi.fn(),
      sendContract: vi.fn(),
      signContract: vi.fn(),
    }

    await persistAcceptanceSignature(db, "contract_1", undefined, legal)

    expect(legal.getContract).toHaveBeenCalledWith(db, "contract_1")
    expect(legal.listSignatures).toHaveBeenCalledWith(db, "contract_1")
    expect(legal.sendContract).not.toHaveBeenCalled()
    expect(legal.signContract).not.toHaveBeenCalled()
  })
})
