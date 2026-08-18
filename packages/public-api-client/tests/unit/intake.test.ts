import { describe, expect, it } from "vitest"

import {
  createPublicApiLead,
  createPublicInquiry,
  createVoyantPublicApiClient,
  publicApiLeadIntakeInputSchema,
  publicApiNewsletterSubscribeInputSchema,
  subscribePublicApiNewsletter,
} from "../../src/index.js"

describe("storefront intake operations", () => {
  it("posts lead intake through the public storefront route", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const client = {
      baseUrl: "https://operator.example.com",
      fetcher: async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        return Response.json({
          data: {
            id: "sig_123",
            personId: "person_123",
            kind: "inquiry",
            source: "website",
            status: "new",
            duplicate: false,
          },
        })
      },
    }

    const result = await createPublicApiLead(client, {
      contact: { email: "traveler@example.com" },
      consent: { newsletter: false },
    })

    expect(result.id).toBe("sig_123")
    expect(calls[0]?.url).toBe("https://operator.example.com/v1/public/leads")
    expect(calls[0]?.init?.method).toBe("POST")
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      kind: "inquiry",
      source: "website",
      contact: { email: "traveler@example.com" },
      consent: { marketing: false, newsletter: false, gdpr: false },
    })
  })

  it("posts newsletter subscriptions through the client facade", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const voyant = createVoyantPublicApiClient({
      baseUrl: "https://operator.example.com/",
      fetcher: async (url, init) => {
        calls.push({ url, init })
        return Response.json({
          data: {
            id: "sig_news",
            personId: "person_news",
            kind: "notify",
            source: "website",
            status: "new",
            duplicate: false,
            doubleOptIn: "requested",
          },
        })
      },
    })

    const result = await voyant.storefront.subscribeNewsletter({
      email: "reader@example.com",
      consent: { newsletter: true },
    })

    expect(result.doubleOptIn).toBe("requested")
    expect(calls[0]?.url).toBe("https://operator.example.com/v1/public/newsletter/subscribe")
    expect(calls[0]?.init?.method).toBe("POST")
  })

  it("posts canonical targetless custom Inquiry intake through the client", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const result = await createPublicInquiry(
      {
        baseUrl: "https://operator.example.com/",
        fetcher: async (url, init) => {
          calls.push({ url, init })
          return Response.json({
            data: {
              inquiryId: "inq_123",
              status: "new",
              duplicate: false,
              receivedAt: "2026-08-18T08:00:00.000Z",
            },
          })
        },
      },
      {
        sourceRef: "custom-1",
        subject: "Plan a custom trip",
        kind: "custom_trip",
        contactSnapshot: { email: "traveler@example.com" },
      },
    )

    expect(result.inquiryId).toBe("inq_123")
    expect(calls[0]?.url).toBe("https://operator.example.com/v1/public/relationships/inquiries")
    expect(calls[0]?.init?.method).toBe("POST")
  })

  it("re-exports upstream intake schemas", () => {
    expect(
      publicApiLeadIntakeInputSchema.parse({
        contact: { phone: "+40700000000" },
        consent: { newsletter: false },
      }).contact.phone,
    ).toBe("+40700000000")
    expect(
      publicApiNewsletterSubscribeInputSchema.parse({
        email: "reader@example.com",
        consent: { newsletter: true },
      }).consent.newsletter,
    ).toBe(true)
  })

  it("normalizes newsletter API errors like other SDK calls", async () => {
    await expect(
      subscribePublicApiNewsletter(
        {
          baseUrl: "https://operator.example.com",
          fetcher: async () =>
            Response.json({ error: { message: "Blocked by intake guard" } }, { status: 429 }),
        },
        { email: "reader@example.com", consent: { newsletter: true } },
      ),
    ).rejects.toMatchObject({
      name: "VoyantPublicApiError",
      status: 429,
      message: "Blocked by intake guard",
    })
  })
})
