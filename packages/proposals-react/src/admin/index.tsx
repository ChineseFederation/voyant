import {
  type AdminExtension,
  type AdminRouteLoaderContext,
  type AdminRouteRuntime,
  adminRoutePageModule,
  defineAdminExtension,
  type NavItem,
  type SelectedAdminExtensionFactoryContext,
} from "@voyant-travel/admin"
// Lean static only: the shared fetcher fallback. The page-data helpers
// resolve via dynamic import inside the loaders so the REST query options stay
// out of the workspace-chrome chunk that evaluates this factory.
import { defaultFetcher } from "@voyant-travel/react"
import { FileText } from "lucide-react"

/**
 * Semantic destinations the proposals admin surfaces navigate to (packaged-admin
 * RFC §4.7). The board opens a proposal's detail; the detail page links back to
 * the board — instead of importing a host route tree they resolve these keys
 * through `useAdminNavigate` from `@voyant-travel/admin`. Both are route-backed
 * (pure path interpolation), so the host's resolvers are generated.
 */
declare module "@voyant-travel/admin" {
  interface AdminDestinations {
    /** The proposals board (landing) page. */
    "proposal.list": Record<string, never>
    /** A proposal's detail page, where its versions live. */
    "proposal.detail": { proposalId: string }
  }
}

// Endgame rule (packaged-admin RFC §4.8): this barrel re-exports NO page or
// host component values — it is evaluated with the workspace chrome, so a
// static host re-export would pin the Proposals page modules (board, dialogs,
// detail table) into the entry chunk. Hosts import from their specific
// modules; only the lightweight query keys re-export here.
export { proposalsQueryKeys } from "../query-keys.js"

export interface CreateProposalsAdminExtensionOptions {
  /** Mount path of the proposals pages inside the admin workspace. Default `/proposals`. */
  basePath?: string
  /** Localized nav/page labels. Defaults are the English operator nav labels. */
  labels?: {
    proposals?: string
  }
  /** Nav icon — icon choice stays with the host (e.g. lucide `FileText`). */
  icon?: NavItem["icon"]
}

/**
 * The proposals admin contribution (packaged-admin RFC Phase 3,
 * `@voyant-travel/<domain>-react/admin` convention).
 *
 * NAVIGATION: package-delivered. The Proposals item is NOT part of the BASE
 * operator navigation (`createOperatorAdminNavigation` in
 * `@voyant-travel/admin`), so the extension contributes it — spliced directly
 * after Bookings via `insertAfter` because both belong to the
 * proposal → accept → book lifecycle. The icon stays a host choice.
 *
 * ROUTES: two contributions carry the FULL route implementation — the board
 * (landing) at `basePath`, where operators manage pipelines/stages and create
 * proposals, and a proposal detail at `basePath/$id`, where that proposal's VERSIONS
 * live (listed inline, created in context). Versions are never a top-level
 * surface: they are revisions of a proposal. Both pages keep their filter/state
 * local (no URL search contract); cross-route links resolve through the
 * semantic destinations declared above.
 *
 * WIDGETS: none contributed and no slots exposed yet.
 */
export function createProposalsAdminExtension(
  options: CreateProposalsAdminExtensionOptions = {},
): AdminExtension {
  const { basePath = "/proposals", labels = {}, icon } = options
  const { proposals = "Proposals" } = labels

  return defineAdminExtension({
    id: "proposals",
    navigation: [
      {
        insertAfter: "bookings",
        items: [{ id: "proposals", title: proposals, url: basePath, icon }],
      },
    ],
    routes: [
      {
        id: "proposals-index",
        path: basePath,
        title: proposals,
        destination: "proposal.list",
        ssr: "data-only",
        routeMessagesProvider: proposalsRouteMessagesProvider,
        page: () =>
          import("./proposals-board-host.js").then((module) =>
            adminRoutePageModule(module.ProposalsBoardHost),
          ),
        // Dynamic import on purpose: the helper pulls the REST query options,
        // and a static import here would pin them into the workspace-chrome
        // chunk that evaluates this factory.
        loader: async ({ queryClient, runtime }: AdminRouteLoaderContext) => {
          const { getPipelinesQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(
            getPipelinesQueryOptions(loaderClient(runtime), { entityType: "proposal", limit: 50 }),
          )
        },
      },
      {
        id: "proposals-detail",
        path: `${basePath}/$id`,
        title: proposals,
        destination: "proposal.detail",
        destinationParams: { id: "proposalId" },
        ssr: "data-only",
        routeMessagesProvider: proposalsRouteMessagesProvider,
        page: () => import("./pages/proposal-detail-page.js"),
        loader: async ({ queryClient, runtime, params }: AdminRouteLoaderContext) => {
          const id = params.id
          if (!id) return
          const { getProposalQueryOptions } = await import("../query-options.js")
          return queryClient.ensureQueryData(getProposalQueryOptions(loaderClient(runtime), id))
        },
      },
    ],
  })
}

/** Selected-graph adapter owning the standard Operator copy key and icon. */
export function createSelectedProposalsAdminExtension(
  { navMessages }: SelectedAdminExtensionFactoryContext = { navMessages: {} },
): AdminExtension {
  return createProposalsAdminExtension({
    labels: { proposals: navMessages.proposals ?? "Proposals" },
    icon: FileText,
  })
}

function proposalsRouteMessagesProvider() {
  return import("../i18n/index.js").then((module) => ({ default: module.CrmUiMessagesProvider }))
}

/**
 * Bridge the host-supplied {@link AdminRouteRuntime} (optional fetcher) to
 * the required-fetcher client contract the query options take — SSR loaders
 * run with the host runtime's cookie-forwarding fetcher.
 */
function loaderClient(runtime: AdminRouteRuntime) {
  return { baseUrl: runtime.baseUrl, fetcher: runtime.fetcher ?? defaultFetcher }
}
