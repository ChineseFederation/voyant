"use client"

import { useQuery } from "@tanstack/react-query"
import type {
  UiExtensionContext,
  UiExtensionDescriptor,
  UiExtensionEntity,
  UiExtensionOrg,
  UiExtensionTextDirection,
  UiExtensionToastIntent,
  UiExtensionViewer,
} from "@voyant-travel/admin-extension-sdk"
import { createContext, useContext } from "react"

import {
  type AdminExtension,
  type AdminNavigationContribution,
  type AdminRoutePageProps,
  defineAdminExtension,
} from "../extensions.js"
import { createRemoteNavIcon } from "../navigation/remote-nav-icon.js"
import { useLocale } from "../providers/locale.js"
import { useOperatorAdminMessages } from "../providers/operator-admin-messages.js"
import { useTheme } from "../providers/theme.js"
import type { NavItem, NavSubItem } from "../types.js"
import { AppExtensionPage, useAppPageNavEntries, useInstalledAppPages } from "./app-pages.js"
import { ADMIN_UI_EXTENSION_SLOTS } from "./registry.js"
import { UiExtensionHost, type UiExtensionSessionTokenGrant } from "./ui-extension-host.js"

/**
 * A resolved descriptor as the installation-backed client returns it: the SDK
 * descriptor shape plus the host-resolved app locale/direction and the owning
 * installation. Static self-hosted descriptors omit the extra fields and fall
 * back to the active locale / `ltr`.
 */
export interface InstalledUiExtension extends UiExtensionDescriptor {
  /** Owning installation, used to broker a session token for the frame. */
  installationId?: string
  /** App locale the host resolved from the release's declared locales. */
  appLocale?: string
  /** Text direction for {@link appLocale}. */
  direction?: UiExtensionTextDirection
}

/** Read-side dependency the factory uses to list an org's installed extensions. */
export interface UiExtensionsClient {
  list(): Promise<InstalledUiExtension[]>
  /** Full-page app extensions mounted under the app-owned admin route. */
  listPages?(): Promise<AppPageDescriptor[]>
}

/** A resolved full-page app extension (app-owned admin route + nav entry). */
export interface AppPageDescriptor {
  /** Stable per-installation key. */
  key: string
  installationId?: string
  /** App-owned admin sub-path (mounted under the apps route segment). */
  path: string
  entryUrl: string
  /** Host-rendered page title (locale-resolved). */
  title: string
  /** Host-rendered navigation label. */
  navLabel: string
  /** App-declared nav icon URL (HTTPS). Absent → host renders a generic icon. */
  icon?: string
  /** Deterministic navigation order; lower values appear first. */
  order?: number
  /** Installation-local structural navigation group key. */
  group?: string
  /** Locale-resolved label for {@link group}. */
  groupLabel?: string
  /** Existing host navigation item id after which this page or group is inserted. */
  insertAfter?: string
  appLocale?: string
  direction?: UiExtensionTextDirection
}

/** Context the host passes when brokering a session token for a frame. */
export interface UiExtensionTokenRequest {
  descriptor: InstalledUiExtension
  slot: string
  entity?: UiExtensionEntity | null
}

/** Brokers a short-lived session token for a frame (null answers `unavailable`). */
export type UiExtensionTokenBroker = (
  request: UiExtensionTokenRequest,
) => Promise<UiExtensionSessionTokenGrant | null>

/**
 * Ambient wiring an extension host needs that is NOT derivable from the theme
 * and locale providers: which org/viewer the surface belongs to, the entity a
 * detail surface is scoped to, and how host actions reach the admin shell.
 */
export interface UiExtensionEnvironment {
  org: UiExtensionOrg
  viewer: UiExtensionViewer
  entity?: UiExtensionEntity | null
  onNavigate?: (to: string) => void
  onToast?: (intent: UiExtensionToastIntent, message: string) => void
  /**
   * Brokers a session token when a frame sends `request-token`. When omitted,
   * the host answers `not-supported`. The platform wiring supplies this to mint
   * a token via the apps module for the descriptor's installation and context.
   */
  requestToken?: UiExtensionTokenBroker
}

const UiExtensionEnvironmentContext = createContext<UiExtensionEnvironment | undefined>(undefined)

export interface UiExtensionEnvironmentProviderProps {
  value: UiExtensionEnvironment
  children: React.ReactNode
}

export function UiExtensionEnvironmentProvider({
  value,
  children,
}: UiExtensionEnvironmentProviderProps) {
  return (
    <UiExtensionEnvironmentContext.Provider value={value}>
      {children}
    </UiExtensionEnvironmentContext.Provider>
  )
}

export function useUiExtensionEnvironment(): UiExtensionEnvironment | undefined {
  return useContext(UiExtensionEnvironmentContext)
}

/**
 * Static client for self-hosted wiring: the install set is known at boot rather
 * than fetched. The cloud platform supplies a fetching client instead.
 */
export function createStaticUiExtensionsClient(
  descriptors: ReadonlyArray<InstalledUiExtension>,
): UiExtensionsClient {
  const snapshot = [...descriptors]
  return { list: async () => snapshot }
}

