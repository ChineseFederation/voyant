// agent-quality: file-size exception -- owner: scripts; existing automation script stays co-located until a dedicated split preserves behavior and tests.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

interface ExportCheck {
  packageName: string
  entry: string
  requiredExports: string[]
}

interface PackageJson {
  name?: string
  private?: boolean
  exports?: Record<string, unknown>
  files?: string[]
  publishConfig?: {
    exports?: Record<string, unknown>
  }
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const uiStylesExport = "./styles.css"
const uiStylesSource = "./src/styles.css"
const packageFilters = getPackageFilters(process.argv.slice(2))
const financeContractsPaymentValidationExports = [
  "insertPaymentAuthorizationBodySchema",
  "insertPaymentSessionBodySchema",
  "insertSupplierInvoicePaymentBodySchema",
  "paymentAuthorizationStatusSchema",
  "updatePaymentAuthorizationBodySchema",
  "updatePaymentSessionBodySchema",
]

const checks: ExportCheck[] = [
  {
    packageName: "@voyant-travel/storage",
    entry: "packages/storage/dist/index.js",
    requiredExports: [
      "createStorageService",
      "StorageError",
      "createLocalStorageProvider",
      "createS3CompatibleStorageProvider",
      "assertStorageProviderConformance",
    ],
  },
  {
    packageName: "@voyant-travel/finance",
    entry: "packages/finance/dist/index.js",
    requiredExports: [
      "createFinanceApiModule",
      "createFinanceAdminDocumentRoutes",
      "createFinanceAdminSettlementRoutes",
      "createPdfInvoiceDocumentGenerator",
      "createStorageBackedInvoiceDocumentGenerator",
      "defaultPdfInvoiceDocumentSerializer",
      "publicFinanceRoutes",
      "publicFinanceService",
      "defaultStorageBackedInvoiceDocumentSerializer",
      "financeDocumentsService",
      "financeSettlementService",
      "generateInvoiceDocumentInputSchema",
      "generatedInvoiceDocumentResultSchema",
      "pollInvoiceSettlementInputSchema",
      "polledInvoiceSettlementProviderResultSchema",
      "polledInvoiceSettlementResultSchema",
      "publicBookingFinanceDocumentsSchema",
      "publicBookingFinancePaymentsSchema",
      "publicFinanceBookingDocumentSchema",
      "publicFinanceDocumentLookupQuerySchema",
      "publicFinanceDocumentLookupSchema",
      "publicFinanceBookingPaymentSchema",
      "publicFinanceDocumentAvailabilitySchema",
      "publicBookingPaymentOptionsSchema",
      "publicPaymentOptionsQuerySchema",
      "publicPaymentSessionSchema",
      "publicStartPaymentSessionSchema",
      "publicValidateTravelCreditSchema",
      "publicTravelCreditValidationSchema",
    ],
  },
  {
    packageName: "@voyant-travel/finance-react",
    entry: "packages/finance-react/dist/index.js",
    requiredExports: [
      "getPublicBookingDocuments",
      "getPublicBookingDocumentsQueryOptions",
      "usePublicBookingDocuments",
      "getPublicFinanceDocumentByReference",
      "getPublicFinanceDocumentByReferenceQueryOptions",
      "usePublicFinanceDocumentByReference",
      "getPublicBookingPayments",
      "getPublicBookingPaymentsQueryOptions",
      "usePublicBookingPayments",
      "publicBookingFinanceDocumentsSchema",
      "publicBookingFinancePaymentsSchema",
      "publicFinanceDocumentLookupQuerySchema",
      "publicFinanceDocumentLookupSchema",
      "publicFinanceBookingDocumentSchema",
      "publicFinanceBookingPaymentSchema",
      "getPublicBookingPaymentOptions",
      "getPublicBookingPaymentOptionsQueryOptions",
      "getPublicPaymentSession",
      "getPublicPaymentSessionQueryOptions",
      "startPublicBookingGuaranteePaymentSession",
      "startPublicBookingSchedulePaymentSession",
      "validatePublicTravelCredit",
      "publicBookingPaymentOptionsSchema",
      "publicPaymentOptionsQuerySchema",
      "publicPaymentSessionSchema",
      "publicStartPaymentSessionSchema",
      "publicValidateTravelCreditSchema",
      "publicTravelCreditValidationSchema",
    ],
  },
  {
    packageName: "@voyant-travel/finance-contracts",
    entry: "packages/finance-contracts/dist/index.js",
    requiredExports: financeContractsPaymentValidationExports,
  },
  {
    packageName: "@voyant-travel/finance-contracts/validation",
    entry: "packages/finance-contracts/dist/validation.js",
    requiredExports: financeContractsPaymentValidationExports,
  },
  {
    packageName: "@voyant-travel/inventory",
    entry: "packages/inventory/dist/index.js",
    requiredExports: [
      "publicProductRoutes",
      "publicProductsService",
      "catalogProductsService",
      "catalogSearchDocumentSchema",
      "catalogSearchDocumentListQuerySchema",
      "catalogSearchDocumentListResponseSchema",
      "localizedCatalogProductSummarySchema",
      "publicCatalogDestinationListQuerySchema",
      "publicCatalogDestinationListResponseSchema",
      "publicCatalogDestinationSchema",
      "localizedCatalogProductDetailSchema",
      "upsertProductBrochureSchema",
    ],
  },
  {
    packageName: "@voyant-travel/inventory/tasks",
    entry: "packages/inventory/dist/tasks.js",
    requiredExports: [
      "createBasicPdfProductBrochurePrinter",
      "createCloudflareBrowserProductBrochurePrinter",
      "createCloudflareBrowserProductBrochurePrinterFromEnv",
      "createDefaultProductBrochureTemplate",
      "generateAndStoreProductBrochure",
      "loadProductBrochureTemplateContext",
      "renderProductBrochureTemplate",
    ],
  },
  {
    packageName: "@voyant-travel/bookings",
    entry: "packages/bookings/dist/index.js",
    requiredExports: [
      "publicBookingRoutes",
      "publicBookingsService",
      "publicBookingOverviewLookupQuerySchema",
      "publicBookingSessionRepriceResultSchema",
      "publicBookingSessionStateSchema",
      "publicBookingSessionMutationSchema",
      "publicCreateBookingSessionSchema",
      "publicRepriceBookingSessionSchema",
      "publicUpsertBookingSessionStateSchema",
      "publicUpdateBookingSessionSchema",
      "bookingSessionStates",
      "publicBookingRequirementsRoutes",
      "bookingRequirementsService",
      "publicTransportRequirementsQuerySchema",
      "publicTransportRequirementsSchema",
      "transportRequirementFieldSchema",
    ],
  },
  {
    packageName: "@voyant-travel/bookings-react",
    entry: "packages/bookings-react/dist/index.js",
    requiredExports: [
      "usePublicBookingSession",
      "usePublicBookingSessionState",
      "usePublicBookingSessionFlowMutation",
      "getPublicBookingSessionQueryOptions",
      "getPublicBookingSessionStateQueryOptions",
      "publicBookingSessionResponse",
      "publicBookingSessionStateResponse",
      "publicBookingSessionRepriceResponse",
      "useTransportRequirements",
      "getTransportRequirementsQueryOptions",
      "bookingRequirementsQueryKeys",
      "publicTransportRequirementsSchema",
      "transportRequirementFieldSchema",
    ],
  },
  {
    packageName: "@voyant-travel/inventory-react",
    entry: "packages/inventory-react/dist/index.js",
    requiredExports: [
      "useProductDayMutation",
      "useProductDays",
      "useProductMedia",
      "useProductMediaMutation",
      "useProductVersionMutation",
      "useProductVersions",
      "getProductDayServicesQueryOptions",
      "getProductDaysQueryOptions",
      "getProductMediaQueryOptions",
      "getProductVersionsQueryOptions",
      "productDayRecordSchema",
      "productMediaRecordSchema",
      "productVersionRecordSchema",
    ],
  },
  {
    packageName: "@voyant-travel/inventory-react/components/product-detail",
    entry: "packages/inventory-react/dist/components/product-detail.js",
    requiredExports: [
      "getProductMediaQueryOptions",
      "getProductDetailMediaQueryOptions",
      "getPricingCategoriesQueryOptions",
      "getProductDetailPricingCategoriesQueryOptions",
      "getProductOptionsQueryOptions",
      "getProductDetailProductOptionsQueryOptions",
    ],
  },
  {
    packageName: "@voyant-travel/storefront",
    entry: "packages/storefront/dist/index.js",
    requiredExports: [
      "createStorefrontApiModule",
      "createStorefrontPublicRoutes",
      "createStorefrontService",
      "resolveStorefrontSettings",
      "storefrontDepartureListQuerySchema",
      "storefrontDepartureListResponseSchema",
      "storefrontDepartureItinerarySchema",
      "storefrontDeparturePricePreviewInputSchema",
      "storefrontDeparturePricePreviewSchema",
      "storefrontDepartureSchema",
      "storefrontProductExtensionsQuerySchema",
      "storefrontProductExtensionsResponseSchema",
      "storefrontPromotionalOfferListQuerySchema",
      "storefrontPromotionalOfferListResponseSchema",
      "storefrontPromotionalOfferResponseSchema",
      "storefrontPromotionalOfferSchema",
      "storefrontSettingsInputSchema",
      "storefrontSettingsSchema",
    ],
  },
  {
    packageName: "@voyant-travel/storefront-react",
    entry: "packages/storefront-react/dist/index.js",
    requiredExports: [
      "getStorefrontSettings",
      "getStorefrontSettingsQueryOptions",
      "getStorefrontDeparture",
      "getStorefrontDepartureQueryOptions",
      "getStorefrontProductDeparturesQueryOptions",
      "getStorefrontProductExtensionsQueryOptions",
      "getStorefrontDepartureItineraryQueryOptions",
      "getStorefrontProductOffersQueryOptions",
      "getStorefrontOfferQueryOptions",
      "useStorefrontSettings",
      "useStorefrontDeparture",
      "useStorefrontProductDepartures",
      "useStorefrontProductExtensions",
      "useStorefrontDepartureItinerary",
      "useStorefrontProductOffers",
      "useStorefrontOffer",
      "useStorefrontDeparturePricePreviewMutation",
      "storefrontSettingsResponseSchema",
      "storefrontDepartureResponseSchema",
      "storefrontDepartureListResponseSchema",
      "storefrontDeparturePricePreviewResponseSchema",
      "storefrontDepartureItineraryResponseSchema",
      "storefrontPromotionalOfferListResponseSchema",
      "storefrontPromotionalOfferResponseSchema",
    ],
  },
  {
    packageName: "@voyant-travel/utils/template-renderer",
    entry: "packages/utils/dist/template-renderer.js",
    requiredExports: ["renderMustacheTemplate", "renderStringTemplate", "renderStructuredTemplate"],
  },
  {
    packageName: "@voyant-travel/utils/pdf-renderer",
    entry: "packages/utils/dist/pdf-renderer.js",
    requiredExports: ["renderPdfDocument"],
  },
  {
    packageName: "@voyant-travel/notifications",
    entry: "packages/notifications/dist/index.js",
    requiredExports: [
      "bookingDocumentBundleItemSchema",
      "bookingDocumentBundleSchema",
      "createDefaultBookingDocumentAttachment",
      "durableNotificationProviderPort",
      "notificationAttachmentSchema",
      "notificationReminderRunRecordSchema",
      "notificationReminderRunListResponseSchema",
      "notificationReminderRunRuleSummarySchema",
      "notificationReminderRunDeliverySummarySchema",
      "notificationReminderRunLinksSchema",
    ],
  },
  {
    packageName: "@voyant-travel/legal",
    entry: "packages/legal/dist/index.js",
    requiredExports: [
      "createLegalApiModule",
      "legalApiModule",
      "createContractsAdminRoutes",
      "createContractsPublicRoutes",
      "contractsService",
    ],
  },
  {
    packageName: "@voyant-travel/storefront/verification",
    entry: "packages/storefront/dist/verification/index.js",
    requiredExports: [
      "createStorefrontVerificationApiModule",
      "createStorefrontVerificationPublicRoutes",
      "createStorefrontVerificationService",
      "createStorefrontVerificationSendersFromProviders",
      "storefrontVerificationChallenges",
      "startEmailVerificationChallengeSchema",
      "confirmSmsVerificationChallengeSchema",
    ],
  },
]

function readPackageJson(packageDir: string): PackageJson {
  return JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8")) as PackageJson
}

function getPackageFilters(argv: string[]): Set<string> {
  const packageNames = new Set<string>()

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === "--package") {
      packageNames.add(argv[index + 1])
      index += 1
      continue
    }

