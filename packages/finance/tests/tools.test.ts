import {
  createToolRegistry,
  type ToolContext,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"
import { FINANCE_BOOKING_CREATE_HANDLER_POLICY } from "../src/booking-create-policy.js"
import { type FinanceToolServices, financeBookingsCreateTools, financeTools } from "../src/tools.js"
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

describe("finance tools", () => {
  it("registers read tools and destructive finance actions", () => {
    const registry = createToolRegistry()
    registry.registerAll(financeTools)
    const list = registry.list()
    expect(list.map((t) => t.name).sort()).toEqual([
      "get_invoice",
      "issue_invoice_from_booking",
      "issue_invoice_refund",
      "list_invoices",
      "void_invoice",
    ])
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
  })

  it("allocates the booking reference through a Tool instead of leaving it to the caller", async () => {
    const registry = createToolRegistry()
    const tool = financeBookingsCreateTools.find(
      (entry) => entry.name === "generate_booking_number",
    )
    if (!tool) throw new Error("generate_booking_number is missing")
    registry.register(tool, {
      capabilityId: tool.capabilityId,
      owner: tool.owner,
      capabilityVersion: tool.capabilityVersion,
      name: tool.name,
      requiredScopes: tool.requiredScopes,
      deploymentRisk: "low",
    })

    const result = await registry.dispatch(
      "generate_booking_number",
      {},
      ctx({
        async generateBookingNumber() {
          return { bookingNumber: "BK-2607-000123" }
        },
      }),
    )

    expect(result).toEqual({ bookingNumber: "BK-2607-000123" })
    // Read-tier so allocating a reference never needs an approval round-trip.
    expect(tool.tier).toBe("read")
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
        return { bookingId: "booking_1", replayed: false }
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

  it("advertises the billing-party requirement in the create_booking contract", () => {
    // ProTravel hit this in production: Max resolved the client, then called
    // create_booking without personId and looped on
    // "Select a billing person or organization". personId and organizationId
    // are both structurally optional (either satisfies the rule), and the
    // requirement lived only in a superRefine, which does not serialize into
    // the JSON Schema a Tool caller reads. The contract has to state it.
    const tool = financeBookingsCreateTools.find((entry) => entry.name === "create_booking")
    if (!tool) throw new Error("create_booking is missing")

    expect(tool.description).toMatch(/personId/)
    expect(tool.description).toMatch(/organizationId/)

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

    // "at least one", never "exactly one": createBookingMutation stores both,
    // for a traveller billed through their company, and no rule forbids it.
    for (const description of [shape.personId?.description, shape.organizationId?.description]) {
      expect(description).not.toMatch(/exactly one/i)
    }
    // The proven-effective precedent in this schema; if it ever stops carrying
    // a description the mechanism this test relies on has changed.
    expect(shape.bookingNumber?.description).toBeTruthy()
  })
})
