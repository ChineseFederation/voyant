import { describe, expect, it, vi } from "vitest"

import { createVoyantDataPresentationFxQuoter } from "../../src/presentation-money/voyant-data-fx.js"

describe("createVoyantDataPresentationFxQuoter", () => {
  it("calls Voyant Data with a server credential and preserves quote provenance", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        result: "success",
        source: "bnr",
        base_code: "EUR",
        target_code: "RON",
        conversion_rate: 4.975,
        time_last_update_utc: "Sat, 08 Aug 2026 08:00:00 +0000",
        time_next_update_utc: "Sun, 09 Aug 2026 08:00:00 +0000",
      }),
    )
    const quoteFx = createVoyantDataPresentationFxQuoter({
      apiKey: "vd_server_only",
      baseUrl: "https://data.test",
      fetch: fetch as typeof globalThis.fetch,
    })

    await expect(quoteFx("eur", "ron")).resolves.toEqual({
      rate: "4.975",
      provider: "bnr",
      quotedAt: "2026-08-08T08:00:00.000Z",
      validUntil: "2026-08-09T08:00:00.000Z",
    })
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(String(url)).toBe("https://data.test/data/fx/v1/fx/pair/EUR/RON")
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer vd_server_only")
    expect(new Headers(init?.headers).get("x-voyant-sdk")).toBe("voyant-storefront")
  })

  it("returns identity locally without spending an FX request", async () => {
    const fetch = vi.fn()
    const quoteFx = createVoyantDataPresentationFxQuoter({
      apiKey: "vd_server_only",
      fetch: fetch as typeof globalThis.fetch,
      now: () => new Date("2026-08-08T09:00:00.000Z"),
    })

    await expect(quoteFx("EUR", "EUR")).resolves.toEqual({
      rate: "1",
      provider: "voyant-data-fx",
      quotedAt: "2026-08-08T09:00:00.000Z",
      validUntil: null,
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it("rejects invalid rates rather than emitting rankable display money", async () => {
    const quoteFx = createVoyantDataPresentationFxQuoter({
      apiKey: "vd_server_only",
      fetch: (async () => Response.json({ conversion_rate: 0 })) as typeof globalThis.fetch,
    })

    await expect(quoteFx("EUR", "RON")).rejects.toThrow("storefront_presentation_fx_quote_invalid")
  })

  it("requires a server credential at construction", () => {
    expect(() => createVoyantDataPresentationFxQuoter({ apiKey: " " })).toThrow(
      "storefront_presentation_fx_api_key_required",
    )
  })
})
