import {
  type AdminExtension,
  type AdminRouteLoaderContext,
  type AdminRouteRuntime,
  adminRoutePageModule,
  defineAdminExtension,
  type SelectedAdminExtensionFactoryContext,
  withAdminRouteMessagesProvider,
} from "@voyant-travel/admin"
import { Building, ClipboardList, Users } from "lucide-react"

// Lean statics only: the client module (fetcher) and the skeletons. Query
// options resolve via dynamic import inside the loaders so the data layer
// (client + response schemas) stays out of the workspace-chrome chunk that
// evaluates this factory.
import { defaultFetcher } from "../client.js"
import { InquiryDetailSkeleton, InquiryQueueSkeleton } from "./inquiry-skeletons.js"
import { OrganizationDetailSkeleton } from "./organization-detail-skeleton.js"
import { OrganizationsListSkeleton } from "./organizations-list-skeleton.js"
import { PeopleListSkeleton } from "./people-list-skeleton.js"
import { PersonDetailSkeleton } from "./person-detail-skeleton.js"

/**
 * Semantic destinations the Relationships admin surfaces navigate to (packaged-admin
 * RFC §4.7). The people/organization pages link into routes they do not own,
 * so they resolve these keys through `useAdminHref`/`useAdminNavigate` from
 * `@voyant-travel/admin`; hosts register one resolver per key
 * (`satisfies AdminDestinationResolvers`).
 *
 * `person.detail` and `organization.detail` are ALSO declared by
 * `@voyant-travel/bookings-react/admin` (its pages were their first consumers).
 * This package cannot peer-depend on bookings-ui — bookings-ui depends on
 * crm-ui — so the keys are re-declared here shape-locked: interface merging
 * requires the member shape to stay identical across packages.
 */
declare module "@voyant-travel/admin" {
  interface AdminDestinations {
    /** The Relationships people list page. */
    "person.list": Record<string, never>
    /** A Relationships person's detail page. */
    "person.detail": { personId: string }
    /** The Relationships organizations list page. */
    "organization.list": Record<string, never>
    /** A Relationships organization's detail page. */
    "organization.detail": { organizationId: string }
    "inquiry.list": Record<string, never>
    "inquiry.detail": { inquiryId: string }
  }
}

export { InquiryDetailSkeleton, InquiryQueueSkeleton } from "./inquiry-skeletons.js"
// Packaged admin hosts (packaged-admin RFC Phase 3): the Relationships pages bound to
// their data wiring + semantic-destination navigation. Host route files only
// bind route params onto these.
//
// Endgame rule (packaged-admin RFC §4.8): this barrel re-exports NO page
// or host component values — it is evaluated with the workspace chrome, so
// a static host re-export would pin the heavy page modules into the entry
// chunk. Hosts import from their specific modules; only their TYPES
// re-export here, plus the lean slot id and skeletons.
export type { OrganizationDetailHostProps } from "./organization-detail-host.js"
export { OrganizationDetailSkeleton } from "./organization-detail-skeleton.js"
export { OrganizationsListSkeleton } from "./organizations-list-skeleton.js"
export { PeopleListSkeleton } from "./people-list-skeleton.js"
export type { PersonDetailHostProps } from "./person-detail-host.js"
export { PersonDetailSkeleton } from "./person-detail-skeleton.js"
export { type PersonDetailBookingsTabContext, personDetailBookingsTabSlot } from "./slots.js"

export interface CreateRelationshipsAdminExtensionOptions {
  /** Mount path of the people pages inside the admin workspace. Default `/people`. */
  peopleBasePath?: string
  /** Mount path of the organization pages inside the admin workspace. Default `/organizations`. */
  organizationsBasePath?: string
  /** Mount path of the inquiry pages. Default `/inquiries`. */
  inquiriesBasePath?: string
  /** Localized page titles. Defaults are the English operator nav labels. */
  labels?: {
    people?: string
    organizations?: string
    inquiries?: string
  }
}

