import { createDbClient } from "@voyant-travel/db"
import type { KmsEnvelope } from "@voyant-travel/db/schema/iam"
import {
  authOrganization,
  customerAccountCredentials,
  customerAccountSettings,
  publicApiKeys,
} from "@voyant-travel/db/schema/iam"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import type { PublicApiCredentialCipher } from "../../src/public-api-credentials.js"
import { createLocalPublicApiAdapter } from "../../src/public-api-local-adapter.js"
import type {
  PublicApiRequestContext,
  PublicApiResolveContext,
} from "../../src/public-api-runtime-port.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

// Deterministic in-memory cipher: base64 stands in for KMS ciphertext so the
// round-trip (encrypt → store envelope → decrypt) is exercised end-to-end.
const testCipher: PublicApiCredentialCipher = {
  async encrypt(plaintext) {
    return { enc: Buffer.from(plaintext, "utf8").toString("base64") } satisfies KmsEnvelope
  },
  async decrypt(envelope) {
    if (!envelope) throw new Error("empty envelope")
    return Buffer.from(envelope.enc, "base64").toString("utf8")
  },
}

const METHODS = {
  emailCode: true,
  emailPassword: false,
  google: false,
  facebook: false,
  apple: false,
} as const

describe.skipIf(!TEST_DATABASE_URL)("local public API adapter", () => {
  const db = createDbClient(TEST_DATABASE_URL!, {
    adapter: "node",
    nodeMaxConnections: 4,
    timeouts: { connectMs: false, queryMs: false, statementMs: false },
  })
  const adapter = createLocalPublicApiAdapter({ resolveCipher: () => testCipher })
  const context: PublicApiRequestContext = { bindings: {}, db }
  const resolveContext: PublicApiResolveContext = { bindings: {}, db }

  // No organization fixture: the operator auth realm never creates one, so a
  // real deployment runs with `organization` empty. The public API must work
  // there (voyant#4261) — the emptiness is the point, not an omission.
  beforeEach(async () => {
    await db.delete(publicApiKeys)
    await db.delete(customerAccountCredentials)
    await db.delete(customerAccountSettings)
    await db.delete(authOrganization)
  })

  afterAll(async () => {
    await db.delete(publicApiKeys)
    await db.delete(customerAccountCredentials)
    await db.delete(customerAccountSettings)
  })

  const issueWebKey = () =>
    adapter.issueApiKey(context, {
      kind: "publishable",
      name: "web",
      allowedOrigins: ["https://shop.example.com"],
    })

  it("issues, lists, resolves, rotates, and revokes access keys", async () => {
    const issued = await issueWebKey()
    expect(issued.token.startsWith("vpk_")).toBe(true)
    expect(issued.tokenPreview).toBe(issued.token.slice(0, "vpk_".length + 6))

    // Assert on THIS key rather than the row count: the integration files share
    // one database, and CI runs each in its own `vitest run` while a local
    // whole-suite run does not. A count makes the test depend on that, which is
    // not what it is trying to prove.
    const listed = await adapter.listApiKeys(context)
    const mine = listed.find((row) => row.id === issued.id)
    expect(mine).toBeDefined()
    expect(mine).not.toHaveProperty("token")

    expect((await adapter.resolveApiKeyByToken(resolveContext, issued.token))?.id).toBe(issued.id)
    expect(await adapter.resolveApiKeyByToken(resolveContext, "vpk_unknown")).toBeNull()
    expect(await adapter.resolveApiKeyByToken(resolveContext, "not-a-key")).toBeNull()

    const rotated = await adapter.rotateApiKey(context, issued.id)
    expect(rotated.token).not.toBe(issued.token)
    expect(rotated.kind).toBe("publishable")
    // Rotation replaces the token, never the binding: the frontend keeps
    // working because its origins and channel came across.
    expect(rotated.allowedOrigins).toEqual(["https://shop.example.com"])
    expect(await adapter.resolveApiKeyByToken(resolveContext, issued.token)).toBeNull()
    expect((await adapter.resolveApiKeyByToken(resolveContext, rotated.token))?.id).toBe(rotated.id)

    await adapter.revokeApiKey(context, rotated.id)
    expect(await adapter.resolveApiKeyByToken(resolveContext, rotated.token)).toBeNull()
  })

  it("carries the key's own origins and channel", async () => {
    const key = await adapter.issueApiKey(context, {
      kind: "publishable",
      allowedOrigins: ["https://shop.example.com/", "https://*.example.com"],
      channelId: "chan_affiliate",
    })

    expect(key.allowedOrigins).toEqual(["https://*.example.com", "https://shop.example.com"])
    expect(key.channelId).toBe("chan_affiliate")

    const cleared = await adapter.updateApiKey(context, key.id, { channelId: null })
    // Null is the ordinary case — it means the deployment's Direct channel.
    expect(cleared.channelId).toBeNull()
  })

  it("refuses a publishable key with no allowed origin", async () => {
    // A `vpk_` ships in a browser bundle; the declared-origin check is the only
    // thing narrowing where it may be used, so one with none is unusable.
    await expect(adapter.issueApiKey(context, { kind: "publishable" })).rejects.toThrow(/origin/i)
  })

  it("lets two keys share one origin, and resolves that origin to a key", async () => {
    // The retired storefront model banned this. With the key as the unit, a
    // site's publishable key and its BFF's secret key on the same origin is the
    // ORDINARY case (voyant#4624).
    await issueWebKey()
    await adapter.issueApiKey(context, {
      kind: "secret",
      allowedOrigins: ["https://shop.example.com"],
    })

    const resolved = await adapter.resolveApiKeysByOrigin(
      resolveContext,
      "https://shop.example.com",
    )
    expect(resolved).toHaveLength(2)
  })

  it("returns every live key on an origin, leaving the channel test to the caller", async () => {
    // Whether two keys on one origin are AMBIGUOUS depends on the channels they
    // RESOLVE to, and only the caller holds the channel provider. `null` and an
    // explicit Direct binding are the same channel, so deciding here would deny
    // an ordinary setup.
    await adapter.issueApiKey(context, {
      kind: "publishable",
      allowedOrigins: ["https://shop.example.com"],
      channelId: "chan_a",
    })
    await adapter.issueApiKey(context, {
      kind: "publishable",
      allowedOrigins: ["https://*.example.com"],
      channelId: "chan_b",
    })

    const resolved = await adapter.resolveApiKeysByOrigin(
      resolveContext,
      "https://shop.example.com",
    )
    expect(resolved.map((key) => key.channelId).sort()).toEqual(["chan_a", "chan_b"])
  })

  it("keeps a revoked key out of origin resolution", async () => {
    const issued = await issueWebKey()
    await adapter.revokeApiKey(context, issued.id)

    expect(
      await adapter.resolveApiKeysByOrigin(resolveContext, "https://shop.example.com"),
    ).toEqual([])
  })

  it("serves deployment customer-account settings, creating them on first read", async () => {
    // A deployment that has never opened the admin surface must still be able
    // to serve customer auth.
    const settings = await adapter.getCustomerAccountSettings(context)
    expect(settings.methods.emailCode).toBe(true)
    expect(settings.accountPolicy.allowedKinds).toEqual(["personal"])

    const updated = await adapter.updateCustomerAccountSettings(context, {
      accountPolicy: {
        allowedKinds: ["personal", "business"],
        personalSignup: "open",
        businessOnboarding: "request",
      },
    })
    expect(updated.accountPolicy.allowedKinds).toEqual(["personal", "business"])
    // Still exactly one row: the singleton index is what enforces that, not a
    // convention the next writer has to remember.
    expect(await db.select().from(customerAccountSettings)).toHaveLength(1)
  })

  it("stores, lists, resolves, and gates provider credentials", async () => {
    await adapter.putProviderCredential(context, "google", {
      clientId: "g-id",
      clientSecret: "g-secret",
    })
    const listed = await adapter.listProviderCredentials(context)
    expect(listed.find((entry) => entry.provider === "google")?.configured).toBe(true)
    expect(listed.find((entry) => entry.provider === "facebook")?.configured).toBe(false)

    expect((await adapter.resolveProviderCredentials(resolveContext, ["google"])).google).toEqual({
      provider: "google",
      clientId: "g-id",
      clientSecret: "g-secret",
    })

    // Enabling a social method now succeeds because the credential exists…
    const updated = await adapter.updateCustomerAccountSettings(context, {
      methods: { ...METHODS, google: true },
    })
    expect(updated.methods.google).toBe(true)

    // …but enabling facebook without a credential is rejected.
    await expect(
      adapter.updateCustomerAccountSettings(context, {
        methods: { ...METHODS, google: true, facebook: true },
      }),
    ).rejects.toThrow(/facebook/)
  })

  it("refuses to remove the credential behind an enabled method", async () => {
    await adapter.putProviderCredential(context, "google", {
      clientId: "g-id",
      clientSecret: "g-secret",
    })
    await adapter.updateCustomerAccountSettings(context, {
      methods: { ...METHODS, google: true },
    })

    // Otherwise customer auth advertises a provider it cannot complete a
    // sign-in with — the mirror of the check on enabling it.
    await expect(adapter.deleteProviderCredential(context, "google")).rejects.toThrow(/google/)

    await adapter.updateCustomerAccountSettings(context, { methods: METHODS })
    await adapter.deleteProviderCredential(context, "google")
    expect(
      (await adapter.listProviderCredentials(context)).find((e) => e.provider === "google")
        ?.configured,
    ).toBe(false)
  })

  it("reports an unknown key id as not found", async () => {
    await expect(adapter.getApiKey(context, "pak_missing")).rejects.toThrow(/not found/i)
  })

  // The regression this suite exists for: with `organization` empty — which is
  // every operator deployment, because the admin realm has no organization
  // plugin — issuing and listing a key must still work. Scoping these tables by
  // `organization_id` made the insert fail its foreign key and the list return
  // nothing (voyant#4261).
  it("issues and lists a key with no operator organization in the database", async () => {
    expect(await db.select().from(authOrganization)).toHaveLength(0)

    const issued = await issueWebKey()

    expect((await adapter.listApiKeys(context)).map((row) => row.id)).toContain(issued.id)
    expect((await adapter.resolveApiKeyByToken(resolveContext, issued.token))?.id).toBe(issued.id)
  })
})
