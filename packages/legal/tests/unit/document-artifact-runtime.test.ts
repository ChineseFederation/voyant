import { describe, expect, it, vi } from "vitest"
import { createStandardLegalDocumentArtifactProvider } from "../../src/document-artifact-runtime.js"

function descriptor(body: string, bodyFormat: "markdown" | "html" | "lexical_json") {
  return {
    contractId: "contract-1",
    bookingId: "booking-1",
    templateVersionId: "template-version-1",
    contractNumber: "C-1",
    body,
    bodyFormat,
    variables: {},
  } as const
}

async function provider(renderPdf: ReturnType<typeof vi.fn>) {
  return createStandardLegalDocumentArtifactProvider({
    renderer: {
      name: "network-renderer",
      resolveBackendIdentity: async () => "renderer-primary",
      renderPdf,
    },
    storage: {
      name: "documents",
      resolveBackendIdentity: async () => "storage-primary",
    } as never,
    db: {} as never,
  })
}

describe("standard Legal document artifact rendering", () => {
  it("hardens stored HTML before a network-capable renderer receives it", async () => {
    const renderPdf = vi.fn(async () => new TextEncoder().encode("%PDF"))
    const artifacts = await provider(renderPdf)

    await artifacts.render(
      descriptor(
        '<html><head></head><body onload="steal()"><script>steal()</script><h1>Agreement</h1></body></html>',
        "html",
      ),
    )

    const request = renderPdf.mock.calls[0]?.[0] as { html: string }
    expect(request.html).toContain('http-equiv="Content-Security-Policy"')
    expect(request.html).toContain("default-src 'none'")
    expect(request.html).not.toContain("<script")
    expect(request.html).not.toContain("steal()</script>")
    expect(request.html).toContain("<h1>Agreement</h1>")
  })

  it("renders Lexical text content instead of serialized editor state", async () => {
    const renderPdf = vi.fn(async () => new TextEncoder().encode("%PDF"))
    const artifacts = await provider(renderPdf)
    const lexical = JSON.stringify({
      root: {
        type: "root",
        children: [
          {
            type: "paragraph",
            children: [
              { type: "text", text: "Customer <Agreement>" },
              { type: "linebreak" },
              { type: "text", text: "Second line" },
            ],
          },
        ],
      },
    })

    await artifacts.render(descriptor(lexical, "lexical_json"))

    const request = renderPdf.mock.calls[0]?.[0] as { html: string }
    expect(request.html).toContain("Customer &lt;Agreement&gt;")
    expect(request.html).toContain("Customer &lt;Agreement&gt;\nSecond line")
    expect(request.html).not.toContain('"root"')
    expect(request.html).not.toContain('"children"')
  })
})
