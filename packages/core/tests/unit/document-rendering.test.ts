import { describe, expect, it, vi } from "vitest"

import {
  createHttpDocumentRenderer,
  createHttpDocumentRendererFromEnv,
  documentRendererPort,
} from "../../src/document-rendering.js"

describe("document rendering", () => {
  it("posts the portable PDF contract to a configured HTTP renderer", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(new Uint8Array([37, 80, 68, 70])),
    )
    const renderer = createHttpDocumentRenderer({
      endpoint: "https://renderer.example/pdf",
      backendIdentity: "renderer-test-account",
      headers: { authorization: "Bearer secret" },
      fetch,
    })

    await expect(renderer.renderPdf({ html: "<h1>Hello</h1>" })).resolves.toEqual(
      new Uint8Array([37, 80, 68, 70]),
    )
    expect(fetch).toHaveBeenCalledWith(
      "https://renderer.example/pdf",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ html: "<h1>Hello</h1>" }),
      }),
    )
    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers)
    expect(headers.get("authorization")).toBe("Bearer secret")
    expect(headers.get("accept")).toBe("application/pdf")
  })

  it("requires explicit backend identity for opaque headers or transport", () => {
    expect(() =>
      createHttpDocumentRenderer({
        endpoint: "https://renderer.example/pdf",
        headers: {},
      }),
    ).toThrow(/backendIdentity/)
    expect(() =>
      createHttpDocumentRenderer({
        endpoint: "https://renderer.example/pdf",
        fetch: vi.fn() as never,
      }),
    ).toThrow(/backendIdentity/)
  })

  it("allows endpoint identity only for the built-in unauthenticated transport", async () => {
    const renderer = createHttpDocumentRenderer({ endpoint: "https://renderer.example/pdf" })
    await expect(renderer.resolveBackendIdentity?.()).resolves.toMatch(/^[a-f0-9]{64}$/)
  })

  it("distinguishes explicit identities at the same endpoint", async () => {
    const first = createHttpDocumentRenderer({
      endpoint: "https://renderer.example/pdf",
      backendIdentity: "deployment-a",
    })
    const second = createHttpDocumentRenderer({
      endpoint: "https://renderer.example/pdf",
      backendIdentity: "deployment-b",
    })
    expect(await first.resolveBackendIdentity?.()).not.toBe(await second.resolveBackendIdentity?.())
  })

  it("resolves the zero-code environment adapter with deployment authentication", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(new Uint8Array([1])))
    const renderer = createHttpDocumentRendererFromEnv(
      {
        VOYANT_DOCUMENT_RENDERER_URL: "https://renderer.example/pdf",
        VOYANT_DOCUMENT_RENDERER_TOKEN: "secret",
        VOYANT_DOCUMENT_RENDERER_NAME: "self-hosted-playwright",
        VOYANT_CLOUD_DEPLOYMENT_ID: "dpl_1",
      },
      { fetch, backendIdentity: "test-renderer:dpl_1" },
    )

    expect(renderer?.name).toBe("self-hosted-playwright")
    await renderer?.renderPdf({ html: "hello" })
    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers)
    expect(headers.get("authorization")).toBe("Bearer secret")
    expect(headers.get("x-voyant-deployment-id")).toBe("dpl_1")
  })

  it("keeps the renderer optional when no URL is configured", () => {
    expect(createHttpDocumentRendererFromEnv({})).toBeNull()
  })

  it("fails closed when a custom environment fetch has no explicit backend identity", () => {
    expect(() =>
      createHttpDocumentRendererFromEnv(
        { VOYANT_DOCUMENT_RENDERER_URL: "https://renderer.example/pdf" },
        // @ts-expect-error custom fetches require an explicit stable backend identity.
        { fetch: vi.fn<typeof globalThis.fetch>() },
      ),
    ).toThrow(/backendIdentity is required/)
    expect(() =>
      createHttpDocumentRendererFromEnv(
        { VOYANT_DOCUMENT_RENDERER_URL: "https://renderer.example/pdf" },
        {
          fetch: vi.fn<typeof globalThis.fetch>(),
          backendIdentity: " ",
        },
      ),
    ).toThrow(/backendIdentity is required/)
  })

  it("uses the explicit custom-fetch backend identity", async () => {
    const first = createHttpDocumentRendererFromEnv(
      { VOYANT_DOCUMENT_RENDERER_URL: "https://renderer.example/pdf" },
      { fetch: vi.fn<typeof globalThis.fetch>(), backendIdentity: "custom-a" },
    )
    const second = createHttpDocumentRendererFromEnv(
      { VOYANT_DOCUMENT_RENDERER_URL: "https://renderer.example/pdf" },
      { fetch: vi.fn<typeof globalThis.fetch>(), backendIdentity: "custom-b" },
    )

    expect(await first?.resolveBackendIdentity?.()).not.toBe(
      await second?.resolveBackendIdentity?.(),
    )
  })

  it("binds opaque backend identity to credential tenancy without exposing the token", async () => {
    const first = createHttpDocumentRendererFromEnv({
      VOYANT_DOCUMENT_RENDERER_URL: "https://renderer.example/pdf",
      VOYANT_DOCUMENT_RENDERER_TOKEN: "account-a-secret",
    })
    const second = createHttpDocumentRendererFromEnv({
      VOYANT_DOCUMENT_RENDERER_URL: "https://renderer.example/pdf",
      VOYANT_DOCUMENT_RENDERER_TOKEN: "account-b-secret",
    })

    const firstIdentity = await first?.resolveBackendIdentity?.()
    const secondIdentity = await second?.resolveBackendIdentity?.()
    expect(firstIdentity).toMatch(/^[a-f0-9]{64}$/)
    expect(secondIdentity).not.toBe(firstIdentity)
    expect(firstIdentity).not.toContain("account-a-secret")
  })

  it("rejects invalid runtime port implementations", () => {
    expect(() => documentRendererPort.test({ name: "", renderPdf: vi.fn() })).toThrow(
      "documents.renderer",
    )
  })
})
