/**
 * @voyant-travel/admin — shared admin-dashboard shell for Voyant starters.
 *
 * Exports:
 * - Theme provider: zero-dependency ThemeProvider + useTheme that toggles
 *   `light`/`dark` classes on `document.documentElement` and honors
 *   `prefers-color-scheme` for the "system" mode.
 * - Locale provider: useLocale + LocaleProvider for admin locale/timezone
 *   resolution and persistence.
 * - Query client factory: `makeQueryClient()` with Voyant's admin defaults.
 * - `AdminProvider` composing QueryClient + ThemeProvider + LocaleProvider.
 * - Operator admin shell helpers for API, i18n, and domain provider wiring.
 * - Dashboard page composition, skeletons, aggregate query helpers, and extension context.
 * - Operator admin sidebar, navigation, and workspace layout helpers.
 * - Admin extension helpers for navigation contributions and widget slots.
 * - Semantic destinations: `AdminDestinations` + `AdminNavigationProvider` +
 *   `useAdminHref`/`useAdminNavigate` for package-owned pages that navigate
 *   to routes they don't own (packaged-admin RFC §4.7).
 * - User utilities: `getInitials`, `getDisplayName`.
 * - Types: `AdminUser`, `NavItem`, `NavSubItem`, `AuthActions`, `ThemeMode`.
 */

