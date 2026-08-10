import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import { createCustomerBusinessAccountAdminRoutes } from "../../src/customer-business-onboarding-routes.js"
import { customerBusinessAccountOnboardingRuntimePort } from "../../src/customer-business-onboarding-runtime-port.js"
import { identityAccessRuntimePort } from "../../src/identity-access-runtime-port.js"
import {
  createInvitationsAdminRoutes,
  createInvitationsPublicRoutes,
} from "../../src/invitations-routes.js"
import { teamManagementRuntimePort } from "../../src/team-management-runtime-port.js"
import { createTeamAdminRoutes } from "../../src/team-routes.js"
import {
  authCustomerBusinessAccountsVoyantModule,
  authInvitationsVoyantModule,
  authStorefrontVoyantModule,
  authTeamVoyantModule,
} from "../../src/voyant.js"

describe("auth identity/access deployment manifests", () => {
  it("owns invitations and team route bundles behind typed deployment ports", () => {
    expect(authCustomerBusinessAccountsVoyantModule).toMatchObject({
      id: "@voyant-travel/auth#customer-business-accounts",
      packageName: "@voyant-travel/auth",
      runtimePorts: [{ id: customerBusinessAccountOnboardingRuntimePort.id }],
      api: [
        {
          surface: "admin",
          mount: "customer-business-accounts",
          resource: "customer-business-accounts",
          openapi: { document: "customer-business-accounts" },
          transactional: true,
        },
      ],
      access: {
        resources: [
          {
            resource: "customer-business-accounts",
            actions: [{ action: "read" }, { action: "write", sensitive: true }],
          },
        ],
      },
      admin: {
        runtime: {
          entry: "@voyant-travel/auth-react/admin",
          export: "createSelectedCustomerBusinessAccountsAdminExtension",
        },
        routes: [
          {
            path: "/business-accounts",
            requiredScopes: ["customer-business-accounts:read"],
          },
        ],
        copy: [{ namespace: "auth.admin.customer-business-accounts" }],
      },
    })
    expect(authInvitationsVoyantModule).toMatchObject({
      id: "@voyant-travel/auth#invitations",
      packageName: "@voyant-travel/auth",
      provides: { ports: [{ id: identityAccessRuntimePort.id }] },
      runtimePorts: [{ id: identityAccessRuntimePort.id }],
      api: [
        {
          surface: "admin",
          mount: "invitations",
          resource: "team",
          openapi: { document: "invitations" },
          transactional: true,
        },
        {
          surface: "public",
          mount: "invitations",
          anonymous: true,
          openapi: { document: "invitations" },
          transactional: true,
        },
      ],
      presentations: [
        {
          id: "@voyant-travel/auth#presentation.local-auth",
          runtime: {
            entry: "@voyant-travel/auth-react/local-auth-routes",
            export: "createLocalAuthRouteContribution",
          },
        },
      ],
    })
    expect(authTeamVoyantModule).toMatchObject({
      id: "@voyant-travel/auth#team",
      packageName: "@voyant-travel/auth",
      provides: { ports: [{ id: teamManagementRuntimePort.id }] },
      runtimePorts: [{ id: teamManagementRuntimePort.id }],
      api: [
        {
          surface: "admin",
          mount: "team",
          openapi: { document: "team" },
          transactional: true,
        },
      ],
      admin: {
        runtime: {
          entry: "@voyant-travel/auth-react/admin",
          export: "createSelectedAuthTeamAdminExtension",
        },
        routes: [{ path: "/settings/team" }],
        copy: [{ namespace: "auth.admin.team" }],
      },
    })
  })

  it("declares scoped team Tools and ledger/approval gates for every sensitive write", () => {
    expect(authInvitationsVoyantModule.meta?.agentTools).toMatchObject({
      posture: "not-applicable",
    })
    expect(authTeamVoyantModule.tools?.map(({ name }) => name).sort()).toEqual([
      "activate_team_member",
      "deactivate_team_member",
      "get_team_management_capabilities",
      "invite_team_member",
      "list_team_invitations",
      "list_team_members",
      "list_team_roles",
      "revoke_team_invitation",
      "update_team_member_role",
    ])

    const writes = authTeamVoyantModule.actions?.filter(({ kind }) => kind === "execute") ?? []
    expect(writes).toHaveLength(5)
    expect(
      writes.every(
        ({ risk, ledger, approval, allowedActorTypes, requiredScopes, from }) =>
          risk === "high" &&
          ledger === "required" &&
          approval === "required" &&
          allowedActorTypes?.join() === "staff" &&
          requiredScopes?.length === 1 &&
          from?.tools?.length === 1,
      ),
    ).toBe(true)
    expect(
      Object.fromEntries(
        writes
          .filter(({ id }) => id !== "@voyant-travel/auth#team.action.invite-member")
          .map(({ id, commandTargetField }) => [id.split(".action.")[1], commandTargetField]),
      ),
    ).toEqual({
      "activate-member": "memberId",
      "deactivate-member": "memberId",
      "revoke-invitation": "invitationId",
      "update-member-role": "memberId",
    })
    expect(
      authTeamVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/auth#team.action.invite-member",
      ),
    ).toMatchObject({
      availability: {
        status: "unavailable",
        reasonCode: "unsafe-nontransactional-effect",
      },
      effectBoundary: "multistage",
    })
    expect(
      authTeamVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/auth#team.action.update-member-role",
      ),
    ).toMatchObject({
      targetLifecycle: "existing",
      existingTarget: { durability: "handler-command-result-v1" },
    })
    expect(
      authTeamVoyantModule.actions?.find(
        ({ id }) => id === "@voyant-travel/auth#team.action.update-member-role",
      ),
    ).not.toHaveProperty("availability")
    for (const actionId of [
      "@voyant-travel/auth#team.action.revoke-invitation",
      "@voyant-travel/auth#team.action.activate-member",
      "@voyant-travel/auth#team.action.deactivate-member",
    ]) {
      expect(authTeamVoyantModule.actions?.find(({ id }) => id === actionId)).toMatchObject({
        targetLifecycle: "existing",
        existingTarget: { durability: "handler-command-result-v1" },
        durability: {
          strategy: "saga",
          testReference: "packages/auth/tests/integration/team-member-role-command.test.ts",
        },
      })
      expect(authTeamVoyantModule.actions?.find(({ id }) => id === actionId)).not.toHaveProperty(
        "availability",
      )
    }
    expect(authTeamVoyantModule.access?.resources[0]).toMatchObject({
      wildcard: "explicit-resource",
      actions: [
        { action: "read" },
        { action: "write", sensitive: true, wildcard: "explicit" },
        { action: "delete", sensitive: true, wildcard: "explicit" },
      ],
    })
  })

  it("declares storefront as a linkable identity and deployment-owned channel link", () => {
    expect(authStorefrontVoyantModule).toMatchObject({
      id: "@voyant-travel/auth#storefront",
      links: [
        {
          id: "@voyant-travel/auth#linkable.storefront",
          kind: "linkable",
          source: "@voyant-travel/auth/linkables",
        },
        {
          id: "@voyant-travel/auth#link.storefront-channel",
          kind: "definition",
          source: "@voyant-travel/auth/standard-links",
        },
      ],
      api: [
        {
          surface: "admin",
          mount: "storefronts",
          resource: "storefronts",
          transactional: true,
        },
      ],
    })
  })

  it("claims every package-owned invitations and team OpenAPI operation", async () => {
    const documents = await Promise.all([
      readOpenApi("../../openapi/admin/invitations.json"),
      readOpenApi("../../openapi/storefront/invitations.json"),
      readOpenApi("../../openapi/admin/team.json"),
      readOpenApi("../../openapi/admin/customer-business-accounts.json"),
    ])

    const runtime = {} as Parameters<typeof createInvitationsAdminRoutes>[0]
    expect(operationClaims(documents[0])).toEqual(
      liveOperationClaims(createInvitationsAdminRoutes(runtime), "/v1/admin/invitations"),
    )
    expect(operationClaims(documents[1])).toEqual(
      liveOperationClaims(createInvitationsPublicRoutes(), "/v1/public/invitations"),
    )
    expect(operationClaims(documents[2])).toEqual(
      liveOperationClaims(createTeamAdminRoutes(runtime), "/v1/admin/team"),
    )
    expect(operationClaims(documents[3])).toEqual(
      liveOperationClaims(
        createCustomerBusinessAccountAdminRoutes(runtime as never),
        "/v1/admin/customer-business-accounts",
      ),
    )
  })
})

type OpenApiDocument = {
  paths?: Record<string, Record<string, Record<string, unknown>>>
}

async function readOpenApi(relativePath: string): Promise<OpenApiDocument> {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8"))
}

function operationClaims(document: OpenApiDocument): string[][] {
  return Object.entries(document.paths ?? {})
    .flatMap(([path, pathItem]) =>
      Object.entries(pathItem).map(([method, operation]) => [
        method.toUpperCase(),
        path,
        String(operation["x-voyant-api-id"]),
      ]),
    )
    .sort((left, right) => left.join(":").localeCompare(right.join(":")))
}

function liveOperationClaims(
  app: { getOpenAPI31Document(input: Record<string, unknown>): OpenApiDocument },
  mount: string,
): string[][] {
  const document = app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "test", version: "1.0.0" },
  })
  return operationClaims({
    paths: Object.fromEntries(
      Object.entries(document.paths ?? {}).map(([path, item]) => [
        `${mount}${path === "/" ? "" : path}`,
        item,
      ]),
    ),
  })
}
