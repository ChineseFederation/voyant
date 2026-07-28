import { describe, expect, it } from "vitest"

import { commerceVoyantModule } from "./voyant.js"

describe("commerce deployment manifest", () => {
  it("owns durable promotion jobs and the reindex-intent subscriber", () => {
    expect(commerceVoyantModule.jobs).toEqual([
      {
        id: "promotions.reindex-all-products",
        schedule: { every: "2m", overlap: "skip" },
        scheduling: {
          required: true,
          profiles: {
            eager: { every: "1m", overlap: "skip" },
            economical: { every: "15m", overlap: "skip" },
            "scale-to-zero": { cron: "*/15 * * * *", overlap: "skip" },
          },
        },
        wakeup: true,
        runtime: {
          entry: "@voyant-travel/commerce/promotion-reindex-job",
          export: "runPromotionReindexJob",
        },
      },
      {
        id: "commerce.process-promotion-boundaries",
        schedule: { cron: "*/5 * * * *", overlap: "skip" },
        scheduling: {
          required: true,
          profiles: {
            eager: { cron: "* * * * *", overlap: "skip" },
            economical: { cron: "*/15 * * * *", overlap: "skip" },
            "scale-to-zero": { cron: "*/15 * * * *", overlap: "skip" },
          },
        },
        wakeup: true,
        runtime: {
          entry: "@voyant-travel/commerce/promotion-boundary-job",
          export: "runPromotionBoundaryJob",
        },
      },
    ])
    expect(commerceVoyantModule.subscribers).toEqual([
      {
        id: "@voyant-travel/commerce#subscriber.promotion-redemption-booking-confirmed",
        eventType: "booking.confirmed",
        source: "@voyant-travel/commerce/promotion-redemption-subscriber",
        runtime: {
          entry: "@voyant-travel/commerce/promotion-redemption-subscriber",
          export: "createPromotionRedemptionSubscriberGraphRuntime",
        },
      },
      {
        id: "@voyant-travel/commerce#subscriber.promotion-reindex-intent",
        eventType: "promotion.changed",
        runtime: {
          entry: "@voyant-travel/commerce/promotion-reindex-subscriber",
          export: "createPromotionReindexIntentSubscriberGraphRuntime",
        },
      },
    ])
  })
})
