import {
  createToolRegistry,
  type ToolContext,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"
import {
  FINANCE_BOOK_PRODUCT_HANDLER_POLICY,
  FINANCE_BOOKING_CREATE_HANDLER_POLICY,
} from "../src/booking-create-policy.js"
import {
  type FinanceToolServices,
  financeBookingsCreateTools,
  financeTools,
  invoiceBookingTool,
  issueInvoiceFromBookingTool,
  issueInvoiceFromBookingToolInputSchema,
  issueInvoiceRefundInputSchema,
  issueInvoiceRefundTool,
  issueUnsyncedProformaFromBookingToolInputSchema,
} from "../src/tools.js"
import { financeBookingsCreateVoyantPlugin } from "../src/voyant.js"

function ctx(
  services?: Partial<FinanceToolServices>,
  handlerActionPolicy?: ToolHandlerActionPolicyContext,
): ToolContext & { finance?: FinanceToolServices } {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "default",
    resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
    finance: services as FinanceToolServices | undefined,
    ...(handlerActionPolicy ? { handlerActionPolicy } : {}),
  }
}

function bookingDetail(id = "booking_1") {
  return {
    id,
    bookingNumber: "B-1",
    status: "confirmed" as const,
    personId: "person_1",
    organizationId: null,
    sourceType: "manual" as const,
    externalBookingRef: null,
    communicationLanguage: null,
    contactFirstName: "Ada",
    contactLastName: "Lovelace",
    contactPartyType: "individual",
    contactTaxId: null,
    contactEmail: "ada@example.com",
    contactPhone: null,
    contactPreferredLanguage: null,
    contactCountry: null,
    contactRegion: null,
    contactCity: null,
    contactAddressLine1: null,
    contactAddressLine2: null,
    contactPostalCode: null,
    sellCurrency: "EUR",
    baseCurrency: null,
    fxRateSetId: null,
    sellAmountCents: 50_000,
    baseSellAmountCents: null,
    costAmountCents: 30_000,
    baseCostAmountCents: null,
    marginPercent: 40,
    startDate: "2026-08-01",
    endDate: "2026-08-01",
    pax: 1,
    internalNotes: null,
    notificationsSuppressed: false,
    customerPaymentPolicy: null,
    priceOverride: null,
    customFields: {},
    acceptedAt: "2026-07-15T10:00:00.000Z",
    confirmedAt: null,
    cancelledAt: null,
    completedAt: null,
    redeemedAt: null,
    createdAt: "2026-07-15T10:00:00.000Z",
    updatedAt: "2026-07-15T10:00:00.000Z",
    items: [],
    travelers: [],
  }
}

