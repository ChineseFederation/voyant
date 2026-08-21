import { Hono } from "hono"
import { describe, expect, it } from "vitest"

import { relationshipsRoutes } from "../../src/routes/index.js"

describe("Inquiry private-data routes", () => {
  it.each([
    ["attachment download", "/inquiries/inq_private/attachments/link_private/download", "GET"],
    ["privacy export", "/inquiries/inq_private/privacy-export", "GET"],
    ["privacy erasure", "/inquiries/inq_private/privacy-erasure", "POST"],
  ] as const)("denies %s before reading private data without a PII grant", async (_name, path, method) => {
    const app = new Hono()
    app.route("/", relationshipsRoutes)

    const response = await app.request(path, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify({ reasonCode: "data_subject_request" }) : undefined,
    })

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ error: "Forbidden" })
  })
})
