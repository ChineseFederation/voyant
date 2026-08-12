import { Link, Outlet, useRouterState } from "@tanstack/react-router"
import { useOperatorAdminMessages } from "@voyant-travel/admin/providers/operator-admin-messages"
import { cn } from "@voyant-travel/ui/lib/utils"
import { useEffect, useRef } from "react"

import {
  type AdminCoreSettingsExtraNavEntry,
  type AdminCoreSettingsNavGroup,
  type AdminCoreSettingsNavIcon,
  type AdminCoreSettingsPageId,
  adminCoreSettingsNavEntries,
} from "./settings-nav.js"

/**
 * The settings area layout (packaged from the operator starter's
 * `SettingsLayout`): a grouped sub-navigation sidebar plus an outlet for
 * the active settings page. Mounted as the core extension's `/settings`
 * layout route; the child pages render into the outlet.
 *
 * Built-in nav entries resolve their labels reactively through
 * `useOperatorAdminMessages`; app-supplied extras pass a string or a
 * messages-resolver through the core extension factory.
 */
export interface AdminCoreSettingsLayoutProps {
  basePath: string
  omit?: ReadonlyArray<AdminCoreSettingsPageId>
  extras?: ReadonlyArray<AdminCoreSettingsExtraNavEntry>
}

interface ResolvedNavItem {
  id: string
  label: string
  href: string
  icon?: AdminCoreSettingsNavIcon
  order: number
}

export function AdminCoreSettingsLayout({
  basePath,
  omit = [],
  extras = [],
}: AdminCoreSettingsLayoutProps) {
  const messages = useOperatorAdminMessages()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  const itemsByGroup = new Map<AdminCoreSettingsNavGroup, ResolvedNavItem[]>()
  const push = (group: AdminCoreSettingsNavGroup, item: ResolvedNavItem) => {
    const bucket = itemsByGroup.get(group) ?? []
    bucket.push(item)
    itemsByGroup.set(group, bucket)
  }

  for (const entry of adminCoreSettingsNavEntries) {
    if (omit.includes(entry.id)) continue
    push(entry.group, {
      id: entry.id,
      label: entry.label(messages.settings),
      href: `${basePath}${entry.path}`,
      icon: entry.icon,
      order: entry.order,
    })
  }
  for (const extra of extras) {
    push(extra.group, {
      id: extra.id,
      label: typeof extra.label === "function" ? extra.label(messages) : extra.label,
      href: extra.href,
      icon: extra.icon,
      order: extra.order,
    })
  }

  const navGroups = (
    [
      { group: "general", title: messages.settings.generalGroup },
      { group: "products", title: messages.settings.productsGroup },
    ] satisfies Array<{ group: AdminCoreSettingsNavGroup; title: string }>
  )
    .map(({ group, title }) => ({
      title,
      items: [...(itemsByGroup.get(group) ?? [])].sort((a, b) => a.order - b.order),
    }))
    .filter((group) => group.items.length > 0)

  const isActive = (href: string) => pathname.replace(/\/$/, "") === href

  const activeHref =
    navGroups.flatMap((group) => group.items).find((item) => isActive(item.href))?.href ?? null

  // On a phone the nav is a scroll strip roughly six times wider than the
  // viewport, so without this the active section is almost always scrolled out
  // of sight and there is nothing to say which of ~18 sections you are in.
  //
  // Keyed on the active entry rather than on mount: the settings pages are child
  // routes of this layout, so moving between them — including via browser
  // back/forward — keeps this component alive, and a mount-only effect would
  // leave the strip parked on whichever section was active when it first
  // rendered. Keying on the resolved href rather than `pathname` also avoids
  // re-scrolling when only a query string changes.
  const navRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!activeHref) return
    const active = navRef.current?.querySelector<HTMLElement>("[data-settings-nav-active='true']")
    active?.scrollIntoView({ block: "nearest", inline: "center" })
  }, [activeHref])

  // Full-height two-pane settings shell. It bleeds out of the shared page
  // padding (px-4 py-6 md:px-6 from the workspace layout) so the panes stay
  // edge-to-edge; the content pane re-adds its own padding below.
  return (
    <div className="-mx-4 -my-6 flex flex-col md:-mx-6 md:h-[calc(100vh-0px)] md:flex-row">
      <aside className="shrink-0 border-b md:w-64 md:overflow-y-auto md:border-r md:border-b-0 md:p-6">
        {/* Title only on desktop — on mobile the nav collapses to a thin scroll strip. */}
        <div className="hidden md:block">
          <h1 className="text-xl font-semibold tracking-tight">{messages.settings.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{messages.settings.description}</p>
        </div>
        <nav
          ref={navRef}
          className="flex gap-1 overflow-x-auto px-4 py-3 md:mt-6 md:flex-col md:gap-6 md:overflow-x-visible md:px-0 md:py-0"
        >
          {navGroups.map((group) => (
            <div key={group.title} className="flex gap-1 md:flex-col md:gap-0">
              <h3 className="mb-2 hidden px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground md:block">
                {group.title}
              </h3>
              <ul className="flex gap-1 md:flex-col md:gap-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      to={item.href}
                      data-settings-nav-active={isActive(item.href) ? "true" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors",
                        isActive(item.href)
                          ? "bg-accent font-medium text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                      )}
                    >
                      {item.icon ? <item.icon className="h-4 w-4 shrink-0" /> : null}
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 p-4 md:overflow-y-auto md:p-6">
        <Outlet />
      </div>
    </div>
  )
}