    if (arg.startsWith("--package=")) {
      packageNames.add(arg.slice("--package=".length))
    }
  }

  return packageNames
}

function getWorkspacePackageName(packageName: string): string {
  if (!packageName.startsWith("@")) {
    return packageName.split("/")[0] ?? packageName
  }

  const parts = packageName.split("/")
  return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : packageName
}

function shouldCheckPackage(packageName: string): boolean {
  return (
    packageFilters.size === 0 ||
    packageFilters.has(packageName) ||
    packageFilters.has(getWorkspacePackageName(packageName))
  )
}

function hasStylesExport(exportsMap: Record<string, unknown> | undefined): boolean {
  const value = exportsMap?.[uiStylesExport]

  if (typeof value === "string") {
    return value === uiStylesSource
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return (value as { default?: unknown }).default === uiStylesSource
  }

  return false
}

function getCssHelperPackageDirs(): string[] {
  const packagesDir = path.join(repoRoot, "packages")

  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => path.join(packagesDir, dirent.name))
    .filter((packageDir) => {
      const packageJsonPath = path.join(packageDir, "package.json")
      const componentsDir = path.join(packageDir, "src", "components")

      if (!existsSync(packageJsonPath) || !existsSync(componentsDir)) {
        return false
      }

      const packageJson = readPackageJson(packageDir)
      const packageName = packageJson.name ?? ""

      if (packageJson.private) {
        return false
      }

      if (
        packageName === "@voyant-travel/admin" ||
        packageName === "@voyant-travel/ui" ||
        packageName.endsWith("-ui") ||
        packageName.endsWith("-react")
      ) {
        return shouldCheckPackage(packageName)
      }

      return false
    })
}

