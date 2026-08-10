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

  it("does not retry an OpenAI insufficient-quota 429", async () => {
    const request = vi.fn(async () =>
      Response.json(
        {
          error: {
            message: "You have no credits remaining.",
            type: "insufficient_quota",
            code: "insufficient_quota",
          },
        },
        { status: 429 },
      ),
    )
    const delay = vi.fn(async () => undefined)

    const response = await fetchWithTransientRetry(request, { delay })

    expect(response.status).toBe(429)
    expect(request).toHaveBeenCalledTimes(1)
    expect(delay).not.toHaveBeenCalled()
  })

  it("still retries a transient OpenAI rate-limit 429", async () => {
    const request = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(
        Response.json(
          { error: { type: "rate_limit_error", code: "rate_limit_exceeded" } },
          { status: 429 },
        ),
      )
      .mockResolvedValueOnce(new Response('{"id":"response_1"}', { status: 200 }))
    const delay = vi.fn(async () => undefined)

    const response = await fetchWithTransientRetry(request, { delay })

    expect(response.status).toBe(200)
    expect(request).toHaveBeenCalledTimes(2)
    expect(delay).toHaveBeenCalledTimes(1)
  })
})
