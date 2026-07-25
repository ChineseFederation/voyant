import { defineTool, READ_ONLY_RISK, requireService, type ToolContext } from "@voyant-travel/tools"
import { z } from "zod"

import {
  type NavigationPreferencesSnapshot,
  type NavigationVisibilityMap,
  navigationPreferencesSnapshotSchema,
  navigationVisibilityMapSchema,
  updateNavigationPreferencesSchema,
} from "./contracts.js"

const visibilityResultSchema = z.object({ visibility: navigationVisibilityMapSchema })

export interface NavigationPreferencesToolServices {
  get(): Promise<NavigationPreferencesSnapshot>
  setOrganization(visibility: NavigationVisibilityMap): Promise<NavigationVisibilityMap>
  setMember(visibility: NavigationVisibilityMap): Promise<NavigationVisibilityMap>
}

export type NavigationPreferencesToolContext = ToolContext & {
  navigationPreferences?: NavigationPreferencesToolServices
}

function navigationPreferences(
  context: NavigationPreferencesToolContext,
): NavigationPreferencesToolServices {
  return requireService(context.navigationPreferences, "navigationPreferences")
}

export const getNavigationPreferencesTool = defineTool<
  Record<string, never>,
  NavigationPreferencesSnapshot,
  NavigationPreferencesToolContext
>({
  name: "get_navigation_preferences",
  description:
    "Read organization defaults, the authenticated member's overrides, and effective admin navigation visibility. Read-only.",
  inputSchema: z.object({}),
  outputSchema: navigationPreferencesSnapshotSchema,
  requiredScopes: ["admin-navigation:read"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler(_input, context) {
    return navigationPreferences(context).get()
  },
})

export const setOrganizationNavigationPreferencesTool = defineTool<
  { visibility: NavigationVisibilityMap },
  { visibility: NavigationVisibilityMap },
  NavigationPreferencesToolContext
>({
  name: "set_organization_navigation_preferences",
  description:
    "Replace organization-wide admin navigation visibility defaults. Requires confirmation and affects all members unless they have overrides.",
  inputSchema: updateNavigationPreferencesSchema,
  outputSchema: visibilityResultSchema,
  requiredScopes: ["admin-navigation:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "sensitive",
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    confirmationRequired: true,
    sideEffects: ["data-write"],
  },
  async handler({ visibility }, context) {
    return { visibility: await navigationPreferences(context).setOrganization(visibility) }
  },
})

export const setMyNavigationPreferencesTool = defineTool<
  { visibility: NavigationVisibilityMap },
  { visibility: NavigationVisibilityMap },
  NavigationPreferencesToolContext
>({
  name: "set_my_navigation_preferences",
  description: "Replace admin navigation visibility overrides for the authenticated member only.",
  inputSchema: updateNavigationPreferencesSchema,
  outputSchema: visibilityResultSchema,
  requiredScopes: ["admin-navigation:write"],
  audience: { source: "grant", allowed: ["staff"] },
  tier: "write",
  riskPolicy: {
    destructive: false,
    reversible: true,
    dryRunSupported: false,
    confirmationRequired: false,
    sideEffects: ["data-write"],
  },
  async handler({ visibility }, context) {
    return { visibility: await navigationPreferences(context).setMember(visibility) }
  },
})

export const navigationPreferencesTools = [
  getNavigationPreferencesTool,
  setOrganizationNavigationPreferencesTool,
  setMyNavigationPreferencesTool,
] as const
