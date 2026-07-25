// agent-quality: file-size exception -- owner: bookings-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
import {
  type AdminExtension,
  type AdminRouteLoaderContext,
  type AdminRoutePageProps,
  type AdminRouteRuntime,
  type AdminWidgetContribution,
  defineAdminExtension,
  type SelectedAdminExtensionFactoryContext,
  withAdminRouteMessagesProvider,
} from "@voyant-travel/admin"
// Importing the slot id also binds the crm-ui `AdminDestinations`
// augmentation (`person.list`, `organization.list`, ...) into this program;
// this package already peer-depends on `@voyant-travel/relationships-react/ui`.
import { personDetailBookingsTabSlot } from "@voyant-travel/relationships-react/admin"
import { CalendarCheck } from "lucide-react"
import * as React from "react"
import { z } from "zod"
// Lean statics only: the client module (fetcher), query-key types, and the
// skeletons. Query options and page data helpers resolve via dynamic import
// inside the loaders so the data layer (clients + response schemas) stays
// out of the workspace-chrome chunk that evaluates this factory.
import { BOOKING_STATUS_ALL } from "../booking-list-constants.js"
import { defaultFetcher } from "../client.js"
import type { BookingDetailTabValue } from "../components/booking-detail-page.js"
import type { BookingListFiltersState } from "../components/booking-list.js"
import type { BookingsListSortDir, BookingsListSortField } from "../query-keys.js"
import { BookingDetailSkeleton } from "./booking-detail-skeleton.js"
import { BookingsListSkeleton } from "./bookings-list-skeleton.js"
import type { PersonBookingsWidgetProps } from "./person-bookings-widget.js"

/**
 * Semantic destinations the bookings admin surfaces navigate to
 * (packaged-admin RFC §4.7). The booking pages link into routes they do not
 * own — the CRM person/organization pages, the product editor, the finance
 * payment/invoice pages — so instead of importing a host route tree they
 * resolve these keys through `useAdminHref`/`useAdminNavigate` from
 * `@voyant-travel/admin`. Hosts register one resolver per key
 * (`satisfies AdminDestinationResolvers`).
 *
 * `booking.detail`/`booking.list` are declared here even
 * though bookings pages are their first consumers: other domains' packaged
 * pages navigate TO bookings through the same keys.
 */
declare module "@voyant-travel/admin" {
  interface AdminDestinations {
    /** The bookings list page. */
    "booking.list": Record<string, never>
    /** A booking's detail page; `tab` deep-links a specific tab. */
    "booking.detail": { bookingId: string; tab?: BookingDetailTabValue }
    /** A CRM person's detail page. */
    "person.detail": { personId: string }
    /** A CRM organization's detail page. */
    "organization.detail": { organizationId: string }
    /**
     * The owned-product editor/detail page. Also declared by
     * `@voyant-travel/catalog-react/admin` — interface merging requires the member
     * shape to stay identical across packages.
     */
    "product.detail": { productId: string }
    /** An availability slot's detail page. */
    "availabilitySlot.detail": { slotId: string }
    /**
     * The trips's "new trip" entry. Declared here because the
     * packaged `/bookings/compose` alias route forwards to it — the composer
     * pages themselves live in the trips area, whose admin entry
     * may also declare this key (interface merging requires the member shape
     * to stay identical across packages).
     */
    "trip.create": Record<string, never>
    /** A payment's detail page in the finance area. */
    "payment.detail": { paymentId: string }
    /** An invoice's full detail page in the finance area. */
    "invoice.detail": { invoiceId: string }
    /**
     * A legal contract's detail page. Also declared by
     * `@voyant-travel/legal-react/admin` — interface merging requires the member
     * shape to stay identical across packages. Declared here because the
     * booking Documents tab links contract rows to their detail page.
     */
    "contract.detail": { contractId: string }
  }
}

