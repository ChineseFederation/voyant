import type { VoyantGraphPresentationDeclaration } from "@voyant-travel/core/project"
import { describe, expect, it } from "vitest"

import { createStandardOperatorRouteFiles } from "../src/standard-route-files"

const presentation = (
  id: string,
  contribution: string,
  routes: readonly { route: string; member: string }[],
): VoyantGraphPresentationDeclaration => ({
  id,
  runtime: { entry: "@voyant-travel/example-react/routes", export: "createRouteContribution" },
  contribution,
  routes,
})

const localAuth = presentation("@voyant-travel/auth#presentation.local-auth", "localAuth", [
  { route: "/(auth)", member: "layout" },
  { route: "/(auth)/accept-invitation", member: "acceptInvitation" },
  { route: "/(auth)/accept-invite", member: "acceptInvite" },
  { route: "/(auth)/forgot-password", member: "forgotPassword" },
  { route: "/(auth)/onboarding", member: "onboarding" },
  { route: "/(auth)/reset-password", member: "resetPassword" },
  { route: "/(auth)/sign-in", member: "signIn" },
  { route: "/(auth)/sign-up", member: "signUp" },
  { route: "/(auth)/verify-email", member: "verifyEmail" },
])

const financePublic = presentation("@voyant-travel/finance#presentation.public", "finance", [
  { route: "/accountant/$token", member: "accountant" },
  { route: "/pay", member: "pay" },
  { route: "/pay_/$sessionId", member: "paymentLink" },
])

const mcpConsent = presentation("@voyant-travel/mcp#presentation.consent", "mcpConsent", [
  { route: "/(mcp)", member: "layout" },
  { route: "/(mcp)/mcp-consent", member: "consent" },
])

const proposalsPublic = presentation("@voyant-travel/proposals#presentation.public", "proposals", [
  { route: "/proposal/$proposalVersionId", member: "proposal" },
])

const storefrontCustomer = presentation(
  "@voyant-travel/storefront#presentation.customer",
  "storefront",
  [
    { route: "/(storefront)", member: "layout" },
    { route: "/(storefront)/shop", member: "shop" },
    { route: "/(storefront)/shop_/account", member: "account" },
    { route: "/(storefront)/shop_/account/sign-in", member: "accountSignIn" },
    { route: "/(storefront)/shop_/account/sign-up", member: "accountSignUp" },
    { route: "/(storefront)/shop_/account/verify-email", member: "accountVerifyEmail" },
    { route: "/(storefront)/shop_/composer", member: "composer" },
    { route: "/(storefront)/shop_/confirmation/$bookingId", member: "confirmation" },
    { route: "/(storefront)/shop_/products/$entityModule/$entityId", member: "productDetail" },
  ],
)

const allPresentations = [localAuth, financePublic, mcpConsent, proposalsPublic, storefrontCustomer]