/**
 * Installation-backed client: the cloud/apps layer resolves activated
 * descriptors from `app_extension_installations` (active installations only,
 * compatibility-filtered, host labels + app locale/direction resolved) and this
 * client just fetches that snapshot. Pausing/uninstalling an app drops it from
 * the fetched list, so its frames unmount on the next refetch.
 */
export function createInstallationUiExtensionsClient(
  fetchInstalled: () => Promise<InstalledUiExtension[]>,
  fetchPages?: () => Promise<AppPageDescriptor[]>,
): UiExtensionsClient {
  // Without a page fetcher `useInstalledAppPages` would return [] and the
  // installation-sourced full-page app extensions/navigation added here would
  // be unreachable through this factory.
  return fetchPages ? { list: fetchInstalled, listPages: fetchPages } : { list: fetchInstalled }
}

/** Shared query key so every slot widget reads a single `client.list()` result. */
export const UI_EXTENSIONS_QUERY_KEY = ["voyant", "admin", "ui-extensions"] as const

let warnedListError = false

function useInstalledUiExtensions(client: UiExtensionsClient) {
  return useQuery({
    queryKey: UI_EXTENSIONS_QUERY_KEY,
    queryFn: () => client.list(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

function SlotUiExtensions({ client, slot }: { client: UiExtensionsClient; slot: string }) {
  const environment = useUiExtensionEnvironment()
  const { resolvedTheme } = useTheme()
  const { resolvedLocale } = useLocale()
  const query = useInstalledUiExtensions(client)

  if (query.isError) {
    if (!warnedListError) {
      warnedListError = true
      console.warn("[voyant-admin] Failed to list UI extensions; rendering none.", query.error)
    }
    return null
  }

  if (!environment || !query.data) return null

  const descriptors = query.data.filter((descriptor) => descriptor.slots.includes(slot))
  if (descriptors.length === 0) return null

  const entity = environment.entity ?? null

  return (
    <>
      {descriptors.map((descriptor) => {
        // The app locale/direction are per-app (release-pinned); a static
        // descriptor without them falls back to the active locale / ltr.
        const context: UiExtensionContext = {
          org: environment.org,
          viewer: environment.viewer,
          entity,
          theme: resolvedTheme,
          locale: resolvedLocale,
          appLocale: descriptor.appLocale ?? resolvedLocale,
          direction: descriptor.direction ?? "ltr",
        }
        const broker = environment.requestToken
        return (
          <UiExtensionHost
            key={descriptor.key}
            descriptor={descriptor}
            slot={slot}
            context={context}
            onNavigate={environment.onNavigate}
            onToast={environment.onToast}
            onRequestToken={broker ? () => broker({ descriptor, slot, entity }) : undefined}
          />
        )
      })}
    </>
  )
}

export interface CreateUiExtensionsAdminExtensionOptions {
  client: UiExtensionsClient
  /**
   * Optional localized chrome copy for the app-page route. The visible sidebar
   * entry is already localized (its label comes from the resolved page's
   * `navLabel`); these cover the static route metadata a host can't resolve
   * through a hook. Omitted → the host default copy (English fallback).
   */
  labels?: {
    /** Document/breadcrumb title for the generic app-page route. */
    appPageTitle?: string
  }
}

/**
 * Route id + path pattern for the single param route that renders ANY installed
 * app page. Installations can repeat a manifest page key, so the route is keyed
 * on both `installationId` and `pageKey`; the component resolves the matching
 * descriptor at render time. Nav urls built by
 * {@link createAppPageNavigationContributions} match this pattern.
 */
export const APP_PAGE_ROUTE_ID = "voyant-ui-extensions:app-page"
export const APP_PAGE_ROUTE_PATH = "apps/$installationId/$pageKey"

/**
 * English fallback for the app-page route's static metadata title, used when a
 * host does not pass a localized {@link CreateUiExtensionsAdminExtensionOptions.labels}
 * value. Mirrors the package-route localization pattern (host-supplied labels
 * with an English default). The user-visible sidebar label is localized
 * independently via the resolved page's `navLabel`.
 */
const APP_PAGE_ROUTE_TITLE_FALLBACK = "App"

/** Admin nav url for an installed app page, matching {@link APP_PAGE_ROUTE_PATH}. */
function appPageNavUrl(installationId: string, pageKey: string): string {
  return `/apps/${encodeURIComponent(installationId)}/${encodeURIComponent(pageKey)}`
}

/** Fallback shown when the routed installation+page is unknown or inactive. */
function AppPageNotFound() {
  const messages = useOperatorAdminMessages()
  return <div className="p-6 text-sm text-muted-foreground">{messages.appPageUnavailable}</div>
}

/** Build the param-route page that renders the matching installed app page. */
function createAppPageRouteComponent(client: UiExtensionsClient) {
  return function AppPageRoute({ params }: AdminRoutePageProps) {
    const pages = useInstalledAppPages(client)
    const descriptorKey = `${params.installationId}:${params.pageKey}`
    const page = pages.find((candidate) => candidate.key === descriptorKey)
    if (!page) return <AppPageNotFound />
    return <AppExtensionPage page={page} className="flex-1" />
  }
}

/**
 * Runtime navigation contributions for installed app pages. Ungrouped pages
 * become top-level entries; pages sharing an installation-local `group` become
 * children of one structural entry. Contributions retain manifest `order` and
 * `insertAfter` metadata for the shell's standard navigation resolver.
 */
export function createAppPageNavigationContributions(
  entries: ReadonlyArray<ReturnType<typeof useAppPageNavEntries>[number]>,
): AdminNavigationContribution[] {
  const ordered = entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (left, right) =>
        (left.entry.order ?? 0) - (right.entry.order ?? 0) || left.index - right.index,
    )
    .map(({ entry }) => entry)
  const contributions: AdminNavigationContribution[] = []
  const groups = new Map<string, typeof ordered>()

  for (const entry of ordered) {
    if (!entry.group) continue
    const bucketKey = `${entry.installationId}\u0000${entry.group}\u0000${entry.insertAfter ?? ""}`
    const bucket = groups.get(bucketKey) ?? []
    bucket.push(entry)
    groups.set(bucketKey, bucket)
  }

  const emittedGroups = new Set<string>()
  for (const entry of ordered) {
    if (!entry.group) {
      contributions.push({
        order: entry.order ?? 0,
        ...(entry.insertAfter ? { insertAfter: entry.insertAfter } : {}),
        items: [toAppPageNavItem(entry)],
      })
      continue
    }
    const bucketKey = `${entry.installationId}\u0000${entry.group}\u0000${entry.insertAfter ?? ""}`
    if (emittedGroups.has(bucketKey)) continue
    emittedGroups.add(bucketKey)
    const pages = groups.get(bucketKey) ?? []
    const items: NavSubItem[] = pages.map((entry) => ({
      id: `${APP_PAGE_ROUTE_ID}:${entry.key}`,
      title: entry.label,
      url: appPageNavUrl(entry.installationId, entry.pageKey),
      icon: createRemoteNavIcon(entry.icon),
    }))
    contributions.push({
      order: entry.order ?? 0,
      ...(entry.insertAfter ? { insertAfter: entry.insertAfter } : {}),
      items: [
        {
          id: `${APP_PAGE_ROUTE_ID}:group:${entry.installationId}:${entry.group}`,
          title: entry.groupLabel ?? entry.group,
          url: items[0]?.url ?? "/apps",
          icon: createRemoteNavIcon(entry.icon),
          items,
          structural: true,
        },
      ],
    })
  }

  return contributions
}

function toAppPageNavItem(entry: ReturnType<typeof useAppPageNavEntries>[number]): NavItem {
  return {
    id: `${APP_PAGE_ROUTE_ID}:${entry.key}`,
    title: entry.label,
    url: appPageNavUrl(entry.installationId, entry.pageKey),
    icon: createRemoteNavIcon(entry.icon),
  }
}

function useAppPageRuntimeNavigation(client: UiExtensionsClient): AdminNavigationContribution[] {
  return createAppPageNavigationContributions(useAppPageNavEntries(client))
}

/** Legacy flat projection retained for hosts that predate runtime contributions. */
function useAppPageRuntimeNavItems(client: UiExtensionsClient): NavItem[] {
  return useAppPageNavEntries(client).map(toAppPageNavItem)
}

/**
 * Build a standard admin extension that mounts installed UI extensions into
 * every public slot. It contributes one widget per registry slot; each widget
 * reads the shared install list and renders a {@link UiExtensionHost} per
 * descriptor that targets the slot. List failures render nothing (fail-soft).
 *
 * It also surfaces installed full-page app extensions as first-class navigation:
 * {@link AdminExtension.useRuntimeNavigation} contributes sidebar entries for
 * active pages (icon + label), and a single param route renders the page through
 * {@link AppExtensionPage}. Pausing/uninstalling an app drops the page from the
 * resolver, so both the nav entry and the route target vanish on the next query.
 */
export function createUiExtensionsAdminExtension({
  client,
  labels,
}: CreateUiExtensionsAdminExtensionOptions): AdminExtension {
  const AppPageRoute = createAppPageRouteComponent(client)
  const appPageRouteTitle = labels?.appPageTitle ?? APP_PAGE_ROUTE_TITLE_FALLBACK
  return defineAdminExtension({
    id: "voyant-ui-extensions",
    widgets: ADMIN_UI_EXTENSION_SLOTS.map((slot) => ({
      id: `voyant-ui-extensions:${slot}`,
      slot,
      component: function UiExtensionsSlotWidget() {
        return <SlotUiExtensions client={client} slot={slot} />
      },
    })),
    routes: [
      {
        id: APP_PAGE_ROUTE_ID,
        path: APP_PAGE_ROUTE_PATH,
        title: appPageRouteTitle,
        page: async () => ({ default: AppPageRoute }),
      },
    ],
    useRuntimeNavigation: function useRuntimeNavigation() {
      return useAppPageRuntimeNavigation(client)
    },
    useRuntimeNavItems: function useRuntimeNavItems() {
      return useAppPageRuntimeNavItems(client)
    },
  })
}
