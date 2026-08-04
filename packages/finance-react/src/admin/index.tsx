import {
  type AdminExtension,
  type AdminRouteLoaderContext,
  type AdminWidgetContribution,
  adminRoutePageModule,
  defineAdminExtension,
  type SelectedAdminExtensionFactoryContext,
  withAdminRouteMessagesProvider,
} from "@voyant-travel/admin"
// Importing the slot id also binds the bookings-ui `AdminDestinations`
// augmentation (`booking.detail`, `person.detail`, `organization.detail`,
// `invoice.detail`, `payment.detail`, ...) into this program — the finance
// pages navigate through those shared keys, and this package already
// peer-depends on `@voyant-travel/bookings-react/ui`, so re-declaring them here would
// just duplicate the contract.
import {
  type BookingDetailPaymentControllerSlotContext,
  bookingDetailFinanceEndSlot,
  bookingDetailFinanceStartSlot,
  bookingDetailInvoicesTabSlot,
  bookingDetailPaymentControllerSlot,
} from "@voyant-travel/bookings-react/admin"
// Importing the slot id also binds the suppliers-ui `AdminDestinations`
// augmentation (`supplier.list`, `supplier.detail`) — this package already
// peer-depends on `@voyant-travel/distribution-react/suppliers/ui`.
import { supplierDetailPaymentPolicySlot } from "@voyant-travel/distribution-react/suppliers/admin"
import { defaultFetcher } from "@voyant-travel/react"
import { DollarSign } from "lucide-react"
import type { ComponentType } from "react"
import * as React from "react"

// Skeletons are deliberately the ONLY page-adjacent statics this factory
// touches: they ship from their own light modules, so attaching them as
// `pendingComponent` doesn't pull the heavy page chunks into the factory.
// Query options resolve via dynamic import inside the loaders, and the
// widgets mount through Suspense-wrapped `React.lazy` loaders — both keep
// the finance data layer (client + response schemas + the payment-policy
// engine) out of the workspace-chrome chunk that evaluates this factory.
import { InvoicesPageSkeleton } from "../components/invoices-page-skeleton.js"
import { PaymentsPageSkeleton } from "../components/payments-page-skeleton.js"
import { financeFiscalSetupMessageDefinitions } from "../i18n/setup.js"
import type { BookingInvoicesWidgetProps } from "./booking-invoices-widget.js"
import type { BookingPaymentPolicyWidgetProps } from "./booking-payment-policy-widget.js"
import type { BookingPendingPaymentSessionsWidgetProps } from "./booking-pending-payment-sessions-widget.js"
import { InvoiceDetailSkeleton } from "./invoice-detail-skeleton.js"
import { PaymentDetailSkeleton } from "./payment-detail-skeleton.js"
import type { SupplierPaymentPolicyWidgetProps } from "./supplier-payment-policy-widget.js"

/** The host runtime as the package's query-option client (`fetchWithValidation`). */
function runtimeClient(runtime: AdminRouteLoaderContext["runtime"]) {
  return { baseUrl: runtime.baseUrl, fetcher: runtime.fetcher ?? defaultFetcher }
}

/**
 * Suspense-wrapped lazy widget mount: the widget registry takes a sync
 * component, but the finance cards (and the payment-policy/schedule stack
 * behind them) must not load with workspace chrome — each widget chunk
 * fetches when its slot actually renders on a detail page.
 */
function lazyWidget<TProps extends object>(
  load: () => Promise<{ default: ComponentType<TProps> }>,
): React.FunctionComponent<TProps> {
  const Lazy = React.lazy(load)
  return function LazyFinanceAdminWidget(props: TProps) {
    return (
      <React.Suspense fallback={null}>
        <Lazy {...props} />
      </React.Suspense>
    )
  }
}

const LazyBookingInvoicesWidget = lazyWidget<BookingInvoicesWidgetProps>(() =>
  import("./booking-invoices-widget.js").then(
    (module): { default: ComponentType<BookingInvoicesWidgetProps> } => ({
      default: module.BookingInvoicesWidget,
    }),
  ),
)
const LazyBookingPendingPaymentSessionsWidget =
  lazyWidget<BookingPendingPaymentSessionsWidgetProps>(() =>
    import("./booking-pending-payment-sessions-widget.js").then(
      (module): { default: ComponentType<BookingPendingPaymentSessionsWidgetProps> } => ({
        default: module.BookingPendingPaymentSessionsWidget,
      }),
    ),
  )
