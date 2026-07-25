import assert from "node:assert/strict"
import { test } from "node:test"
import {
  checkStorefrontPresentationAuthority,
  STOREFRONT_ROUTE_HOSTS,
} from "../lib/storefront-presentation-authority.mjs"

const routeHosts = Object.fromEntries(
  Object.entries(STOREFRONT_ROUTE_HOSTS).map(([file, routeKey]) => [
    file,
    `import { createFileRoute } from "@tanstack/react-router"\nimport { storefrontPresentationContribution } from "adapter"\nexport const Route = createFileRoute("/fixture")(storefrontPresentationContribution.routes.${routeKey})\n`,
  ]),
)
const hostAdapter = [
  '"@voyant-travel/storefront#presentation.customer"',
  "presentationFactories",
  "StorefrontComposerPage",
  "CruiseDetailPage",
  "ProductDetailPageProducts",
  "AccommodationDetailPage",
  "authClient.useSession()",
  "useLocale().resolvedLocale",
].join("\n")
const packagePresentation = [
  'id: "@voyant-travel/storefront#presentation.customer"',
  "accountSignInSearchSchema",
  "confirmationSearchSchema",
  "getStorefrontCustomerProductDetailRoute",
  "CustomerAccountPage",
  "StorefrontMessagesProvider",
  "createStorefrontMessagesProvider",
].join("\n")
const packageIntake = [
  "createStorefrontIntakePersistence",
  "relationshipsService.createPerson",
  "customerSignals",
  "requireStorefrontDb",
].join("\n")
const graphDeclaration = [
  "presentations: [",
  'id: "@voyant-travel/storefront#presentation.customer"',
  'entry: "@voyant-travel/storefront-react/storefront"',
  'export: "createStorefrontPresentationContribution"',
].join("\n")

function fixture(overrides = {}) {
  return {
    routeHosts,
    hostAdapter,
    messageAdapter: "createStorefrontMessagesProvider",
    intakeAdapter: "export const resources = {}",
    packagePresentation,
    packageIntake,
    relationshipsContributor:
      "[storefrontIntakeRuntimePort.id]: createStorefrontIntakePersistence()",
    graphDeclaration,
    ...overrides,
  }
}

test("accepts selected package presentation with declarative route hosts", () => {
  assert.deepEqual(checkStorefrontPresentationAuthority(fixture()).failures, [])
})

test("rejects route policy and intake authority returning to the starter", () => {
  const result = checkStorefrontPresentationAuthority(
    fixture({
      routeHosts: {
        ...routeHosts,
        "shop.tsx": `${routeHosts["shop.tsx"]}\nfunction ShopPage() { useNavigate() }`,
      },
      intakeAdapter: "function createStorefrontIntakeRuntime() {}",
    }),
  )
  assert(result.failures.some((failure) => failure.includes("shop.tsx must not own function")))
  assert(result.failures.includes("Storefront intake authority must stay out of the starter"))
})

test("rejects direct Storefront factory selection by the host", () => {
  const result = checkStorefrontPresentationAuthority(
    fixture({ hostAdapter: `${hostAdapter}\ncreateStorefrontPresentationContribution` }),
  )
  assert(
    result.failures.includes(
      "Storefront host adapter must not directly select the package factory",
    ),
  )
})
