import { defineModule, providePort, requirePort } from "@voyant-travel/core/project"
import { customerBusinessAccountOnboardingRuntimePort } from "./customer-business-onboarding-runtime-port.js"
import { identityAccessRuntimePort } from "./identity-access-runtime-port.js"
import { storefrontRuntimePort } from "./storefront-runtime-port.js"
import { teamManagementRuntimePort } from "./team-management-runtime-port.js"

export const authCustomerBusinessAccountsVoyantModule = defineModule({
  id: "@voyant-travel/auth#customer-business-accounts",
  packageName: "@voyant-travel/auth",
  localId: "auth.customer-business-accounts",
  requires: { capabilities: ["storefront.data-owner"] },
  runtimePorts: [requirePort(customerBusinessAccountOnboardingRuntimePort)],
  api: [
    {
      id: "@voyant-travel/auth#customer-business-accounts.api.admin",
      surface: "admin",
      mount: "customer-business-accounts",
      resource: "customer-business-accounts",
      openapi: { document: "customer-business-accounts" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/auth/customer-business-onboarding-graph-runtime",
        export: "createCustomerBusinessAccountVoyantRuntime",
      },
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/auth#access.customer-business-accounts",
        resource: "customer-business-accounts",
        label: "Customer business accounts",
        description: "Review onboarding requests and provision customer business accounts.",
        actions: [
          {
            action: "read",
            label: "View customer business accounts",
            description: "View customer business-account capabilities and onboarding requests.",
          },
          {
            action: "write",
            label: "Manage customer business accounts",
            description: "Approve, reject, and provision customer business accounts.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  admin: {
    compositionOrder: 6,
    runtime: {
      entry: "@voyant-travel/auth-react/admin",
      export: "createSelectedCustomerBusinessAccountsAdminExtension",
    },
    copy: [
      {
        id: "@voyant-travel/auth#customer-business-accounts.admin.copy",
        namespace: "auth.admin.customer-business-accounts",
        fallbackLocale: "en",
        runtime: {
          entry: "@voyant-travel/auth-react/i18n",
          export: "authUiMessageDefinitions",
        },
      },
    ],
    routes: [
      {
        id: "@voyant-travel/auth#customer-business-accounts.admin.route",
        path: "/business-accounts",
        requiredScopes: ["customer-business-accounts:read"],
        runtime: {
          entry: "@voyant-travel/auth-react/admin",
          export: "createSelectedCustomerBusinessAccountsAdminExtension",
        },
      },
    ],
  },
  meta: {
    ownership: "package",
    agentTools: {
      posture: "not-applicable",
      rationale: "Business-account onboarding is exposed through staff-guarded admin routes.",
    },
  },
})

export const authInvitationsVoyantModule = defineModule({
  id: "@voyant-travel/auth#invitations",
  packageName: "@voyant-travel/auth",
  localId: "auth.invitations",
  provides: { ports: [providePort(identityAccessRuntimePort)] },
  runtimePorts: [requirePort(identityAccessRuntimePort)],
  api: [
    {
      id: "@voyant-travel/auth#invitations.api.admin",
      surface: "admin",
      mount: "invitations",
      resource: "team",
      openapi: { document: "invitations" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/auth/identity-access-graph-runtime",
        export: "createInvitationsVoyantRuntime",
      },
    },
    {
      id: "@voyant-travel/auth#invitations.api.public",
      surface: "public",
      mount: "invitations",
      anonymous: true,
      openapi: { document: "invitations" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/auth/identity-access-graph-runtime",
        export: "createInvitationsVoyantRuntime",
      },
    },
  ],
  presentations: [
    {
      id: "@voyant-travel/auth#presentation.local-auth",
      runtime: {
        entry: "@voyant-travel/auth-react/local-auth-routes",
        export: "createLocalAuthRouteContribution",
      },
      contribution: "localAuth",
      routes: [
        { route: "/(auth)", member: "layout" },
        { route: "/(auth)/accept-invitation", member: "acceptInvitation" },
        { route: "/(auth)/accept-invite", member: "acceptInvite" },
        { route: "/(auth)/forgot-password", member: "forgotPassword" },
        { route: "/(auth)/onboarding", member: "onboarding" },
        { route: "/(auth)/reset-password", member: "resetPassword" },
        { route: "/(auth)/sign-in", member: "signIn" },
        { route: "/(auth)/sign-up", member: "signUp" },
        { route: "/(auth)/verify-email", member: "verifyEmail" },
      ],
    },
  ],
  meta: {
    ownership: "package",
    agentTools: {
      posture: "not-applicable",
      rationale:
        "This unit owns public invitation acceptance; staff invitation management is exposed by the guarded auth team runtime.",
    },
  },
})

export const authTeamVoyantModule = defineModule({
  id: "@voyant-travel/auth#team",
  packageName: "@voyant-travel/auth",
  localId: "auth.team",
  provides: { ports: [providePort(teamManagementRuntimePort)] },
  runtimePorts: [requirePort(teamManagementRuntimePort)],
  api: [
    {
      id: "@voyant-travel/auth#team.api.admin",
      surface: "admin",
      mount: "team",
      resource: "team",
      openapi: { document: "team" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/auth/identity-access-graph-runtime",
        export: "createTeamVoyantRuntime",
      },
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/auth#access.team",
        resource: "team",
        label: "Team",
        description: "Manage staff team members and their access.",
        wildcard: "explicit-resource",
        actions: [
          {
            action: "read",
            label: "View team",
            description: "View staff team members.",
          },
          {
            action: "write",
            label: "Manage team",
            description: "Invite staff and update roles or access.",
            sensitive: true,
            wildcard: "explicit",
          },
          {
            action: "delete",
            label: "Remove team access",
            description: "Revoke invitations or deactivate staff team members.",
            sensitive: true,
            wildcard: "explicit",
          },
        ],
      },
    ],
  },
  tools: [
    {
      id: "@voyant-travel/auth#team.tool.get-capabilities",
      name: "get_team_management_capabilities",
      runtime: {
        entry: "@voyant-travel/auth/tools",
        export: "getTeamManagementCapabilitiesTool",
      },
      requiredScopes: ["team:read"],
      context: ["teamManagement"],
      risk: "low",
    },
    {
      id: "@voyant-travel/auth#team.tool.list-members",
      name: "list_team_members",
      runtime: { entry: "@voyant-travel/auth/tools", export: "listTeamMembersTool" },
      requiredScopes: ["team:read"],
      context: ["teamManagement"],
      risk: "high",
    },
    {
      id: "@voyant-travel/auth#team.tool.list-roles",
      name: "list_team_roles",
      runtime: { entry: "@voyant-travel/auth/tools", export: "listTeamRolesTool" },
      requiredScopes: ["team:read"],
      context: ["teamManagement"],
      risk: "low",
    },
    {
      id: "@voyant-travel/auth#team.tool.list-invitations",
      name: "list_team_invitations",
      runtime: { entry: "@voyant-travel/auth/tools", export: "listTeamInvitationsTool" },
      requiredScopes: ["team:read"],
      context: ["teamManagement"],
      risk: "high",
    },
    {
      id: "@voyant-travel/auth#team.tool.invite-member",
      name: "invite_team_member",
      runtime: { entry: "@voyant-travel/auth/tools", export: "inviteTeamMemberTool" },
      requiredScopes: ["team:write"],
      context: ["teamManagement"],
      risk: "high",
    },
    {
      id: "@voyant-travel/auth#team.tool.revoke-invitation",
      name: "revoke_team_invitation",
      runtime: { entry: "@voyant-travel/auth/tools", export: "revokeTeamInvitationTool" },
      requiredScopes: ["team:delete"],
      context: ["teamManagement"],
      risk: "high",
    },
    {
      id: "@voyant-travel/auth#team.tool.update-member-role",
      name: "update_team_member_role",
      runtime: { entry: "@voyant-travel/auth/tools", export: "updateTeamMemberRoleTool" },
      requiredScopes: ["team:write"],
      context: ["teamManagement"],
      risk: "high",
    },
    {
      id: "@voyant-travel/auth#team.tool.activate-member",
      name: "activate_team_member",
      runtime: { entry: "@voyant-travel/auth/tools", export: "activateTeamMemberTool" },
      requiredScopes: ["team:write"],
      context: ["teamManagement"],
      risk: "high",
    },
    {
      id: "@voyant-travel/auth#team.tool.deactivate-member",
      name: "deactivate_team_member",
      runtime: { entry: "@voyant-travel/auth/tools", export: "deactivateTeamMemberTool" },
      requiredScopes: ["team:delete"],
      context: ["teamManagement"],
      risk: "high",
    },
  ],
  actions: [
    {
      id: "@voyant-travel/auth#team.action.get-capabilities",
      version: "v1",
      kind: "read",
      targetType: "team-capabilities",
      resource: "team",
      action: "read",
      requiredScopes: ["team:read"],
      risk: "low",
      ledger: "optional",
      approval: "never",
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/auth#team.tool.get-capabilities"] },
    },
    {
      id: "@voyant-travel/auth#team.action.list-members",
      version: "v1",
      kind: "sensitive-read",
      targetType: "team-member",
      resource: "team",
      action: "read",
      requiredScopes: ["team:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/auth#team.tool.list-members"] },
    },
    {
      id: "@voyant-travel/auth#team.action.list-roles",
      version: "v1",
      kind: "read",
      targetType: "team-role",
      resource: "team",
      action: "read",
      requiredScopes: ["team:read"],
      risk: "low",
      ledger: "optional",
      approval: "never",
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/auth#team.tool.list-roles"] },
    },
    {
      id: "@voyant-travel/auth#team.action.list-invitations",
      version: "v1",
      kind: "sensitive-read",
      targetType: "team-invitation",
      resource: "team",
      action: "read",
      requiredScopes: ["team:read"],
      risk: "high",
      ledger: "required",
      approval: "never",
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/auth#team.tool.list-invitations"] },
    },
    {
      id: "@voyant-travel/auth#team.action.invite-member",
      version: "v1",
      kind: "execute",
      targetType: "team-invitation",
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-nontransactional-effect",
      },
      effectBoundary: "multistage",
      resource: "team",
      action: "write",
      requiredScopes: ["team:write"],
      risk: "high",
      ledger: "required",
      approval: "required",
      reversible: false,
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/auth#team.tool.invite-member"] },
    },
    {
      id: "@voyant-travel/auth#team.action.revoke-invitation",
      version: "v1",
      kind: "execute",
      targetType: "team-invitation",
      commandTargetField: "invitationId",
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-nontransactional-effect",
      },
      effectBoundary: "multistage",
      resource: "team",
      action: "delete",
      requiredScopes: ["team:delete"],
      risk: "high",
      ledger: "required",
      approval: "required",
      reversible: false,
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/auth#team.tool.revoke-invitation"] },
    },
    {
      id: "@voyant-travel/auth#team.action.update-member-role",
      version: "v1",
      kind: "execute",
      targetType: "team-member",
      commandTargetField: "memberId",
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-nontransactional-effect",
      },
      effectBoundary: "multistage",
      resource: "team",
      action: "write",
      requiredScopes: ["team:write"],
      risk: "high",
      ledger: "required",
      approval: "required",
      reversible: true,
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/auth#team.tool.update-member-role"] },
    },
    {
      id: "@voyant-travel/auth#team.action.activate-member",
      version: "v1",
      kind: "execute",
      targetType: "team-member",
      commandTargetField: "memberId",
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-nontransactional-effect",
      },
      effectBoundary: "multistage",
      resource: "team",
      action: "write",
      requiredScopes: ["team:write"],
      risk: "high",
      ledger: "required",
      approval: "required",
      reversible: true,
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/auth#team.tool.activate-member"] },
    },
    {
      id: "@voyant-travel/auth#team.action.deactivate-member",
      version: "v1",
      kind: "execute",
      targetType: "team-member",
      commandTargetField: "memberId",
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-nontransactional-effect",
      },
      effectBoundary: "multistage",
      resource: "team",
      action: "delete",
      requiredScopes: ["team:delete"],
      risk: "high",
      ledger: "required",
      approval: "required",
      reversible: false,
      allowedActorTypes: ["staff"],
      from: { tools: ["@voyant-travel/auth#team.tool.deactivate-member"] },
    },
  ],
  admin: {
    compositionOrder: 5,
    setupSteps: [{ id: "@voyant-travel/auth#setup.team", skippable: true }],
    runtime: {
      entry: "@voyant-travel/auth-react/admin",
      export: "createSelectedAuthTeamAdminExtension",
    },
    copy: [
      {
        id: "@voyant-travel/auth#team.admin.copy",
        namespace: "auth.admin.team",
        fallbackLocale: "en",
        runtime: {
          entry: "@voyant-travel/auth-react/i18n",
          export: "authUiMessageDefinitions",
        },
      },
    ],
    routes: [
      {
        id: "@voyant-travel/auth#team.admin.route",
        path: "/settings/team",
        requiredScopes: ["team:read"],
        runtime: {
          entry: "@voyant-travel/auth-react/admin",
          export: "createSelectedAuthTeamAdminExtension",
        },
      },
    ],
  },
  meta: {
    ownership: "package",
  },
})

