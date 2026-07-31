import type { VoyantGraphPresentationDeclaration } from "@voyant-travel/core/project"
import type { VoyantGeneratedRouteFile } from "@voyant-travel/vite-config"

const runtimeImport = (path: string) =>
  path.includes("/") ? "../_lib/operator-frontend.js" : "./_lib/operator-frontend.js"
const standardFrontendImport = "@voyant-travel/operator-standard/standard-frontend"

/**
 * Derive a route file path from a router path. The mapping is mechanical:
 * strip the leading `/`, keep a leading group segment `(x)` as a directory,
 * turn the remaining `/` into `.`, and emit `route.tsx` for a bare group path.
 */
const routeFilePath = (route: string): string => {
  const withoutLeadingSlash = route.slice(1)
  const groupMatch = /^(\([^)]+\))(?:\/(.*))?$/.exec(withoutLeadingSlash)
  if (groupMatch) {
    const [, group, rest] = groupMatch
    return rest === undefined ? `${group}/route.tsx` : `${group}/${rest.replaceAll("/", ".")}.tsx`
  }
  return `${withoutLeadingSlash.replaceAll("/", ".")}.tsx`
}

const presentationRoute = (
  route: string,
  contribution: string,
  member: string,
): VoyantGeneratedRouteFile => {
  const path = routeFilePath(route)
  return {
    path,
    source: `
import { createFileRoute } from "@tanstack/react-router"
import { operatorFrontend } from ${JSON.stringify(runtimeImport(path))}

export const Route = createFileRoute(${JSON.stringify(route)})(operatorFrontend.routes.${contribution}!.${member})
`,
  }
}

export interface CreateStandardOperatorRouteFilesOptions {
  presentations: readonly VoyantGraphPresentationDeclaration[]
}

const standardOperatorRouteFiles: readonly VoyantGeneratedRouteFile[] = [
  {
    path: "_lib/operator-frontend.tsx",
    source: `
import { createStandardOperatorFrontend } from ${JSON.stringify(standardFrontendImport)}
import { accessCatalog } from "../../access/selected-access-catalog.generated.js"
import { createSelectedGraphAdminExtensions } from "../../admin/selected-graph-admin.generated.js"
import { selectedGraphPresentationFactories } from "../../presentations/selected-graph-presentations.generated.js"

const workspaceSpecs = import.meta.glob<{ default: Record<string, unknown> }>(
  "../../../../../packages/*/openapi/{admin,storefront}/*.json",
)
const installedSpecs = import.meta.glob<{ default: Record<string, unknown> }>(
  "../../../node_modules/@voyant-travel/*/openapi/{admin,storefront}/*.json",
)

export const operatorFrontend = createStandardOperatorFrontend({
  accessCatalog,
  selected: createSelectedGraphAdminExtensions,
  presentations: selectedGraphPresentationFactories,
  project: import.meta.glob("../../../src/admin/*/index.tsx", { eager: true }),
  openApiSpecs: { ...workspaceSpecs, ...installedSpecs },
})
`,
  },
  {
    path: "__root.tsx",
    source: `
import {
  AdminRootErrorBoundary,
  AdminRootShell,
  adminRootHead,
  Toaster,
} from ${JSON.stringify(standardFrontendImport)}
import type { QueryClient } from "@tanstack/react-query"
import { createRootRouteWithContext, Outlet, useRouteContext } from "@tanstack/react-router"
import { operatorFrontend } from "./_lib/operator-frontend.js"
import "@/styles.css"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => adminRootHead({ title: "Voyant", description: "Voyant operator workspace", faviconHref: "/favicon.png" }),
  shellComponent: AdminRootShell,
  component: RootComponent,
  errorComponent: AdminRootErrorBoundary,
})

function RootComponent() {
  const queryClient = useRouteContext({ from: "__root__", select: (context) => context.queryClient })
  return <operatorFrontend.Providers queryClient={queryClient}><Outlet /><Toaster /></operatorFrontend.Providers>
}
`,
  },
  {
    path: "docs.tsx",
    source: `
import { createFileRoute } from "@tanstack/react-router"
import { operatorFrontend } from "./_lib/operator-frontend.js"

export const Route = createFileRoute("/docs")(operatorFrontend.routes.docs)
`,
  },
]

const workspaceRouteFiles: readonly VoyantGeneratedRouteFile[] = [
  {
    path: "_workspace/route.tsx",
    source: `
import { createFileRoute, Outlet } from "@tanstack/react-router"
import { operatorFrontend } from "../_lib/operator-frontend.js"

const workspace = operatorFrontend.workspace

export const Route = createFileRoute("/_workspace")({
  ssr: "data-only",
  beforeLoad: ({ location }) => workspace.beforeLoad({ location }),
  loader: ({ context }) => ({ user: context.user }),
  pendingComponent: workspace.PendingComponent,
  component: WorkspaceLayout,
})

function WorkspaceLayout() {
  const { user } = Route.useLoaderData()
  return <workspace.Workspace initialUser={user}><Outlet /></workspace.Workspace>
}
`,
  },
]

/**
 * Emit the route files a selected presentation contributes, in declared order.
 * A presentation without a `contribution`/`routes` table contributes nothing.
 */
const presentationRouteFiles = (
  presentation: VoyantGraphPresentationDeclaration,
): readonly VoyantGeneratedRouteFile[] => {
  if (!presentation.contribution || !presentation.routes?.length) return []
  const contribution = presentation.contribution
  return presentation.routes.map((route) =>
    presentationRoute(route.route, contribution, route.member),
  )
}

/** Standard package-owned route registrations emitted into `.voyant/routes`. */
export function createStandardOperatorRouteFiles(
  options: CreateStandardOperatorRouteFilesOptions,
): readonly VoyantGeneratedRouteFile[] {
  const presentationFamilies = [...options.presentations]
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap(presentationRouteFiles)
  return [...standardOperatorRouteFiles, ...presentationFamilies, ...workspaceRouteFiles]
}
