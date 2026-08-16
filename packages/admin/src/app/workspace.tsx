import { type QueryClient, useQuery } from "@tanstack/react-query"
import { Link, redirect, useRouter, useRouterState } from "@tanstack/react-router"
import { useVoyantReactContext } from "@voyant-travel/react"
import { Loader2 } from "lucide-react"
import { forwardRef, type ReactNode, useCallback, useMemo } from "react"
import { useAdminNavigationAnalytics } from "../analytics.js"
import type { AdminNavLinkComponent, AdminNavLinkProps } from "../components/admin-nav-link.js"
import { AdminWidgetSlotRenderer } from "../components/admin-widget-slot.js"
import { OperatorAdminBootstrapGate } from "../components/operator-admin-bootstrap-gate.js"
import { OperatorAdminWorkspaceLayout } from "../components/operator-admin-sidebar.js"
import type { AdminExtension } from "../extensions.js"
import { adminWorkspaceHeaderActionsSlot, resolveAdminWidgets } from "../extensions.js"
import {
  type AdminDestinationResolvers,
  AdminNavigationProvider,
} from "../navigation/destinations.js"
import type { OperatorAdminNavigationIcons } from "../navigation/operator-navigation.js"
import type {
  AdminNavigationPreferencesContribution,
  AdminNavigationPreferencesSnapshot,
} from "../navigation/preferences.js"
import { LocaleProvider, type LocaleProviderProps } from "../providers/locale.js"
import {
  getOperatorAdminMessageOverridesFromUiPrefs,
  type OperatorAdminMessages,
  OperatorAdminMessagesProvider,
  useOperatorAdminMessages,
} from "../providers/operator-admin-messages.js"
import type { AdminUser } from "../types.js"
import {
  ADMIN_CURRENT_USER_QUERY_KEY,
  ADMIN_SESSION_STALE_TIME_MS,
  ADMIN_SHELL_BOOTSTRAP_QUERY_KEY,
  type AdminAuthRuntime,
  type AdminBootstrapStatus,
} from "./auth-runtime.js"

/**
 * Router-aware sidebar link. SidebarMenuButton with `asChild` wraps this in a
 * Slot, which clones the element with merged className, data attributes, and
 * event props — extras not declared on AdminNavLinkProps but arriving at runtime, so
 * spread the rest. Without this, Slot's className is silently dropped and
 * sidebar items render unstyled. External URLs fall back to a plain anchor.
 */
export const AdminRouterLink = forwardRef<HTMLAnchorElement, AdminNavLinkProps>(
  function AdminRouterLink({ children, href, onClick, target, ...rest }, ref) {
    const external = href.startsWith("http://") || href.startsWith("https://")

    if (external) {
      return (
        <a
          ref={ref}
          href={href}
          target={target}
          rel={target === "_blank" ? "noopener noreferrer" : undefined}
          onClick={onClick}
          {...rest}
        >
          {children}
        </a>
      )
    }

    return (
      <Link ref={ref} to={href} target={target} onClick={onClick} {...rest}>
        {children}
      </Link>
    )
  },
)

export interface CreateAdminWorkspaceBeforeLoadOptions<TUser> {
  /**
   * The deployment's auth capability (see {@link AdminAuthRuntime}).
   * Only the read/redirect members the guard needs are required.
   */
  auth: Pick<
    AdminAuthRuntime<TUser>,
    "getCurrentUser" | "getShellBootstrap" | "getBootstrapStatus" | "cloudAuthStartHref"
  >
  /** Where unauthenticated visitors are sent in `local` auth mode. Default `/sign-in`. */
  signInPath?: string
  hydrateShellBootstrap?: (
    bootstrap: NonNullable<
      Awaited<ReturnType<NonNullable<AdminAuthRuntime<TUser>["getShellBootstrap"]>>>
    >,
    queryClient: QueryClient,
  ) => void
  /**
   * How long a resolved session is reused before the guard revalidates it.
   * Defaults to {@link ADMIN_SESSION_STALE_TIME_MS}.
   */
  sessionStaleTime?: number
}

