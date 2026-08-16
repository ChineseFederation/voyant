import { describe, expect, it } from "vitest"

import {
  customerAccountSettingsSchema,
  customerAuthMethodsSchema,
  issuePublicApiKeyInputSchema,
  publicApiKeySchema,
  publicApiKeyWithChannelSchema,
  updateCustomerAccountPolicyInputSchema,
} from "../../src/public-api-admin-contracts.js"

const KEY = {
  id: "pak_1",
  kind: "publishable",
  scopes: null,
  tokenPreview: "vpk_ab12",
  name: "Website",
  allowedOrigins: ["https://shop.example"],
  channelId: null,
  hostOnlyCookies: true,
  lastUsedAt: null,
  revokedAt: null,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
}

describe("publicApiKeySchema", () => {
  it("decodes key kinds owned by the runtime provider, not just this package's", () => {
    // The public API runtime is a port: a control plane behind it can mint a
    // kind this package never sees. A closed enum here rejects the whole list
    // response and blanks the page.
    expect(publicApiKeySchema.parse({ ...KEY, kind: "managed_publishable" })).toMatchObject({
      kind: "managed_publishable",
    })
  })

  it("still requires a kind to be present", () => {
    expect(publicApiKeySchema.safeParse({ ...KEY, kind: "" }).success).toBe(false)
    expect(publicApiKeySchema.safeParse({ ...KEY, kind: null }).success).toBe(false)
  })

  it("decodes fields the runtime provider adds, and keeps them out of the DTO", () => {
    // Refusing an unmodelled field rejected the whole list response and
    // rendered the page's error state on a healthy 200 (voyant#4342). One
    // unrecognized key must not be able to do that.
    const decoded = publicApiKeySchema.parse({ ...KEY, organizationId: "org_1" })

    expect(decoded).not.toHaveProperty("organizationId")
    expect(decoded).toMatchObject({ id: "pak_1" })
  })

  it("projects the resolved channel, distinguishing a default from a choice", () => {
    const decoded = publicApiKeyWithChannelSchema.parse({
      ...KEY,
      channel: {
        channelId: "chan_direct",
        channelName: "Direct",
        channelStatus: "active",
        implicit: true,
      },
    })

    // An admin surface shows an implicit channel as the default rather than as
    // a configured choice, so clearing it reads as "back to Direct" and not as
    // "breaks the public API".
    expect(decoded.channel?.implicit).toBe(true)
  })

  it("accepts a key with no channel at all", () => {
    expect(publicApiKeyWithChannelSchema.safeParse(KEY).success).toBe(true)
  })
})

describe("customerAccountSettingsSchema", () => {
  it("decodes settings and tolerates provider-added fields", () => {
    const decoded = customerAccountSettingsSchema.parse({
      methods: {
        emailCode: true,
        emailPassword: false,
        google: false,
        facebook: false,
        apple: false,
      },
      accountPolicy: {
        allowedKinds: ["personal"],
        personalSignup: "open",
        businessOnboarding: "disabled",
      },
      updatedAt: "2026-07-15T00:00:00.000Z",
      somethingNewer: true,
    })

    expect(decoded).not.toHaveProperty("somethingNewer")
    expect(decoded.methods.emailCode).toBe(true)
  })
})

describe("request contracts are closed", () => {
  it("refuses a method this deployment does not know", () => {
    // A request body is this deployment's own vocabulary, so an unknown key
    // there is a caller mistake worth refusing — the opposite polarity from a
    // response.
    const result = customerAuthMethodsSchema.safeParse({
      emailCode: true,
      emailPassword: false,
      google: false,
      facebook: false,
      apple: false,
      telegram: true,
    })

    expect(result.success).toBe(false)
  })

  it("refuses an unknown key on an issue request", () => {
    expect(
      issuePublicApiKeyInputSchema.safeParse({ kind: "publishable", channelName: "Direct" })
        .success,
    ).toBe(false)
  })

  it("refuses an unknown buyer-account kind", () => {
    expect(
      updateCustomerAccountPolicyInputSchema.safeParse({
        accountPolicy: {
          allowedKinds: ["personal", "government"],
          personalSignup: "open",
          businessOnboarding: "disabled",
        },
      }).success,
    ).toBe(false)
  })

  it("accepts a minimal issue request, since origins default on the server", () => {
    expect(issuePublicApiKeyInputSchema.safeParse({ kind: "secret" }).success).toBe(true)
  })
})
