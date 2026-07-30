import { describe, expect, it } from "vitest"

import { createStandardOperatorRouteFiles } from "../src/standard-route-files"

describe("createStandardOperatorRouteFiles", () => {
  it("routes every standard frontend surface through the package runtime", () => {
    const standardOperatorRouteFiles = createStandardOperatorRouteFiles({
      presentationIds: [
        "@voyant-travel/auth#presentation.local-auth",
        "@voyant-travel/finance#presentation.public",
        "@voyant-travel/mcp#presentation.consent",
        "@voyant-travel/quotes#presentation.public",
        "@voyant-travel/storefront#presentation.customer",
      ],
    })
    const runtime = standardOperatorRouteFiles.find(
      (file) => file.path === "_lib/operator-frontend.tsx",
    )
    expect(runtime?.source).toContain("createStandardOperatorFrontend")
    expect(runtime?.source).toContain("selectedGraphPresentationFactories")
    expect(runtime?.source).toContain('import.meta.glob("../../../src/admin/*/index.tsx"')
    expect(runtime?.source).toContain("packages/*/openapi/{admin,storefront}/*.json")

    for (const file of standardOperatorRouteFiles.filter(
      (candidate) => candidate.path !== "_lib/operator-frontend.tsx",
    )) {
      expect(file.source, file.path).toContain("operatorFrontend")
      expect(file.source, file.path).not.toContain('from "@/lib/')
      expect(file.source, file.path).not.toContain('from "@/components/')
      expect(file.source, file.path).not.toContain('from "@/routes/')
    }
  })

  it("emits each package route family only when its presentation is selected", () => {
    const cases = [
      ["@voyant-travel/auth#presentation.local-auth", "(auth)/"],
      ["@voyant-travel/finance#presentation.public", "pay.tsx"],
      ["@voyant-travel/mcp#presentation.consent", "(mcp)/"],
      ["@voyant-travel/quotes#presentation.public", "proposal.$quoteVersionId.tsx"],
    ] as const

    for (const [presentationId, expectedPath] of cases) {
      const selected = createStandardOperatorRouteFiles({ presentationIds: [presentationId] })
      const absent = createStandardOperatorRouteFiles({ presentationIds: [] })
      expect(selected.some(({ path }) => path.startsWith(expectedPath))).toBe(true)
      expect(absent.some(({ path }) => path.startsWith(expectedPath))).toBe(false)
    }
  })

  it("emits the MCP consent screen without the local-auth pages", () => {
    // A broker-authenticated deployment ships no sign-in, sign-up, or
    // password-reset page, but the authorization server issuing connector
    // grants is still local to it — so consent has to be reachable anyway.
    const cloudAuth = createStandardOperatorRouteFiles({
      presentationIds: ["@voyant-travel/mcp#presentation.consent"],
    })

    expect(cloudAuth.map(({ path }) => path)).toContain("(mcp)/mcp-consent.tsx")
    expect(cloudAuth.some(({ path }) => path.startsWith("(auth)/"))).toBe(false)
  })

  it("emits Storefront routes only when its presentation is selected", () => {
    const selected = createStandardOperatorRouteFiles({
      presentationIds: ["@voyant-travel/storefront#presentation.customer"],
    })
    const absent = createStandardOperatorRouteFiles({ presentationIds: [] })

    expect(selected.filter((file) => file.path.startsWith("(storefront)/"))).toHaveLength(9)
    expect(absent.some((file) => file.path.startsWith("(storefront)/"))).toBe(false)
    expect(absent.map(({ path }) => path)).toEqual(
      selected.filter((file) => !file.path.startsWith("(storefront)/")).map(({ path }) => path),
    )
  })
})
