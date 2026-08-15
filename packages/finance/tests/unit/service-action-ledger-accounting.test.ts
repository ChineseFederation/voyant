// agent-quality: file-size exception -- owner: finance; existing coverage file stays co-located until a dedicated split preserves behavior and tests.
import { describe, expect, it } from "vitest"

import * as ledger from "../../src/service-action-ledger.js"

describe("finance accounting action ledger builders", () => {
  it("builds booking-targeted action ledger input for manual payment records", async () => {
    const ledgerInput = await ledger.buildRecordPaymentActionLedgerInput(
      {
        userId: "user_123",
        callerType: "session",
      },
      {
        invoice: {
          id: "inv_123",
          bookingId: "book_123",
        } as never,
        payment: {
          id: "pay_123",
          amountCents: 25000,
          currency: "USD",
          paymentMethod: "bank_transfer",
          paymentDate: "2026-05-16",
          referenceNumber: "bank-ref-123",
          paymentAuthorizationId: null,
          paymentCaptureId: null,
        } as never,
      },
    )

    expect(ledgerInput).toMatchObject({
      actionName: "finance.payment.record",
      actionKind: "create",
      status: "succeeded",
      evaluatedRisk: "high",
      targetType: "booking",
      targetId: "book_123",
      routeOrToolName: "finance.payment.record",
      authorizationSource: "finance.payment.route",
      idempotencyScope: "finance.invoice:inv_123:payment",
      idempotencyKey: "bank-ref-123",
      mutationDetail: {
        commandInputRef: "invoice:inv_123:payment",
        commandResultRef: "payment:pay_123",
        summary: "Payment pay_123 recorded for invoice inv_123",
        reversalKind: "none",
      },
    })
    expect(ledgerInput.idempotencyFingerprint).toMatch(/^sha256:/)
  })

  it("derives stable idempotency for payment records without external references", async () => {
    const invoice = {
      id: "inv_123",
      bookingId: "book_123",
    } as never
    const paymentCommand = {
      amountCents: 25000,
      currency: "USD",
      baseCurrency: "USD",
      baseAmountCents: 25000,
      fxRateSetId: null,
      paymentMethod: "bank_transfer",
      paymentDate: "2026-05-16",
      referenceNumber: "",
      paymentInstrumentId: null,
      paymentAuthorizationId: null,
      paymentCaptureId: null,
      status: "completed",
    } as never

    const first = await ledger.buildRecordPaymentIdempotency(invoice, paymentCommand)
    const second = await ledger.buildRecordPaymentIdempotency(invoice, paymentCommand)

    expect(first.scope).toBe("finance.invoice:inv_123:payment")
    expect(first.key).toMatch(/^sha256:/)
    expect(first.fingerprint).toMatch(/^sha256:/)
    expect(second).toEqual(first)
  })

  it("builds booking-targeted action ledger input for supplier payment creation", async () => {
    const ledgerInput = await ledger.buildSupplierPaymentCreateActionLedgerInput(
      {
        userId: "user_123",
        callerType: "session",
      },
      {
        payment: {
          id: "spay_123",
          bookingId: "book_123",
          supplierId: "sup_123",
          amountCents: 25000,
          currency: "USD",
          paymentMethod: "bank_transfer",
          paymentDate: "2026-05-16",
          referenceNumber: "supplier-ref-123",
          status: "completed",
        } as never,
      },
    )

    expect(ledgerInput).toMatchObject({
      actionName: "finance.supplier_payment.create",
      actionKind: "create",
      status: "succeeded",
      evaluatedRisk: "high",
      targetType: "booking",
      targetId: "book_123",
      routeOrToolName: "finance.supplier_payment.create",
      authorizationSource: "finance.supplier_payment.route",
      idempotencyScope: "finance.booking:book_123:supplier_payment",
      idempotencyKey: "supplier-ref-123",
      mutationDetail: {
        commandInputRef: "booking:book_123:supplier_payment",
        commandResultRef: "supplier_payment:spay_123",
        summary: "Supplier payment spay_123 recorded against booking:book_123",
        reversalKind: "none",
      },
    })
    expect(ledgerInput.idempotencyFingerprint).toMatch(/^sha256:/)
  })

  it("targets the supplier invoice when an AP payment has no booking", async () => {
    const ledgerInput = await ledger.buildSupplierPaymentCreateActionLedgerInput(
      { userId: "user_123", callerType: "session" },
      {
        payment: {
          id: "spay_456",
          bookingId: null,
          supplierInvoiceId: "sinv_789",
          supplierId: "sup_123",
          amountCents: 480000,
          currency: "EUR",
          paymentMethod: "bank_transfer",
          paymentDate: "2026-06-10",
          referenceNumber: "ap-ref-456",
          status: "completed",
        } as never,
      },
    )

    expect(ledgerInput).toMatchObject({
      targetType: "supplier_invoice",
      targetId: "sinv_789",
      idempotencyScope: "finance.supplier_invoice:sinv_789:supplier_payment",
      mutationDetail: {
        commandInputRef: "supplier_invoice:sinv_789:supplier_payment",
        summary: "Supplier payment spay_456 recorded against supplier_invoice:sinv_789",
        reversalKind: "none",
      },
    })
  })

  it("builds booking-targeted action ledger input for supplier payment updates", () => {
    const ledgerInput = ledger.buildSupplierPaymentUpdateActionLedgerInput(
      {
        userId: "user_123",
        callerType: "session",
      },
      {
        payment: {
          id: "spay_123",
          bookingId: "book_123",
        } as never,
        changes: {
          notes: "Settled by bank transfer",
          status: "completed",
        },
      },
    )

    expect(ledgerInput).toMatchObject({
      actionName: "finance.supplier_payment.update",
      actionKind: "update",
      status: "succeeded",
      evaluatedRisk: "high",
      targetType: "booking",
      targetId: "book_123",
      routeOrToolName: "finance.supplier_payment.update",
      authorizationSource: "finance.supplier_payment.route",
      idempotencyScope: null,
      idempotencyKey: null,
      idempotencyFingerprint: null,
      mutationDetail: {
        commandInputRef: "supplier_payment:spay_123:update",
        commandResultRef: "supplier_payment:spay_123",
        summary: "Supplier payment spay_123 updated (notes, status)",
        reversalKind: "none",
      },
    })
  })

  it("builds booking-targeted action ledger input for credit note creation", async () => {
    const ledgerInput = await ledger.buildCreditNoteCreationActionLedgerInput(
      {
        userId: "user_123",
        callerType: "session",
      },
      {
        invoice: {
          id: "inv_123",
          bookingId: "book_123",
        } as never,
        creditNote: {
          id: "cn_123",
          creditNoteNumber: "CN-2026-001",
          amountCents: 10000,
          currency: "USD",
          status: "issued",
          reason: "Customer refund",
        } as never,
      },
    )

    expect(ledgerInput).toMatchObject({
      actionName: "finance.credit_note.create",
      actionKind: "create",
      status: "succeeded",
      evaluatedRisk: "high",
      targetType: "booking",
      targetId: "book_123",
      routeOrToolName: "finance.credit_note.create",
      authorizationSource: "finance.credit_note.route",
      idempotencyScope: "finance.invoice:inv_123:credit_note",
      idempotencyKey: "CN-2026-001",
      mutationDetail: {
        commandInputRef: "invoice:inv_123:credit_note",
        commandResultRef: "credit_note:cn_123",
        summary: "Credit note CN-2026-001 created for invoice inv_123",
        reversalKind: "none",
      },
    })
    expect(ledgerInput.idempotencyFingerprint).toMatch(/^sha256:/)
  })

  it("links an approved refund execution to the exact requested action", async () => {
    const ledgerInput = await ledger.buildCreditNoteCreationActionLedgerInput(
      { agentId: "agent_123", callerType: "agent", actor: "staff" },
      {
        invoice: { id: "inv_123", bookingId: "book_123" } as never,
        creditNote: {
          id: "cn_123",
          creditNoteNumber: "CN-2026-002",
          amountCents: 5000,
          currency: "EUR",
          status: "issued",
          reason: "Approved operator refund",
        } as never,
      },
      {
        actionName: "finance.credit_note.issue_refund",
        routeOrToolName: "finance.issue_invoice_refund",
        targetType: "invoice",
        targetId: "inv_123",
        capabilityId: "finance:refund",
        capabilityVersion: "v1",
        evaluatedRisk: "critical",
        authorizationSource: "scope:finance:refund",
        causationActionId: "action_requested",
        approvalId: "approval_123",
        idempotencyScope: "approval_123:execution",
        idempotencyKey: "approval_123",
        idempotencyFingerprint: "sha256:approved-command",
      },
    )

    expect(ledgerInput).toMatchObject({
      actionName: "finance.credit_note.issue_refund",
      routeOrToolName: "finance.issue_invoice_refund",
      targetType: "invoice",
      targetId: "inv_123",
      capabilityId: "finance:refund",
      capabilityVersion: "v1",
      evaluatedRisk: "critical",
      causationActionId: "action_requested",
      approvalId: "approval_123",
      idempotencyScope: "approval_123:execution",
      idempotencyKey: "approval_123",
      idempotencyFingerprint: "sha256:approved-command",
    })
  })

  it("builds booking-targeted action ledger input for credit note updates", () => {
    const ledgerInput = ledger.buildCreditNoteUpdateActionLedgerInput(
      {
        userId: "user_123",
        callerType: "session",
      },
      {
        invoice: {
          id: "inv_123",
          bookingId: "book_123",
        } as never,
        creditNote: {
          id: "cn_123",
          creditNoteNumber: "CN-2026-001",
        } as never,
        changes: {
          status: "issued",
          reason: "Customer refund updated",
        },
      },
    )

    expect(ledgerInput).toMatchObject({
      actionName: "finance.credit_note.update",
      actionKind: "update",
      status: "succeeded",
      evaluatedRisk: "high",
      targetType: "booking",
      targetId: "book_123",
      routeOrToolName: "finance.credit_note.update",
      authorizationSource: "finance.credit_note.route",
      idempotencyScope: null,
      idempotencyKey: null,
      idempotencyFingerprint: null,
      mutationDetail: {
        commandInputRef: "credit_note:cn_123:update",
        commandResultRef: "credit_note:cn_123",
        summary: "Credit note CN-2026-001 updated (reason, status)",
        reversalKind: "none",
      },
    })
  })

  it("builds booking-targeted action ledger input for credit note line item creation", () => {
    const ledgerInput = ledger.buildCreditNoteLineItemCreateActionLedgerInput(
      {
        userId: "user_123",
        callerType: "session",
      },
      {
        invoice: {
          id: "inv_123",
          bookingId: "book_123",
        } as never,
        creditNote: {
          id: "cn_123",
          creditNoteNumber: "CN-2026-001",
        } as never,
        lineItem: {
          id: "cnli_123",
          creditNoteId: "cn_123",
          description: "Refunded tour",
        } as never,
      },
    )

    expect(ledgerInput).toMatchObject({
      actionName: "finance.credit_note_line_item.create",
      actionKind: "create",
      status: "succeeded",
      evaluatedRisk: "high",
      targetType: "booking",
      targetId: "book_123",
      routeOrToolName: "finance.credit_note_line_item.create",
      authorizationSource: "finance.credit_note_line_item.route",
      idempotencyScope: null,
      idempotencyKey: null,
      idempotencyFingerprint: null,
      mutationDetail: {
        commandInputRef: "credit_note:cn_123:line_item",
        commandResultRef: "credit_note_line_item:cnli_123",
        summary: "Line item cnli_123 added to credit note CN-2026-001",
        reversalKind: "none",
      },
    })
  })

  it("builds booking-targeted action ledger input for invoice issuance", async () => {
    const ledgerInput = await ledger.buildInvoiceIssuedActionLedgerInput(
      {
        userId: "user_123",
        callerType: "session",
      },
      {
        invoice: {
          id: "inv_123",
          invoiceNumber: "INV-2026-001",
          invoiceType: "invoice",
          bookingId: "book_123",
          totalCents: 50000,
          currency: "USD",
          status: "issued",
          issueDate: "2026-05-16",
          dueDate: "2026-05-23",
        } as never,
      },
    )

    expect(ledgerInput).toMatchObject({
      actionName: "finance.invoice.issue_from_booking",
      actionKind: "create",
      status: "succeeded",
      evaluatedRisk: "high",
      targetType: "booking",
      targetId: "book_123",
      routeOrToolName: "finance.invoice.issue_from_booking",
      authorizationSource: "finance.invoice.from_booking.route",
      idempotencyScope: "finance.booking:book_123:invoice_issue",
      // Keyed by (type, number) to match
      // `invoices_invoice_number_type_active_idx`: a proforma and a fiscal
      // invoice may share an external number, and keying on the number
      // alone made the second of the pair collide with the first.
      idempotencyKey: "invoice:INV-2026-001",
      mutationDetail: {
        commandInputRef: "booking:book_123:invoice_issue",
        commandResultRef: "invoice:inv_123",
        summary: "Invoice INV-2026-001 issued for booking book_123",
        reversalKind: "none",
      },
    })
    expect(ledgerInput.idempotencyFingerprint).toMatch(/^sha256:/)
  })

  it("builds booking-targeted action ledger input for invoice updates", () => {
    const ledgerInput = ledger.buildInvoiceUpdateActionLedgerInput(
      {
        userId: "user_123",
        callerType: "session",
      },
      {
        invoice: {
          id: "inv_123",
          invoiceNumber: "INV-2026-001",
          bookingId: "book_123",
        } as never,
        changes: {
          dueDate: "2026-06-01",
          notes: "Updated payment terms",
        },
      },
    )

    expect(ledgerInput).toMatchObject({
      actionName: "finance.invoice.update",
      actionKind: "update",
      status: "succeeded",
      evaluatedRisk: "high",
      targetType: "booking",
      targetId: "book_123",
      routeOrToolName: "finance.invoice.update",
      authorizationSource: "finance.invoice.route",
      idempotencyScope: null,
      idempotencyKey: null,
      idempotencyFingerprint: null,
      mutationDetail: {
        commandInputRef: "invoice:inv_123:update",
        commandResultRef: "invoice:inv_123",
        summary: "Invoice INV-2026-001 updated (dueDate, notes)",
        reversalKind: "none",
      },
    })
  })

  it("builds booking-targeted action ledger input for draft invoice deletion", () => {
    const ledgerInput = ledger.buildInvoiceDeleteActionLedgerInput(
      {
        userId: "user_123",
        callerType: "session",
      },
      {
        invoice: {
          id: "inv_123",
          invoiceNumber: "INV-2026-001",
          bookingId: "book_123",
        } as never,
      },
    )

    expect(ledgerInput).toMatchObject({
      actionName: "finance.invoice.delete",
      actionKind: "delete",
      status: "succeeded",
      evaluatedRisk: "high",
      targetType: "booking",
      targetId: "book_123",
      routeOrToolName: "finance.invoice.delete",
      authorizationSource: "finance.invoice.route",
      idempotencyScope: null,
      idempotencyKey: null,
      idempotencyFingerprint: null,
      mutationDetail: {
        commandInputRef: "invoice:inv_123:delete",
        commandResultRef: null,
        summary: "Draft invoice INV-2026-001 deleted",
        reversalKind: "none",
      },
    })
  })

  it("builds booking-targeted action ledger input for invoice line item creation", () => {
    const ledgerInput = ledger.buildInvoiceLineItemCreateActionLedgerInput(
      {
        userId: "user_123",
        callerType: "session",
      },
      {
        invoice: {
          id: "inv_123",
          invoiceNumber: "INV-2026-001",
          bookingId: "book_123",
        } as never,
        lineItem: {
          id: "ili_123",
          invoiceId: "inv_123",
          description: "Private tour",
        } as never,
      },
    )

    expect(ledgerInput).toMatchObject({
      actionName: "finance.invoice_line_item.create",
      actionKind: "create",
      status: "succeeded",
      evaluatedRisk: "high",
      targetType: "booking",
      targetId: "book_123",
      routeOrToolName: "finance.invoice_line_item.create",
      authorizationSource: "finance.invoice_line_item.route",
      idempotencyScope: null,
      idempotencyKey: null,
      idempotencyFingerprint: null,
      mutationDetail: {
        commandInputRef: "invoice:inv_123:line_item",
        commandResultRef: "invoice_line_item:ili_123",
        summary: "Line item ili_123 added to invoice INV-2026-001",
        reversalKind: "none",
      },
    })
  })

  it("builds booking-targeted action ledger input for invoice line item updates", () => {
    const ledgerInput = ledger.buildInvoiceLineItemUpdateActionLedgerInput(
      {
        userId: "user_123",
        callerType: "session",
      },
      {
        invoice: {
          id: "inv_123",
          invoiceNumber: "INV-2026-001",
          bookingId: "book_123",
        } as never,
        lineItem: {
          id: "ili_123",
          invoiceId: "inv_123",
          description: "Private tour",
        } as never,
        changes: {
          description: "Private city tour",
          totalCents: 12000,
        },
      },
    )

    expect(ledgerInput).toMatchObject({
      actionName: "finance.invoice_line_item.update",
      actionKind: "update",
      status: "succeeded",
      evaluatedRisk: "high",
      targetType: "booking",
      targetId: "book_123",
      routeOrToolName: "finance.invoice_line_item.update",
      authorizationSource: "finance.invoice_line_item.route",
      idempotencyScope: null,
      idempotencyKey: null,
      idempotencyFingerprint: null,
      mutationDetail: {
        commandInputRef: "invoice_line_item:ili_123:update",
        commandResultRef: "invoice_line_item:ili_123",
        summary: "Line item ili_123 updated (description, totalCents)",
        reversalKind: "none",
      },
    })
  })

  it("builds booking-targeted action ledger input for invoice line item deletion", () => {
    const ledgerInput = ledger.buildInvoiceLineItemDeleteActionLedgerInput(
      {
        userId: "user_123",
        callerType: "session",
      },
      {
        invoice: {
          id: "inv_123",
          invoiceNumber: "INV-2026-001",
          bookingId: "book_123",
        } as never,
        lineItem: {
          id: "ili_123",
          invoiceId: "inv_123",
          description: "Private tour",
        } as never,
      },
    )

    expect(ledgerInput).toMatchObject({
      actionName: "finance.invoice_line_item.delete",
      actionKind: "delete",
      status: "succeeded",
      evaluatedRisk: "high",
      targetType: "booking",
      targetId: "book_123",
      routeOrToolName: "finance.invoice_line_item.delete",
      authorizationSource: "finance.invoice_line_item.route",
      idempotencyScope: null,
      idempotencyKey: null,
      idempotencyFingerprint: null,
      mutationDetail: {
        commandInputRef: "invoice_line_item:ili_123:delete",
        commandResultRef: null,
        summary: "Line item ili_123 deleted from invoice INV-2026-001",
        reversalKind: "none",
      },
    })
  })
})
