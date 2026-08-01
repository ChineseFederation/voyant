/**
 * Installation-backed admin extension resolution (RFC §6, Phase 3).
 *
 * Replaces the static self-hosted descriptor list as the source of activated
 * admin extensions: descriptors come from `app_extension_installations` for
 * `active` installations only, so pausing, degrading, or uninstalling an app
 * immediately drops its pages and slots. Slot extensions are filtered by
 * release-pinned `extensionApi` compatibility, and host-rendered labels (nav
 * entries, extension titles) plus the resolved app locale + text direction come
 * from the installed release's declared locales and `app_release_localizations`.
 *
 * The returned descriptors are the exact shape the admin host consumes; static
 * deployment-graph descriptors remain supported alongside these.
 */
import {
  ADMIN_UI_EXTENSION_API_VERSION,
  isUiExtensionCompatible,
  type UiExtensionDescriptor,
} from "@voyant-travel/admin-extension-sdk"
import { and, eq, inArray } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  type AppTextDirection,
  createHostLabelResolver,
  type HostLabelRow,
  resolveAppLocale,
} from "./locale-resolution.js"
import {
  appExtensionInstallations,
  appInstallations,
  appReleaseLocalizations,
  appReleases,
} from "./schema.js"

/** A resolved slot/dashboard extension plus the app locale its frame renders in. */
export interface ResolvedUiSlotExtension {
  descriptor: UiExtensionDescriptor
  installationId: string
  appId: string
  appLocale: string
  direction: AppTextDirection
}

/** A resolved full-page app extension mounted under the app-owned admin route. */
export interface ResolvedAppPage {
  /** Stable per-installation key (`<installationId>:<manifest key>`). */
  key: string
  installationId: string
  appId: string
  /** App-owned admin sub-path declared by the manifest (e.g. `/settings`). */
  path: string
  entryUrl: string
  /** Host-rendered page title, locale-resolved with deterministic fallback. */
  title: string
  /** Host-rendered navigation label for the page's nav entry. */
  navLabel: string
  /**
   * App-declared nav icon (HTTPS remote asset). Already resolved through the
   * app-level default at manifest-normalize time; absent when neither the page
   * nor the app declared one (the host falls back to a generic app icon).
   */
  icon?: string
  /** Deterministic navigation order; omitted manifest values resolve to `0`. */
  order: number
  /** Installation-local structural group key, when the page is grouped. */
  group?: string
  /** Locale-resolved label for {@link group}. */
  groupLabel?: string
  /** Existing host navigation item id after which this page or group is inserted. */
  insertAfter?: string
  appLocale: string
  direction: AppTextDirection
}

export interface ResolvedInstalledExtensions {
  slots: ResolvedUiSlotExtension[]
  pages: ResolvedAppPage[]
}

export interface ResolveInstalledExtensionsInput {
  deploymentId: string
  /** The staff member's active admin locale. */
  activeLocale: string
  /** The extension API version the host implements (defaults to the SDK's). */
  extensionApiVersion?: string
}

interface ReleaseLocaleDeclaration {
  defaultLocale: string
  supportedLocales: readonly string[]
}

/** One row of an active installation's active extension, as read from the store. */
export interface InstalledExtensionRow {
  installationId: string
  appId: string
  extensionKey: string
  descriptor: Record<string, unknown>
  releaseId: string
  defaultLocale: string
  supportedLocales: readonly string[]
}

export async function resolveInstalledExtensions(
  db: PostgresJsDatabase,
  input: ResolveInstalledExtensionsInput,
): Promise<ResolvedInstalledExtensions> {
  const rows = await db
    .select({
      installationId: appInstallations.id,
      appId: appInstallations.appId,
      extensionKey: appExtensionInstallations.extensionKey,
      descriptor: appExtensionInstallations.descriptor,
      releaseId: appExtensionInstallations.releaseId,
      defaultLocale: appReleases.defaultLocale,
      supportedLocales: appReleases.supportedLocales,
    })
    .from(appExtensionInstallations)
    .innerJoin(appInstallations, eq(appExtensionInstallations.installationId, appInstallations.id))
    .innerJoin(appReleases, eq(appExtensionInstallations.releaseId, appReleases.id))
    .where(
      and(
        eq(appInstallations.deploymentId, input.deploymentId),
        // Active installations only: paused/degraded/uninstalled apps unmount.
        eq(appInstallations.status, "active"),
        eq(appExtensionInstallations.status, "active"),
      ),
    )

  const localizationsByRelease = await loadLocalizations(
    db,
    rows.map((row) => row.releaseId),
  )
  return assembleInstalledExtensions(rows, localizationsByRelease, {
    activeLocale: input.activeLocale,
    extensionApiVersion: input.extensionApiVersion,
  })
}

/**
 * Pure assembly of resolved descriptors from store rows and localization data.
 * Applies compatibility filtering, locale resolution, and host-label lookup.
 * The `rows` are assumed to already be scoped to active installations/extensions.
 */
