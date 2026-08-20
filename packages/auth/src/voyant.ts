import { personalBuyerPersonRuntimePort } from "@voyant-travel/catalog/personal-buyer-person-runtime-port"
import { defineModule, providePort, requirePort } from "@voyant-travel/core/project"
import { customerBusinessAccountOnboardingRuntimePort } from "./customer-business-onboarding-runtime-port.js"
import { identityAccessRuntimePort } from "./identity-access-runtime-port.js"
import { publicApiRuntimePort } from "./public-api-runtime-port.js"
import { teamManagementRuntimePort } from "./team-management-runtime-port.js"

export const authCustomerBusinessAccountsVoyantModule = defineModule({
  id: "@voyant-travel/auth#customer-business-accounts",
  packageName: "@voyant-travel/auth",
  localId: "auth.customer-business-accounts",
  requires: { capabilities: ["public-api.data-owner"] },
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
    loading: "lazy-routes",
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
      // The emailed invitation token is the authority and the link opens in a
      // browser; the key never decides who may redeem.
      publishable: true,
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
    agentTools: {
      posture: "not-applicable",
      rationale: "Team membership and access administration is dashboard-only.",
    },
  },
})

export const authPublicApiVoyantModule = defineModule({
  id: "@voyant-travel/auth#public-api",
  packageName: "@voyant-travel/auth",
  localId: "auth.public-api",
  // Self-host public-API access model: keys carrying their own origins and
  // channel, plus the deployment's customer-account configuration and its
  // KMS-encrypted provider credentials, backing the local customer-auth
  // resolver. There is no storefront entity above any of it (voyant#4624).
  provides: {
    ports: [providePort(publicApiRuntimePort), providePort(personalBuyerPersonRuntimePort)],
  },
  runtimePorts: [
    requirePort(publicApiRuntimePort),
    requirePort(customerBusinessAccountOnboardingRuntimePort, { optional: true }),
  ],
  // Two API surfaces, because the retired storefronts module was two things
  // wearing one name: the credentials a frontend presents, and how customers
  // sign in. They have different audiences, different blast radius on a
  // mistake, and no reason to share a scope.
  api: [
    {
      id: "@voyant-travel/auth#public-api-keys.api.admin",
      surface: "admin",
      mount: "public-api-keys",
      resource: "public-api-keys",
      openapi: { document: "public-api-keys" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/auth/public-api-graph-runtime",
        export: "createPublicApiVoyantRuntime",
      },
    },
    {
      id: "@voyant-travel/auth#customer-accounts.api.admin",
      surface: "admin",
      mount: "customer-accounts",
      resource: "customer-accounts",
      openapi: { document: "customer-accounts" },
      transactional: true,
      runtime: {
        entry: "@voyant-travel/auth/public-api-graph-runtime",
        export: "createCustomerAccountsVoyantRuntime",
      },
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/auth#access.public-api-keys",
        resource: "public-api-keys",
        label: "Public API keys",
        description: "Manage public API keys, their allowed origins, and their channel.",
        actions: [
          {
            action: "read",
            label: "View public API keys",
            description: "View issued keys, their origins, channel, and last use.",
          },
          {
            action: "write",
            label: "Manage public API keys",
            description: "Issue and rotate keys and configure their origins and channel.",
            sensitive: true,
          },
          {
            action: "delete",
            label: "Revoke public API keys",
            description: "Revoke issued public API keys.",
            sensitive: true,
          },
        ],
      },
      {
        id: "@voyant-travel/auth#access.customer-accounts",
        resource: "customer-accounts",
        label: "Customer accounts",
        description: "Configure how customers sign in and what a buyer account may be.",
        actions: [
          {
            action: "read",
            label: "View customer account settings",
            description: "View sign-in methods, buyer account policy, and provider status.",
          },
          {
            action: "write",
            label: "Manage customer account settings",
            description:
              "Configure sign-in methods, buyer account policy, and OAuth provider credentials.",
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
      export: "createSelectedPublicApiAdminExtension",
    },
    copy: [
      {
        id: "@voyant-travel/auth#public-api-keys.admin.copy",
        namespace: "auth.admin.publicApi",
        fallbackLocale: "en",
        runtime: {
          entry: "@voyant-travel/auth-react/i18n",
          export: "authUiMessageDefinitions",
        },
      },
    ],
    routes: [
      {
        id: "@voyant-travel/auth#public-api-keys.admin.route",
        path: "/public-api",
        requiredScopes: ["public-api-keys:read"],
        runtime: {
          entry: "@voyant-travel/auth-react/admin",
          export: "createSelectedPublicApiAdminExtension",
        },
      },
      {
        id: "@voyant-travel/auth#customer-accounts.admin.route",
        path: "/customer-accounts",
        requiredScopes: ["customer-accounts:read"],
        runtime: {
          entry: "@voyant-travel/auth-react/admin",
          export: "createSelectedPublicApiAdminExtension",
        },
      },
    ],
  },
  meta: {
    ownership: "package",
    agentTools: {
      posture: "not-applicable",
      rationale:
        "Public API and customer-account configuration is operator-owned; it is exposed through guarded admin surfaces, not agent tools.",
    },
  },
})