describe("createStandardOperatorRouteFiles", () => {
  it("routes every standard frontend surface through the package runtime", () => {
    const standardOperatorRouteFiles = createStandardOperatorRouteFiles({
      presentations: allPresentations,
    })
    const runtime = standardOperatorRouteFiles.find(
      (file) => file.path === "_lib/operator-frontend.tsx",
    )
    expect(runtime?.source).toContain("createStandardOperatorFrontend")
    expect(runtime?.source).toContain("selectedGraphPresentationFactories")
    expect(runtime?.source).toContain('import("../../access/selected-access-catalog.generated.js")')
    expect(runtime?.source).not.toContain(
      'import { accessCatalog } from "../../access/selected-access-catalog.generated.js"',
    )
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
      [localAuth, "(auth)/"],
      [financePublic, "pay.tsx"],
      [mcpConsent, "(mcp)/"],
      [proposalsPublic, "proposal.$proposalVersionId.tsx"],
    ] as const

    for (const [declaration, expectedPath] of cases) {
      const selected = createStandardOperatorRouteFiles({ presentations: [declaration] })
      const absent = createStandardOperatorRouteFiles({ presentations: [] })
      expect(selected.some(({ path }) => path.startsWith(expectedPath))).toBe(true)
      expect(absent.some(({ path }) => path.startsWith(expectedPath))).toBe(false)
    }
  })

  it("emits the MCP consent screen without the local-auth pages", () => {
    // A broker-authenticated deployment ships no sign-in, sign-up, or
    // password-reset page, but the authorization server issuing connector
    // grants is still local to it — so consent has to be reachable anyway.
    const cloudAuth = createStandardOperatorRouteFiles({
      presentations: [mcpConsent],
    })

    expect(cloudAuth.map(({ path }) => path)).toContain("(mcp)/mcp-consent.tsx")
    expect(cloudAuth.some(({ path }) => path.startsWith("(auth)/"))).toBe(false)
  })

  it("emits Storefront routes only when its presentation is selected", () => {
    const selected = createStandardOperatorRouteFiles({
      presentations: [storefrontCustomer],
    })
    const absent = createStandardOperatorRouteFiles({ presentations: [] })

    expect(selected.filter((file) => file.path.startsWith("(storefront)/"))).toHaveLength(9)
    expect(absent.some((file) => file.path.startsWith("(storefront)/"))).toBe(false)
    expect(absent.map(({ path }) => path)).toEqual(
      selected.filter((file) => !file.path.startsWith("(storefront)/")).map(({ path }) => path),
    )
  })

  it("keeps the authenticated workspace client-rendered without disabling public SSR", () => {
    const files = createStandardOperatorRouteFiles({ presentations: [storefrontCustomer] })
    const workspace = files.find((file) => file.path === "_workspace/route.tsx")
    const storefront = files.find((file) => file.path === "(storefront)/route.tsx")

    expect(workspace?.source).toContain("ssr: false")
    expect(workspace?.source).toContain("workspace.beforeLoad")
    expect(storefront?.source).not.toContain("ssr: false")
  })

  it("emits routes for a presentation declared entirely outside operator-standard", () => {
    // The whole point of the refactor: a package that declares a presentation
    // with a contribution + routes gets admin route files emitted without any
    // edit to operator-standard.
    const loyalty = presentation("@acme/loyalty#presentation.portal", "loyalty", [
      { route: "/(loyalty)", member: "layout" },
      { route: "/loyalty/$memberId", member: "member" },
    ])

    const files = createStandardOperatorRouteFiles({ presentations: [loyalty] })
    const byPath = new Map(files.map((file) => [file.path, file.source]))

    expect(byPath.has("(loyalty)/route.tsx")).toBe(true)
    expect(byPath.get("(loyalty)/route.tsx")).toContain(
      'createFileRoute("/(loyalty)")(operatorFrontend.routes.loyalty!.layout)',
    )
    expect(byPath.has("loyalty.$memberId.tsx")).toBe(true)
    expect(byPath.get("loyalty.$memberId.tsx")).toContain(
      'createFileRoute("/loyalty/$memberId")(operatorFrontend.routes.loyalty!.member)',
    )
  })

  it("orders presentation families by presentation id", () => {
    const files = createStandardOperatorRouteFiles({
      // Deliberately shuffled to prove the generator sorts by presentation id.
      presentations: [storefrontCustomer, localAuth, proposalsPublic, financePublic, mcpConsent],
    })
    const familyPaths = files
      .map(({ path }) => path)
      .filter(
        (path) =>
          path !== "_lib/operator-frontend.tsx" &&
          path !== "__root.tsx" &&
          path !== "docs.tsx" &&
          path !== "_workspace/route.tsx",
      )

    expect(familyPaths).toEqual([
      "(auth)/route.tsx",
      "(auth)/accept-invitation.tsx",
      "(auth)/accept-invite.tsx",
      "(auth)/forgot-password.tsx",
      "(auth)/onboarding.tsx",
      "(auth)/reset-password.tsx",
      "(auth)/sign-in.tsx",
      "(auth)/sign-up.tsx",
      "(auth)/verify-email.tsx",
      "accountant.$token.tsx",
      "pay.tsx",
      "pay_.$sessionId.tsx",
      "(mcp)/route.tsx",
      "(mcp)/mcp-consent.tsx",
      "proposal.$proposalVersionId.tsx",
      "(storefront)/route.tsx",
      "(storefront)/shop.tsx",
      "(storefront)/shop_.account.tsx",
      "(storefront)/shop_.account.sign-in.tsx",
      "(storefront)/shop_.account.sign-up.tsx",
      "(storefront)/shop_.account.verify-email.tsx",
      "(storefront)/shop_.composer.tsx",
      "(storefront)/shop_.confirmation.$bookingId.tsx",
      "(storefront)/shop_.products.$entityModule.$entityId.tsx",
    ])
  })
})
