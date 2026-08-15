"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"

import { fetchWithValidation } from "../client.js"
import { useVoyantFinanceContext } from "../provider.js"
import { financeQueryKeys } from "../query-keys.js"
import { type InvoiceRecord, invoiceSingleResponse, successEnvelope } from "../schemas.js"

export interface CreateInvoiceInput {
  invoiceNumber: string
  bookingId: string
  personId?: string | null
  organizationId?: string | null
  status?: InvoiceRecord["status"]
  currency: string
  subtotalCents?: number
  taxCents?: number
  totalCents?: number
  paidCents?: number
  balanceDueCents?: number
  issueDate: string
  dueDate: string
  notes?: string | null
}

export type UpdateInvoiceInput = Partial<CreateInvoiceInput>

export interface VoidInvoiceInput {
  reason?: string | null
}

const linkedBookingQueryKeys = {
  booking: (bookingId: string) => ["voyant", "bookings", "bookings", "detail", bookingId] as const,
  activity: (bookingId: string) =>
    [...linkedBookingQueryKeys.booking(bookingId), "activity"] as const,
  actionLedger: (bookingId: string) =>
    [...linkedBookingQueryKeys.booking(bookingId), "action-ledger"] as const,
}

export function useInvoiceMutation() {
  const { baseUrl, fetcher } = useVoyantFinanceContext()
  const queryClient = useQueryClient()

  const invalidateLinkedBooking = (bookingId: string | null | undefined) => {
    if (!bookingId) return
    void queryClient.invalidateQueries({ queryKey: linkedBookingQueryKeys.booking(bookingId) })
    void queryClient.invalidateQueries({ queryKey: linkedBookingQueryKeys.activity(bookingId) })
    void queryClient.invalidateQueries({
      queryKey: linkedBookingQueryKeys.actionLedger(bookingId),
    })
    void queryClient.invalidateQueries({
      queryKey: financeQueryKeys.adminBookingPayments(bookingId),
    })
    void queryClient.invalidateQueries({
      queryKey: financeQueryKeys.publicBookingPayments(bookingId),
    })
  }

  const create = useMutation({
    mutationFn: async (input: CreateInvoiceInput) => {
      const { data } = await fetchWithValidation(
        "/v1/admin/finance/invoices",
        invoiceSingleResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: financeQueryKeys.invoices() })
      queryClient.setQueryData(financeQueryKeys.invoice(data.id), { data })
      invalidateLinkedBooking(data.bookingId)
    },
  })

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateInvoiceInput }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/finance/invoices/${id}`,
        invoiceSingleResponse,
        { baseUrl, fetcher },
        { method: "PATCH", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: financeQueryKeys.invoices() })
      queryClient.setQueryData(financeQueryKeys.invoice(data.id), { data })
      invalidateLinkedBooking(data.bookingId)
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) =>
      fetchWithValidation(
        `/v1/admin/finance/invoices/${id}`,
        successEnvelope,
        { baseUrl, fetcher },
        {
          method: "DELETE",
        },
      ),
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: financeQueryKeys.invoices() })
      queryClient.removeQueries({ queryKey: financeQueryKeys.invoice(id) })
      queryClient.removeQueries({ queryKey: financeQueryKeys.lineItems(id) })
      queryClient.removeQueries({ queryKey: financeQueryKeys.payments(id) })
      queryClient.removeQueries({ queryKey: financeQueryKeys.creditNotes(id) })
      queryClient.removeQueries({ queryKey: financeQueryKeys.notes(id) })
    },
  })

  const voidInvoice = useMutation({
    mutationFn: async ({ id, input }: { id: string; input?: VoidInvoiceInput }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/finance/invoices/${id}/void`,
        invoiceSingleResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input ?? {}) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: financeQueryKeys.invoices() })
      queryClient.setQueryData(financeQueryKeys.invoice(data.id), { data })
      invalidateLinkedBooking(data.bookingId)
    },
  })

  /**
   * Create + issue an invoice (or proforma) from an existing booking. The
   * server builds line items from either the booking items or a targeted
   * payment schedule row, then emits an `invoice.issued` event post-commit.
   */
  const createFromBooking = useMutation({
    mutationFn: async (input: CreateInvoiceFromBookingInput) => {
      const { data } = await fetchWithValidation(
        "/v1/admin/finance/invoices/from-booking",
        invoiceSingleResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input) },
      )
      return data
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: financeQueryKeys.invoices() })
      queryClient.setQueryData(financeQueryKeys.invoice(data.id), { data })
      invalidateLinkedBooking(data.bookingId)
    },
  })

  /**
   * Convert an issued proforma into a final invoice. Server-side this
   * copies the proforma's line items + totals, marks the proforma as
   * `void`, moves any payments onto the final invoice, and emits
   * `invoice.proforma.converted` so downstream subscribers can preserve
   * the original external linkage.
   */
  const convertToInvoice = useMutation({
    mutationFn: async ({ id, input }: { id: string; input?: ConvertProformaInput }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/finance/invoices/${id}/convert-to-invoice`,
        invoiceSingleResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify(input ?? {}) },
      )
      return data
    },
    onSuccess: (data, variables) => {
      void queryClient.invalidateQueries({ queryKey: financeQueryKeys.invoices() })
      void queryClient.invalidateQueries({
        queryKey: financeQueryKeys.adminBookingPayments(data.bookingId),
      })
      void queryClient.invalidateQueries({
        queryKey: financeQueryKeys.publicBookingPayments(data.bookingId),
      })
      void queryClient.invalidateQueries({ queryKey: financeQueryKeys.invoice(variables.id) })
      void queryClient.invalidateQueries({ queryKey: financeQueryKeys.payments(variables.id) })
      queryClient.setQueryData(financeQueryKeys.invoice(data.id), { data })
      void queryClient.invalidateQueries({ queryKey: financeQueryKeys.payments(data.id) })
      invalidateLinkedBooking(data.bookingId)
    },
  })

  /**
   * Render (or re-render) a PDF for an existing invoice, for the operator's
   * "Generate" / "Regenerate" buttons.
   *
   * Waits by default. The route is non-blocking unless the caller opts in
   * (`docs/architecture/invoice-rendition-wait.md`), and a person who just
   * pressed a button is exactly the caller the wait exists for — without it the
   * row is fulfilled by the recovery job and the button appears to do nothing
   * for up to a minute. Pass an explicit `wait` to override.
   *
   * The old note here claimed this emitted `invoice.rendered` and that a
   * subscriber turned it into a PDF. Neither was true: nothing fulfilled the
   * requested rendition at all until voyant#4668.
   */
  const render = useMutation({
    mutationFn: async ({ id, input }: { id: string; input?: RenderInvoiceInput }) => {
      const { data } = await fetchWithValidation(
        `/v1/admin/finance/invoices/${id}/render`,
        invoiceRenditionResponse,
        { baseUrl, fetcher },
        { method: "POST", body: JSON.stringify({ format: "pdf", wait: "pdf", ...input }) },
      )
      return data
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: financeQueryKeys.invoice(variables.id),
      })
      void queryClient.invalidateQueries({ queryKey: financeQueryKeys.invoices() })
    },
  })

  return { create, createFromBooking, convertToInvoice, render, update, remove, voidInvoice }
}

export interface ConvertProformaInput {
  /** Optional override; server derives from the proforma number when omitted. */
  invoiceNumber?: string
  issueDate?: string
  dueDate?: string
}

export interface CreateInvoiceFromBookingInput {
  bookingId: string
  bookingPaymentScheduleId?: string
  invoiceNumber?: string
  issueDate: string
  dueDate: string
  notes?: string | null
  currency?: string
  baseCurrency?: string
  fxRateSetId?: string
  subtotalCents?: number
  taxCents?: number
  totalCents?: number
  lineItems?: CreateInvoiceFromBookingLineItemInput[]
  externalRefs?: CreateInvoiceFromBookingExternalRefInput[]
  /** Defaults to `invoice` on the server. Pass `proforma` for placeholders. */
  invoiceType?: "invoice" | "proforma"
  /**
   * When `true`, downstream e-invoicing plugins (e.g. SmartBill) skip
   * the auto-sync triggered by `invoice.issued`. The event still fires
   * so other subscribers (ledgers, audit, etc.) see it.
   */
  skipExternalSync?: boolean
}

export interface CreateInvoiceFromBookingExternalRefInput {
  provider: string
  externalId?: string | null
  externalNumber?: string | null
  externalUrl?: string | null
  status?: string | null
  metadata?: Record<string, unknown> | null
  syncedAt?: string | null
  syncError?: string | null
}

export interface CreateInvoiceFromBookingLineItemInput {
  description: string
  quantity: number
  unitAmountCents: number
  taxRateBps?: number | null
  taxAmountCents?: number | null
}

export interface RenderInvoiceInput {
  format?: "pdf" | "html"
  /** Optional invoice-template id; server falls back to the default. */
  templateId?: string | null
}

// Light envelope schema for the render endpoint — the server returns
// `{ data: rendition }` where rendition is { id, invoiceId, format, ... }.
// We only assert the wrapper so the hook stays portable across renditions
// shape changes; consumers that care can narrow on the data field.
const invoiceRenditionResponse = z.object({
  data: z.object({ id: z.string() }).passthrough(),
})
