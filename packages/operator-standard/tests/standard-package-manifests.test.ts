import { bookingsVoyantModule } from "@voyant-travel/bookings/voyant"
import { financeVoyantModule } from "@voyant-travel/finance/voyant"
import navigationPreferencesVoyantModule from "@voyant-travel/navigation-preferences/voyant"
import reportingVoyantModule from "@voyant-travel/reporting/voyant"
import { storefrontVoyantModule } from "@voyant-travel/storefront/voyant"
import operatorWebhooksVoyantModule from "@voyant-travel/webhook-delivery/voyant"
import { describe, expect, it } from "vitest"
import {
  defineProject,
  resolveDeploymentGraph,
  validateGraphUnitManifest,
} from "../../framework/src/deployment-graph.js"
import {
  STANDARD_OPERATOR_ACCESS,
  STANDARD_OPERATOR_DEPLOYMENT,
  STANDARD_OPERATOR_DISTRIBUTION_POLICY,
} from "../src/index.js"

describe("standard package manifests", () => {
  it("selects durable Postgres outbound webhook enqueueing explicitly", () => {
    expect(STANDARD_OPERATOR_DEPLOYMENT.providers?.outboundWebhooks).toBe("postgres")
    expect(validateGraphUnitManifest(operatorWebhooksVoyantModule, "module")).toEqual([])
    expect(
      STANDARD_OPERATOR_DISTRIBUTION_POLICY.modules.find(
        (selection) => selection.resolve === "@voyant-travel/webhook-delivery",
      ),
    ).toEqual({ resolve: "@voyant-travel/webhook-delivery", required: true })
  })

  it("resolves a package-owned module manifest without starter synthesis", async () => {
    expect(validateGraphUnitManifest(bookingsVoyantModule, "module")).toEqual([])

    const graph = await resolveDeploymentGraph({
      project: defineProject({ modules: [bookingsVoyantModule] }),
      target: "node",
      mode: "self-hosted",
    })

    expect(graph.modules[0]).toMatchObject({
      id: "@voyant-travel/bookings",
      api: [
        {
          id: "@voyant-travel/bookings#api.admin",
          runtime: { entry: "@voyant-travel/bookings", export: "createBookingsApiModule" },
        },
        {
          id: "@voyant-travel/bookings#api.public",
          runtime: { entry: "@voyant-travel/bookings", export: "createBookingsApiModule" },
        },
      ],
      schema: [{ id: "@voyant-travel/bookings#schema" }],
      migrations: [{ id: "@voyant-travel/bookings#migrations" }],
      links: [{ id: "@voyant-travel/bookings#linkable.booking" }],
    })
  })

  it("keeps the Storefront presentation as selected graph authority", async () => {
    expect(validateGraphUnitManifest(storefrontVoyantModule)).toEqual([])
    expect(validateGraphUnitManifest(financeVoyantModule)).toEqual([])
    expect(storefrontVoyantModule.meta).not.toHaveProperty("presentation")

    const graph = await resolveDeploymentGraph({
      project: defineProject({ modules: [storefrontVoyantModule] }),
      target: "node",
      mode: "self-hosted",
      packageRecords: [
        { packageName: "@voyant-travel/storefront", source: { kind: "workspace" } },
        { packageName: "@voyant-travel/storefront-react", source: { kind: "workspace" } },
      ],
    })
    expect(graph.modules[0]?.presentations).toEqual([
      {
        id: "@voyant-travel/storefront#presentation.customer",
        runtime: {
          entry: "@voyant-travel/storefront-react/storefront",
          export: "createStorefrontPresentationContribution",
        },
      },
    ])
  })

  it("runs selected product jobs in the standard Operator by default", () => {
    expect(STANDARD_OPERATOR_DEPLOYMENT.providers?.scheduledJobs).toBe("node-cron")
    expect(STANDARD_OPERATOR_DEPLOYMENT.providers?.legalDocumentArtifact).toBe("standard")
  })

  it("selects the composed dashboard with a staff preset that satisfies every source scope", () => {
    expect(STANDARD_OPERATOR_DISTRIBUTION_POLICY.modules).toContainEqual({
      resolve: "@voyant-travel/operations/dashboard",
    })
    expect(STANDARD_OPERATOR_ACCESS.presets.find(({ id }) => id === "agent-staff")).toMatchObject({
      audience: "staff",
      grants: expect.arrayContaining([
        "operations:read",
        "bookings:read",
        "finance:read",
        "products:read",
        "reports:export",
        "reports:read",
        "reports:write",
        "suppliers:read",
      ]),
    })
  })

  it("selects Reporting with module datasets, presets, templates, and persistence", async () => {
    expect(STANDARD_OPERATOR_DISTRIBUTION_POLICY.modules).toContainEqual({
      resolve: "@voyant-travel/reporting",
    })
    expect(validateGraphUnitManifest(reportingVoyantModule, "module")).toEqual([])

    const graph = await resolveDeploymentGraph({
      project: defineProject({
        modules: [bookingsVoyantModule, financeVoyantModule, reportingVoyantModule],
      }),
      target: "node",
      mode: "self-hosted",
    })

    expect(graph.modules.find(({ id }) => id === "@voyant-travel/reporting")).toMatchObject({
      api: [{ id: "@voyant-travel/reporting#api.admin" }],
      schema: [{ id: "@voyant-travel/reporting#schema" }],
      migrations: [{ id: "@voyant-travel/reporting#migrations" }],
      admin: { routes: expect.arrayContaining([expect.objectContaining({ path: "/reporting" })]) },
    })
    expect(graph.reportingCatalog.datasets.map(({ id }) => id)).toEqual(
      expect.arrayContaining(["bookings.activity", "finance.receivables"]),
    )
    expect(graph.reportingCatalog.widgets.length).toBeGreaterThanOrEqual(7)
    expect(graph.reportingCatalog.templates.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "bookings.template.overview",
        "finance.overview",
        "reporting.template.operator-overview",
      ]),
    )
  })

  it("requires navigation preferences in the standard operator graph", () => {
    expect(validateGraphUnitManifest(navigationPreferencesVoyantModule, "module")).toEqual([])
    expect(
      STANDARD_OPERATOR_DISTRIBUTION_POLICY.modules.find(
        (selection) => selection.resolve === "@voyant-travel/navigation-preferences",
      ),
    ).toEqual({ resolve: "@voyant-travel/navigation-preferences", required: true })
    expect(
      STANDARD_OPERATOR_DISTRIBUTION_POLICY.modules.find(
        (selection) => selection.resolve === "@voyant-travel/setup",
      ),
    ).toEqual({ resolve: "@voyant-travel/setup", required: true })
  })
})