const LazyBookingPaymentPolicyWidget = lazyWidget<BookingPaymentPolicyWidgetProps>(() =>
  import("./booking-payment-policy-widget.js").then(
    (module): { default: ComponentType<BookingPaymentPolicyWidgetProps> } => ({
      default: module.BookingPaymentPolicyWidget,
    }),
  ),
)
const LazySupplierPaymentPolicyWidget = lazyWidget<SupplierPaymentPolicyWidgetProps>(() =>
  import("./supplier-payment-policy-widget.js").then(
    (module): { default: ComponentType<SupplierPaymentPolicyWidgetProps> } => ({
      default: module.SupplierPaymentPolicyWidget,
    }),
  ),
)
const LazyBookingPaymentController = lazyWidget<BookingDetailPaymentControllerSlotContext>(() =>
  import("./booking-payment-controller.js").then((module) => ({
    default: module.BookingPaymentController,
  })),
)

/**
 * Semantic destinations the finance admin surfaces navigate to
 * (packaged-admin RFC §4.7). Keys shared with other domains
 * (`invoice.detail`, `booking.detail`, `person.detail`,
 * `organization.detail`, `payment.detail`) come from the bookings-ui
 * augmentation bound above; declared here are the finance-owned list
 * targets plus `supplier.detail`, re-declared shape-locked — also declared
 * by `@voyant-travel/catalog-react/admin`, and interface merging requires the
 * member shape to stay identical across packages.
 */
declare module "@voyant-travel/admin" {
  interface AdminDestinations {
    /** The invoices list page (the finance area's landing surface). */
    "invoice.list": Record<string, never>
    /** The payments list page. */
    "payment.list": Record<string, never>
    /** A supplier's detail page. */
    "supplier.detail": { supplierId: string }
    /** The supplier-invoices (accounts payable) list page. */
    "supplierInvoice.list": Record<string, never>
    /** A supplier invoice's detail page. */
    "supplierInvoice.detail": { supplierInvoiceId: string }
    /**
     * The departure/product profitability report. Declared here because this
     * package owns the route, and also declared by
     * `@voyant-travel/operations-react` — the departure workspace links out to
     * it rather than recomputing revenue.
     */
    "financeProfitability.report": Record<string, never>
  }
}

// Packaged admin hosts (packaged-admin RFC Phase 3): the operator-grade
// finance pages bound to their data wiring + semantic-destination
// navigation. Host route files only bind route params onto these.
// Endgame rule (packaged-admin RFC §4.8): this barrel re-exports NO page,
// host, dialog or widget component values — it is evaluated with the
// workspace chrome, so a static re-export would pin the heavy finance
// modules into the entry chunk. Consumers import them from their specific
// modules; only their TYPES re-export here, plus the lean skeletons.
export type { BookingInvoicesWidgetProps } from "./booking-invoices-widget.js"
export type { BookingPaymentPolicyWidgetProps } from "./booking-payment-policy-widget.js"
export type { BookingPendingPaymentSessionsWidgetProps } from "./booking-pending-payment-sessions-widget.js"
export type { CreditNoteDialogProps } from "./credit-note-dialog.js"
export type { InvoiceDetailHostProps } from "./invoice-detail-host.js"
export { InvoiceDetailSkeleton } from "./invoice-detail-skeleton.js"
export type { LineItemDialogProps } from "./line-item-dialog.js"
export type { PaymentDetailHostProps } from "./payment-detail-host.js"
export { PaymentDetailSkeleton } from "./payment-detail-skeleton.js"
export type { PaymentDialogProps } from "./payment-dialog.js"
export type { RecordPaymentDialogProps } from "./record-payment-dialog.js"
export type { SupplierPaymentPolicyWidgetProps } from "./supplier-payment-policy-widget.js"
export type { SupplierPicker } from "./use-supplier-picker.js"

export interface CreateFinanceAdminExtensionOptions {
  /** Mount path of the finance pages inside the admin workspace. Default `/finance`. */
  basePath?: string
  /** Localized page titles. Defaults are the English operator nav labels. */
  labels?: {
    invoices?: string
    invoiceNumberSeries?: string
    payments?: string
    supplierInvoices?: string
    profitability?: string
  }
}