function verifyCssHelperExports(failures: string[]) {
  for (const packageDir of getCssHelperPackageDirs()) {
    const packageJson = readPackageJson(packageDir)
    const packageName = packageJson.name ?? path.relative(repoRoot, packageDir)
    const stylesPath = path.join(packageDir, "src", "styles.css")

    if (!existsSync(stylesPath)) {
      failures.push(`${packageName}: missing Tailwind helper file at src/styles.css`)
      continue
    }

    if (!hasStylesExport(packageJson.exports)) {
      failures.push(`${packageName}: missing source export ${uiStylesExport}`)
    }

    if (!hasStylesExport(packageJson.publishConfig?.exports)) {
      failures.push(`${packageName}: missing publishConfig export ${uiStylesExport}`)
    }

    if (!packageJson.files?.includes("src/styles.css")) {
      failures.push(`${packageName}: package files must include src/styles.css`)
    }

    const stylesSource = readFileSync(stylesPath, "utf8")
    if (
      !stylesSource.includes("@source") &&
      !stylesSource.includes('@import "./styles/globals.css"')
    ) {
      failures.push(`${packageName}: src/styles.css must expose Tailwind source detection`)
    }
  }
}

async function main() {
  const failures: string[] = []

  verifyCssHelperExports(failures)

  const filteredChecks = checks.filter((check) => shouldCheckPackage(check.packageName))

  for (const check of filteredChecks) {
    const entryPath = path.join(repoRoot, check.entry)
    if (!existsSync(entryPath)) {
      failures.push(
        `${check.packageName}: missing build output at ${check.entry}; run the package build before verifying exports.`,
      )
      continue
    }

    try {
      const mod = await import(pathToFileURL(entryPath).href)
      const missingExports = check.requiredExports.filter((name) => !(name in mod))

      if (missingExports.length > 0) {
        failures.push(`${check.packageName}: missing exports ${missingExports.join(", ")}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push(`${check.packageName}: failed to import built entrypoint (${message})`)
    }
  }

  if (failures.length > 0) {
    console.error("Package export verification failed:\n")
    for (const failure of failures) {
      console.error(`- ${failure}`)
    }
    process.exit(1)
  }

  console.log(`Verified runtime package exports for ${filteredChecks.length} package entrypoints.`)
}

void main()
