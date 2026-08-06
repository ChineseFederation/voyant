import { describe, expect, it } from "vitest"

import {
  createStorefrontInputSchema,
  storefrontSchema,
  updateStorefrontAccountPolicyInputSchema,
  updateStorefrontMethodsInputSchema,
} from "../../src/storefront-admin-contracts.js"

const STOREFRONT = {
  id: "storefront_1",
  name: "Customer portal",
  slug: "customer-portal",
  hostingKind: "external",
  siteId: null,
  allowedOrigins: ["https://shop.example"],
  methods: { emailCode: true, emailPassword: false, google: false, facebook: false, apple: false },
  accountPolicy: {
    allowedKinds: ["personal"],
    personalSignup: "open",
    businessOnboarding: "disabled",
  },
  hostOnlyCookies: true,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
}

describe("storefrontSchema", () => {
  it("decodes hosting kinds owned by the runtime provider, not just this package's", () => {
    // Voyant Cloud mints these for the portal and booking engine it hosts. A
    // closed enum here rejects the whole list response and blanks the page.
    for (const hostingKind of ["managed_portal", "managed_booking_engine"]) {
      expect(storefrontSchema.parse({ ...STOREFRONT, hostingKind })).toMatchObject({ hostingKind })
    }
  })

  it("still requires a hosting kind to be present", () => {
    expect(storefrontSchema.safeParse({ ...STOREFRONT, hostingKind: "" }).success).toBe(false)
    expect(storefrontSchema.safeParse({ ...STOREFRONT, hostingKind: null }).success).toBe(false)
  })

  it("decodes fields the runtime provider adds, and keeps them out of the DTO", () => {
    // Voyant Cloud serves managed storefronts with an `organizationId` this
    // package does not model. Refusing it rejected the whole list response and
    // rendered "Storefronts unavailable" on a healthy 200 (voyant#4342).
    const parsed = storefrontSchema.parse({ ...STOREFRONT, organizationId: "org_1" })

    expect(parsed).toEqual(STOREFRONT)
    expect(parsed).not.toHaveProperty("organizationId")
  })

  it("decodes nested objects the runtime provider extends", () => {
    const parsed = storefrontSchema.parse({
      ...STOREFRONT,
      methods: { ...STOREFRONT.methods, passkey: true },
      accountPolicy: { ...STOREFRONT.accountPolicy, partnerOnboarding: "disabled" },
    })

    expect(parsed.methods).toEqual(STOREFRONT.methods)
    expect(parsed.accountPolicy).toEqual(STOREFRONT.accountPolicy)
  })
})

describe("write contracts", () => {
  it("still refuses a request body naming a method this deployment does not have", () => {
    expect(
      updateStorefrontMethodsInputSchema.safeParse({ ...STOREFRONT.methods, passkey: true })
        .success,
    ).toBe(false)
    expect(
      updateStorefrontAccountPolicyInputSchema.safeParse({
        ...STOREFRONT.accountPolicy,
        partnerOnboarding: "disabled",
      }).success,
    ).toBe(false)
  })
})

describe("createStorefrontInputSchema", () => {
  const input = {
    name: "Web store",
    slug: "web",
    allowedOrigins: ["https://shop.example"],
    methods: STOREFRONT.methods,
  }

  it("accepts the hosting kinds an operator provisions", () => {
    for (const hostingKind of ["cloud_site", "external"]) {
      expect(createStorefrontInputSchema.parse({ ...input, hostingKind })).toMatchObject({
        hostingKind,
      })
    }
  })

  it("refuses platform-owned hosting kinds an operator cannot provision", () => {
    expect(
      createStorefrontInputSchema.safeParse({ ...input, hostingKind: "managed_portal" }).success,
    ).toBe(false)
  })
})