/**
 * The workspace auth guard. MUST run in `beforeLoad`, not `loader`:
 * beforeLoad executes top-down for the whole matched chain BEFORE any loader
 * fires, so an unauthenticated redirect short-circuits the subtree. In a
 * loader it would race child loaders whose 401s surface the root error
 * boundary and beat the redirect, dead-ending logged-out users. Returns
 * `{ user }`, which TanStack merges into route context.
 *
 * The unauthenticated destination is mode-dependent (resolved from the auth
 * port, not hard-coded): in `voyant-cloud` mode the visitor is sent to the
 * Cloud identity-broker; otherwise to the local `signInPath`. Deciding it here
 * keeps the packaged admin free of a concrete auth client and avoids a
 * double-hop through the local sign-in page.
 */
export function createAdminWorkspaceBeforeLoad<TUser>({
  auth,
  signInPath = "/sign-in",
  hydrateShellBootstrap,
  sessionStaleTime = ADMIN_SESSION_STALE_TIME_MS,
}: CreateAdminWorkspaceBeforeLoadOptions<TUser>) {
  /**
   * Resolve a session-scoped value through the QueryClient when the router
   * supplied one. `beforeLoad` runs again for every matched route on every
   * navigation, so calling the auth port directly turns one cold-load round
   * trip into one per navigation. A `null` result is dropped rather than
   * cached: signed-out is the state most likely to change underneath us, and
   * caching it would keep redirecting a member who has just signed in.
   */
  async function resolveSession<TValue>(
    queryClient: QueryClient | undefined,
    queryKey: readonly unknown[],
    load: () => Promise<TValue | null | undefined>,
  ): Promise<{ value: TValue | null; fromCache: boolean }> {
    if (!queryClient) return { value: (await load()) ?? null, fromCache: false }

    const cached = queryClient.getQueryData<TValue | null>(queryKey)
    const value = await queryClient.ensureQueryData<TValue | null>({
      queryKey,
      queryFn: async () => (await load()) ?? null,
      staleTime: sessionStaleTime,
      // Cached data is returned immediately and refreshed behind the
      // navigation once it ages past `sessionStaleTime`. Without this the
      // session would be resolved once and then never again for the life of
      // the tab, because `ensureQueryData` does not revalidate on its own.
      revalidateIfStale: true,
    })
    if (value === null) queryClient.removeQueries({ queryKey, exact: true })
    return { value, fromCache: cached !== undefined && Object.is(cached, value) }
  }

  return async ({
    location,
    context,
  }: {
    location: { href: string }
    context?: { queryClient?: QueryClient }
  }): Promise<{ user: TUser }> => {
    const queryClient = context?.queryClient
    const getShellBootstrap = auth.getShellBootstrap
    const shellBootstrap = getShellBootstrap
      ? await resolveSession(queryClient, ADMIN_SHELL_BOOTSTRAP_QUERY_KEY, () =>
          getShellBootstrap(),
        )
      : null
    const currentUser = shellBootstrap
      ? null
      : await resolveSession(queryClient, ADMIN_CURRENT_USER_QUERY_KEY, () => auth.getCurrentUser())
    const user = shellBootstrap ? shellBootstrap.value?.user : currentUser?.value

    if (user) {
      // Re-seeding on every navigation would overwrite whatever the shell has
      // since done with these slices (a reordered navigation, a refetched
      // entitlement) with the snapshot this session started from. Hydrate only
      // the response that was actually fetched.
      if (shellBootstrap?.value && !shellBootstrap.fromCache && queryClient) {
        hydrateShellBootstrap?.(shellBootstrap.value, queryClient)
      }
      return { user }
    }

    // Unauthenticated: send to the Cloud broker in voyant-cloud mode, else the
    // local sign-in. A failed bootstrap probe falls back to the local path.
    const bootstrapStatus = await auth
      .getBootstrapStatus()
      .catch((): AdminBootstrapStatus => ({ hasUsers: true }))

    if (bootstrapStatus.authMode === "voyant-cloud") {
      // `cloudAuthStartHref` is a relative API path (`/api/auth/admin/cloud/start…`).
      // TanStack only infers a full-document redirect for absolute hrefs, so on
      // a client-side navigation a relative href would be handled as in-app
      // routing to a non-route API path. Force a document request so the browser
      // actually starts the broker flow.
      throw redirect({ href: auth.cloudAuthStartHref(location.href), reloadDocument: true })
    }

    throw redirect({ to: signInPath, search: { next: location.href } })
  }
}

