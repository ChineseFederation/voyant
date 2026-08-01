"use client"

import {
  cn,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@voyant-travel/ui/components"
import { Settings as DefaultSettingsIcon } from "lucide-react"
import type * as React from "react"

import {
  type AdminExtension,
  type AdminNavigationContribution,
  resolveAdminNavigation,
} from "../extensions.js"
import {
  createOperatorAdminNavigation,
  type OperatorAdminNavigationIcons,
  resolveOperatorAdminNavigation,
} from "../navigation/operator-navigation.js"
import type { AdminNavigationPreferences } from "../navigation/preferences.js"
import { AdminExtensionsProvider } from "../providers/admin-extensions.js"
import { useOperatorAdminMessages } from "../providers/operator-admin-messages.js"
import type { AdminUser, NavItem, NavSubItem } from "../types.js"
import {
  AdminBreadcrumbsProvider,
  AdminBreadcrumbsTrail,
  useAdminBreadcrumbsValue,
} from "./admin-breadcrumbs.js"
import { AdminNavGroup } from "./admin-nav-group.js"
import { type AdminNavLinkComponent, DefaultAdminNavLink } from "./admin-nav-link.js"
import { type AdminPageHeadOptions, AdminPageHeadProvider } from "./admin-page-head.js"
import { VoyantMark } from "./brand/voyant-mark.js"
import { VoyantWordmark } from "./brand/voyant-wordmark.js"
import { OperatorAdminUserMenu } from "./operator-admin-user-menu.js"

/**
 * Collect each extension's optional runtime navigation hooks in stable extension
 * order. Declarative contributions retain standard order/anchor behavior; the
 * legacy flat hook remains the fallback for extensions without the richer hook.
 *
 * Rules-of-hooks: the extension registry is a stable, append-only list, so
 * calling each runtime hook once per render in a fixed order keeps hook call
 * order stable across renders.
 */
function useRuntimeExtensionNavigation(
  extensions: ReadonlyArray<AdminExtension> | undefined,
): AdminNavigationContribution[] {
  const contributions: AdminNavigationContribution[] = []
  for (const extension of extensions ?? []) {
    if (extension.useRuntimeNavigation) {
      // biome-ignore lint/correctness/useHookAtTopLevel: owner: admin; intentional -- the extension registry and hook shape are stable, so calling each extension's preferred runtime nav hook once per render keeps hook order stable.
      contributions.push(...extension.useRuntimeNavigation())
      continue
    }
    // biome-ignore lint/correctness/useHookAtTopLevel: owner: admin; same stable extension-registry contract as above; this is the backwards-compatible fallback.
    const legacyItems = extension.useRuntimeNavItems?.() ?? []
    if (legacyItems.length) contributions.push({ items: legacyItems })
  }
  return contributions
}

function mergeRuntimeExtensionNavigation(
  staticItems: ReadonlyArray<NavItem>,
  contributions: ReadonlyArray<AdminNavigationContribution>,
): NavItem[] {
  if (!contributions.length) return [...staticItems]
  return resolveAdminNavigation({
    baseItems: staticItems,
    extensions: [{ id: "voyant-runtime-navigation", navigation: contributions }],
  })
}

export interface OperatorAdminSidebarProps
  extends Omit<React.ComponentProps<typeof Sidebar>, "children"> {
  accountHref?: string
  brand?: React.ReactNode
  currentPath: string
  extensions?: ReadonlyArray<AdminExtension>
  icons?: OperatorAdminNavigationIcons
  linkComponent?: AdminNavLinkComponent
  navItems?: ReadonlyArray<NavItem>
  navigationPreferences?: AdminNavigationPreferences
  onSignOut?: () => void | Promise<void>
  user?: AdminUser | null
}

export interface DefaultOperatorAdminBrandProps {
  href?: string
  linkComponent?: AdminNavLinkComponent
}

export function DefaultOperatorAdminBrand({
  href = "/",
  linkComponent: LinkComponent = DefaultAdminNavLink,
}: DefaultOperatorAdminBrandProps) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          tooltip="Voyant"
          size="lg"
          className="gap-2 text-foreground group-data-[collapsible=icon]:justify-center"
        >
          <LinkComponent href={href} target="_self" aria-label="Voyant">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
              <VoyantMark aria-hidden="true" className="size-4!" />
            </span>
            <VoyantWordmark
              aria-hidden="true"
              className="h-[1.125rem]! w-auto! group-data-[collapsible=icon]:hidden!"
            />
          </LinkComponent>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

export function OperatorAdminSidebar({
  accountHref,
  brand,
  currentPath,
  extensions,
  icons,
  linkComponent,
  navItems,
  navigationPreferences,
  onSignOut,
  user,
  variant = "inset",
  ...props
}: OperatorAdminSidebarProps) {
  const messages = useOperatorAdminMessages()
  const baseItems = navItems ?? createOperatorAdminNavigation({ icons, messages: messages.nav })
  const staticItems = resolveOperatorAdminNavigation({
    baseItems,
    extensions,
    preferences: navigationPreferences,
  })
  const runtimeNavigation = useRuntimeExtensionNavigation(extensions)
  const resolvedItems = mergeRuntimeExtensionNavigation(staticItems, runtimeNavigation)
  const resolvedBrand = brand ?? <DefaultOperatorAdminBrand linkComponent={linkComponent} />
  const LinkComponent = linkComponent ?? DefaultAdminNavLink
  const SettingsIcon = icons?.settings ?? DefaultSettingsIcon
  const settingsActive = navUrlMatchesPath("/settings", currentPath)

  return (
    <Sidebar collapsible="icon" variant={variant} {...props}>
      <SidebarHeader>{resolvedBrand}</SidebarHeader>
      <SidebarContent>
        <AdminNavGroup
          currentPath={currentPath}
          items={resolvedItems}
          linkComponent={linkComponent}
        />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={settingsActive} tooltip={messages.nav.settings}>
              <LinkComponent href="/settings">
                <SettingsIcon />
                <span>{messages.nav.settings}</span>
              </LinkComponent>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {user && (
          <OperatorAdminUserMenu
            accountHref={accountHref}
            linkComponent={linkComponent}
            onSignOut={onSignOut}
            user={user}
          />
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

export interface OperatorAdminWorkspaceLayoutProps {
  accountHref?: string
  brand?: React.ReactNode
  children: React.ReactNode
  currentPath: string
  defaultOpen?: React.ComponentProps<typeof SidebarProvider>["defaultOpen"]
  extensions?: ReadonlyArray<AdminExtension>
  headerClassName?: string
  /**
   * Left slot of the inset header (after the sidebar trigger). When
   * omitted, a default breadcrumb showing the resolved page title is
   * rendered automatically.
   */
  headerSlot?: React.ReactNode
  /** Right slot of the inset header — meant for page actions. */
  headerSlotRight?: React.ReactNode
  icons?: OperatorAdminNavigationIcons
  linkComponent?: AdminNavLinkComponent
  mainClassName?: string
  /**
   * Classes for the wrapper around the page outlet. Defaults to the shared
   * page padding (`px-4 py-6 md:px-6`) so every screen gets consistent
   * top/bottom/left/right spacing. Pass `""` for full-bleed routes that manage
   * their own edges (e.g. a full-height two-pane layout).
   */
  contentClassName?: string
  navItems?: ReadonlyArray<NavItem>
  navigationPreferences?: AdminNavigationPreferences
  onSignOut?: () => void | Promise<void>
  pageHead?: (AdminPageHeadOptions & { titleOverride?: string | null }) | false
  side?: React.ComponentProps<typeof Sidebar>["side"]
  sidebarProps?: Omit<OperatorAdminSidebarProps, "currentPath">
  showSidebarTrigger?: boolean
  user?: AdminUser | null
  variant?: React.ComponentProps<typeof Sidebar>["variant"]
}

function normalizePath(path: string): string {
  const withoutHash = path.split("#")[0] ?? ""
  const withoutSearch = withoutHash.split("?")[0] ?? ""
  const normalized = withoutSearch.replace(/\/+$/, "")

  return normalized || "/"
}

function navUrlMatchesPath(navUrl: string, currentPath: string): boolean {
  const normalizedUrl = normalizePath(navUrl)
  const normalizedPath = normalizePath(currentPath)

  if (normalizedUrl === "/") {
    return normalizedPath === "/"
  }

  return normalizedPath === normalizedUrl || normalizedPath.startsWith(`${normalizedUrl}/`)
}

export function resolveAdminPageTitle(
  currentPath: string,
  navItems: ReadonlyArray<NavItem>,
): string | null {
  let matchedTitle: string | null = null
  let matchedUrlLength = -1
  const visitItem = (item: NavItem | NavSubItem) => {
    if (navUrlMatchesPath(item.url, currentPath)) {
      const urlLength = normalizePath(item.url).length
      if (urlLength >= matchedUrlLength) {
        matchedTitle = item.title
        matchedUrlLength = urlLength
      }
    }

    if ("items" in item) {
      item.items?.forEach(visitItem)
    }
  }

  navItems.forEach(visitItem)

  return matchedTitle
}

export function OperatorAdminWorkspaceLayout({
  accountHref,
  brand,
  children,
  currentPath,
  defaultOpen,
  extensions,
  headerClassName,
  headerSlot,
  headerSlotRight,
  icons,
  linkComponent,
  mainClassName = "flex-1",
  contentClassName = "px-4 py-6 md:px-6",
  navItems,
  navigationPreferences,
  onSignOut,
  pageHead,
  side,
  sidebarProps,
  showSidebarTrigger = true,
  user,
  variant,
}: OperatorAdminWorkspaceLayoutProps) {
  const messages = useOperatorAdminMessages()
  const {
    extensions: sidebarExtensions,
    navItems: sidebarNavItems,
    side: sidebarSide,
    ...restSidebarProps
  } = sidebarProps ?? {}
  const baseItems =
    sidebarNavItems ?? navItems ?? createOperatorAdminNavigation({ icons, messages: messages.nav })
  const activeExtensions = sidebarExtensions ?? extensions
  const staticItems = resolveOperatorAdminNavigation({
    baseItems,
    extensions: activeExtensions,
    preferences: navigationPreferences,
  })
  // Merge runtime nav here (not just in the sidebar) so app-page entries are
  // resolved for both the sidebar tree and the page-title/breadcrumb lookup;
  // the nested sidebar is handed the merged list with `extensions={undefined}`.
  const runtimeNavigation = useRuntimeExtensionNavigation(activeExtensions)
  const resolvedItems = mergeRuntimeExtensionNavigation(staticItems, runtimeNavigation)
  const resolvedSide = sidebarSide ?? side
  let pageTitle: string | null = null
  if (pageHead !== false) {
    if (pageHead?.titleOverride !== undefined) {
      pageTitle = pageHead.titleOverride
    } else if (pageHead?.title !== undefined) {
      pageTitle = pageHead.title
    } else {
      pageTitle = resolveAdminPageTitle(currentPath, resolvedItems)
    }
  }
  const pageHeadBase =
    pageHead === false
      ? null
      : {
          brand: pageHead?.brand ?? "Voyant",
          description: pageHead?.description ?? null,
          title: pageTitle,
        }
  const sidebar = (
    <OperatorAdminSidebar
      accountHref={accountHref}
      brand={brand}
      currentPath={currentPath}
      extensions={undefined}
      icons={icons}
      linkComponent={linkComponent}
      navItems={resolvedItems}
      onSignOut={onSignOut}
      side={resolvedSide}
      user={user}
      variant={variant}
      {...restSidebarProps}
    />
  )
  const headerHasContent = showSidebarTrigger || headerSlot !== undefined || pageTitle != null
  const hasHeader = headerHasContent || headerSlotRight != null
  const inset = (
    <SidebarInset className={mainClassName}>
      {hasHeader && (
        <header
          className={cn(
            "flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12",
            headerClassName,
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            {showSidebarTrigger && (
              <SidebarTrigger
                className="-ml-1"
                title={messages.toggleSidebarShortcut}
                aria-label={messages.toggleSidebar}
              />
            )}
            {headerSlot !== undefined ? (
              headerSlot
            ) : (
              <DefaultHeaderBreadcrumb linkComponent={linkComponent} pageTitle={pageTitle} />
            )}
          </div>
          {headerSlotRight && (
            <div className="flex shrink-0 items-center gap-2">{headerSlotRight}</div>
          )}
        </header>
      )}
      <div
        data-slot="operator-admin-page-content"
        className={cn("min-w-0 flex-1", contentClassName)}
      >
        {children}
      </div>
    </SidebarInset>
  )
  const workspace =
    resolvedSide === "right" ? (
      <>
        {inset}
        {sidebar}
      </>
    ) : (
      <>
        {sidebar}
        {inset}
      </>
    )

  return (
    <AdminExtensionsProvider extensions={extensions}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AdminBreadcrumbsProvider>
          {pageHead === false ? (
            workspace
          ) : (
            <AdminPageHeadProvider baseHead={pageHeadBase}>{workspace}</AdminPageHeadProvider>
          )}
        </AdminBreadcrumbsProvider>
      </SidebarProvider>
    </AdminExtensionsProvider>
  )
}

function DefaultHeaderBreadcrumb({
  linkComponent,
  pageTitle,
}: {
  linkComponent?: AdminNavLinkComponent
  pageTitle: string | null
}) {
  const segments = useAdminBreadcrumbsValue()
  if (segments.length > 0) {
    return <AdminBreadcrumbsTrail linkComponent={linkComponent} segments={segments} />
  }
  if (pageTitle == null) return null
  return <AdminBreadcrumbsTrail linkComponent={linkComponent} segments={[{ label: pageTitle }]} />
}