// Packaged admin hosts (packaged-admin RFC Phase 3): the bookings pages
// bound to their data wiring + semantic-destination navigation. Host route
// files only bind route params/search state onto these.
//
// Endgame rule (packaged-admin RFC §4.8): this barrel re-exports NO page
// or host component values — it is evaluated with the workspace chrome, so
// a static host re-export would pin the heavy page modules into the entry
// chunk. Hosts/dialogs/widgets import from their specific modules
// (`@voyant-travel/bookings-react/admin/booking-detail-host`, ...); only their
// TYPES re-export here, plus the lean slot ids and skeletons.
export type {
  BookingDetailHostProps,
  BookingDetailHostSlot,
  BookingDetailHostSlotContext,
  BookingDetailHostSlots,
  BookingDetailPaymentActions,
  BookingDetailPaymentControllerSlotContext,
} from "./booking-detail-host.js"
export { BookingDetailSkeleton } from "./booking-detail-skeleton.js"
export type { BookingDocumentsTableProps } from "./booking-documents-table.js"
export type { BookingInvoiceSheetProps } from "./booking-invoice-sheet.js"
export type { BookingsHostProps } from "./bookings-host.js"
export { BookingsListSkeleton } from "./bookings-list-skeleton.js"
export type { PersonBookingsWidgetProps } from "./person-bookings-widget.js"
export {
  bookingDetailFinanceEndSlot,
  bookingDetailFinanceStartSlot,
  bookingDetailInvoicesTabSlot,
  bookingDetailPaymentControllerSlot,
  bookingsListHeaderActionsSlot,
} from "./slots.js"

const bookingsListSortBySchema = z.enum([
  "bookingNumber",
  "status",
  "sellAmount",
  "pax",
  "startDate",
  "endDate",
  "createdAt",
]) satisfies z.ZodType<BookingsListSortField>
const bookingsListSortDirSchema = z.enum(["asc", "desc"]) satisfies z.ZodType<BookingsListSortDir>

/**
 * Search contract for the bookings list page: the URL projection of
 * `BookingListFiltersState` (filters, sort, paging). Package-owned so the
 * route file, the host, and the extension contribution validate the same
 * shape. Defaults are absent from the URL — see
 * {@link bookingsFiltersToSearch}.
 */
export const bookingsIndexSearchSchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  productId: z.string().optional(),
  optionId: z.string().optional(),
  supplierId: z.string().optional(),
  productCategoryId: z.string().optional(),
  personId: z.string().optional(),
  organizationId: z.string().optional(),
  availabilitySlotId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  paxMin: z.string().optional(),
  paxMax: z.string().optional(),
  sortBy: bookingsListSortBySchema.optional(),
  sortDir: bookingsListSortDirSchema.optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

export type BookingsIndexSearchParams = z.infer<typeof bookingsIndexSearchSchema>

/** URL search params → `BookingList` initial state. Empty / `"all"` /
 * default values are absent in the URL; we let `BookingList`'s defaults
 * fill them in. */
export function bookingsSearchToFilters(
  search: BookingsIndexSearchParams,
): Partial<BookingListFiltersState> {
  return {
    search: search.search,
    status: search.status,
    productId: search.productId ?? null,
    optionId: search.optionId ?? null,
    supplierId: search.supplierId ?? null,
    productCategoryId: search.productCategoryId ?? null,
    personId: search.personId ?? null,
    organizationId: search.organizationId ?? null,
    availabilitySlotId: search.availabilitySlotId ?? null,
    dateFrom: search.dateFrom ?? null,
    dateTo: search.dateTo ?? null,
    paxMin: search.paxMin,
    paxMax: search.paxMax,
    sortBy: search.sortBy,
    sortDir: search.sortDir,
    offset: search.offset,
  }
}

/** Project the filter snapshot back into URL search params, dropping
 * any value that matches the component's default so the URL stays
 * clean when the operator is viewing the unfiltered list. */
export function bookingsFiltersToSearch(
  filters: BookingListFiltersState,
): BookingsIndexSearchParams {
  return {
    search: filters.search || undefined,
    status:
      filters.status === BOOKING_STATUS_ALL || filters.status === "all"
        ? undefined
        : filters.status,
    productId: filters.productId ?? undefined,
    optionId: filters.optionId ?? undefined,
    supplierId: filters.supplierId ?? undefined,
    productCategoryId: filters.productCategoryId ?? undefined,
    personId: filters.personId ?? undefined,
    organizationId: filters.organizationId ?? undefined,
    availabilitySlotId: filters.availabilitySlotId ?? undefined,
    dateFrom: filters.dateFrom ?? undefined,
    dateTo: filters.dateTo ?? undefined,
    paxMin: filters.paxMin || undefined,
    paxMax: filters.paxMax || undefined,
    sortBy: filters.sortBy === "createdAt" ? undefined : filters.sortBy,
    sortDir: filters.sortDir === "desc" ? undefined : filters.sortDir,
    offset: filters.offset === 0 ? undefined : filters.offset,
  }
}