export function AdminWorkspacePendingFallback({ label }: { label?: string }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
      </div>
    </div>
  )
}

/** Structural slice of the loaded user the shell itself needs. */
export interface AdminWorkspaceShellUser {
  id?: string | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  profilePictureUrl?: string | null
  locale?: string | null
  timeZone?: string | null
  timezone?: string | null
  uiPrefs?: unknown
}

/** Default mapping from the loaded user to the layout's AdminUser shape. */
export function defaultAdminWorkspaceUser(user: AdminWorkspaceShellUser): AdminUser {
  return {
    name: [user.firstName, user.lastName].filter(Boolean).join(" "),
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email ?? "",
    avatar: user.profilePictureUrl,
    locale: user.locale,
    timeZone: user.timeZone ?? user.timezone,
  }
}

export interface AdminWorkspaceShellProps<TUser extends AdminWorkspaceShellUser> {
  user: TUser | null | undefined
  isUserLoading?: boolean
  /**
   * Admin extensions for the navigation/widget seam. Pass a function to
   * derive nav labels from the resolved admin messages.
   */
  extensions?:
    | ReadonlyArray<AdminExtension>
    | ((messages: OperatorAdminMessages) => ReadonlyArray<AdminExtension>)
  icons?: OperatorAdminNavigationIcons
  /** Defaults to the router-aware {@link AdminRouterLink}. */
  linkComponent?: AdminNavLinkComponent
  /**
   * Host resolver map for the semantic-destination contract (packaged-admin
   * RFC §4.7): one `params → href` resolver per `AdminDestinations` key the
   * mounted packages declare. When provided, the shell mounts an
   * `AdminNavigationProvider` wired to the app router, so packaged pages can
   * navigate to routes they don't own via `useAdminHref`/`useAdminNavigate`.
   */
  destinations?: Partial<AdminDestinationResolvers>
  /**
   * Left slot of the workspace header after the sidebar trigger. When omitted,
   * the layout renders its default breadcrumbs.
   */
  headerSlot?: ReactNode
  /** Host-owned right slot for persistent workspace header actions. */
  headerSlotRight?: ReactNode
  onSignOut?: () => void | Promise<void>
  onPreferenceChange?: LocaleProviderProps["onPreferenceChange"]
  /** Maps the loaded user for the layout; default covers the common fields. */
  mapUser?: (user: TUser) => AdminUser
  children: ReactNode
}

/**
 * The authenticated workspace shell: bootstrap gate (current-user readiness
 * is the only shell dependency), per-user message overrides, locale
 * preference sync, and the workspace layout with router-aware links — the
 * composition every Voyant admin previously copied from the starter.
 */
export function AdminWorkspaceShell<TUser extends AdminWorkspaceShellUser>({
  user,
  isUserLoading,
  extensions,
  icons,
  linkComponent = AdminRouterLink,
  destinations,
  headerSlot,
  headerSlotRight,
  onSignOut,
  onPreferenceChange,
  mapUser = defaultAdminWorkspaceUser,
  children,
}: AdminWorkspaceShellProps<TUser>) {
  return (
    <OperatorAdminBootstrapGate
      user={user}
      isUserLoading={isUserLoading}
      loadingFallback={<AdminWorkspacePendingFallback />}
    >
      {({ user: loadedUser }) => (
        <LocaleProvider
          defaultLocale={loadedUser.locale ?? undefined}
          defaultTimeZone={loadedUser.timeZone ?? loadedUser.timezone}
          preferenceAuthority="account"
          onPreferenceChange={onPreferenceChange}
        >
          <OperatorAdminMessagesProvider
            overrides={getOperatorAdminMessageOverridesFromUiPrefs(loadedUser.uiPrefs)}
          >
            <AdminWorkspaceShellInner
              user={loadedUser}
              extensions={extensions}
              icons={icons}
              linkComponent={linkComponent}
              destinations={destinations}
              headerSlot={headerSlot}
              headerSlotRight={headerSlotRight}
              onSignOut={onSignOut}
              mapUser={mapUser}
            >
              {children}
            </AdminWorkspaceShellInner>
          </OperatorAdminMessagesProvider>
        </LocaleProvider>
      )}
    </OperatorAdminBootstrapGate>
  )
}

