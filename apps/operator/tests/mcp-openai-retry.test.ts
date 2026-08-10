import { describe, expect, it, vi } from "vitest"

import { fetchWithTransientRetry } from "./support/openai-response-retry.js"

describe("MCP capability model transport retry", () => {
  it("retries a transient upstream response and returns the successful response", async () => {
    const request = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response("upstream reset", { status: 503 }))
      .mockResolvedValueOnce(new Response('{"id":"response_1"}', { status: 200 }))
    const delay = vi.fn(async () => undefined)

    const response = await fetchWithTransientRetry(request, { delay })

    expect(response.status).toBe(200)
    expect(request).toHaveBeenCalledTimes(2)
    expect(delay).toHaveBeenCalledTimes(1)
  })

  it("does not retry a terminal client response", async () => {
    const request = vi.fn(async () => new Response("bad request", { status: 400 }))

    const response = await fetchWithTransientRetry(request)

    expect(response.status).toBe(400)
    expect(request).toHaveBeenCalledTimes(1)
  })
})
