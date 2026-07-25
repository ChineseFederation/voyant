import {
  createToolRegistry,
  type ToolContext,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { describe, expect, it, vi } from "vitest"

import {
  type NotificationsToolServices,
  notificationsTools,
  SEND_NOTIFICATION_HANDLER_POLICY,
} from "../src/tools.js"

const occurredAt = new Date("2026-07-15T10:00:00.000Z")

function delivery(overrides: Record<string, unknown> = {}) {
  return {
    id: "ndl_1",
    templateId: "ntp_1",
    templateSlug: "booking-confirmed",
    targetType: "booking",
    targetId: "bk_1",
    personId: null,
    organizationId: null,
    bookingId: "bk_1",
    invoiceId: null,
    paymentSessionId: null,
    channel: "email",
    provider: "resend",
    providerMessageId: "msg_1",
    status: "sent",
    toAddress: "guest@example.com",
    fromAddress: "bookings@example.com",
    subject: "Booking confirmed",
    htmlBody: "<p>Your booking is confirmed.</p>",
    textBody: "Your booking is confirmed.",
    payloadData: { bookingId: "bk_1" },
    metadata: { category: "transactional" },
    errorMessage: null,
    scheduledFor: null,
    sentAt: occurredAt,
    failedAt: null,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    ...overrides,
  }
}

function ctx(
  services?: Partial<NotificationsToolServices>,
): ToolContext & { notifications?: NotificationsToolServices } {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "default",
    resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
    handlerActionPolicy: sendActionPolicy(),
    notifications: services as NotificationsToolServices | undefined,
  }
}

function sendActionPolicy(): ToolHandlerActionPolicyContext {
  return {
    capabilityId: SEND_NOTIFICATION_HANDLER_POLICY.capabilityId,
    capabilityVersion: SEND_NOTIFICATION_HANDLER_POLICY.capabilityVersion,
    canonicalName: SEND_NOTIFICATION_HANDLER_POLICY.canonicalName,
    actionPolicy: {
      ...SEND_NOTIFICATION_HANDLER_POLICY.actionPolicy,
      enforcement: "handler",
      invocation: {
        controlField: "_voyant",
        requiredFields: [
          "confirmed",
          "targetId",
          "idempotencyKey",
          "approvalId",
          "idempotencyFingerprint",
        ],
        optionalFields: ["reasonCode", "approvalId", "idempotencyFingerprint"],
        fingerprintAlgorithm: "action-ledger-command-v1",
      },
    },
    invocation: {
      confirmed: true,
      targetId: "booking-confirmed",
      idempotencyKey: "send_1",
      approvalId: "approval_1",
      idempotencyFingerprint: "sha256:test",
    },
  }
}

describe("notifications tools", () => {
  it("registers the template-only v2 send Tool without raw content fields", () => {
    const registry = createToolRegistry()
    registry.registerAll(notificationsTools)
    const list = registry.list()
    expect(list.map((tool) => tool.name).sort()).toEqual([
      "get_notification_delivery",
      "list_notification_deliveries",
      "send_notification",
    ])
    const send = list.find(({ name }) => name === "send_notification")
    expect(send).toMatchObject({
      capabilityVersion: "v2",
      tier: "destructive",
      requiredScopes: ["notifications:send"],
    })
    const properties =
      (send?.inputSchema as { properties?: Record<string, unknown> }).properties ?? {}
    expect(properties).toHaveProperty("templateSlug")
    expect(properties).not.toHaveProperty("subject")
    expect(properties).not.toHaveProperty("html")
    expect(properties).not.toHaveProperty("text")
    for (const t of list.filter(({ name }) => name !== "send_notification")) {
      expect(t.tier).toBe("read")
      expect(t.requiredScopes).toEqual(["notifications:read"])
    }
  })

  it("dispatches sends only through the admitted template service", async () => {
    const registry = createToolRegistry()
    for (const tool of notificationsTools) {
      registry.register(
        tool,
        tool.name === "send_notification"
          ? { actionPolicy: SEND_NOTIFICATION_HANDLER_POLICY.actionPolicy }
          : {},
      )
    }
    const sendTemplated = vi.fn(async () => delivery({ id: "ndl_9", status: "pending" }))
    const result = await registry.dispatch(
      "send_notification",
      { templateSlug: "booking-confirmed", to: "guest@example.com" },
      ctx({
        listDeliveries: async () => ({ data: [], total: 0, limit: 50, offset: 0 }),
        getDeliveryById: async () => null,
        sendTemplated,
      }),
    )
    expect(result).toMatchObject({ id: "ndl_9", status: "pending" })
    expect(sendTemplated).toHaveBeenCalledWith(
      { templateSlug: "booking-confirmed", to: "guest@example.com" },
      expect.objectContaining({ capabilityVersion: "v2" }),
    )
  })

  it("dispatches delivery reads through the injected service", async () => {
    const registry = createToolRegistry()
    registry.registerAll(notificationsTools)
    const result = await registry.dispatch(
      "get_notification_delivery",
      { id: "ndl_1" },
      ctx({
        async listDeliveries() {
          return { data: [], total: 0, limit: 50, offset: 0 }
        },
        async getDeliveryById(id) {
          return delivery({ id })
        },
      }),
    )
    expect(result).toMatchObject({ id: "ndl_1" })
  })

  it("throws MISSING_SERVICE when unwired", async () => {
    const registry = createToolRegistry()
    registry.registerAll(notificationsTools)
    await expect(
      registry.dispatch("list_notification_deliveries", {}, ctx(undefined)),
    ).rejects.toMatchObject({ code: "MISSING_SERVICE" })
  })
})