function AdminWorkspaceShellInner<TUser extends AdminWorkspaceShellUser>({
  user,
  extensions,
  icons,
  linkComponent,
  destinations,
  headerSlot,
  headerSlotRight,
  onSignOut,
  mapUser,
  children,
}: {
  user: TUser
  extensions: AdminWorkspaceShellProps<TUser>["extensions"]
  icons?: OperatorAdminNavigationIcons
  linkComponent: AdminNavLinkComponent
  destinations?: Partial<AdminDestinationResolvers>
  headerSlot?: ReactNode
  headerSlotRight?: ReactNode
  onSignOut?: () => void | Promise<void>
  mapUser: (user: TUser) => AdminUser
  children: ReactNode
}) {
  const router = useRouter()
  const currentPath = useRouterState({ select: (s) => s.location.pathname })
  const messages = useOperatorAdminMessages()
  // Mounted once, here, rather than per route: the shell is the only place
  // that sees every navigation, including the ones packaged pages make.
  useAdminNavigationAnalytics()
  const resolvedExtensions = useMemo(
    () => (typeof extensions === "function" ? extensions(messages) : extensions),
    [extensions, messages],
  )
  const navigationPreferencesContribution = useMemo(
    () =>
      resolvedExtensions?.find((extension) => extension.navigationPreferences)
        ?.navigationPreferences,
    [resolvedExtensions],
  )
  const hasHeaderActionWidgets = useMemo(
    () =>
      resolveAdminWidgets({
        slot: adminWorkspaceHeaderActionsSlot,
        extensions: resolvedExtensions,
      }).length > 0,
    [resolvedExtensions],
  )
  const hasHeaderSlotRight = headerSlotRight != null
  // Resolver-built hrefs may carry a query string, so navigate by `href`
  // (which parses it back into search params) rather than `to` (which would
  // treat the whole string as a literal pathname). `replace` forwards so
  // packaged redirect pages (alias routes, deep-link forwards) keep
  // route-redirect history semantics.
  const navigateToHref = useCallback(
    (href: string, options?: { replace?: boolean }) => {
      void router.navigate({ href, replace: options?.replace })
    },
    [router],
  )

  return (
    <OptionalNavigationPreferences
      contribution={navigationPreferencesContribution}
      memberKey={user.id ?? user.email ?? "unknown-member"}
    >
      {(navigationPreferences) => {
        const layout = (
          <OperatorAdminWorkspaceLayout
            currentPath={currentPath}
            extensions={resolvedExtensions}
            headerSlot={headerSlot}
            headerSlotRight={
              hasHeaderSlotRight || hasHeaderActionWidgets ? (
                <>
                  {headerSlotRight}
                  {hasHeaderActionWidgets ? (
                    <AdminWidgetSlotRenderer
                      extensions={resolvedExtensions}
                      slot={adminWorkspaceHeaderActionsSlot}
                    />
                  ) : null}
                </>
              ) : undefined
            }
            icons={icons}
            linkComponent={linkComponent}
            navigationPreferences={navigationPreferences}
            onSignOut={onSignOut}
            user={mapUser(user)}
          >
            {children}
          </OperatorAdminWorkspaceLayout>
        )

        if (!destinations) return layout

        return (
          <AdminNavigationProvider resolvers={destinations} navigate={navigateToHref}>
            {layout}
          </AdminNavigationProvider>
        )
      }}
    </OptionalNavigationPreferences>
  )
}

function OptionalNavigationPreferences({
  contribution,
  memberKey,
  children,
}: {
  contribution: AdminNavigationPreferencesContribution | undefined
  memberKey: string
  children: (preferences: AdminNavigationPreferencesSnapshot | undefined) => ReactNode
}) {
  if (!contribution) return children(undefined)

  return (
    <SelectedNavigationPreferences contribution={contribution} memberKey={memberKey}>
      {children}
    </SelectedNavigationPreferences>
  )
}

function SelectedNavigationPreferences({
  contribution,
  memberKey,
  children,
}: {
  contribution: AdminNavigationPreferencesContribution
  memberKey: string
  children: (preferences: AdminNavigationPreferencesSnapshot | undefined) => ReactNode
}) {
  const api = useVoyantReactContext()
  const query = useQuery({
    queryKey: contribution.queryKey(memberKey),
    queryFn: () => contribution.load(api),
  })

  return children(query.data)
}