/** Tab values of the canonical `BookingDetailPage`, as a search-param schema. */
export const bookingDetailTabSchema = z.enum([
  "items",
  "travelers",
  "finance",
  "invoices",
  "documents",
  "suppliers",
  "activity",
  "metadata",
]) satisfies z.ZodType<BookingDetailTabValue>

/**
 * Search contract for the booking detail page.
 */
export const bookingDetailSearchSchema = z.object({
  tab: bookingDetailTabSchema.optional(),
})

export type BookingDetailSearchParams = z.infer<typeof bookingDetailSearchSchema>

/**
 * Props contract of the booking detail PAGE component the "bookings-detail"
 * contribution mounts — the route-state subset of `BookingDetailHostProps`.
 * The packaged default wraps {@link BookingDetailHost} with exactly these;
 * selected packages attach cross-domain behavior through stable widget slots.
 */
export interface BookingDetailPageComponentProps {
  id: string
  activeTab?: BookingDetailTabValue
  onTabChange?: (tab: BookingDetailTabValue) => void
}

export interface CreateBookingsAdminExtensionOptions {
  /** Mount path of the bookings pages inside the admin workspace. Default `/bookings`. */
  basePath?: string
  /** Localized page titles. Defaults are the English operator nav labels. */
  labels?: {
    bookings?: string
  }
}

/** Map the host-supplied route runtime onto the bookings data client shape. */
function loaderClient(runtime: AdminRouteRuntime) {
  return { baseUrl: runtime.baseUrl, fetcher: runtime.fetcher ?? defaultFetcher }
}

const LazyPersonBookingsWidget = React.lazy(() =>
  import("./person-bookings-widget.js").then((module) => ({
    default: module.PersonBookingsWidget,
  })),
)

/**
 * Suspense-wrapped lazy mount of {@link LazyPersonBookingsWidget}. The widget
 * registry takes a sync component, but the card (and the booking-list stack
 * behind it) must not load with workspace chrome — the chunk fetches when the
 * CRM person page actually renders the Bookings tab.
 */
function PersonBookingsWidgetLoader(props: PersonBookingsWidgetProps) {
  return (
    <React.Suspense fallback={null}>
      <LazyPersonBookingsWidget {...props} />
    </React.Suspense>
  )
}

/**
 * The bookings admin contribution (packaged-admin RFC Phase 3,
 * `@voyant-travel/<domain>-ui/admin` convention).
 *
 * NAVIGATION: the general-purpose factory remains neutral. The graph-selected
 * factory below adds the standard operator Bookings item.
 *
 * ROUTES: full implementations (packaged-admin RFC §4.8) — the package-owned
 * search contracts ({@link bookingsIndexSearchSchema} for the list,
 * {@link bookingDetailSearchSchema} for the detail page), loaders that
 * prefetch through the host-supplied runtime, and lazy `page` modules. The
 * PAGES are package-owned too: {@link BookingsHost} and
 * {@link BookingDetailHost} bind the canonical bookings pages to their data
 * wiring (bookings/finance provider context) and resolve every cross-route
 * link through the semantic destinations declared above — no app RPC client,
 * no host route tree.
 *
 * `component:` stays unattached; each contribution carries a lazy `page`
 * loader instead. The host binder wraps it in the router's lazy-component
 * machinery (so the page lands in its own chunk) and hands the resolved
 * component its route state as `AdminRoutePageProps` — which is how the
 * param/search-taking bookings pages mount without a host route file. The
 * `page` thunks below dynamically import the SPECIFIC page modules, never
 * this barrel, so the factory itself never pins page code into the
 * workspace-chrome chunk.
 *
 * WIDGETS: the crm-ui ↔ bookings-ui cycle resolution (RFC §4.7). The CRM
 * person detail page mounts a Bookings tab, but this package depends on
 * `@voyant-travel/relationships-react/ui`, so crm-ui's host cannot import the bookings-owned
 * card. Instead this extension contributes {@link PersonBookingsWidget} on
 * the `person.details.bookings-tab` slot crm-ui's `PersonDetailHost`
 * exposes; the host mounts its Bookings tab whenever a contribution targets
 * that slot and hands the widget its typed slot context
 * (`PersonDetailBookingsTabContext`) as props.
 */