/**
 * The Relationships admin contribution (packaged-admin RFC Phase 3,
 * `@voyant-travel/<domain>-ui/admin` convention).
 *
 * NAVIGATION: the general-purpose factory remains neutral. The graph-selected
 * factory below adds the standard operator People and Organizations items.
 *
 * ROUTES: contributions carry the FULL route implementation (packaged-admin
 * RFC §4.2/§4.8) — lazy `page` module loaders, data loaders fed by the
 * host-supplied {@link AdminRouteLoaderContext} (QueryClient + runtime +
 * params), per-route SSR mode, and pending skeletons. Hosts bind them into
 * their code-assembled admin route tree; no per-route host files needed.
 * The pages stay code-split because each contribution's `page` dynamically
 * imports the specific host/page module — never the admin barrel — so the
 * heavy page chunks load on navigation, not with workspace chrome. The
 * detail pages read the route id from {@link AdminRoutePageProps} via the
 * default-exported wrappers in `./pages/`. The lists carry no URL search
 * state (filtering/paging is in-memory component state), so no
 * `validateSearch` contracts.
 *
 * WIDGET SLOTS: the person detail page exposes
 * {@link personDetailBookingsTabSlot} — the bookings-ui ↔ crm-ui cycle
 * resolution (RFC §4.7). `@voyant-travel/bookings-react/ui` depends on this package, so
 * the person page cannot import the bookings-owned person-bookings card;
 * instead bookings-ui's admin extension contributes a widget targeting that
 * slot and {@link PersonDetailHost} mounts its Bookings tab whenever a
 * contribution exists.
 */
