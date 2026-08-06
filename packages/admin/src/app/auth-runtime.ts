/**
 * The admin auth capability **port** for a deployment-provided admin host.
 *
 * Auth is deployment-owned: the admin surfaces (shell, guard, packaged pages)
 * never import a concrete auth client. Instead a deployment provides a
 * {@link AdminAuthRuntime}, and the packaged admin depends only on
 * this port. There are two implementations:
 *
 * - **Voyant Cloud** — a hosted identity-broker implementation. Unauthenticated
 *   visitors are redirected to the Cloud broker (`authMode: "voyant-cloud"`); no
 *   local password/login pages are shipped.
 * - **Self-host / starter** — a Better Auth impl (`authMode: "local"`) that also
 *   mounts the local `(auth)` page suite consuming this same port.
 *
 * The `getCurrentUser` / `getBootstrapStatus` members are typically TanStack
 * server functions (cookie-forwarding), so they are *provided*, not packaged.
 */

/** Identity-broker mode: local Better Auth, or the Voyant Cloud broker. */
export type AdminAuthMode = "local" | "voyant-cloud"

export const ADMIN_ACTIVE_MODULES_QUERY_KEY = ["voyant", "admin", "active-modules"] as const

/** Whether any user exists yet, plus the identity-broker mode. */
export interface AdminBootstrapStatus {
  hasUsers: boolean
  authMode?: AdminAuthMode
  /**
   * The active module ids for this deployment (voyant#3063). A source-free
   * hosted admin reads this to gate its composition, showing only the modules
   * selected by the deployment graph. Absent for hosts that do not gate (e.g. a
   * self-hosted project built from its own module set); the admin then composes
   * everything.
   */
  modules?: readonly string[]
}

/** Framework-neutral shape consumed by the authenticated shell guard. */
export interface AdminShellBootstrap<TUser> {
  version: number
  compatibility: { minimumShellVersion: number; capabilities: readonly string[] }
  user: TUser
  activeModules: readonly string[]
  entitlements: Readonly<Record<string, boolean>>
  navigationPreferences: unknown
  extensions: readonly Readonly<Record<string, unknown>>[]
}

/**
 * The auth capability a deployment supplies to the packaged admin. `TUser` is
 * the deployment's loaded-user shape (a structural superset of
 * {@link AdminWorkspaceShellUser}).
 */
export interface AdminAuthRuntime<TUser> {
  /** Resolve the current user (server fn / cookie-forwarding fetch); `null` when signed out. */
  getCurrentUser: () => Promise<TUser | null | undefined>
  /** Preferred one-request shell bootstrap; older/custom hosts may omit it. */
  getShellBootstrap?: () => Promise<AdminShellBootstrap<TUser> | null | undefined>
  /** Whether any user exists yet + the identity-broker mode driving redirects. */
  getBootstrapStatus: () => Promise<AdminBootstrapStatus>
  /** Href that starts the Voyant Cloud identity-broker flow (used in `voyant-cloud` mode). */
  cloudAuthStartHref: (next?: string) => string
  /** Clear the current session. Navigation after sign-out is the caller's concern. */
  signOut: () => Promise<void>
  /**
   * Persist account-owned display preferences. Optional for read-only hosts;
   * the standard operator implements it with `PATCH /auth/me`.
   */
  updateCurrentUserPreferences?: (preferences: {
    locale?: string
    timezone?: string | null
  }) => Promise<TUser>
}
