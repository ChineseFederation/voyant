import { describe, expect, it, vi } from "vitest"

import type { VoyantFetcher } from "./client.js"
import { getAdminStorefrontSettings, updateAdminStorefrontSettings } from "./operations.js"

const storefrontSettingsResponse = {
  data: {
    support: {
      email: null,
      phone: null,
      links: [],
    },
    legal: {
      termsUrl: null,
      privacyUrl: null,
      cancellationUrl: null,
      defaultContractTemplateId: null,
      // Required-but-nullable since #4590. Null is the safe reading: the
      // operator has no authority to store an instrument.
      storedInstrumentMandate: null,
    },
    localization: {
      defaultLocale: null,
      currencyDisplay: "code",
    },
    forms: {
      billing: { fields: [] },
      travelers: { fields: [] },
    },
    payment: {
      defaultMethod: null,
      methods: [],
      structure: "full",
      schedule: [],
      defaultSchedule: null,
      bankTransfer: null,
    },
  },
}

describe("admin storefront settings operations", () => {
  it("reads admin storefront settings from the admin endpoint", async () => {
    const fetcher = vi
      .fn<VoyantFetcher>()
      .mockResolvedValueOnce(Response.json(storefrontSettingsResponse))

    await expect(
      getAdminStorefrontSettings({ baseUrl: "https://operator.example/api", fetcher }),
    ).resolves.toEqual(storefrontSettingsResponse)

    expect(fetcher).toHaveBeenCalledWith(
      "https://operator.example/api/v1/admin/storefront/settings",
      { headers: expect.any(Headers) },
    )
  })

  it("validates and sends settings updates as PATCH requests", async () => {
    const fetcher = vi
      .fn<VoyantFetcher>()
      .mockResolvedValueOnce(Response.json(storefrontSettingsResponse))

    await updateAdminStorefrontSettings(
      { baseUrl: "https://operator.example/api", fetcher },
      {
        support: {
          email: "support@example.com",
          links: [{ label: "Help", url: "https://example.com/help" }],
        },
        payment: {
          defaultMethod: "card",
          methods: [{ code: "card" }],
        },
      },
    )

    const [, init] = fetcher.mock.calls[0] ?? []
    expect(init?.method).toBe("PATCH")
    expect(init?.body).toBe(
      JSON.stringify({
        support: {
          email: "support@example.com",
          links: [{ label: "Help", url: "https://example.com/help" }],
        },
        payment: {
          defaultMethod: "card",
          methods: [{ code: "card", enabled: true }],
        },
      }),
    )
  })
})