/**
 * The finance admin contribution (packaged-admin RFC Phase 3,
 * `@voyant-travel/<domain>-ui/admin` convention).
 *
 * NAVIGATION: the general-purpose factory remains neutral. The graph-selected
 * factory below adds the standard operator Finance group.
 *
 * ROUTES: all eight contributions carry the FULL route implementation
 * (packaged-admin RFC §4.8 endgame) — a lazy `page` module loader, a data
 * loader fed by the host runtime (`baseUrl` + cookie-forwarding fetcher),
 * `ssr: "data-only"`, and the pending skeleton where the operator route had
 * one — so the host needs no per-route files for them. Pages stay
 * code-split: this factory never references a page component statically;
 * each `page:` dynamically imports its specific module (never a barrel), and
 * param-taking pages read the matched `$id` off `AdminRoutePageProps` and
 * bind it onto {@link InvoiceDetailHost} / {@link PaymentDetailHost}.
 * Cross-route links resolve through the semantic destinations declared
 * above. The supplier-invoices pages carry their previously app-owned wiring
 * package-side now: attachment uploads post to the starter-level
 * `/v1/admin/uploads` route through the shared finance provider context (the
 * `BookingInvoicesWidget` precedent), inline supplier creation rides the
 * suppliers package's `useSupplierMutation`, and the allocation dialog's
 * cross-domain target search composes the bookings / products /
 * availability packages' query options through the same context client.
 *
 * WIDGETS: the cycle-resolution piece (RFC §4.7). The booking detail page
 * needs the finance-owned invoices card, but this package peer-depends on
 * `@voyant-travel/bookings-react/ui`, so the bookings host cannot import it. Instead
 * this extension contributes {@link BookingInvoicesWidget} on the
 * `booking.details.invoices-tab` slot the bookings host exposes; the host
 * mounts its Invoices tab whenever a contribution targets that slot and
 * hands the widget its typed slot context as props. The Finance tab's
 * payment-links card ({@link BookingPendingPaymentSessionsWidget}) and
 * payment-policy override card ({@link BookingPaymentPolicyWidget}) travel
 * the same way on `booking.details.finance-start` / `…finance-end`. The
 * same pattern resolves the finance-ui ↔ suppliers-ui cycle: the supplier detail page's
 * customer-payment-policy card ships as {@link SupplierPaymentPolicyWidget}
 * on the `supplier.details.payment-policy` slot the supplier host exposes.
 */