export function createRelationshipsAdminExtension(
  options: CreateRelationshipsAdminExtensionOptions = {},
): AdminExtension {
  const {
    peopleBasePath = "/people",
    organizationsBasePath = "/organizations",
    inquiriesBasePath = "/inquiries",
    labels = {},
  } = options
  const { people = "People", organizations = "Organizations", inquiries = "Inquiries" } = labels

  return defineAdminExtension({
    id: "relationships",
    routes: [
      {
        id: "relationships-inquiries-index",
        path: inquiriesBasePath,
        title: inquiries,
        destination: "inquiry.list",
        ssr: "data-only",
        page: () =>
          import("./inquiry-queue-host.js").then((module) =>
            adminRoutePageModule(module.InquiryQueueHost),
          ),
        loader: async ({ queryClient, runtime }: AdminRouteLoaderContext) => {
          const { getInquiriesQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(
            getInquiriesQueryOptions(loaderClient(runtime), {
              view: "actionable",
              limit: 50,
            }),
          )
        },
        pendingComponent: InquiryQueueSkeleton,
      },
      {
        id: "relationships-inquiries-detail",
        path: `${inquiriesBasePath}/$id`,
        title: inquiries,
        destination: "inquiry.detail",
        destinationParams: { id: "inquiryId" },
        page: () => import("./pages/inquiry-detail-page.js"),
        loader: async ({ queryClient, runtime, params }: AdminRouteLoaderContext) => {
          if (!params.id) return
          const { getInquiryQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(
            getInquiryQueryOptions(loaderClient(runtime), params.id),
          )
        },
        pendingComponent: InquiryDetailSkeleton,
      },
      {
        id: "relationships-people-index",
        path: peopleBasePath,
        title: people,
        // Route-backed destination (RFC §4.7 endgame): the key resolves by
        // pure path interpolation of this route, so the host's resolver is
        // generated (`voyant admin generate --destinations`).
        destination: "person.list",
        ssr: "data-only",
        page: () =>
          import("./people-host.js").then((module) => adminRoutePageModule(module.PeopleHost)),
        // Dynamic import on purpose: the query options pull the Relationships data
        // layer (client + response schemas), and a static import here would
        // pin it into the workspace-chrome chunk that evaluates this factory.
        loader: async ({ queryClient, runtime }: AdminRouteLoaderContext) => {
          const { getPeopleQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(
            getPeopleQueryOptions(loaderClient(runtime), { limit: 25, offset: 0 }),
          )
        },
        pendingComponent: PeopleListSkeleton,
      },
      {
        id: "relationships-people-detail",
        path: `${peopleBasePath}/$id`,
        title: people,
        destination: "person.detail",
        destinationParams: { id: "personId" },
        page: () => import("./pages/person-detail-page.js"),
        loader: async ({ queryClient, runtime, params }: AdminRouteLoaderContext) => {
          const id = params.id
          if (!id) return
          // Dynamic import on purpose — see the people index loader above.
          const { getOrganizationQueryOptions, getPersonQueryOptions } = await import(
            "../query-options.js"
          )
          const client = loaderClient(runtime)
          const person = await queryClient.ensureQueryData(getPersonQueryOptions(client, id))

          if (person.organizationId) {
            await queryClient.ensureQueryData(
              getOrganizationQueryOptions(client, person.organizationId),
            )
          }
        },
        pendingComponent: PersonDetailSkeleton,
      },
      {
        id: "relationships-organizations-index",
        path: organizationsBasePath,
        title: organizations,
        destination: "organization.list",
        ssr: "data-only",
        page: () =>
          import("./organizations-host.js").then((module) =>
            adminRoutePageModule(module.OrganizationsHost),
          ),
        // Dynamic import on purpose — see the people index loader above.
        loader: async ({ queryClient, runtime }: AdminRouteLoaderContext) => {
          const { getOrganizationsQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(
            getOrganizationsQueryOptions(loaderClient(runtime), { limit: 25, offset: 0 }),
          )
        },
        pendingComponent: OrganizationsListSkeleton,
      },
      {
        id: "relationships-organizations-detail",
        path: `${organizationsBasePath}/$id`,
        title: organizations,
        destination: "organization.detail",
        destinationParams: { id: "organizationId" },
        page: () => import("./pages/organization-detail-page.js"),
        loader: async ({ queryClient, runtime, params }: AdminRouteLoaderContext) => {
          const id = params.id
          if (!id) return
          // Dynamic import on purpose — see the people index loader above.
          const { getActivitiesQueryOptions, getOrganizationQueryOptions, getPeopleQueryOptions } =
            await import("../query-options.js")
          const client = loaderClient(runtime)

          await Promise.all([
            queryClient.ensureQueryData(getOrganizationQueryOptions(client, id)),
            queryClient.ensureQueryData(
              getPeopleQueryOptions(client, { organizationId: id, limit: 50 }),
            ),
            queryClient.ensureQueryData(
              getActivitiesQueryOptions(client, {
                entityType: "organization",
                entityId: id,
                limit: 50,
              }),
            ),
          ])
        },
        pendingComponent: OrganizationDetailSkeleton,
      },
    ],
  })
}

/**
 * Bridge the host-supplied {@link AdminRouteRuntime} (optional fetcher) to
 * the required-fetcher client contract the Relationships query options take.
 */
function loaderClient(runtime: AdminRouteRuntime) {
  return { baseUrl: runtime.baseUrl, fetcher: runtime.fetcher ?? defaultFetcher }
}

const relationshipsRouteMessagesProvider = () =>
  import("../i18n/index.js").then((module) => ({ default: module.CrmUiMessagesProvider }))

export function createSelectedRelationshipsAdminExtension({
  navMessages,
}: SelectedAdminExtensionFactoryContext): AdminExtension {
  const peopleLabel = navMessages.people ?? "People"
  const organizationsLabel = navMessages.organizations ?? "Organizations"
  const inquiriesLabel = navMessages.inquiries ?? "Inquiries"
  const extension = withAdminRouteMessagesProvider(
    createRelationshipsAdminExtension({
      labels: {
        people: peopleLabel,
        organizations: organizationsLabel,
        inquiries: inquiriesLabel,
      },
    }),
    relationshipsRouteMessagesProvider,
  )

  return {
    ...extension,
    navigation: [
      {
        order: -70,
        items: [
          { id: "inquiries", title: inquiriesLabel, url: "/inquiries", icon: ClipboardList },
          { id: "people", title: peopleLabel, url: "/people", icon: Users },
          {
            id: "organizations",
            title: organizationsLabel,
            url: "/organizations",
            icon: Building,
          },
        ],
      },
    ],
  }
}
