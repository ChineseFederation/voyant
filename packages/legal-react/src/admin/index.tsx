import {
  type AdminExtension,
  type AdminRouteLoaderContext,
  type AdminRouteRuntime,
  adminRoutePageModule,
  defineAdminExtension,
  type SelectedAdminExtensionFactoryContext,
  withAdminRouteMessagesProvider,
} from "@voyant-travel/admin"
// Type-only: binds the bookings-ui `AdminDestinations` augmentation
// (`booking.detail`, `person.detail`, `organization.detail`, ...) into this
// program — the contract detail page's reference cells navigate through
// those shared keys, and `booking.detail`'s shape carries bookings-ui's own
// tab union, so re-declaring it here could not stay shape-identical.
import type {} from "@voyant-travel/bookings-react/admin"
import { Scale } from "lucide-react"

// Lean static only: the client module (fetcher + client contract type).
// Query options resolve via dynamic import inside the loaders so the legal
// data layer (client + response schemas) stays out of the workspace-chrome
// chunk that evaluates this factory.
import { defaultFetcher, type FetchWithValidationOptions } from "../client.js"

/**
 * Semantic destinations the legal admin surfaces navigate to
 * (packaged-admin RFC §4.7). Keys shared with other domains
 * (`person.detail`, `booking.detail`) come from the bookings-ui
 * augmentation bound above; declared here are the legal-owned targets the
 * packaged pages and breadcrumbs resolve through
 * `useAdminHref`/`useAdminNavigate`.
 */
declare module "@voyant-travel/admin" {
  interface AdminDestinations {
    /** The legal area's landing surface (redirects to contracts). */
    "legal.home": Record<string, never>
    /** The contracts list page. */
    "contract.list": Record<string, never>
    /** A contract's detail page. */
    "contract.detail": { contractId: string }
    /** The contract templates list page. */
    "contractTemplate.list": Record<string, never>
    /** A contract template's detail page. */
    "contractTemplate.detail": { templateId: string }
    /** The policies list page. */
    "policy.list": Record<string, never>
    /** A policy's detail page. */
    "policy.detail": { policyId: string }
  }
}

// Packaged admin hosts (packaged-admin RFC Phase 3): the operator-grade
// legal pages bound to their data wiring + semantic-destination navigation.
// Host route files only bind route params onto these.
//
// Endgame rule (packaged-admin RFC §4.8): this barrel re-exports NO page,
// host or dialog component values — it is evaluated with the workspace
// chrome, so a static re-export would pin the heavy legal modules into the
// entry chunk. Consumers import them from their specific modules; only
// their TYPES re-export here.
export type { ContractDetailHostProps } from "./contract-detail-host.js"
export type { ContractDialogProps } from "./contract-dialog.js"
export type { AssignmentData, PolicyAssignmentDialogProps } from "./policy-assignment-dialog.js"
export type { PolicyDetailHostProps } from "./policy-detail-host.js"
export type { TemplateDetailHostProps } from "./template-detail-host.js"

/**
 * Bind the host-supplied route runtime to the legal data-client shape the
 * query-option factories take. Hosts that don't inject a fetcher (no SSR
 * cookie forwarding) fall back to the package's `defaultFetcher`.
 */
function toLegalClient(runtime: AdminRouteRuntime): FetchWithValidationOptions {
  return { baseUrl: runtime.baseUrl, fetcher: runtime.fetcher ?? defaultFetcher }
}

export interface CreateLegalAdminExtensionOptions {
  /** Mount path of the legal pages inside the admin workspace. Default `/legal`. */
  basePath?: string
  /** Localized page titles. Defaults are the English operator nav labels. */
  labels?: {
    contracts?: string
    contractTemplates?: string
    policies?: string
    numberSeries?: string
  }
}

/**
 * The legal admin contribution (packaged-admin RFC Phase 3,
 * `@voyant-travel/<domain>-ui/admin` convention).
 *
 * NAVIGATION: the general-purpose factory remains neutral. The graph-selected
 * factory below adds the standard operator Legal group.
 *
 * ROUTES: full implementations (packaged-admin RFC §4.8 endgame) — each
 * contribution carries the lazy `page` module loader, the data loader and
 * the per-route SSR mode, so hosts bind them through their code-assembled
 * admin route tree with no per-route files. List pages
 * ({@link ContractsHost}, {@link TemplatesHost}, {@link PoliciesHost},
 * {@link NumberSeriesHost}) are zero-prop; the detail contributions resolve
 * wrapper pages (`./pages/*`) that bind the matched `$id` param onto
 * {@link ContractDetailHost}, {@link TemplateDetailHost} and
 * {@link PolicyDetailHost}. Pages stay code-split because every `page` is a
 * dynamic import of the specific host module, never a static reference from
 * this factory.
 *
 * WIDGETS: none today. The legal-owned `BookingContractCard` ships from the
 * package root, but no operator surface currently mounts it through a
 * widget slot — the booking detail page's documents/contract wiring is an
 * operator bookings-domain concern and stays with that host.
 */
