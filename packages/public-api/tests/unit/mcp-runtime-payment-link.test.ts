import type { ToolHandlerActionPolicyContext } from "@voyant-travel/tools"
import { afterEach, describe, expect, it, vi } from "vitest"

const executeAdmittedExistingTargetCommand = vi.hoisted(() => vi.fn())

vi.mock("@voyant-travel/action-ledger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@voyant-travel/action-ledger")>()),
  executeAdmittedExistingTargetCommand,
}))

import { financeService } from "@voyant-travel/finance"
import { createPaymentLinkToolServices } from "../../src/mcp-runtime.js"

afterEach(() => {
  vi.restoreAllMocks()
  executeAdmittedExistingTargetCommand.mockReset()
})

describe("invoice payment-link durable command", () => {
  it("creates once and reloads the session by invoice and idempotency key on replay", async () => {
    const row = {
      id: "pays_1",
      status: "pending",
      invoiceId: "inv_1",
      bookingId: null,
      currency: "EUR",
      amountCents: 12500,
      paymentMethod: "credit_card",
      provider: "stripe",
      redirectUrl: null,
      expiresAt: null,
      createdAt: new Date("2026-08-08T10:00:00.000Z"),
      updatedAt: new Date("2026-08-08T10:00:00.000Z"),
    }
    const create = vi
      .spyOn(financeService, "createPaymentSessionFromInvoice")
      .mockResolvedValue(row as never)
    const list = vi.spyOn(financeService, "listPaymentSessions").mockResolvedValue({
      data: [row],
      total: 1,
      limit: 2,
      offset: 0,
    } as never)
    let completed = false
    executeAdmittedExistingTargetCommand.mockImplementation(async (_input, handlers) => {
      if (!completed) {
        await handlers.prepare({})
        completed = true
        return { replayed: false, value: await handlers.execute() }
      }
      return { replayed: true, value: await handlers.replay() }
    })
    const services = createPaymentLinkToolServices({
      db: {} as never,
      request: {
        var: { actor: "staff", organizationId: "org_1" },
        req: { header: () => null },
      } as never,
      runtime: {
        resolvePublicCheckoutBaseUrl: () => "https://pay.example.test",
        resolvePaymentLinkUrlTemplate: async () =>
          "https://pay.example.test/pay?session={sessionId}",
      } as never,
    })
    const command = {
      invoiceId: "inv_1",
      paymentUrl: "https://pay.example.test/pay?session=pays_1",
      idempotencyKey: "invoice-inv_1-v1",
      paymentMethod: "credit_card" as const,
    }
    const admitted = {} as ToolHandlerActionPolicyContext

    await expect(services.createFromInvoice(command, admitted)).resolves.toMatchObject({
      id: "pays_1",
      invoiceId: "inv_1",
    })
    await expect(services.createFromInvoice(command, admitted)).resolves.toMatchObject({
      id: "pays_1",
      invoiceId: "inv_1",
    })

    expect(create).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ invoiceId: "inv_1", idempotencyKey: "invoice-inv_1-v1" }),
    )
  })
})
