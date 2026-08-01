import {
  Building,
  Building2,
  CalendarCheck,
  CalendarDays,
  DollarSign,
  LayoutDashboard,
  Library,
  Mail,
  Package,
  Plane,
  Radio,
  Scale,
  Settings,
  Users,
  Wrench,
} from "lucide-react"
import { type AdminExtension, resolveAdminNavigation } from "../extensions.js"
import type { OperatorAdminMessages } from "../providers/operator-admin-messages.js"
import type { NavItem } from "../types.js"
import {
  type AdminNavigationPreferences,
  resolveAdminNavigationPreferences,
} from "./preferences.js"

export type OperatorAdminNavigationIconName =
  | "availability"
  | "bookings"
  | "catalog"
  | "channelSync"
  | "dashboard"
  | "finance"
  | "flights"
  | "legal"
  | "notifications"
  | "organizations"
  | "people"
  | "products"
  | "resources"
  | "settings"
  | "suppliers"

export type OperatorAdminNavigationIcons = Partial<
  Record<OperatorAdminNavigationIconName, NavItem["icon"]>
>

/**
 * Compatibility icon set for hosts that construct explicit navigation items.
 * Graph-selected package factories own their standard domain icons; the shared
 * shell consumes the dashboard and settings entries from this map.
 */
export const defaultOperatorNavIcons: Record<OperatorAdminNavigationIconName, NavItem["icon"]> = {
  availability: CalendarDays,
  bookings: CalendarCheck,
  catalog: Library,
  channelSync: Radio,
  dashboard: LayoutDashboard,
  finance: DollarSign,
  flights: Plane,
  legal: Scale,
  notifications: Mail,
  organizations: Building,
  people: Users,
  products: Package,
  resources: Wrench,
  settings: Settings,
  suppliers: Building2,
}

export interface CreateOperatorAdminNavigationOptions {
  messages: OperatorAdminMessages["nav"]
  icons?: OperatorAdminNavigationIcons
}

export function createOperatorAdminNavigation({
  icons = {},
  messages,
}: CreateOperatorAdminNavigationOptions): NavItem[] {
  return [
    {
      id: "dashboard",
      title: messages.dashboard,
      url: "/",
      icon: icons.dashboard,
    },
  ]
}

export interface ResolveOperatorAdminNavigationOptions {
  baseItems: ReadonlyArray<NavItem>
  extensions?: ReadonlyArray<AdminExtension>
  preferences?: AdminNavigationPreferences
}

/**
 * Resolve package-owned navigation before anchored add-ons. Standard package
 * items are no longer host base items, so this first pass lets contributions
 * such as Trips, Proposals, and MICE keep anchoring themselves after Bookings.
 */
export function resolveOperatorAdminNavigation({
  baseItems,
  extensions = [],
  preferences,
}: ResolveOperatorAdminNavigationOptions): NavItem[] {
  const selectContributions = (anchored: boolean): AdminExtension[] =>
    extensions.flatMap((extension) => {
      const navigation = extension.navigation?.filter((contribution) =>
        anchored ? contribution.insertAfter !== undefined : contribution.insertAfter === undefined,
      )

      return navigation?.length ? [{ id: extension.id, navigation }] : []
    })

  const packageItems = resolveAdminNavigation({
    baseItems,
    extensions: selectContributions(false),
  })

  const mergedItems = resolveAdminNavigation({
    baseItems: packageItems,
    extensions: selectContributions(true),
  })

  return preferences
    ? resolveAdminNavigationPreferences({ items: mergedItems, ...preferences })
    : mergedItems
}