export function createLegalAdminExtension(
  options: CreateLegalAdminExtensionOptions = {},
): AdminExtension {
  const { basePath = "/legal", labels = {} } = options
  const {
    contracts = "Contracts",
    contractTemplates = "Contract Templates",
    policies = "Policies",
    numberSeries = "Number Series",
  } = labels

  return defineAdminExtension({
    id: "legal",
    routes: [
      {
        // Index redirect (formerly the host's `legal/index.tsx` file
        // route): `/legal` lands on the contracts page. This is the route
        // behind the hand-written `legal.home` resolver — it stays
        // unannotated (no `destination:`) until the host's generated
        // destinations module is regenerated to claim it.
        id: "legal-index",
        path: basePath,
        title: contracts,
        redirectTo: `${basePath}/contracts`,
      },
      {
        id: "legal-contracts-index",
        path: `${basePath}/contracts`,
        title: contracts,
        // Route-backed destination (RFC §4.7 endgame): the key resolves by
        // pure path interpolation of this route, so the host's resolver is
        // generated (`voyant admin generate --destinations`). `legal.home`
        // stays hand-written — it targets the host's index redirect, not a
        // contributed route.
        destination: "contract.list",
        ssr: "data-only",
        page: () =>
          import("./contracts-host.js").then((module) =>
            adminRoutePageModule(module.ContractsHost),
          ),
        // Dynamic import on purpose: the query options pull the legal data
        // layer (client + response schemas), and a static import here would
        // pin it into the workspace-chrome chunk that evaluates this factory.
        loader: async ({ queryClient, runtime }: AdminRouteLoaderContext) => {
          const { getLegalContractsQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(
            getLegalContractsQueryOptions(toLegalClient(runtime), {
              search: "",
              scope: "all",
              status: "all",
              limit: 25,
              offset: 0,
            }),
          )
        },
      },
      {
        id: "legal-contracts-detail",
        path: `${basePath}/contracts/$id`,
        title: contracts,
        destination: "contract.detail",
        destinationParams: { id: "contractId" },
        ssr: "data-only",
        page: () => import("./pages/contract-detail-page.js"),
        loader: async ({ queryClient, runtime, params }: AdminRouteLoaderContext) => {
          const id = params.id
          if (!id) return
          // Dynamic import on purpose — see the contracts index loader above.
          const {
            getLegalContractAttachmentsQueryOptions,
            getLegalContractQueryOptions,
            getLegalContractSignaturesQueryOptions,
          } = await import("../query-options.js")
          const client = toLegalClient(runtime)

          await queryClient.ensureQueryData(getLegalContractQueryOptions(client, id))

          void queryClient.prefetchQuery(
            getLegalContractSignaturesQueryOptions(client, { contractId: id }),
          )
          void queryClient.prefetchQuery(
            getLegalContractAttachmentsQueryOptions(client, { contractId: id }),
          )
        },
      },
      {
        id: "legal-templates-index",
        path: `${basePath}/templates`,
        title: contractTemplates,
        destination: "contractTemplate.list",
        ssr: "data-only",
        page: () =>
          import("./templates-host.js").then((module) =>
            adminRoutePageModule(module.TemplatesHost),
          ),
        // Dynamic import on purpose — see the contracts index loader above.
        loader: async ({ queryClient, runtime }: AdminRouteLoaderContext) => {
          const { getLegalContractTemplatesQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(
            getLegalContractTemplatesQueryOptions(toLegalClient(runtime), {
              search: "",
              scope: "all",
            }),
          )
        },
      },
      {
        id: "legal-templates-detail",
        path: `${basePath}/templates/$id`,
        title: contractTemplates,
        destination: "contractTemplate.detail",
        destinationParams: { id: "templateId" },
        ssr: "data-only",
        page: () => import("./pages/template-detail-page.js"),
        loader: async ({ queryClient, runtime, params }: AdminRouteLoaderContext) => {
          const id = params.id
          if (!id) return
          // Dynamic import on purpose — see the contracts index loader above.
          const {
            getLegalContractTemplateQueryOptions,
            getLegalContractTemplateVersionsQueryOptions,
          } = await import("../query-options.js")
          const client = toLegalClient(runtime)

          await queryClient.ensureQueryData(getLegalContractTemplateQueryOptions(client, id))

          void queryClient.prefetchQuery(
            getLegalContractTemplateVersionsQueryOptions(client, { templateId: id }),
          )
        },
      },
      {
        id: "legal-policies-index",
        path: `${basePath}/policies`,
        title: policies,
        destination: "policy.list",
        ssr: "data-only",
        page: () =>
          import("./policies-host.js").then((module) => adminRoutePageModule(module.PoliciesHost)),
        // Dynamic import on purpose — see the contracts index loader above.
        loader: async ({ queryClient, runtime }: AdminRouteLoaderContext) => {
          const { getLegalPoliciesQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(
            getLegalPoliciesQueryOptions(toLegalClient(runtime), {
              search: "",
              kind: "all",
              limit: 25,
              offset: 0,
            }),
          )
        },
      },
      {
        id: "legal-policies-detail",
        path: `${basePath}/policies/$id`,
        title: policies,
        destination: "policy.detail",
        destinationParams: { id: "policyId" },
        ssr: "data-only",
        page: () => import("./pages/policy-detail-page.js"),
        loader: async ({ queryClient, runtime, params }: AdminRouteLoaderContext) => {
          const id = params.id
          if (!id) return
          // Dynamic import on purpose — see the contracts index loader above.
          const {
            getLegalPolicyAcceptancesQueryOptions,
            getLegalPolicyAssignmentsQueryOptions,
            getLegalPolicyQueryOptions,
            getLegalPolicyVersionsQueryOptions,
          } = await import("../query-options.js")
          const client = toLegalClient(runtime)

          await queryClient.ensureQueryData(getLegalPolicyQueryOptions(client, id))

          void queryClient.prefetchQuery(
            getLegalPolicyVersionsQueryOptions(client, { policyId: id }),
          )
          void queryClient.prefetchQuery(
            getLegalPolicyAssignmentsQueryOptions(client, { policyId: id }),
          )
          void queryClient.prefetchQuery(
            getLegalPolicyAcceptancesQueryOptions(client, { limit: 50, offset: 0 }),
          )
        },
      },
      {
        id: "legal-number-series",
        path: `${basePath}/number-series`,
        title: numberSeries,
        ssr: "data-only",
        page: () =>
          import("./number-series-host.js").then((module) =>
            adminRoutePageModule(module.NumberSeriesHost),
          ),
        // Dynamic import on purpose — see the contracts index loader above.
        loader: async ({ queryClient, runtime }: AdminRouteLoaderContext) => {
          const { getLegalContractNumberSeriesQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(
            getLegalContractNumberSeriesQueryOptions(toLegalClient(runtime)),
          )
        },
      },
    ],
  })
}

export function createSelectedLegalAdminExtension({
  navMessages,
}: SelectedAdminExtensionFactoryContext): AdminExtension {
  const labels = {
    legal: navMessages.legal ?? "Legal",
    contracts: navMessages.contracts ?? "Contracts",
    contractTemplates: navMessages.contractTemplates ?? "Contract templates",
    policies: navMessages.policies ?? "Policies",
    numberSeries: navMessages.contractNumberSeries ?? "Number series",
  }
  const extension = withAdminRouteMessagesProvider(
    createLegalAdminExtension({
      labels,
    }),
    () =>
      import("../i18n/index.js").then((module) => ({ default: module.LegalUiMessagesProvider })),
  )

  return {
    ...extension,
    navigation: [
      {
        order: -40,
        items: [
          {
            id: "legal",
            title: labels.legal,
            url: "/legal/contracts",
            icon: Scale,
            items: [
              { id: "contracts", title: labels.contracts, url: "/legal/contracts" },
              {
                id: "contract-templates",
                title: labels.contractTemplates,
                url: "/legal/templates",
              },
              { id: "policies", title: labels.policies, url: "/legal/policies" },
              {
                id: "number-series",
                title: labels.numberSeries,
                url: "/legal/number-series",
              },
            ],
          },
        ],
      },
    ],
  }
}
