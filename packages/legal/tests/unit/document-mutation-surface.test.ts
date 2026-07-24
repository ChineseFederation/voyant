import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const legacyMarkers = [
  "generate-document",
  "regenerate-document",
  "regenerate-pdf",
  "generate-contract",
  "attach-document",
] as const

describe("legal document mutation surface", () => {
  it("does not publish legacy HTTP operations", () => {
    const documents = [
      JSON.parse(
        readFileSync(new URL("../../openapi/admin/legal.json", import.meta.url), "utf8"),
      ) as { paths: Record<string, unknown> },
      JSON.parse(
        readFileSync(
          new URL("../../openapi/admin/contract-document.json", import.meta.url),
          "utf8",
        ),
      ) as { paths: Record<string, unknown> },
    ]
    const paths = documents.flatMap((document) => Object.keys(document.paths))
    for (const marker of legacyMarkers) {
      expect(paths.some((path) => path.includes(marker))).toBe(false)
    }
    expect(paths).not.toContain("/v1/admin/bookings/{bookingId}/contract-preview")
  })

  it("does not export legacy runtime or mutation services", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as {
      exports: Record<string, unknown>
      publishConfig: { exports: Record<string, unknown> }
    }
    for (const exportName of [
      "./runtime",
      "./contract-document",
      "./booking-contract-subscriber",
      "./contract-variables",
    ]) {
      expect(packageJson.exports).not.toHaveProperty(exportName)
      expect(packageJson.publishConfig.exports).not.toHaveProperty(exportName)
    }
    for (const sourceName of [
      "contract-document-service.ts",
      "booking-contract-subscriber-port.ts",
      "booking-contract-subscriber-runtime.ts",
      "service-documents.ts",
      "service-documents-browser.ts",
      "service-auto-generate.ts",
      "service-auto-generate-types.ts",
      "service-auto-generate-variables.ts",
    ]) {
      expect(existsSync(new URL(`../../src/contracts/${sourceName}`, import.meta.url))).toBe(false)
    }
  })
})
