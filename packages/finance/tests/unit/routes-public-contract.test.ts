import { describe, expect, it } from "vitest"
import { z } from "zod"

import {
  type PublicBookingFinanceDocuments,
  type PublicBookingFinancePayments,
  type PublicBookingPaymentOptions,
  type PublicFinanceDocumentLookup,
  type PublicPaymentSession,
  type PublicTravelCreditValidationResult,
  publicBookingFinanceDocumentsSchema,
  publicBookingFinancePaymentsSchema,
  publicBookingPaymentOptionsSchema,
  publicFinanceDocumentLookupSchema,
  publicPaymentSessionSchema,
  publicTravelCreditValidationSchema,
} from "../../src/validation-public.js"

/**
 * Response contract tests (voyant#2114 — finance public sub-batch) for the
 * `/v1/public/finance/*` routes converted to `@hono/zod-openapi`. Each fixture
 * is typed as the real `publicFinanceService` return type so a service-shape
 * drift breaks compilation; the JSON round-trip (Date → ISO string) mirrors
 * `c.json` so a declared/actual mismatch breaks the test. The schemas asserted
 * here are the exact ones declared as the `{ data }` response bodies in
 * `routes-public.ts`.
 */
function jsonRoundTrip<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value))
}

const travelCreditValidation: PublicTravelCreditValidationResult = {
  valid: true,
  reason: null,
  travelCredit: {
    id: "pinst_0000000000000000000000000",
    code: "WELCOME10",
    currency: "EUR",
    amountCents: 1000,
    remainingAmountCents: 1000,
    expiresAt: "2026-12-31",
  },
}

const documentLookup: PublicFinanceDocumentLookup = {
  bookingId: "bk_0000000000000000000000000",
  invoiceId: "inv_0000000000000000000000000",
  invoiceNumber: "INV-2026-0001",
  invoiceType: "invoice",
  invoiceStatus: "issued",
  currency: "EUR",
  totalCents: 120000,
  paidCents: 0,
  balanceDueCents: 120000,
  issueDate: "2026-06-01",
  dueDate: "2026-06-15",
  renditionId: null,
  documentStatus: "ready",
  format: "pdf",
  language: "en",
  generatedAt: "2026-06-01T00:00:00.000Z",
  fileSize: 12345,
  checksum: null,
  downloadUrl: "https://example.com/inv.pdf",
}

const bookingDocuments: PublicBookingFinanceDocuments = {
  bookingId: documentLookup.bookingId,
  documents: [
    {
      invoiceId: documentLookup.invoiceId,
      invoiceNumber: documentLookup.invoiceNumber,
      invoiceType: "proforma",
      invoiceStatus: "issued",
      currency: "EUR",
      totalCents: 120000,
      paidCents: 0,
      balanceDueCents: 120000,
      issueDate: "2026-06-01",
      dueDate: "2026-06-15",
      renditionId: null,
      documentStatus: "pending",
      format: null,
      language: null,
      generatedAt: null,
      fileSize: null,
      checksum: null,
      downloadUrl: null,
    },
  ],
}

const bookingPayments: PublicBookingFinancePayments = {
  bookingId: documentLookup.bookingId,
  payments: [
    {
      id: "pay_0000000000000000000000000",
      source: "payment",
      invoiceId: documentLookup.invoiceId,
      invoiceNumber: documentLookup.invoiceNumber,
      invoiceType: "invoice",
      status: "completed",
      paymentMethod: "credit_card",
      amountCents: 120000,
      currency: "EUR",
      baseCurrency: null,
      baseAmountCents: null,
      paymentDate: "2026-06-02",
      referenceNumber: null,
      notes: null,
    },
    {
      id: "vred_000000000000000000000000",
      source: "travel_credit_redemption",
      invoiceId: null,
      invoiceNumber: null,
      invoiceType: null,
      status: "completed",
      paymentMethod: "travel_credit",
      amountCents: 20000,
      currency: "EUR",
      baseCurrency: null,
      baseAmountCents: null,
      paymentDate: "2026-06-03T10:00:00.000Z",
      referenceNumber: "GIFT-2026",
      notes: null,
    },
  ],
}

const paymentOptions: PublicBookingPaymentOptions = {
  bookingId: documentLookup.bookingId,
  accounts: [
    {
      id: "pinst_0000000000000000000000001",
      label: "Visa ••4242",
      provider: "netopia",
      instrumentType: "credit_card",
      status: "active",
      brand: "visa",
      last4: "4242",
      expiryMonth: 12,
      expiryYear: 2030,
      isDefault: true,
    },
  ],
  schedules: [
    {
      id: "bps_0000000000000000000000000",
      scheduleType: "deposit",
      status: "pending",
      dueDate: "2026-06-10",
      dueTimeZone: "UTC",
      currency: "EUR",
      amountCents: 30000,
      notes: null,
    },
  ],
  guarantees: [
    {
      id: "bg_0000000000000000000000000",
      bookingPaymentScheduleId: null,
      guaranteeType: "credit_card",
      status: "active",
      currency: "EUR",
      amountCents: 50000,
      provider: "netopia",
      referenceNumber: null,
      expiresAt: null,
      notes: null,
    },
  ],
  recommendedTarget: {
    targetType: "booking_payment_schedule",
    targetId: "bps_0000000000000000000000000",
  },
}

const paymentSession: PublicPaymentSession = {
  id: "psess_0000000000000000000000000",
  target: null,
  provenance: null,
  targetType: "booking_payment_schedule",
  targetId: null,
  bookingId: documentLookup.bookingId,
  legacyOrderId: null,
  invoiceId: documentLookup.invoiceId,
  bookingPaymentScheduleId: "bps_0000000000000000000000000",
  bookingGuaranteeId: null,
  status: "pending",
  provider: "netopia",
  providerConnectionId: null,
  providerSessionId: null,
  providerPaymentId: null,
  externalReference: null,
  clientReference: null,
  currency: "EUR",
  amountCents: 30000,
  paymentMethod: "credit_card",
  payerEmail: null,
  payerName: null,
  redirectUrl: null,
  checkout: null,
  returnUrl: null,
  cancelUrl: null,
  expiresAt: null,
  completedAt: null,
  failureCode: null,
  failureMessage: null,
  notes: null,
}

const cases: Array<{ name: string; value: unknown; schema: z.ZodTypeAny }> = [
  {
    name: "travel credit validation",
    value: travelCreditValidation,
    schema: publicTravelCreditValidationSchema,
  },
  { name: "document lookup", value: documentLookup, schema: publicFinanceDocumentLookupSchema },
  {
    name: "booking documents",
    value: bookingDocuments,
    schema: publicBookingFinanceDocumentsSchema,
  },
  { name: "booking payments", value: bookingPayments, schema: publicBookingFinancePaymentsSchema },
  { name: "payment options", value: paymentOptions, schema: publicBookingPaymentOptionsSchema },
  { name: "payment session", value: paymentSession, schema: publicPaymentSessionSchema },
]

describe("finance public response contracts", () => {
  for (const { name, value, schema } of cases) {
    it(`the ${name} { data } envelope satisfies the declared response schema`, () => {
      const wire = jsonRoundTrip({ data: value })
      const parsed = z.object({ data: schema }).safeParse(wire)
      expect(parsed.success ? null : parsed.error.toString()).toBeNull()
    })
  }
})
