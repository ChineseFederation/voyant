export const STOREFRONT_ROUTE_HOSTS = {
  "route.tsx": "layout",
  "shop.tsx": "shop",
  "shop_.account.tsx": "account",
  "shop_.account.sign-in.tsx": "accountSignIn",
  "shop_.account.sign-up.tsx": "accountSignUp",
  "shop_.account.verify-email.tsx": "accountVerifyEmail",
  "shop_.composer.tsx": "composer",
  "shop_.confirmation.$bookingId.tsx": "confirmation",
  "shop_.products.$entityModule.$entityId.tsx": "productDetail",
}

export function checkStorefrontPresentationAuthority({
  routeHosts,
  hostAdapter,
  messageAdapter,
  intakeAdapter,
  packagePresentation,
  packageIntake,
  relationshipsContributor = "",
  graphDeclaration,
}) {
  const failures = []
  let hostLines = 0

  for (const [file, routeKey] of Object.entries(STOREFRONT_ROUTE_HOSTS)) {
    const source = routeHosts[file]
    if (source === undefined) {
      failures.push(`${file} is required as a Storefront route host`)
      continue
    }
    hostLines += source.split("\n").length
    if (!source.includes("createFileRoute")) failures.push(`${file} must contain createFileRoute`)
    const oldRuntime =
      source.includes("storefrontPresentationContribution") && source.includes(`routes.${routeKey}`)
    const packagedRuntime =
      source.includes("operatorFrontend") && source.includes(`routes.storefront.${routeKey}`)
    if (!oldRuntime && !packagedRuntime)
      failures.push(`${file} must bind Storefront route ${routeKey}`)
    for (const token of [
      "function ",
      "useNavigate",
      "useSearch",
      "z.object",
      "redirect(",
      "authClient",
    ]) {
      if (source.includes(token)) failures.push(`${file} must not own ${token.trim()}`)
    }
  }

  if (hostLines > 80)
    failures.push(`Storefront route hosts grew to ${hostLines} lines; ratchet is 80`)

  for (const token of [
    '"@voyant-travel/storefront#presentation.customer"',
    "presentationFactories",
    "StorefrontComposerPage",
    "CruiseDetailPage",
    "ProductDetailPageProducts",
    "AccommodationDetailPage",
    "authClient.useSession()",
    "useLocale().resolvedLocale",
  ]) {
    if (!hostAdapter.includes(token)) failures.push(`Storefront host adapter must contain ${token}`)
  }
  if (hostAdapter.includes("createStorefrontPresentationContribution")) {
    failures.push("Storefront host adapter must not directly select the package factory")
  }
  for (const token of ["z.object", "redirect(", "createFileRoute", "CustomerAccountPage"]) {
    if (hostAdapter.includes(token)) failures.push(`Storefront host adapter must not own ${token}`)
  }

  for (const token of [
    'id: "@voyant-travel/storefront#presentation.customer"',
    "accountSignInSearchSchema",
    "confirmationSearchSchema",
    "getStorefrontCustomerProductDetailRoute",
    "CustomerAccountPage",
    "StorefrontMessagesProvider",
    "createStorefrontMessagesProvider",
  ]) {
    if (!packagePresentation.includes(token)) {
      failures.push(`package presentation contribution must contain ${token}`)
    }
  }
  if (packagePresentation.includes('from "@/')) {
    failures.push("package presentation contribution must not import Operator aliases")
  }

  if (!messageAdapter.includes("createStorefrontMessagesProvider")) {
    failures.push("Storefront message adapter must use the package-owned provider factory")
  }
  if (messageAdapter.includes("function OperatorStorefrontMessagesProvider")) {
    failures.push("Storefront message adapter must not implement the provider")
  }

  if (intakeAdapter.includes("StorefrontIntake") || intakeAdapter.includes("storefrontIntake")) {
    failures.push("Storefront intake authority must stay out of the starter")
  }
  if (
    !relationshipsContributor.includes("[storefrontIntakeRuntimePort.id]") &&
    !relationshipsContributor.includes("[storefrontIntakeRuntimePortReference.id]")
  ) {
    failures.push("Relationships contributor must provide the Storefront intake port")
  }
  for (const token of [
    "createStorefrontIntakePersistence",
    "relationshipsService.createPerson",
    "customerSignals",
    "requireStorefrontDb",
  ]) {
    if (!packageIntake.includes(token))
      failures.push(`package intake adapter must contain ${token}`)
  }

  for (const token of [
    "presentations: [",
    'id: "@voyant-travel/storefront#presentation.customer"',
    'entry: "@voyant-travel/storefront-react/storefront"',
    'export: "createStorefrontPresentationContribution"',
  ]) {
    if (!graphDeclaration.includes(token)) {
      failures.push(`Storefront selected graph declaration must contain ${token}`)
    }
  }

  return { failures, hostLines }
}
