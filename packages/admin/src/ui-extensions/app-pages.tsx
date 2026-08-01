"use client"

/**
 * Full-page app extensions (RFC §6): an app declares admin pages under an
 * app-owned admin route plus navigation contributions. Pages render through the
 * same sandboxed host as slot extensions — no `allow-same-origin`, unchanged
 * sandbox posture — but fill the available height instead of following the
 * frame's self-reported resize height.
 */
import { useQuery } from "@tanstack/react-query"
import {
  ADMIN_UI_EXTENSION_API_VERSION,
  type UiExtensionContext,
  type UiExtensionDescriptor,
} from "@voyant-travel/admin-extension-sdk"

import { useLocale } from "../providers/locale.js"
import { useTheme } from "../providers/theme.js"
import { UiExtensionHost } from "./ui-extension-host.js"
import {
  type AppPageDescriptor,
  type UiExtensionEnvironment,
  type UiExtensionsClient,
  useUiExtensionEnvironment,
} from "./ui-extensions-extension.js"

/** Query key for the installed full-page app extensions. */
export const APP_PAGES_QUERY_KEY = ["voyant", "admin", "app-pages"] as const

let warnedPageListError = false

function useInstalledAppPagesQuery(client: UiExtensionsClient) {
  return useQuery({
    queryKey: APP_PAGES_QUERY_KEY,
    queryFn: async () => (client.listPages ? client.listPages() : []),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}

/** Read the installed app pages (fail-soft: list errors resolve to none). */
export function useInstalledAppPages(client: UiExtensionsClient): AppPageDescriptor[] {
  const query = useInstalledAppPagesQuery(client)
  if (query.isError) {
    if (!warnedPageListError) {
      warnedPageListError = true
      console.warn("[voyant-admin] Failed to list app pages; rendering none.", query.error)
    }
    return []
  }
  return query.data ?? []
}

/** A navigation entry contributed by an installed app page. */
export interface AppPageNavEntry {
  /** Stable per-installation key (`<installationId>:<manifest key>`). */
  key: string
  /** Owning installation id — pairs with {@link pageKey} to build the route url. */
  installationId: string
  /** Manifest page key (unique within an installation, may repeat across them). */
  pageKey: string
  /** App-owned admin sub-path declared by the manifest (e.g. `/settings`). */
  path: string
  label: string
  /** App-declared nav icon URL (HTTPS). Absent → host renders a generic icon. */
  icon?: string
  /** Lower values appear first; omitted values resolve as `0`. */
  order?: number
  /** Installation-local structural navigation group key. */
  group?: string
  /** Host-localized label for {@link group}. */
  groupLabel?: string
  /** Existing host navigation item id after which this page/group is inserted. */
  insertAfter?: string
}

/**
 * Split a resolved descriptor key (`<installationId>:<manifest key>`) back into
 * its parts. Installation ids never contain a colon, so the first colon is the
 * boundary; a manifest key may itself contain colons and is kept intact.
 */
function splitPageKey(page: AppPageDescriptor): { installationId: string; pageKey: string } {
  const installationId = page.installationId ?? ""
  const prefix = `${installationId}:`
  if (installationId && page.key.startsWith(prefix)) {
    return { installationId, pageKey: page.key.slice(prefix.length) }
  }
  const separator = page.key.indexOf(":")
  if (separator === -1) return { installationId, pageKey: page.key }
  return { installationId: page.key.slice(0, separator), pageKey: page.key.slice(separator + 1) }
}

/**
 * Navigation contributions for installed app pages. The admin shell renders
 * these as nav entries pointing at the app-owned admin route.
 */
export function useAppPageNavEntries(client: UiExtensionsClient): AppPageNavEntry[] {
  return useInstalledAppPages(client).map((page) => {
    const { installationId, pageKey } = splitPageKey(page)
    return {
      key: page.key,
      installationId,
      pageKey,
      path: page.path,
      label: page.navLabel,
      ...(page.icon ? { icon: page.icon } : {}),
      ...(page.order !== undefined ? { order: page.order } : {}),
      ...(page.group ? { group: page.group } : {}),
      ...(page.groupLabel ? { groupLabel: page.groupLabel } : {}),
      ...(page.insertAfter ? { insertAfter: page.insertAfter } : {}),
    }
  })
}

/** Adapt a page descriptor into the SDK descriptor shape the host renders. */
function toPageHostDescriptor(page: AppPageDescriptor): UiExtensionDescriptor {
  return {
    key: page.key,
    version: "1.0.0",
    displayName: page.title,
    // Pages use the same protocol as the host implements; they are release-pinned
    // by the installation rather than gated on a manifest-declared range.
    extensionApi: ADMIN_UI_EXTENSION_API_VERSION,
    entryUrl: page.entryUrl,
    slots: [],
  }
}

export interface AppExtensionPageProps {
  page: AppPageDescriptor
  /** Ambient environment; defaults to the nearest provider. */
  environment?: UiExtensionEnvironment
  className?: string
}

/**
 * Render one full-page app extension. Reads org/viewer/token-broker from the
 * environment and passes the page's resolved app locale/direction to the frame.
 * Fails soft through the same error-card path as slot extensions.
 */
export function AppExtensionPage({ page, environment, className }: AppExtensionPageProps) {
  const ambient = useUiExtensionEnvironment()
  const env = environment ?? ambient
  const { resolvedTheme } = useTheme()
  const { resolvedLocale } = useLocale()

  if (!env) return null

  const context: UiExtensionContext = {
    org: env.org,
    viewer: env.viewer,
    entity: null,
    theme: resolvedTheme,
    locale: resolvedLocale,
    appLocale: page.appLocale ?? resolvedLocale,
    direction: page.direction ?? "ltr",
  }
  const broker = env.requestToken

  return (
    <UiExtensionHost
      descriptor={toPageHostDescriptor(page)}
      slot={`page:${page.path}`}
      context={context}
      fill
      className={className}
      onNavigate={env.onNavigate}
      onToast={env.onToast}
      onRequestToken={
        broker
          ? () =>
              broker({
                descriptor: { ...toPageHostDescriptor(page), installationId: page.installationId },
                slot: `page:${page.path}`,
                entity: null,
              })
          : undefined
      }
    />
  )
}
