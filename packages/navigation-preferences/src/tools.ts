import {
  admitHandlerActionPolicy,
  defineTool,
  type HandlerActionPolicyExpectation,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  type ToolHandlerActionPolicyContext,
} from "@voyant-travel/tools"
import { z } from "zod"

import {
  type NavigationPreferencesSnapshot,
  type NavigationVisibilityMap,
  navigationPreferencesSnapshotSchema,
  navigationVisibilityMapSchema,
  updateNavigationPreferencesSchema,
} from "./contracts.js"

const visibilityResultSchema = z.object({ visibility: navigationVisibilityMapSchema })

export const SET_ORGANIZATION_NAVIGATION_PREFERENCES_HANDLER_POLICY = {
  capabilityId:
    "@voyant-travel/navigation-preferences#tool.set-organization-navigation-preferences",
  capabilityVersion: "v1",
  canonicalName: "set_organization_navigation_preferences",
  actionPolicy: {
    id: "@voyant-travel/navigation-preferences#action.set-organization-navigation-preferences",
    capabilityId:
      "@voyant-travel/navigation-preferences#action.set-organization-navigation-preferences",
    version: "v1",
    kind: "execute",
    targetType: "organization-navigation-preferences",
    commandTargetField: "preferencesId",
    targetLifecycle: "existing",
    existingTarget: { durability: "handler-command-result-v1" },
    risk: "high",
    ledger: "required",
    approval: "required",
    reversible: true,
    allowedActorTypes: ["staff"],
  },
} as const satisfies HandlerActionPolicyExpectation

export interface NavigationPreferencesToolServices {
  get(): Promise<NavigationPreferencesSnapshot>
  setOrganization(
    visibility: NavigationVisibilityMap,
    admitted: ToolHandlerActionPolicyContext,
  ): Promise<NavigationVisibilityMap>
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
  annotations: { idempotentHint: true },
  actionPolicyEnforcement: "handler",
  async handler({ visibility }, context) {
    const admitted = admitHandlerActionPolicy(
      context,
      SET_ORGANIZATION_NAVIGATION_PREFERENCES_HANDLER_POLICY,
    )
    return {
      visibility: await navigationPreferences(context).setOrganization(visibility, admitted),
    }
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