export const authStorefrontVoyantModule = defineModule({
  id: "@voyant-travel/auth#storefront",
  packageName: "@voyant-travel/auth",
  localId: "auth.storefront",
  // Self-host storefront access model: keys, operator-declared origins, and
  // KMS-encrypted provider credentials backing the local customer-auth
  // resolver, surfaced through the operator "Storefronts" admin surface. The
  // managed cloud storefront adapter is a follow-up.
  provides: { ports: [providePort(storefrontRuntimePort)] },
  runtimePorts: [
    requirePort(storefrontRuntimePort),
    requirePort(customerBusinessAccountOnboardingRuntimePort, { optional: true }),
  ],
  api: [
    {
      id: "@voyant-travel/auth#storefront.api.admin",
      surface: "admin",
      mount: "storefronts",
      resource: "storefronts",
      openapi: { document: "storefronts" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/auth/storefront-graph-runtime",
        export: "createStorefrontVoyantRuntime",
      },
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/auth#access.storefronts",
        resource: "storefronts",
        label: "Storefronts",
        description: "Manage storefront access keys, origins, and customer auth.",
        actions: [
          {
            action: "read",
            label: "View storefronts",
            description: "View storefront configuration, keys, and provider status.",
          },
          {
            action: "write",
            label: "Manage storefronts",
            description:
              "Create storefronts, issue keys, and configure origins, methods, and provider credentials.",
            sensitive: true,
          },
          {
            action: "delete",
            label: "Delete storefronts",
            description: "Delete storefronts and revoke their access keys.",
            sensitive: true,
          },
        ],
      },
    ],
  },
  admin: {
    compositionOrder: 7,
    runtime: {
      entry: "@voyant-travel/auth-react/admin",
      export: "createSelectedStorefrontAdminExtension",
    },
    copy: [
      {
        id: "@voyant-travel/auth#storefront.admin.copy",
        namespace: "auth.admin.storefronts",
        fallbackLocale: "en",
        runtime: {
          entry: "@voyant-travel/auth-react/i18n",
          export: "authUiMessageDefinitions",
        },
      },
    ],
    routes: [
      {
        id: "@voyant-travel/auth#storefront.admin.route",
        path: "/storefronts",
        requiredScopes: ["storefronts:read"],
        runtime: {
          entry: "@voyant-travel/auth-react/admin",
          export: "createSelectedStorefrontAdminExtension",
        },
      },
    ],
  },
  meta: {
    ownership: "package",
    agentTools: {
      posture: "not-applicable",
      rationale:
        "Storefront access configuration is operator-owned; it is exposed through guarded admin surfaces, not agent tools.",
    },
  },
})