export function createFinanceAdminExtension(
  options: CreateFinanceAdminExtensionOptions = {},
): AdminExtension {
  const { basePath = "/finance", labels = {} } = options
  const {
    invoices = "Invoices",
    invoiceNumberSeries = "Number Series",
    payments = "Payments",
    supplierInvoices = "Supplier invoices",
    profitability = "Profitability",
  } = labels

  return defineAdminExtension({
    id: "finance",
    routes: [
      {
        // Index redirect (formerly the host's `finance/index.tsx` file
        // route): `/finance` lands on the invoices page.
        id: "finance-index",
        path: basePath,
        title: invoices,
        redirectTo: `${basePath}/invoices`,
      },
      {
        id: "finance-invoices-index",
        path: `${basePath}/invoices`,
        title: invoices,
        // Route-backed destination (RFC §4.7 endgame): the key resolves by
        // pure path interpolation of this route, so the host's resolver is
        // generated (`voyant admin generate --destinations`).
        destination: "invoice.list",
        ssr: "data-only",
        page: () => import("./pages/invoices-index.js"),
        // Dynamic import on purpose: the query options pull the finance
        // data layer (client + response schemas), and a static import here
        // would pin it into the workspace-chrome chunk that evaluates this
        // factory.
        loader: async ({ queryClient, runtime }: AdminRouteLoaderContext) => {
          const { getInvoicesQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(getInvoicesQueryOptions(runtimeClient(runtime)))
        },
        pendingComponent: InvoicesPageSkeleton,
      },
      {
        id: "finance-invoices-detail",
        path: `${basePath}/invoices/$id`,
        title: invoices,
        // Key declared by @voyant-travel/bookings-react/admin (bound above).
        destination: "invoice.detail",
        destinationParams: { id: "invoiceId" },
        ssr: "data-only",
        page: () => import("./pages/invoice-detail.js"),
        loader: async ({ queryClient, runtime, params }: AdminRouteLoaderContext) => {
          const id = params.id
          if (!id) return
          // Dynamic import on purpose — see the invoices index loader above.
          const {
            getInvoiceCreditNotesQueryOptions,
            getInvoiceLineItemsQueryOptions,
            getInvoiceNotesQueryOptions,
            getInvoicePaymentsQueryOptions,
            getInvoiceQueryOptions,
          } = await import("../query-options.js")
          const client = runtimeClient(runtime)

          await queryClient.ensureQueryData(getInvoiceQueryOptions(client, id))

          void queryClient.prefetchQuery(getInvoiceLineItemsQueryOptions(client, id))
          void queryClient.prefetchQuery(getInvoicePaymentsQueryOptions(client, id))
          void queryClient.prefetchQuery(getInvoiceCreditNotesQueryOptions(client, id))
          void queryClient.prefetchQuery(getInvoiceNotesQueryOptions(client, id))
        },
        pendingComponent: InvoiceDetailSkeleton,
      },
      {
        id: "finance-invoice-number-series",
        path: `${basePath}/invoice-number-series`,
        title: invoiceNumberSeries,
        ssr: "data-only",
        // `InvoiceNumberSeriesPage` takes an all-optional props bag, which
        // TypeScript's weak-type rule rejects as a route page component
        // despite being safe to mount — hence `adminRoutePageModule`.
        page: () =>
          import("../components/invoice-number-series-page.js").then((module) =>
            adminRoutePageModule(module.InvoiceNumberSeriesPage),
          ),
        // Dynamic import on purpose — see the invoices index loader above.
        loader: async ({ queryClient, runtime }: AdminRouteLoaderContext) => {
          const { getInvoiceNumberSeriesQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(
            getInvoiceNumberSeriesQueryOptions(runtimeClient(runtime), {
              limit: 100,
              offset: 0,
            }),
          )
        },
      },
      {
        id: "finance-payments-index",
        path: `${basePath}/payments`,
        title: payments,
        destination: "payment.list",
        ssr: "data-only",
        page: () => import("./pages/payments-index.js"),
        // Dynamic import on purpose — see the invoices index loader above.
        loader: async ({ queryClient, runtime }: AdminRouteLoaderContext) => {
          const { getAllPaymentsQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(getAllPaymentsQueryOptions(runtimeClient(runtime)))
        },
        pendingComponent: PaymentsPageSkeleton,
      },
      {
        id: "finance-payments-detail",
        path: `${basePath}/payments/$id`,
        title: payments,
        // Key declared by @voyant-travel/bookings-react/admin (bound above).
        destination: "payment.detail",
        destinationParams: { id: "paymentId" },
        ssr: "data-only",
        page: () => import("./pages/payment-detail.js"),
        loader: async ({ queryClient, runtime, params }: AdminRouteLoaderContext) => {
          const id = params.id
          if (!id) return
          // Dynamic import on purpose — see the invoices index loader above.
          const { getPaymentQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(getPaymentQueryOptions(runtimeClient(runtime), id))
        },
        pendingComponent: PaymentDetailSkeleton,
      },
      {
        id: "finance-supplier-invoices-index",
        path: `${basePath}/supplier-invoices`,
        title: supplierInvoices,
        destination: "supplierInvoice.list",
        ssr: "data-only",
        page: () => import("./pages/supplier-invoices-index.js"),
        // Dynamic import on purpose — see the invoices index loader above.
        loader: async ({ queryClient, runtime }: AdminRouteLoaderContext) => {
          const { getSupplierInvoicesQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(
            getSupplierInvoicesQueryOptions(runtimeClient(runtime)),
          )
        },
      },
      {
        id: "finance-supplier-invoices-detail",
        path: `${basePath}/supplier-invoices/$id`,
        title: supplierInvoices,
        destination: "supplierInvoice.detail",
        destinationParams: { id: "supplierInvoiceId" },
        ssr: "data-only",
        page: () => import("./pages/supplier-invoice-detail.js"),
        loader: async ({ queryClient, runtime, params }: AdminRouteLoaderContext) => {
          const id = params.id
          if (!id) return
          // Dynamic import on purpose — see the invoices index loader above.
          const { getSupplierInvoiceQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(
            getSupplierInvoiceQueryOptions(runtimeClient(runtime), id),
          )
        },
      },
      {
        id: "finance-profitability",
        path: `${basePath}/profitability`,
        title: profitability,
        // Route-backed destination (RFC §4.7): the key resolves by pure path
        // interpolation of this route, so the host's resolver is generated.
        destination: "financeProfitability.report",
        ssr: "data-only",
        page: () => import("./pages/profitability.js"),
        // Dynamic import on purpose — see the invoices index loader above.
        loader: async ({ queryClient, runtime }: AdminRouteLoaderContext) => {
          const { getDepartureProfitabilityQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(
            getDepartureProfitabilityQueryOptions(runtimeClient(runtime)),
          )
        },
      },
    ],
    widgets: [
      {
        id: "finance-booking-payment-controller",
        slot: bookingDetailPaymentControllerSlot,
        component: LazyBookingPaymentController,
      } satisfies AdminWidgetContribution<BookingDetailPaymentControllerSlotContext>,
      {
        id: "finance-booking-invoices",
        slot: bookingDetailInvoicesTabSlot,
        // The widget registry is untyped (`Record<string, unknown>` props);
        // the typed contract is `BookingDetailHostSlotContext`, which the
        // bookings host passes verbatim to this slot's widgets.
        component: LazyBookingInvoicesWidget,
      } satisfies AdminWidgetContribution<BookingInvoicesWidgetProps>,
      {
        id: "finance-booking-pending-payment-sessions",
        slot: bookingDetailFinanceStartSlot,
        // Same untyped-registry cast; the typed contract is
        // `BookingDetailHostSlotContext`, which the bookings host passes
        // verbatim to this slot's widgets.
        component: LazyBookingPendingPaymentSessionsWidget,
      } satisfies AdminWidgetContribution<BookingPendingPaymentSessionsWidgetProps>,
      {
        id: "finance-booking-payment-policy",
        slot: bookingDetailFinanceEndSlot,
        // Same untyped-registry cast; the typed contract is
        // `BookingDetailHostSlotContext`.
        component: LazyBookingPaymentPolicyWidget,
      } satisfies AdminWidgetContribution<BookingPaymentPolicyWidgetProps>,
      {
        id: "finance-supplier-payment-policy",
        slot: supplierDetailPaymentPolicySlot,
        // Same untyped-registry cast; the typed contract is
        // `SupplierDetailHostSlotContext`, which the supplier detail host
        // passes verbatim to this slot's widgets.
        component: LazySupplierPaymentPolicyWidget,
      } satisfies AdminWidgetContribution<SupplierPaymentPolicyWidgetProps>,
    ],
  })
}

export function createSelectedFinanceAdminExtension({
  navMessages,
}: SelectedAdminExtensionFactoryContext): AdminExtension {
  const labels = {
    finance: navMessages.finance ?? "Finance",
    invoices: navMessages.invoices ?? "Invoices",
    invoiceNumberSeries: navMessages.invoiceNumberSeries ?? "Invoice number series",
    payments: navMessages.payments ?? "Payments",
    supplierInvoices: navMessages.supplierInvoices ?? "Supplier invoices",
    profitability: navMessages.profitability ?? "Profitability",
  }
  const extension = withAdminRouteMessagesProvider(
    createFinanceAdminExtension({
      labels,
    }),
    () =>
      import("../i18n/index.js").then((module) => ({
        default: module.FinanceUiMessagesProvider,
      })),
  )

  return {
    ...extension,
    setupSteps: [
      {
        id: "@voyant-travel/finance#setup.fiscal-settings",
        order: 40,
        skippable: true,
        href: "/settings/taxes",
        messages: financeFiscalSetupMessageDefinitions,
        isComplete: hasFiscalSettings,
      },
    ],
    navigation: [
      {
        order: -50,
        items: [
          {
            id: "finance",
            title: labels.finance,
            url: "/finance/invoices",
            icon: DollarSign,
            items: [
              { id: "invoices", title: labels.invoices, url: "/finance/invoices" },
              {
                id: "invoice-number-series",
                title: labels.invoiceNumberSeries,
                url: "/finance/invoice-number-series",
              },
              { id: "payments", title: labels.payments, url: "/finance/payments" },
              {
                id: "supplier-invoices",
                title: labels.supplierInvoices,
                url: "/finance/supplier-invoices",
              },
              {
                id: "profitability",
                title: labels.profitability,
                url: "/finance/profitability",
              },
            ],
          },
        ],
      },
    ],
  }
}

async function hasFiscalSettings({ runtime }: AdminRouteLoaderContext): Promise<boolean> {
  const response = await (runtime.fetcher ?? fetch)(
    `${runtime.baseUrl}/v1/admin/finance/tax-classes?limit=1`,
  )
  if (!response.ok) return false
  const payload = (await response.json()) as { data?: unknown[]; total?: number }
  return (payload.total ?? payload.data?.length ?? 0) > 0
}