describe("finance tools", () => {
  it("previews and requests approval through one invoice-booking intent call", async () => {
    const received: unknown[] = []
    const preview = {
      id: "booking_1",
      bookingId: "booking_1",
      bookingNumber: "BK-1",
      bookingUpdatedAt: "2026-07-15T09:30:00.000Z",
      snapshotFingerprint: "snapshot_1",
      payer: { type: "organization" as const, id: "org_1" },
      currency: "EUR",
      subtotalCents: 80_000,
      taxCents: 0,
      totalCents: 80_000,
      lines: [],
    }
    const services: Partial<FinanceToolServices> = {
      async invoiceBooking(input) {
        received.push(input)
        return {
          status: "approval_required",
          requestedAction: {
            id: "action_1",
            status: "awaiting_approval",
            actionName: "finance.invoice.issue_from_booking",
            targetType: "booking",
            targetId: "booking_1",
          },
          approval: {
            id: "approval_1",
            status: "pending",
            requestedActionId: "action_1",
            policyName: "finance-invoice-issue-approval-v1",
            policyVersion: "v1",
            riskSnapshot: "high",
            reasonCode: "invoice_issue_from_booking_requested_by_agent",
            expiresAt: null,
            createdAt: "2026-07-15T10:00:00.000Z",
          },
          replayed: false,
          preview,
          nextSteps: [],
        }
      },
    }

    await expect(
      invoiceBookingTool.handler(
        { bookingId: "booking_1", issueDate: "2026-07-15", dueDate: "2026-08-15" },
        ctx(services),
      ),
    ).resolves.toMatchObject({
      status: "approval_required",
      approval: { id: "approval_1" },
      preview: { bookingId: "booking_1", totalCents: 80_000 },
    })
    expect(received).toEqual([
      {
        bookingId: "booking_1",
        issueDate: "2026-07-15",
        dueDate: "2026-08-15",
        approvalId: undefined,
      },
    ])
  })

  it("carries approvals through the _voyant admission instead of a duplicate domain field", async () => {
    expect(issueInvoiceFromBookingToolInputSchema.shape).not.toHaveProperty("approvalId")
    expect(issueInvoiceRefundInputSchema.shape).not.toHaveProperty("approvalId")

    const received: Array<{ tool: string; approvalId?: string }> = []
    const approvalRequired = (targetType: "booking" | "invoice") => ({
      status: "approval_required" as const,
      requestedAction: {
        id: `action_${targetType}`,
        status: "awaiting_approval" as const,
        actionName: `finance.${targetType}.issue`,
        targetType,
        targetId: `${targetType}_1`,
      },
      approval: {
        id: "approval_1",
        status: "pending" as const,
        requestedActionId: `action_${targetType}`,
        policyName: "finance-approval-v1",
        policyVersion: "v1",
        riskSnapshot: "high",
        reasonCode: "finance_approval_requested",
        expiresAt: null,
        createdAt: "2026-08-06T10:00:00.000Z",
      },
      replayed: false,
      nextSteps: [],
    })
    const services: Partial<FinanceToolServices> = {
      async issueInvoiceFromBooking(input) {
        received.push({ tool: "invoice", approvalId: input.approvalId })
        return approvalRequired("booking")
      },
      async issueInvoiceRefund(input) {
        received.push({ tool: "refund", approvalId: input.approvalId })
        return approvalRequired("invoice")
      },
    }
    const handlerPolicy = {
      invocation: { approvalId: "approval_1", confirmed: true },
    } as ToolHandlerActionPolicyContext

    await issueInvoiceFromBookingTool.handler(
      { command: { bookingId: "booking_1", issueDate: "2026-08-06", dueDate: "2026-08-13" } },
      ctx(services, handlerPolicy),
    )
    await issueInvoiceRefundTool.handler(
      {
        invoiceId: "invoice_1",
        creditNoteNumber: "CN-1",
        amountCents: 1_000,
        currency: "EUR",
        reason: "correction",
        idempotencyKey: "refund-1",
      },
      ctx(services, handlerPolicy),
    )

    expect(received).toEqual([
      { tool: "invoice", approvalId: "approval_1" },
      { tool: "refund", approvalId: "approval_1" },
    ])
  })

  it("refuses draft-only and raw external-sync controls before mutation", () => {
    const base = {
      bookingId: "booking_1",
      bookingUpdatedAt: "2026-07-15T09:30:00.000Z",
      snapshotFingerprint: "snapshot_1",
      issueDate: "2026-07-15",
      dueDate: "2026-08-15",
      idempotencyKey: "proforma-booking-1-v1",
    }

    expect(
      issueUnsyncedProformaFromBookingToolInputSchema.safeParse({
        ...base,
        documentState: "draft",
      }).success,
    ).toBe(false)
    expect(
      issueUnsyncedProformaFromBookingToolInputSchema.safeParse({
        ...base,
        skipExternalSync: false,
      }).success,
    ).toBe(false)
  })

  it("registers read tools and destructive finance actions", () => {
    const registry = createToolRegistry()
    registry.registerAll(financeTools)
    const list = registry.list()
    expect(list.map((t) => t.name).sort()).toEqual([
      "get_invoice",
      "invoice_booking",
      "issue_invoice_from_booking",
      "issue_invoice_refund",
      "issue_unsynced_proforma_from_booking",
      "list_invoices",
      "preview_unsynced_proforma_from_booking",
      "record_payment_dispute",
      "record_refund_settlement",
      "void_invoice",
    ])
    // The money leg carries the same scope and the same destructive posture as
    // issuing the refund itself (voyant#4303) — this is where money leaves.
    const refundSettlementTool = list.find((t) => t.name === "record_refund_settlement")
    expect(refundSettlementTool).toMatchObject({
      tier: "destructive",
      requiredScopes: ["finance:refund"],
      riskPolicy: { destructive: true, reversible: false, confirmationRequired: true },
    })
    const disputeTool = list.find((t) => t.name === "record_payment_dispute")
    expect(disputeTool).toMatchObject({
      tier: "write",
      requiredScopes: ["finance:write"],
      riskPolicy: { destructive: false, confirmationRequired: true },
    })
    const voidTool = list.find((t) => t.name === "void_invoice")
    expect(voidTool?.tier).toBe("destructive")
    expect(voidTool?.requiredScopes).toEqual(["finance:void"])
    expect(voidTool?.riskPolicy).toMatchObject({ destructive: true, confirmationRequired: true })
    const refundTool = list.find((t) => t.name === "issue_invoice_refund")
    expect(refundTool).toMatchObject({
      tier: "destructive",
      requiredScopes: ["finance:refund"],
      riskPolicy: { destructive: true, reversible: false, confirmationRequired: true },
    })
    for (const t of list.filter((x) => ["get_invoice", "list_invoices"].includes(x.name))) {
      expect(t.tier).toBe("read")
      expect(t.requiredScopes).toEqual(["finance:read"])
    }
  })

  it("dispatches reads + void through the injected service", async () => {
    const registry = createToolRegistry()
    registry.registerAll(financeTools)
    const invoice = {
      id: "inv_1",
      invoiceNumber: "INV-1",
      invoiceType: "invoice" as const,
      convertedFromInvoiceId: null,
      convertedToInvoiceId: null,
      convertedToInvoiceNumber: null,
      seriesId: null,
      sequence: null,
      templateId: null,
      taxRegimeId: null,
      language: "en",
      bookingId: "book_1",
      personId: null,
      organizationId: null,
      status: "issued" as const,
      currency: "EUR",
      baseCurrency: null,
      fxRateSetId: null,
      subtotalCents: 1000,
      baseSubtotalCents: null,
      taxCents: 0,
      baseTaxCents: null,
      totalCents: 1000,
      baseTotalCents: null,
      paidCents: 0,
      basePaidCents: null,
      balanceDueCents: 1000,
      baseBalanceDueCents: null,
      commissionPercent: null,
      commissionAmountCents: null,
      issueDate: "2026-07-15",
      dueDate: "2026-07-29",
      notes: null,
      voidedAt: null,
      voidReason: null,
      createdAt: "2026-07-15T10:00:00.000Z",
      updatedAt: "2026-07-15T10:00:00.000Z",
    }
    const services: FinanceToolServices = {
      async listInvoices() {
        return { data: [] }
      },
      async getInvoiceById(id) {
        return { ...invoice, id }
      },
      async getFinanceAggregates() {
        return { total: 0 }
      },
      async voidInvoice(id, input) {
        return {
          status: "voided",
          invoice: {
            ...invoice,
            id,
            status: "void",
            voidReason: input.reason ?? null,
            voidedAt: "2026-07-15T10:05:00.000Z",
          },
        }
      },
      async issueInvoiceRefund() {
        return {
          status: "approval_required",
          requestedAction: {
            id: "act_1",
            status: "awaiting_approval",
            actionName: "finance.credit_note.issue_refund",
            targetType: "invoice",
            targetId: "inv_1",
          },
          approval: {
            id: "apr_1",
            status: "pending",
            requestedActionId: "act_1",
            policyName: "finance-credit-note-refund-approval-v1",
            policyVersion: "v1",
            riskSnapshot: "critical",
            reasonCode: "invoice_credit_note_refund_requested_by_agent",
            expiresAt: null,
            createdAt: "2026-07-15T10:00:00.000Z",
          },
          replayed: false,
        }
      },
      async createBooking() {
        throw new Error("not called")
      },
      async issueInvoiceFromBooking() {
        return {
          status: "approval_required",
          requestedAction: {
            id: "act_invoice_1",
            status: "awaiting_approval",
            actionName: "finance.invoice.issue_from_booking",
            targetType: "booking",
            targetId: "booking_1",
          },
          approval: {
            id: "apr_invoice_1",
            status: "pending",
            requestedActionId: "act_invoice_1",
            policyName: "finance-invoice-issue-approval-v1",
            policyVersion: "v1",
            riskSnapshot: "high",
            reasonCode: "invoice_issue_from_booking_requested_by_agent",
            expiresAt: null,
            createdAt: "2026-07-15T10:00:00.000Z",
          },
          replayed: false,
        }
      },
      async previewUnsyncedProformaFromBooking({ bookingId }) {
        return {
          id: bookingId,
          bookingId,
          bookingNumber: "BK-1",
          bookingUpdatedAt: "2026-07-15T09:30:00.000Z",
          snapshotFingerprint: "snapshot_1",
          payer: { type: "organization", id: "org_1" },
          currency: "EUR",
          subtotalCents: 80_000,
          taxCents: 0,
          totalCents: 80_000,
          lines: [],
        }
      },
      async issueUnsyncedProformaFromBooking(input) {
        expect(input).toEqual({
          bookingId: "booking_1",
          bookingUpdatedAt: "2026-07-15T09:30:00.000Z",
          snapshotFingerprint: "snapshot_1",
          issueDate: "2026-07-15",
          dueDate: "2026-08-15",
          idempotencyKey: "proforma-booking-1-v1",
        })
        return {
          status: "approval_required",
          requestedAction: {
            id: "act_proforma_1",
            status: "awaiting_approval",
            actionName: "finance.invoice.issue_from_booking",
            targetType: "booking",
            targetId: "booking_1",
          },
          approval: {
            id: "apr_proforma_1",
            status: "pending",
            requestedActionId: "act_proforma_1",
            policyName: "finance-invoice-issue-approval-v1",
            policyVersion: "v1",
            riskSnapshot: "high",
            reasonCode: "invoice_issue_from_booking_requested_by_agent",
            expiresAt: null,
            createdAt: "2026-07-15T10:00:00.000Z",
          },
          replayed: false,
        }
      },
      async invoiceBooking() {
        throw new Error("not called")
      },
    }
    expect(await registry.dispatch("get_invoice", { id: "inv_1" }, ctx(services))).toMatchObject({
      id: "inv_1",
    })
    expect(
      await registry.dispatch("void_invoice", { id: "inv_2", reason: "dup" }, ctx(services)),
    ).toMatchObject({
      status: "voided",
      invoice: { id: "inv_2", status: "void", voidReason: "dup" },
    })
    expect(
      await registry.dispatch(
        "issue_invoice_refund",
        {
          invoiceId: "inv_1",
          creditNoteNumber: "CN-1",
          amountCents: 1000,
          currency: "EUR",
          reason: "operator adjustment",
          idempotencyKey: "refund-inv-1",
        },
        ctx(services),
      ),
    ).toMatchObject({ status: "approval_required", approval: { id: "apr_1" } })
    expect(
      await registry.dispatch(
        "issue_invoice_from_booking",
        {
          command: {
            bookingId: "booking_1",
            issueDate: "2026-07-15",
            dueDate: "2026-08-15",
          },
          idempotencyKey: "invoice-booking-1-v1",
        },
        ctx(services),
      ),
    ).toMatchObject({ status: "approval_required", approval: { id: "apr_invoice_1" } })
    expect(
      await registry.dispatch(
        "preview_unsynced_proforma_from_booking",
        { bookingId: "booking_1" },
        ctx(services),
      ),
    ).toMatchObject({
      bookingId: "booking_1",
      payer: { type: "organization", id: "org_1" },
      snapshotFingerprint: "snapshot_1",
      totalCents: 80_000,
    })
    expect(
      await registry.dispatch(
        "issue_unsynced_proforma_from_booking",
        {
          bookingId: "booking_1",
          bookingUpdatedAt: "2026-07-15T09:30:00.000Z",
          snapshotFingerprint: "snapshot_1",
          issueDate: "2026-07-15",
          dueDate: "2026-08-15",
          idempotencyKey: "proforma-booking-1-v1",
        },
        ctx(services),
      ),
    ).toMatchObject({ status: "approval_required", approval: { id: "apr_proforma_1" } })
  })

  it("books a product through the intent-level workflow Tool, resolving reference and key server-side", async () => {
    const registry = createToolRegistry()
    const tool = financeBookingsCreateTools.find((entry) => entry.name === "book_product")
    const action = (financeBookingsCreateVoyantPlugin.actions ?? []).find(
      (entry) =>
        entry.id === "@voyant-travel/finance#bookings-create-extension.action.book-product",
    )
    if (!tool || !action) throw new Error("book_product graph declarations are missing")
    registry.register(tool, {
      capabilityId: tool.capabilityId,
      owner: tool.owner,
      capabilityVersion: tool.capabilityVersion,
      name: tool.name,
      requiredScopes: tool.requiredScopes,
      deploymentRisk: "high",
      actionPolicy: action,
    })
    expect(tool.actionPolicyEnforcement).toBe("handler")

    let receivedInput: { productId?: string; personId?: string } | undefined
    const services = {
      // The caller never supplies an idempotency key — the handler (in
      // mcp-runtime) resolves it server-side before the durable command.
      async bookProduct(input: { productId?: string; personId?: string }) {
        receivedInput = input
        return {
          status: "created" as const,
          bookingId: "booking_1",
          bookingNumber: "B-1",
          replayed: false,
          booking: bookingDetail(),
        }
      },
    }
    const result = await registry.dispatch(
      "book_product",
      {
        productId: "product_1",
        personId: "person_1",
        billingContact: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" },
        travelers: [
          { clientTravelerKey: "ada", firstName: "Ada", lastName: "Lovelace", isPrimary: true },
        ],
      },
      ctx(services, {
        capabilityId: FINANCE_BOOK_PRODUCT_HANDLER_POLICY.capabilityId,
        capabilityVersion: FINANCE_BOOK_PRODUCT_HANDLER_POLICY.capabilityVersion,
        canonicalName: "book_product",
        actionPolicy: {
          ...FINANCE_BOOK_PRODUCT_HANDLER_POLICY.actionPolicy,
          enforcement: "handler",
          invocation: {
            requiredFields: ["confirmed", "idempotencyKey"],
            optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
          },
        },
        // No idempotencyKey: book_product resolves it server-side.
        invocation: { confirmed: true },
      }),
    )

    expect(result).toMatchObject({
      status: "created",
      bookingId: "booking_1",
      bookingNumber: "B-1",
    })
    expect(receivedInput).toMatchObject({ productId: "product_1", personId: "person_1" })
  })

  it("creates a booking through the composing Finance extension Tool", async () => {
    const registry = createToolRegistry()
    const tool = financeBookingsCreateTools.find((entry) => entry.name === "create_booking")
    const [action] = financeBookingsCreateVoyantPlugin.actions ?? []
    if (!tool || !action) throw new Error("Finance booking-create graph declarations are missing")
    registry.register(tool, {
      capabilityId: tool.capabilityId,
      owner: tool.owner,
      capabilityVersion: tool.capabilityVersion,
      name: tool.name,
      requiredScopes: tool.requiredScopes,
      deploymentRisk: "high",
      actionPolicy: action,
    })
    expect(registry.list()).toEqual([
      expect.objectContaining({
        name: "create_booking",
        requiredScopes: ["bookings:write", "finance:write"],
        actionPolicy: expect.objectContaining({
          enforcement: "handler",
          invocation: expect.objectContaining({
            requiredFields: ["confirmed", "idempotencyKey"],
          }),
        }),
      }),
    ])
    expect(tool.actionPolicyEnforcement).toBe("handler")
    const services = {
      async createBooking(_input: unknown, admitted: ToolHandlerActionPolicyContext) {
        expect(admitted.invocation.idempotencyKey).toBe("booking-create-1")
        return { bookingId: "booking_1", replayed: false, booking: bookingDetail() }
      },
    }
    const result = await registry.dispatch(
      "create_booking",
      {
        booking: {
          productId: "product_1",
          slotId: "slot_1",
          bookingNumber: "B-1",
          personId: "person_1",
          contactFirstName: "Ada",
          contactLastName: "Lovelace",
          contactEmail: "ada@example.com",
          travelers: [
            {
              clientTravelerKey: "ada",
              firstName: "Ada",
              lastName: "Lovelace",
              isPrimary: true,
            },
          ],
        },
      },
      ctx(services, {
        capabilityId: FINANCE_BOOKING_CREATE_HANDLER_POLICY.capabilityId,
        capabilityVersion: FINANCE_BOOKING_CREATE_HANDLER_POLICY.capabilityVersion,
        canonicalName: "create_booking",
        actionPolicy: {
          ...FINANCE_BOOKING_CREATE_HANDLER_POLICY.actionPolicy,
          enforcement: "handler",
          invocation: {
            requiredFields: ["confirmed", "idempotencyKey"],
            optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
          },
        },
        invocation: { confirmed: true, idempotencyKey: "booking-create-1" },
      }),
    )
    expect(result).toMatchObject({
      status: "created",
      bookingId: "booking_1",
      replayed: false,
    })
  })

  it("throws MISSING_SERVICE when unwired", async () => {
    const registry = createToolRegistry()
    registry.registerAll(financeTools)
    await expect(registry.dispatch("list_invoices", {}, ctx(undefined))).rejects.toMatchObject({
      code: "MISSING_SERVICE",
    })
  })

  it("no longer scripts an orchestration sequence in the create_booking description", () => {
    // voyant#3933: the orchestration prose is deleted. The old description named
    // three other tools and the order to call them in (find the client with
    // list_people/list_organizations, resolve options with
    // list_product_options/list_option_units, allocate with
    // generate_booking_number). That intent now lives in book_product, which
    // resolves the reference and idempotency key server-side.
    const tool = financeBookingsCreateTools.find((entry) => entry.name === "create_booking")
    const bookTool = financeBookingsCreateTools.find((entry) => entry.name === "book_product")
    if (!tool || !bookTool) throw new Error("booking-create tools are missing")

    expect(tool.description).not.toMatch(/find it with/i)
    expect(tool.description).not.toMatch(/first use/i)
    expect(tool.description).not.toMatch(/generate_booking_number/)
    expect(tool.description).not.toMatch(/list_people/)
    expect(tool.description).not.toMatch(/list_product_options/)

    // The intent create_booking used to script is expressed by book_product.
    expect(bookTool.description).toMatch(/personId/)
    expect(bookTool.description).toMatch(/organizationId/)
    expect(bookTool.description).toMatch(/idempotency key server-side/i)

    // Assert on the same carrier `bookingNumber` already relies on to reach a
    // caller, so this pins the description actually shipping, not a doc comment.
    const shape = (
      tool.inputSchema as {
        shape?: Record<string, { shape?: Record<string, { description?: string }> }>
      }
    ).shape?.booking?.shape
    if (!shape) throw new Error("create_booking input schema has no booking shape")

    expect(shape.personId?.description).toMatch(/required unless .*organizationId/i)
    expect(shape.organizationId?.description).toMatch(/required unless .*personId/i)

    // Each branch must name the lookup that can actually return that id.
    // Pointing the organization branch at `list_people` leaves a caller unable
    // to obtain the id and repeating the workflow that failed.
    expect(shape.personId?.description).toMatch(/list_people/)
    expect(shape.personId?.description).not.toMatch(/list_organizations/)
    expect(shape.organizationId?.description).toMatch(/list_organizations/)
    expect(shape.organizationId?.description).not.toMatch(/list_people/)
    expect(shape.optionId?.description).toMatch(/list_product_options/)
    expect(shape.itemLines?.description).toMatch(/room products/i)

    // "at least one", never "exactly one": createBookingMutation stores both,
    // for a traveller billed through their company, and no rule forbids it.
    for (const description of [shape.personId?.description, shape.organizationId?.description]) {
      expect(description).not.toMatch(/exactly one/i)
    }
    // The proven-effective precedent in this schema; if it ever stops carrying
    // a description the mechanism this test relies on has changed.
    expect(shape.bookingNumber?.description).toBeTruthy()
    expect(shape.manualPriceOverride?.description).toMatch(/manual price override/i)
    expect(shape.sellAmountCentsOverride).toBeUndefined()
    expect(shape.catalogSellAmountCents).toBeUndefined()
    expect(shape.confirmedSellAmountCents).toBeUndefined()
    expect(shape.priceOverrideReason).toBeUndefined()

    const parsed = tool.inputSchema.parse({
      booking: {
        productId: "product_1",
        bookingNumber: "B-PRICE-GUARD",
        personId: "person_1",
        contactFirstName: "Ada",
        contactLastName: "Lovelace",
        contactEmail: "ada@example.com",
        travelers: [
          {
            clientTravelerKey: "traveler_1",
            firstName: "Ada",
            lastName: "Lovelace",
            isPrimary: true,
          },
        ],
        itemLines: [
          {
            optionUnitId: "unit_1",
            quantity: 2,
            unitSellAmountCents: 1,
            totalSellAmountCents: 2,
          },
        ],
      },
    }) as { booking: { itemLines?: Array<Record<string, unknown>> } }
    expect(parsed.booking.itemLines?.[0]).not.toHaveProperty("unitSellAmountCents")
    expect(parsed.booking.itemLines?.[0]).not.toHaveProperty("totalSellAmountCents")
  })
})
