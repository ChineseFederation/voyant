import { afterEach, describe, expect, it, vi } from "vitest"

import { fetchContent } from "./content.js"

describe("fetchContent", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("treats invalid or missing content responses as unavailable detail content", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "invalid_key" }), { status: 400 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "not_found" }), { status: 404 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchContent("https://example.test/cruises/cdmi_demo/content")).resolves.toBeNull()
    await expect(fetchContent("https://example.test/cruises/cru_123/content")).resolves.toBeNull()
  })

  it("still fails loud for unexpected content transport errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: "server_error" }), { status: 500 }),
        ),
    )

    await expect(fetchContent("https://example.test/cruises/cru_123/content")).rejects.toThrow(
      "Content request failed: 500",
    )
  })
})
