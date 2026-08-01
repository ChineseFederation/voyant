import { redirect } from "@tanstack/react-router"
import {
  type AdminExtension,
  type AdminRouteLoaderContext,
  type AdminSettingsPageContribution,
  type AdminSetupFlowContribution,
  type AdminSetupStepContribution,
  adminExtensionsFromGlob,
  createAdminExtensionRegistry,
  resolveAdminSetupFlow,
  resolveAdminSetupSteps,
} from "@voyant-travel/admin"
import {
  getDashboardBookingsAggregatesQueryOptions,
  getDashboardFinanceAggregatesQueryOptions,
  getDashboardProductsAggregatesQueryOptions,
  getDashboardSuppliersAggregatesQueryOptions,
} from "@voyant-travel/admin/dashboard/query-options"
import { createAdminCoreExtension } from "@voyant-travel/admin-app/core-extension"
import type { AccessCatalog } from "@voyant-travel/types/api-keys"

type SelectedExtensionsFactory = (context: {
  navMessages: Readonly<Record<string, string>>
}) => ReadonlyArray<AdminExtension>

type CoreExtensionFactory = (
  settingsPages: ReadonlyArray<AdminSettingsPageContribution>,
  setup: {
    flow?: AdminSetupFlowContribution
    steps: ReadonlyArray<AdminSetupStepContribution>
  },
) => AdminExtension

export interface CreateAdminHostExtensionsOptions {
  core: CoreExtensionFactory
  selected: SelectedExtensionsFactory
  navMessages: Readonly<Record<string, string>>
  discovered?: ReadonlyArray<AdminExtension>
}

export interface CreateAdminHostPresentationOptions {
  accessCatalog: AccessCatalog
  selected: SelectedExtensionsFactory
  project?: Record<string, unknown>
}

export interface AdminHostPresentation {
  extensions: ReadonlyArray<AdminExtension>
  createExtensions: (navMessages: Readonly<Record<string, string>>) => ReadonlyArray<AdminExtension>
}

export function discoverAdminHostExtensions(glob: Record<string, unknown>): AdminExtension[] {
  return adminExtensionsFromGlob(glob)
}

/** Compose core, generated selected-graph, and project-local admin extensions. */
export function createAdminHostExtensions({
  core,
  selected,
  navMessages,
  discovered = [],
}: CreateAdminHostExtensionsOptions): ReadonlyArray<AdminExtension> {
  const selectedExtensions = uniqueExtensionsById(selected({ navMessages }))
  const composedExtensions = uniqueExtensionsById([
    ...selectedExtensions,
    ...discovered.map(withoutGraphOwnedSetupContributions),
  ])
  const settingsPages = uniqueSettingsPages(
    composedExtensions.flatMap((extension) => extension.settingsPages ?? []),
  )
  const setup = {
    flow: resolveAdminSetupFlow(selectedExtensions),
    steps: resolveAdminSetupSteps(selectedExtensions),
  }

  return createAdminExtensionRegistry(core(settingsPages, setup), ...composedExtensions)
}

function withoutGraphOwnedSetupContributions(extension: AdminExtension): AdminExtension {
  const { setupFlow: _setupFlow, setupSteps: _setupSteps, ...presentation } = extension
  return presentation
}

function uniqueSettingsPages(
  pages: ReadonlyArray<AdminSettingsPageContribution>,
): ReadonlyArray<AdminSettingsPageContribution> {
  const unique = new Map<string, AdminSettingsPageContribution>()
  for (const page of pages) {
    const key = `${page.id}\0${page.path}`
    if (!unique.has(key)) unique.set(key, page)
  }
  return [...unique.values()]
}

function uniqueExtensionsById(
  extensions: ReadonlyArray<AdminExtension>,
): ReadonlyArray<AdminExtension> {
  const unique = new Map<string, AdminExtension>()
  for (const extension of extensions) {
    if (!unique.has(extension.id)) unique.set(extension.id, extension)
  }
  return [...unique.values()]
}

/** Build the standard selected-graph presentation with optional project-local extensions. */
export function createAdminHostPresentation({
  accessCatalog,
  selected,
  project = {},
}: CreateAdminHostPresentationOptions): AdminHostPresentation {
  const discovered = discoverAdminHostExtensions(project)
  const createExtensions = (navMessages: Readonly<Record<string, string>>) =>
    createAdminHostExtensions({
      core: (settingsPages, setup) =>
        createAdminCoreExtension({
          dashboard: { loader: (context) => loadAdminDashboard(context, setup) },
          settings: { accessCatalog, extraPages: settingsPages },
        }),
      selected,
      navMessages,
      discovered,
    })

  return {
    createExtensions,
    extensions: createExtensions(defaultAdminHostNavMessages),
  }
}

/** Prefetch the standard dashboard through the host's authenticated API runtime. */
export async function loadAdminDashboard(
  { queryClient, runtime }: AdminRouteLoaderContext,
  setup: {
    flow?: AdminSetupFlowContribution
    steps?: ReadonlyArray<AdminSetupStepContribution>
  } = {},
): Promise<void> {
  const client = {
    baseUrl: runtime.baseUrl,
    fetcher:
      runtime.fetcher ??
      ((url: string, init?: RequestInit) => fetch(url, { credentials: "include", ...init })),
  }
  const [bookings, products, suppliers, finance] = await Promise.all([
    queryClient.ensureQueryData(getDashboardBookingsAggregatesQueryOptions(client)),
    queryClient.ensureQueryData(getDashboardProductsAggregatesQueryOptions(client)),
    queryClient.ensureQueryData(getDashboardSuppliersAggregatesQueryOptions(client)),
    queryClient.ensureQueryData(getDashboardFinanceAggregatesQueryOptions(client)),
  ])
  if (!setup.flow) return

  const fresh =
    bookings.data.total === 0 &&
    products.data.total === 0 &&
    suppliers.data.total === 0 &&
    finance.data.total === 0
  const setupContext = { queryClient, runtime, params: {} }
  if (!(await setup.flow.canInitialize(setupContext))) return
  const result = await setup.flow.initialize(setupContext, {
    stepIds: (setup.steps ?? []).map((step) => step.id),
    fresh,
  })
  if (result.redirectTo) throw redirect({ to: result.redirectTo })
}

export const defaultAdminHostNavMessages = {
  actionLedger: "Logs",
  allTrips: "All trips",
  availability: "Availability",
  bookings: "Bookings",
  catalogAccommodations: "Accommodations",
  catalogCruises: "Cruises",
  catalogExcursions: "Excursions",
  catalogProducts: "Packages",
  catalogTours: "Tours",
  channelSync: "Distribution",
  categories: "Categories",
  contractNumberSeries: "Number Series",
  contractTemplates: "Contract Templates",
  contracts: "Contracts",
  flights: "Flights",
  invoiceNumberSeries: "Number Series",
  invoices: "Invoices",
  mice: "Programs",
  newTrip: "New trip",
  notificationDeliveries: "Deliveries",
  notificationPreview: "Preview",
  notificationReminderRules: "Reminder Rules",
  notificationReminderRuns: "Reminder Runs",
  notificationSettings: "Settings",
  notificationTemplates: "Templates",
  organizations: "Organizations",
  payments: "Payments",
  people: "People",
  policies: "Policies",
  products: "Products",
  profitability: "Profitability",
  promotions: "Promotions",
  proposals: "Proposals",
  resources: "Resources",
  setup: "Setup",
  supplierInvoices: "Supplier invoices",
  suppliers: "Suppliers",
  trips: "Trips",
} as const
