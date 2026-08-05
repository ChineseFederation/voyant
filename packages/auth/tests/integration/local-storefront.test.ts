import { createDbClient } from "@voyant-travel/db"
import type { KmsEnvelope } from "@voyant-travel/db/schema/iam"
import { authOrganization, storefronts } from "@voyant-travel/db/schema/iam"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import type { StorefrontCredentialCipher } from "../../src/storefront-credentials.js"
import { createLocalStorefrontAdapter } from "../../src/storefront-local-adapter.js"
import type {
  StorefrontRequestContext,
  StorefrontResolveContext,
} from "../../src/storefront-runtime-port.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

// Deterministic in-memory cipher: base64 stands in for KMS ciphertext so the
// round-trip (encrypt → store envelope → decrypt) is exercised end-to-end.
const testCipher: StorefrontCredentialCipher = {
  async encrypt(plaintext) {
    return { enc: Buffer.from(plaintext, "utf8").toString("base64") } satisfies KmsEnvelope
  },
  async decrypt(envelope) {
    if (!envelope) throw new Error("empty envelope")
    return Buffer.from(envelope.enc, "base64").toString("utf8")
  },
}

describe.skipIf(!TEST_DATABASE_URL)("local storefront adapter", () => {
  const db = createDbClient(TEST_DATABASE_URL!, {
    adapter: "node",
    nodeMaxConnections: 4,
    timeouts: { connectMs: false, queryMs: false, statementMs: false },
  })
  const adapter = createLocalStorefrontAdapter({ resolveCipher: () => testCipher })
  const context: StorefrontRequestContext = { bindings: {}, db }
  const resolveContext: StorefrontResolveContext = { bindings: {}, db }

  // No organization fixture: the operator auth realm never creates one, so a
  // real deployment runs with `organization` empty. Storefronts must work there
  // (voyant#4261) — the emptiness is the point, not an omission.
  beforeEach(async () => {
    await db.delete(storefronts)
    await db.delete(authOrganization)
  })

  afterAll(async () => {
    await db.delete(storefronts)
  })

  async function createShop() {
    return adapter.createStorefront(context, {
      name: "Shop",
      slug: "shop",
      hostingKind: "external",
      allowedOrigins: ["https://shop.example.com"],
      methods: {
        emailCode: true,
        emailPassword: false,
        google: false,
        facebook: false,
        apple: false,
      },
    })
  }

  it("creates, reads, lists, and updates a storefront (origins/methods/policy)", async () => {
    const created = await createShop()
    expect(created.allowedOrigins).toEqual(["https://shop.example.com"])

    expect(await adapter.getStorefront(context, created.id)).toMatchObject({ id: created.id })
    expect(await adapter.listStorefronts(context)).toHaveLength(1)

    const withOrigins = await adapter.setAllowedOrigins(context, created.id, [
      "https://shop.example.com/",
      "https://*.example.com",
    ])
    expect(withOrigins.allowedOrigins).toEqual([
      "https://*.example.com",
      "https://shop.example.com",
    ])

    const policy = await adapter.updateAccountPolicy(context, created.id, {
      allowedKinds: ["personal", "business"],
      personalSignup: "open",
      businessOnboarding: "request",
    })
    expect(policy.accountPolicy.allowedKinds).toEqual(["personal", "business"])
  })

  it("issues, lists, resolves, rotates, and revokes access keys", async () => {
    const shop = await createShop()
    const issued = await adapter.issueApiKey(context, shop.id, "publishable", "web")
    expect(issued.token.startsWith("vpk_")).toBe(true)
    expect(issued.tokenPreview).toBe(issued.token.slice(0, "vpk_".length + 6))

    const keys = await adapter.listApiKeys(context, shop.id)
    expect(keys).toHaveLength(1)
    expect(keys[0]).not.toHaveProperty("token")

    const resolved = await adapter.resolveStorefrontByApiKey(resolveContext, issued.token)
    expect(resolved?.storefront.id).toBe(shop.id)
    expect(resolved?.key.id).toBe(issued.id)

    expect(await adapter.resolveStorefrontByApiKey(resolveContext, "vpk_unknown")).toBeNull()
    expect(
      await adapter.resolveStorefrontByApiKey(resolveContext, "not-a-storefront-key"),
    ).toBeNull()

    const rotated = await adapter.rotateApiKey(context, shop.id, issued.id)
    expect(rotated.token).not.toBe(issued.token)
    expect(rotated.kind).toBe("publishable")
    expect(await adapter.resolveStorefrontByApiKey(resolveContext, issued.token)).toBeNull()
    expect((await adapter.resolveStorefrontByApiKey(resolveContext, rotated.token))?.key.id).toBe(
      rotated.id,
    )

    await adapter.revokeApiKey(context, shop.id, rotated.id)
    expect(await adapter.resolveStorefrontByApiKey(resolveContext, rotated.token)).toBeNull()
  })

  it("rejects an origin that exact- and wildcard-matches two storefronts", async () => {
    await createShop()
    await db.insert(storefronts).values({
      name: "Other Shop",
      slug: "other-shop",
      hostingKind: "external",
      allowedOrigins: ["https://*.example.com"],
      methods: {
        emailCode: true,
        emailPassword: false,
        google: false,
        facebook: false,
        apple: false,
      },
    })

    await expect(
      adapter.resolveStorefrontByOrigin(resolveContext, "https://shop.example.com"),
    ).rejects.toThrow(/multiple storefronts/i)
  })

  it("stores, lists, resolves, and gates provider credentials", async () => {
    const shop = await createShop()
    await adapter.putProviderCredential(context, shop.id, "google", {
      clientId: "g-id",
      clientSecret: "g-secret",
    })
    const listed = await adapter.listProviderCredentials(context, shop.id)
    expect(listed.find((entry) => entry.provider === "google")?.configured).toBe(true)
    expect(listed.find((entry) => entry.provider === "facebook")?.configured).toBe(false)

    const resolvedSecrets = await adapter.resolveProviderCredentials(resolveContext, shop.id, [
      "google",
    ])
    expect(resolvedSecrets.google).toEqual({
      provider: "google",
      clientId: "g-id",
      clientSecret: "g-secret",
    })

    // Enabling a social method now succeeds because the credential exists…
    const updated = await adapter.updateMethods(context, shop.id, {
      emailCode: true,
      emailPassword: false,
      google: true,
      facebook: false,
      apple: false,
    })
    expect(updated.methods.google).toBe(true)

    // …but enabling facebook without a credential is rejected.
    await expect(
      adapter.updateMethods(context, shop.id, {
        emailCode: true,
        emailPassword: false,
        google: true,
        facebook: true,
        apple: false,
      }),
    ).rejects.toThrow(/facebook/)
  })

  it("reports an unknown storefront id as not found", async () => {
    await createShop()
    await expect(adapter.getStorefront(context, "storefronts_missing")).rejects.toThrow(
      /not found/i,
    )
  })

  // The regression this suite exists for: with `organization` empty — which is
  // every operator deployment, because the admin realm has no organization
  // plugin — creating and listing a storefront must still work. Scoping the
  // storefront tables by `organization_id` made the insert fail its foreign key
  // and the list return nothing (voyant#4261).
  it("creates and lists a storefront with no operator organization in the database", async () => {
    expect(await db.select().from(authOrganization)).toHaveLength(0)

    const created = await createShop()
    const listed = await adapter.listStorefronts(context)

    expect(listed.map((row) => row.id)).toEqual([created.id])
    const issued = await adapter.issueApiKey(context, created.id, "publishable", "web")
    expect(
      (await adapter.resolveStorefrontByApiKey(resolveContext, issued.token))?.storefront.id,
    ).toBe(created.id)
  })

  it("deletes a storefront", async () => {
    const shop = await createShop()
    await adapter.deleteStorefront(context, shop.id)
    expect(await adapter.listStorefronts(context)).toHaveLength(0)
  })
})
