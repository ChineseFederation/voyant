import type { QueryClient } from "@tanstack/react-query"
import { AlertTriangle, Loader2 } from "lucide-react"
import type {
  AdminExtension,
  AdminRouteLoaderContext,
  AdminRoutePageModule,
  AdminSettingsPageContribution,
  AdminUiRouteContribution,
  SelectedAdminExtensionFactory,
  SelectedAdminExtensionFactoryContext,
} from "../extensions.js"
import { adminRoutePageModule } from "../extensions.js"
import { useOperatorAdminMessages } from "../providers/operator-admin-messages.js"
import { ADMIN_ACTIVE_MODULES_QUERY_KEY } from "./auth-runtime.js"

export interface LazySelectedAdminRouteDescriptor {
  id: string
  path: string
  title: string
  requiredScopes?: readonly string[]
}

export interface LazySelectedAdminExtensionDescriptor {
  id: string
  moduleId: string
  load: () => Promise<SelectedAdminExtensionFactory>
  routes: readonly LazySelectedAdminRouteDescriptor[]
}

export class AdminExtensionUnavailableError extends Error {
  constructor(readonly extensionId: string) {
    super(`Admin extension "${extensionId}" is not active for this deployment.`)
    this.name = "AdminExtensionUnavailableError"
  }
}

/**
 * Build route metadata synchronously while keeping the owning implementation
 * behind one cached dynamic import. This is intentionally limited to
 * route/settings-only extensions; graph validation rejects unsafe opt-ins.
 */
export function createLazySelectedAdminExtension(
  descriptor: LazySelectedAdminExtensionDescriptor,
  context: SelectedAdminExtensionFactoryContext,
): AdminExtension {
  let loaded: Promise<AdminExtension> | undefined
  const load = () =>
    (loaded ??= descriptor.load().then((factory) => {
      if (typeof factory !== "function") {
        throw new TypeError(`Admin extension "${descriptor.id}" did not export its factory.`)
      }
      return factory(context)
    }))

  const routes: AdminUiRouteContribution[] = []
  const settingsPages: AdminSettingsPageContribution[] = []
  for (const route of descriptor.routes) {
    if (route.path.startsWith("/settings/")) {
      settingsPages.push(lazySettingsPage(descriptor, route, load))
    } else {
      routes.push(lazyRoute(descriptor, route, load))
    }
  }

  return {
    id: descriptor.id,
    ...(routes.length ? { routes } : {}),
    ...(settingsPages.length ? { settingsPages } : {}),
  }
}

function lazyRoute(
  descriptor: LazySelectedAdminExtensionDescriptor,
  route: LazySelectedAdminRouteDescriptor,
  load: () => Promise<AdminExtension>,
): AdminUiRouteContribution {
  return {
    id: route.id,
    path: route.path,
    title: route.title,
    page: () => loadRoutePage(load, route.path),
    loader: (loaderContext) => loadRouteData(descriptor, load, route.path, loaderContext),
    pendingComponent: LazyAdminExtensionPending,
    errorComponent: LazyAdminExtensionError,
    preload: "intent",
    ssr: "data-only",
  }
}

function lazySettingsPage(
  descriptor: LazySelectedAdminExtensionDescriptor,
  route: LazySelectedAdminRouteDescriptor,
  load: () => Promise<AdminExtension>,
): AdminSettingsPageContribution {
  return {
    id: route.id,
    path: route.path.slice("/settings".length),
    title: route.title,
    label: route.title,
    page: () => loadRoutePage(load, route.path),
    loader: (loaderContext) => loadRouteData(descriptor, load, route.path, loaderContext),
    ssr: "data-only",
  }
}

async function loadRouteData(
  descriptor: LazySelectedAdminExtensionDescriptor,
  load: () => Promise<AdminExtension>,
  path: string,
  context: AdminRouteLoaderContext,
): Promise<unknown> {
  requireActiveModule(context.queryClient, descriptor)
  const implementation = await findImplementedRoute(await load(), path)
  return implementation.loader?.(context)
}

async function loadRoutePage(
  load: () => Promise<AdminExtension>,
  path: string,
): Promise<AdminRoutePageModule> {
  const implementation = await findImplementedRoute(await load(), path)
  if (implementation.page) return implementation.page()
  if ("component" in implementation && implementation.component) {
    return adminRoutePageModule(implementation.component)
  }
  throw new Error(`Lazy admin route "${path}" has no page implementation.`)
}

function requireActiveModule(
  queryClient: QueryClient,
  descriptor: LazySelectedAdminExtensionDescriptor,
): void {
  const active = queryClient.getQueryData<readonly string[]>(ADMIN_ACTIVE_MODULES_QUERY_KEY)
  if (active && !active.includes(descriptor.moduleId) && !active.includes(descriptor.id)) {
    throw new AdminExtensionUnavailableError(descriptor.id)
  }
}

async function findImplementedRoute(
  extension: AdminExtension,
  path: string,
): Promise<AdminUiRouteContribution | AdminSettingsPageContribution> {
  const route = findRouteByPath(extension.routes ?? [], path)
  if (route) return route
  if (path.startsWith("/settings/")) {
    const relative = path.slice("/settings".length)
    const settingsPage = extension.settingsPages?.find((candidate) => candidate.path === relative)
    if (settingsPage) return settingsPage
  }
  throw new Error(`Loaded admin extension "${extension.id}" does not implement route "${path}".`)
}

function findRouteByPath(
  routes: readonly AdminUiRouteContribution[],
  path: string,
): AdminUiRouteContribution | undefined {
  for (const route of routes) {
    if (route.path === path) return route
    const child = findRouteByPath(route.children ?? [], path)
    if (child) return child
  }
  return undefined
}

function LazyAdminExtensionPending() {
  const messages = useOperatorAdminMessages()
  return (
    <div
      className="flex min-h-48 items-center justify-center gap-3"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      <span>{messages.loading}</span>
    </div>
  )
}

function LazyAdminExtensionError({ error, reset }: { error: unknown; reset: () => void }) {
  const messages = useOperatorAdminMessages()
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-6" role="alert">
      <AlertTriangle className="size-6" aria-hidden="true" />
      <p>{error instanceof Error ? error.message : messages.somethingWentWrongDetail}</p>
      <button type="button" onClick={reset} className="underline">
        {messages.retry}
      </button>
    </div>
  )
}
