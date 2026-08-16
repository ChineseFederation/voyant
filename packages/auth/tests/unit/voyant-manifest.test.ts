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
  authPublicApiVoyantModule,
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

  it("keeps team administration on the dashboard and out of MCP", () => {
    expect(authInvitationsVoyantModule.meta?.agentTools).toMatchObject({
      posture: "not-applicable",
    })
    expect(authTeamVoyantModule).not.toHaveProperty("tools")
    expect(authTeamVoyantModule).not.toHaveProperty("actions")
    expect(authTeamVoyantModule.meta?.agentTools).toEqual({
      posture: "not-applicable",
      rationale: "Team membership and access administration is dashboard-only.",
    })
    expect(authTeamVoyantModule.access?.resources[0]).toMatchObject({
      wildcard: "explicit-resource",
      actions: [
        { action: "read" },
        { action: "write", sensitive: true, wildcard: "explicit" },
        { action: "delete", sensitive: true, wildcard: "explicit" },
      ],
    })
  })

  it("splits the public API and customer accounts into separately grantable surfaces", () => {
    // The retired storefronts module was two things wearing one name: the
    // credentials a frontend presents, and how customers sign in. They have
    // different blast radius on a mistake and no reason to share a scope
    // (voyant#4624).
    expect(authPublicApiVoyantModule).toMatchObject({
      id: "@voyant-travel/auth#public-api",
      api: [
        {
          surface: "admin",
          // `public-api-keys`, not `public-api`: the composed public surface in
          // @voyant-travel/public-api owns that name, and the two govern
          // different things — keys here, offers and intake there.
          mount: "public-api-keys",
          resource: "public-api-keys",
          transactional: true,
        },
        {
          surface: "admin",
          mount: "customer-accounts",
          resource: "customer-accounts",
          transactional: true,
        },
      ],
    })
  })

  it("owns no links, because the storefront->channel binding is gone", () => {
    // A key names its channel or defaults to Direct; there is no pivot table
    // left to link through.
    expect(authPublicApiVoyantModule).not.toHaveProperty("links")
  })

  it("claims every package-owned invitations and team OpenAPI operation", async () => {
    const documents = await Promise.all([
      readOpenApi("../../openapi/admin/invitations.json"),
      readOpenApi("../../openapi/public-api/invitations.json"),
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
