import { OpenAPIHono } from "@hono/zod-openapi"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterEach, describe, expect, it, vi } from "vitest"

import { publicInquiryRoutes } from "../../src/routes/inquiries-public.js"
import { relationshipsService } from "../../src/service/index.js"

type Env = {
  Variables: {
    db: PostgresJsDatabase
    userId?: string
    relationshipPersonId?: string | null
    publicChannel?: { channelId: string; channelStatus?: string | null }
  }
}

function appWithContext(context: Omit<Env["Variables"], "db"> & { db?: PostgresJsDatabase } = {}) {
  const app = new OpenAPIHono<Env>()
  app.use("*", async (c, next) => {
    c.set("db", context.db ?? ({} as PostgresJsDatabase))
    if (context.userId) c.set("userId", context.userId)
    if (context.relationshipPersonId !== undefined) {
      c.set("relationshipPersonId", context.relationshipPersonId)
    }
    if (context.publicChannel) c.set("publicChannel", context.publicChannel)
    await next()
  })
  return app.route("/v1/public/relationships", publicInquiryRoutes)
}

const body = {
  sourceRef: "submission-1",
  subject: "Plan a custom trip",
  kind: "custom_trip",
  contactSnapshot: { email: "traveler@example.com" },
}

describe("public Inquiry route", () => {
  afterEach(() => vi.restoreAllMocks())

  it("rejects missing or inactive public channel context before persistence", async () => {
    const create = vi.spyOn(relationshipsService, "createPublicInquiry")
    const response = await appWithContext({
      publicChannel: { channelId: "channel-1", channelStatus: "disabled" },
    }).request("/v1/public/relationships/inquiries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })

    expect(response.status).toBe(403)
    expect(create).not.toHaveBeenCalled()
  })

  it("uses canonical auth identity and channel context for guarded intake", async () => {
    const createdAt = new Date("2026-08-18T08:00:00.000Z")
    const create = vi.spyOn(relationshipsService, "createPublicInquiry").mockResolvedValue({
      inquiry: { id: "inq_1", status: "new", createdAt } as never,
      replayed: false,
    })
    const response = await appWithContext({
      userId: "customer-user-1",
      relationshipPersonId: "per_canonical",
      publicChannel: { channelId: "channel-1", channelStatus: "active" },
    }).request("/v1/public/relationships/inquiries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...body,
        kind: "product",
        personId: "per_body_override",
        targets: [
          {
            kind: "product",
            targetId: "prod_1",
            snapshot: { title: "Kyoto discovery", sourceChannel: "spoofed-channel" },
          },
        ],
      }),
    })

    expect(response.status).toBe(201)
    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        targets: [
          {
            kind: "product",
            targetId: "prod_1",
            snapshot: { title: "Kyoto discovery" },
          },
        ],
      }),
      {
        actorId: "customer:customer-user-1",
        channelId: "channel-1",
        relationshipPersonId: "per_canonical",
      },
    )
    expect(create.mock.calls[0]?.[1]).not.toHaveProperty("personId")
    expect(await response.json()).toEqual({
      data: {
        inquiryId: "inq_1",
        status: "new",
        duplicate: false,
        receivedAt: createdAt.toISOString(),
      },
    })
  })

  it("keeps authenticated but unlinked customers targetless instead of trusting the body", async () => {
    const create = vi.spyOn(relationshipsService, "createPublicInquiry").mockResolvedValue({
      inquiry: {
        id: "inq_unlinked",
        status: "new",
        createdAt: new Date("2026-08-18T08:00:00.000Z"),
      } as never,
      replayed: false,
    })
    const response = await appWithContext({
      userId: "customer-user-unlinked",
      relationshipPersonId: null,
      publicChannel: { channelId: "channel-1", channelStatus: "active" },
    }).request("/v1/public/relationships/inquiries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, personId: "per_body_override" }),
    })

    expect(response.status).toBe(201)
    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ personId: "per_body_override" }),
      {
        actorId: "customer:customer-user-unlinked",
        channelId: "channel-1",
        relationshipPersonId: null,
      },
    )
  })
})