export function assembleInstalledExtensions(
  rows: readonly InstalledExtensionRow[],
  localizationsByRelease: Map<string, HostLabelRow[]>,
  options: { activeLocale: string; extensionApiVersion?: string },
): ResolvedInstalledExtensions {
  const version = options.extensionApiVersion ?? ADMIN_UI_EXTENSION_API_VERSION

  const slots: ResolvedUiSlotExtension[] = []
  const pages: ResolvedAppPage[] = []

  for (const row of rows) {
    const declaration: ReleaseLocaleDeclaration = {
      defaultLocale: row.defaultLocale,
      supportedLocales: row.supportedLocales,
    }
    const locale = resolveAppLocale(options.activeLocale, declaration)
    const labels = createHostLabelResolver(
      localizationsByRelease.get(row.releaseId) ?? [],
      locale.appLocale,
      declaration.defaultLocale,
    )

    if (row.extensionKey.startsWith("page:")) {
      const page = parsePageDescriptor(row.descriptor)
      if (!page) continue
      const title = labels.resolve(page.titleKey, ["extension", "navigation"]) ?? page.key
      const navLabel = labels.resolve(page.titleKey, ["navigation", "extension"]) ?? title
      const groupLabel = page.group
        ? (labels.resolve(page.group, ["navigation", "extension"]) ?? page.group)
        : undefined
      pages.push({
        key: `${row.installationId}:${page.key}`,
        installationId: row.installationId,
        appId: row.appId,
        path: page.path,
        entryUrl: page.entryUrl,
        title,
        navLabel,
        ...(page.icon ? { icon: page.icon } : {}),
        order: page.order ?? 0,
        ...(page.group ? { group: page.group, groupLabel: groupLabel ?? page.group } : {}),
        ...(page.insertAfter ? { insertAfter: page.insertAfter } : {}),
        appLocale: locale.appLocale,
        direction: locale.direction,
      })
      continue
    }

    if (row.extensionKey.startsWith("slot:")) {
      const slot = parseSlotDescriptor(row.descriptor)
      if (!slot) continue
      // Release-pinned compatibility filter: an incompatible extension is not
      // mounted (the host's render-time check is defense-in-depth).
      if (!isUiExtensionCompatible(slot.extensionApi, version)) continue
      const displayName = labels.resolve(slot.titleKey, ["extension", "navigation"]) ?? slot.key
      slots.push({
        descriptor: {
          key: `${row.installationId}:${slot.key}`,
          version: slot.version,
          displayName,
          extensionApi: slot.extensionApi,
          entryUrl: slot.entryUrl,
          slots: slot.slots,
          ...(slot.config ? { config: slot.config } : {}),
        },
        installationId: row.installationId,
        appId: row.appId,
        appLocale: locale.appLocale,
        direction: locale.direction,
      })
    }
  }

  return { slots, pages }
}

async function loadLocalizations(
  db: PostgresJsDatabase,
  releaseIds: readonly string[],
): Promise<Map<string, HostLabelRow[]>> {
  const unique = [...new Set(releaseIds)]
  const grouped = new Map<string, HostLabelRow[]>()
  if (unique.length === 0) return grouped
  const rows = await db
    .select({
      releaseId: appReleaseLocalizations.releaseId,
      locale: appReleaseLocalizations.locale,
      surface: appReleaseLocalizations.surface,
      messageKey: appReleaseLocalizations.messageKey,
      text: appReleaseLocalizations.text,
    })
    .from(appReleaseLocalizations)
    .where(inArray(appReleaseLocalizations.releaseId, unique))
  for (const row of rows) {
    const list = grouped.get(row.releaseId) ?? []
    list.push({
      locale: row.locale,
      surface: row.surface,
      messageKey: row.messageKey,
      text: row.text,
    })
    grouped.set(row.releaseId, list)
  }
  return grouped
}

interface ParsedPageDescriptor {
  key: string
  titleKey: string
  path: string
  entryUrl: string
  icon?: string
  order?: number
  group?: string
  insertAfter?: string
}

function parsePageDescriptor(value: Record<string, unknown>): ParsedPageDescriptor | null {
  const key = stringField(value.key)
  const titleKey = stringField(value.titleKey)
  const path = stringField(value.path)
  const entryUrl = stringField(value.entryUrl)
  if (!key || !titleKey || !path || !entryUrl) return null
  const icon = stringField(value.icon)
  const order =
    typeof value.order === "number" &&
    Number.isInteger(value.order) &&
    value.order >= -10_000 &&
    value.order <= 10_000
      ? value.order
      : undefined
  const group = stringField(value.group) ?? undefined
  const insertAfter = stringField(value.insertAfter) ?? undefined
  return {
    key,
    titleKey,
    path,
    entryUrl,
    ...(icon ? { icon } : {}),
    ...(order !== undefined ? { order } : {}),
    ...(group ? { group } : {}),
    ...(insertAfter ? { insertAfter } : {}),
  }
}

interface ParsedSlotDescriptor {
  key: string
  titleKey: string
  version: string
  extensionApi: string
  entryUrl: string
  slots: string[]
  config?: Record<string, unknown>
}

function parseSlotDescriptor(value: Record<string, unknown>): ParsedSlotDescriptor | null {
  const key = stringField(value.key)
  const titleKey = stringField(value.titleKey)
  const version = stringField(value.version)
  const extensionApi = stringField(value.extensionApi)
  const entryUrl = stringField(value.entryUrl)
  const slots = Array.isArray(value.slots)
    ? value.slots.filter((slot): slot is string => typeof slot === "string")
    : []
  if (!key || !titleKey || !version || !extensionApi || !entryUrl || slots.length === 0) return null
  const config =
    value.config && typeof value.config === "object" && !Array.isArray(value.config)
      ? (value.config as Record<string, unknown>)
      : undefined
  return { key, titleKey, version, extensionApi, entryUrl, slots, config }
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}