export {
  type AdminRouteMessagesProviderLoader,
  composeAdminRouteMessagesProviders,
  withAdminRouteMessagesProvider,
} from "./admin-route-messages.js"
export {
  adminModuleOf,
  useAdminExtensionAnalytics,
  useAdminNavigationAnalytics,
} from "./analytics.js"
export {
  type AdminBreadcrumbSegment,
  AdminBreadcrumbsProvider,
  type AdminBreadcrumbsProviderProps,
  AdminBreadcrumbsTrail,
  type AdminBreadcrumbsTrailProps,
  useAdminBreadcrumbs,
  useAdminBreadcrumbsValue,
} from "./components/admin-breadcrumbs.js"
export {
  AdminNavGroup,
  type AdminNavGroupProps,
} from "./components/admin-nav-group.js"
export {
  type AdminNavLinkComponent,
  type AdminNavLinkProps,
  DefaultAdminNavLink,
} from "./components/admin-nav-link.js"
export {
  AdminPageHead,
  type AdminPageHeadOptions,
  type AdminPageHeadProps,
  AdminPageHeadProvider,
  type AdminPageHeadProviderProps,
  useAdminPageHead,
} from "./components/admin-page-head.js"
export {
  AdminWidgetSlotRenderer,
  type AdminWidgetSlotRendererProps,
} from "./components/admin-widget-slot.js"
export { VoyantMark } from "./components/brand/voyant-mark.js"
export { VoyantWordmark } from "./components/brand/voyant-wordmark.js"
export {
  OperatorAdminBootstrapGate,
  type OperatorAdminBootstrapGateProps,
  type OperatorAdminBootstrapMode,
  type OperatorAdminBootstrapRenderState,
} from "./components/operator-admin-bootstrap-gate.js"
export {
  OperatorAdminPageShell,
  type OperatorAdminPageShellProps,
} from "./components/operator-admin-page-shell.js"
export {
  DefaultOperatorAdminBrand,
  type DefaultOperatorAdminBrandProps,
  OperatorAdminSidebar,
  type OperatorAdminSidebarProps,
  OperatorAdminWorkspaceLayout,
  type OperatorAdminWorkspaceLayoutProps,
  resolveAdminPageTitle,
} from "./components/operator-admin-sidebar.js"
export {
  OperatorAdminUserMenu,
  type OperatorAdminUserMenuProps,
} from "./components/operator-admin-user-menu.js"
export type {
  DashboardEmptyAction,
  DashboardEmptyStateConfig,
  DashboardEmptyStateKey,
  DashboardPageProps,
} from "./dashboard/dashboard-page.js"
// DashboardPage pulls recharts (~390 KB) — intentionally NOT re-exported
// here so consumers of this barrel for non-dashboard concerns (sidebar,
// providers, hooks) don't transitively pull the chart bundle. Import
// directly from "@voyant-travel/admin/dashboard/dashboard-page" instead.
export {
  type BookingsAggregates,
  bookingStatusConfig,
  buildDashboardSixMonthWindow,
  buildMonthSeries,
  DashboardApiError,
  type DashboardQueryClient,
  dashboardQueryKeys,
  type FinanceAggregates,
  formatCurrency,
  getDashboardBookingsAggregatesQueryOptions,
  getDashboardFinanceAggregatesQueryOptions,
  getDashboardProductsAggregatesQueryOptions,
  getDashboardSuppliersAggregatesQueryOptions,
  getStatusColor,
  monthlyBookingsConfig,
  type ProductsAggregates,
  pickPrimaryCurrency,
  revenueChartConfig,
  type SuppliersAggregates,
} from "./dashboard/dashboard-query-options.js"
export {
  DashboardAreaChartSkeleton,
  DashboardBarChartSkeleton,
  DashboardKpiRowSkeleton,
  DashboardKpiSkeleton,
  DashboardOutstandingInvoicesSkeleton,
  DashboardPieChartSkeleton,
  DashboardSkeleton,
  DashboardUpcomingListSkeleton,
} from "./dashboard/dashboard-skeleton.js"
export {
  type AdminExtension,
  type AdminNavigationContribution,
  type AdminRouteLoaderContext,
  type AdminRouteMessagesProvider,
  type AdminRouteMessagesProviderModule,
  type AdminRouteMessagesProviderProps,
  type AdminRoutePageComponent,
  type AdminRoutePageModule,
  type AdminRoutePageProps,
  type AdminRouteRuntime,
  type AdminSettingsNavGroup,
  type AdminSettingsNavIcon,
  type AdminSettingsPageContribution,
  type AdminSetupFlowContribution,
  type AdminSetupInitializeInput,
  type AdminSetupInitializeResult,
  type AdminSetupStepActionProps,
  type AdminSetupStepContribution,
  type AdminSetupStepMessages,
  type AdminShellExtension,
  type AdminShellRouteContribution,
  type AdminShellSettingsPageContribution,
  type AdminUiRouteContribution,
  type AdminWidgetContribution,
  type AdminWidgetSlot,
  type AnyAdminWidgetContribution,
  adminExtensionsFromGlob,
  adminRoutePageModule,
  adminWorkspaceHeaderActionsSlot,
  type BindableAdminRoute,
  consumeAdminSetupPrefill,
  createAdminExtensionRegistry,
  createAdminSetupPrefillHref,
  defineAdminExtension,
  findAdminRouteContribution,
  type ImplementedAdminRoute,
  type ResolveAdminNavigationOptions,
  type ResolveAdminWidgetsOptions,
  requireAdminRoute,
  requireImplementedAdminRoute,
  resolveAdminNavigation,
  resolveAdminSetupFlow,
  resolveAdminSetupSteps,
  resolveAdminWidgets,
  type SelectedAdminExtensionFactory,
  type SelectedAdminExtensionFactoryContext,
  type SelectedAdminShellFactory,
  storeAdminSetupPrefill,
} from "./extensions.js"
export {
  composeLocaleMessageDefinitions,
  type DeepPartial,
  formatMessage,
  type LocaleMessageDefinitions,
  type LocaleMessageOverrides,
  MessagesProvider,
  resolveLocaleMessages,
  useMessages,
} from "./lib/i18n.js"
export { getDisplayName, getInitials } from "./lib/initials.js"
export {
  type AdminDestinationKey,
  type AdminDestinationNavigator,
  type AdminDestinationResolvers,
  type AdminDestinations,
  type AdminHrefResolver,
  type AdminNavigateOptions,
  AdminNavigationProvider,
  type AdminNavigationProviderProps,
  useAdminHref,
  useAdminNavigate,
} from "./navigation/destinations.js"
export {
  type CreateOperatorAdminNavigationOptions,
  createOperatorAdminNavigation,
  defaultOperatorNavIcons,
  type OperatorAdminNavigationIconName,
  type OperatorAdminNavigationIcons,
} from "./navigation/operator-navigation.js"
export {
  type AdminNavigationPreferences,
  type AdminNavigationPreferencesClient,
  type AdminNavigationPreferencesContribution,
  type AdminNavigationPreferencesSnapshot,
  type AdminNavigationVisibilityMap,
  type ResolveAdminNavigationPreferencesOptions,
  resolveAdminNavigationPreferences,
} from "./navigation/preferences.js"
export { createRemoteNavIcon } from "./navigation/remote-nav-icon.js"
export {
  AdminExtensionsProvider,
  type AdminExtensionsProviderProps,
  useAdminExtensions,
} from "./providers/admin-extensions.js"
export { AdminProvider, type AdminProviderProps } from "./providers/admin-provider.js"
export {
  DEFAULT_ADMIN_LOCALE,
  DEFAULT_ADMIN_LOCALES,
  type LocaleContextValue,
  LocaleProvider,
  type LocaleProviderProps,
  resolveAdminLocale,
  useLocale,
} from "./providers/locale.js"
export {
  type AdminLocalePreferenceSource,
  AdminLocalePreferenceSync,
  type AdminLocalePreferenceSyncProps,
} from "./providers/locale-preferences.js"
export {
  getOperatorAdminMessageOverridesFromUiPrefs,
  type OperatorAdminMessageOverrides,
  type OperatorAdminMessages,
  OperatorAdminMessagesProvider,
  useOperatorAdminI18n,
  useOperatorAdminMessages,
  useOptionalOperatorAdminI18n,
  useOptionalOperatorAdminMessages,
} from "./providers/operator-admin-messages.js"
export {
  type AdminChildProvider,
  type AdminDomainMessagesProvider,
  type AdminDomainMessagesProviderProps,
  AdminDomainMessagesProviderStack,
  AdminProviderSequence,
  type AdminProviderSequenceProps,
  OperatorAdminShellProvider,
  type OperatorAdminShellProviderProps,
} from "./providers/operator-admin-shell.js"
export { makeQueryClient } from "./providers/query-client.js"
export {
  type ThemeContextValue,
  ThemeProvider,
  type ThemeProviderProps,
  useTheme,
} from "./providers/theme.js"
export {
  type AdminUser,
  type AuthActions,
  BETA,
  COMING_SOON,
  type NavItem,
  type NavItemStatus,
  type NavSubItem,
  type ThemeMode,
} from "./types.js"
export {
  ADMIN_UI_EXTENSION_API_VERSION,
  ADMIN_UI_EXTENSION_SLOTS,
  type AdminUiExtensionSlot,
  APP_PAGES_QUERY_KEY,
  type CreateUiExtensionsAdminExtensionOptions,
  createStaticUiExtensionsClient,
  createUiExtensionsAdminExtension,
  isAdminUiExtensionSlot,
  isUiExtensionCompatible,
  UI_EXTENSIONS_QUERY_KEY,
  type UiExtensionContext,
  type UiExtensionDescriptor,
  type UiExtensionEntity,
  type UiExtensionEnvironment,
  UiExtensionEnvironmentProvider,
  type UiExtensionEnvironmentProviderProps,
  UiExtensionHost,
  type UiExtensionHostProps,
  type UiExtensionOrg,
  type UiExtensionsClient,
  type UiExtensionTheme,
  type UiExtensionToastIntent,
  type UiExtensionViewer,
  useUiExtensionEnvironment,
} from "./ui-extensions/index.js"
