/**
 * The authenticated admin shell bootstrap contract.
 *
 * One versioned response carries everything the shell needs before it can
 * render: who the member is, which modules the deployment runs, and the
 * host-owned entitlement / navigation / extension snapshot. Without it the
 * shell discovers each of those over its own round trip, and because each one
 * gates the next, no page data is requested until they all land
 * (voyant#4754).
 *
 * Kept out of the route body so the contract is a value: the capability list
 * is the only thing telling the shell which slices it may stop asking for, and
 * getting it wrong costs a round trip per page load rather than an error.
 */

export const OPERATOR_SHELL_BOOTSTRAP_VERSION = 1 as const

export interface OperatorCurrentUser {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  locale: string
  timezone: string | null
  uiPrefs: unknown
  isSuperAdmin: boolean
  isSupportUser: boolean
  createdAt: string
  profilePictureUrl: string | null
}

export interface OperatorShellBootstrapAdditions {
  /** Host-owned feature entitlements. Keys are stable capability ids. */
  entitlements?: Readonly<Record<string, boolean>>
  /** Effective navigation snapshot, or null when the selected graph has no preference authority. */
  navigationPreferences?: unknown
  /** Lightweight, non-secret descriptors only. Full extension manifests remain deferred. */
  extensions?: readonly Readonly<Record<string, unknown>>[]
}

export interface OperatorShellBootstrap extends Required<OperatorShellBootstrapAdditions> {
  version: typeof OPERATOR_SHELL_BOOTSTRAP_VERSION
  compatibility: {
    minimumShellVersion: typeof OPERATOR_SHELL_BOOTSTRAP_VERSION
    capabilities: readonly string[]
  }
  user: OperatorCurrentUser
  activeModules: readonly string[]
}

/** Always present: the shell reads these to know it is talking to a v1 host. */
export const OPERATOR_SHELL_BOOTSTRAP_BASE_CAPABILITIES = [
  "admin.shell-bootstrap.v1",
  "admin.shell-bootstrap.focus-invalidation",
] as const

/**
 * Capability id per optional slice, keyed by the addition that answers for it.
 */
export const OPERATOR_SHELL_BOOTSTRAP_SLICE_CAPABILITIES = {
  entitlements: "admin.shell-bootstrap.entitlements",
  navigationPreferences: "admin.shell-bootstrap.navigation-preferences",
  extensions: "admin.shell-bootstrap.extensions",
} as const satisfies Record<keyof OperatorShellBootstrapAdditions, string>

/**
 * A capability states that this response ANSWERS for a slice — not that the
 * answer is non-empty. Testing the value's truthiness instead dropped the
 * navigation-preferences capability whenever the host resolved "nothing
 * stored" (`null`), and the shell then asked
 * `/v1/admin/navigation-preferences` for the same nothing on every page load.
 * An absent key is the only thing that means "the host did not answer".
 */
export function resolveOperatorShellBootstrapCapabilities(
  additions: OperatorShellBootstrapAdditions,
): string[] {
  return [
    ...OPERATOR_SHELL_BOOTSTRAP_BASE_CAPABILITIES,
    ...Object.entries(OPERATOR_SHELL_BOOTSTRAP_SLICE_CAPABILITIES)
      .filter(([slice]) => additions[slice as keyof OperatorShellBootstrapAdditions] !== undefined)
      .map(([, capability]) => capability),
  ]
}

export interface BuildOperatorShellBootstrapInput {
  user: OperatorCurrentUser
  activeModules?: readonly string[]
  additions?: OperatorShellBootstrapAdditions
}

/** Assemble the versioned bootstrap payload from the resolved host additions. */
export function buildOperatorShellBootstrap({
  user,
  activeModules,
  additions = {},
}: BuildOperatorShellBootstrapInput): OperatorShellBootstrap {
  return {
    version: OPERATOR_SHELL_BOOTSTRAP_VERSION,
    compatibility: {
      minimumShellVersion: OPERATOR_SHELL_BOOTSTRAP_VERSION,
      capabilities: resolveOperatorShellBootstrapCapabilities(additions),
    },
    user,
    activeModules: [...(activeModules ?? [])],
    entitlements: { ...(additions.entitlements ?? {}) },
    navigationPreferences: additions.navigationPreferences ?? null,
    extensions: [...(additions.extensions ?? [])],
  }
}