export function createBookingsAdminExtension(
  options: CreateBookingsAdminExtensionOptions = {},
): AdminExtension {
  const { basePath = "/bookings", labels = {} } = options
  const { bookings = "Bookings" } = labels

  return defineAdminExtension({
    id: "bookings",
    routes: [
      {
        id: "bookings-index",
        path: basePath,
        title: bookings,
        // Route-backed destination (RFC §4.7 endgame): the key resolves by
        // pure path interpolation of this route, so the host's resolver is
        // generated (`voyant admin generate --destinations`). `booking.detail`
        // is deliberately NOT bound: its resolver constructs the `tab` search
        // param, which is beyond path interpolation — it stays hand-written.
        destination: "booking.list",
        ssr: "data-only",
        validateSearch: (search) => bookingsIndexSearchSchema.parse(search),
        pendingComponent: BookingsListSkeleton,
        // Dynamic import on purpose: the query options pull the bookings
        // data layer (client + response schemas), and a static import here
        // would pin it into the workspace-chrome chunk that evaluates this
        // factory. The loader and the page resolve shared modules once.
        loader: async ({ queryClient, runtime }: AdminRouteLoaderContext) => {
          const { getBookingsQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(getBookingsQueryOptions(loaderClient(runtime)))
        },
        page: () => import("./pages/bookings-index-page.js"),
      },
      {
        id: "bookings-detail",
        path: `${basePath}/$id`,
        title: bookings,
        ssr: "data-only",
        validateSearch: (search) => bookingDetailSearchSchema.parse(search),
        pendingComponent: BookingDetailSkeleton,
        loader: async ({ queryClient, runtime, params }: AdminRouteLoaderContext) => {
          const id = params.id
          if (!id) return

          // Dynamic import on purpose — see the index loader above.
          const {
            getBookingActivityQueryOptions,
            getBookingNotesQueryOptions,
            getBookingQueryOptions,
            getSupplierStatusesQueryOptions,
            getTravelersQueryOptions,
          } = await import("../query-options.js")
          const client = loaderClient(runtime)

          // Critical: booking itself drives the header. Everything else
          // (travelers, supplier statuses, activity, notes) is per-section
          // and renders progressively.
          await queryClient.ensureQueryData(getBookingQueryOptions(client, id))

          void queryClient.prefetchQuery(getTravelersQueryOptions(client, id))
          void queryClient.prefetchQuery(getSupplierStatusesQueryOptions(client, id))
          void queryClient.prefetchQuery(getBookingActivityQueryOptions(client, id))
          void queryClient.prefetchQuery(getBookingNotesQueryOptions(client, id))
        },
        page: async () => {
          const module = await import("./pages/booking-detail-page.js")
          const Page = module.default
          return {
            default: ({ params, search, updateSearch }: AdminRoutePageProps) => (
              <Page
                id={params.id ?? ""}
                activeTab={(search as BookingDetailSearchParams).tab}
                onTabChange={(tab) => updateSearch((prev) => ({ ...prev, tab }), { replace: true })}
              />
            ),
          }
        },
      },
      {
        id: "bookings-compose",
        path: `${basePath}/compose`,
        title: bookings,
        // Alias route: forwards to the host's trips via the
        // `trip.create` destination (see the page module).
        page: () => import("./pages/booking-compose-page.js"),
      },
    ],
    widgets: [
      {
        id: "bookings-person-bookings",
        slot: personDetailBookingsTabSlot,
        component: PersonBookingsWidgetLoader,
      } satisfies AdminWidgetContribution<PersonBookingsWidgetProps>,
    ],
  })
}

export function createSelectedBookingsAdminExtension({
  navMessages,
}: SelectedAdminExtensionFactoryContext): AdminExtension {
  const bookingsLabel = navMessages.bookings ?? "Bookings"
  const extension = withAdminRouteMessagesProvider(
    createBookingsAdminExtension({ labels: { bookings: bookingsLabel } }),
    () =>
      import("../i18n/index.js").then((module) => ({
        default: module.BookingsUiMessagesProvider,
      })),
  )

  return {
    ...extension,
    navigation: [
      {
        order: -100,
        items: [
          {
            id: "bookings",
            title: bookingsLabel,
            url: "/bookings",
            icon: CalendarCheck,
          },
        ],
      },
    ],
  }
}
