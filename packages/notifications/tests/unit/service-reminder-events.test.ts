import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { describe, expect, it, vi } from "vitest"

import {
  missingRequiredAttachmentTypes,
  requiredAttachmentTypes,
  shouldResolveBookingEventDocuments,
} from "../../src/service-reminder-events.js"
import type {
  BookingDocumentBundleItem,
  NotificationReminderRuleRow,
} from "../../src/service-shared.js"

function rule(overrides: Partial<NotificationReminderRuleRow> = {}): NotificationReminderRuleRow {
  return {
    id: "rule_1",
    slug: "payment-complete",
    name: "Payment complete",
    targetType: "payment_complete",
    channel: "email",
    provider: null,
    templateId: "template_1",
    templateSlug: null,
    status: "active",
    priority: 0,
    suppressionGroup: null,
    isSystem: false,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as NotificationReminderRuleRow
}

function dbWithMetadata(metadata: Record<string, unknown>) {
  const limit = vi.fn(async () => [{ metadata }])
  const where = vi.fn(() => ({ limit }))
  const from = vi.fn(() => ({ where }))
  const select = vi.fn(() => ({ from }))
  return { db: { select } as unknown as PostgresJsDatabase, select }
}

describe("requiredAttachmentTypes", () => {
  it("uses the template attachment contract for the post-payment bundle", async () => {
    const { db } = dbWithMetadata({
      attachments: ["contract", "invoice", "brochure"],
    })
    await expect(requiredAttachmentTypes(db, rule())).resolves.toEqual([
      "contract",
      "invoice",
      "brochure",
    ])
  })

  it("ignores legacy and unknown attachment labels", async () => {
    const { db } = dbWithMetadata({ attachments: ["contract", "product", "receipt"] })
    await expect(requiredAttachmentTypes(db, rule())).resolves.toEqual(["contract"])
  })
})

describe("post-payment document readiness", () => {
  it("does not resolve documents when a payment template selects no attachments", () => {
    expect(shouldResolveBookingEventDocuments("payment_complete", "email", [])).toBe(false)
    expect(shouldResolveBookingEventDocuments("booking_confirmed", "email", [])).toBe(true)
  })

  it("waits until every booked product has a current brochure", () => {
    const brochure = {
      documentType: "brochure",
      metadata: { productId: "product_1" },
    } as BookingDocumentBundleItem

    expect(
      missingRequiredAttachmentTypes(["brochure"], [brochure], ["product_1", "product_2"]),
    ).toEqual(["brochure"])
    expect(missingRequiredAttachmentTypes(["brochure"], [brochure], ["product_1"])).toEqual([])
  })
})
