import { describe, expect, it } from "vitest"

import { createNotificationsTestContext, DB_AVAILABLE, json } from "./test-helpers"

describe.skipIf(!DB_AVAILABLE)("Notification templates and deliveries routes", () => {
  const ctx = createNotificationsTestContext()

  it("creates and lists notification templates", async () => {
    const createRes = await ctx.request("/templates", {
      method: "POST",
      ...json({
        slug: "payment-reminder",
        name: "Payment Reminder",
        channel: "email",
        provider: "local",
        status: "active",
        subjectTemplate: "Reminder for {{ bookingNumber }}",
        textTemplate: "Balance due: {{ amountCents }}",
      }),
    })
    expect(createRes.status).toBe(201)
    const { data } = await createRes.json()
    expect(data.slug).toBe("payment-reminder")

    const listRes = await ctx.request("/templates?status=active")
    expect(listRes.status).toBe(200)
    const body = await listRes.json()
    expect(body.total).toBe(1)
    expect(body.data[0].slug).toBe("payment-reminder")
  })
})
