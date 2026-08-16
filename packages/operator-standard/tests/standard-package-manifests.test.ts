import { readFileSync } from "node:fs"
import { bookingsVoyantModule } from "@voyant-travel/bookings/voyant"
import { catalogVoyantModule } from "@voyant-travel/catalog/voyant"
import { commerceVoyantModule } from "@voyant-travel/commerce/voyant"
import cruisesVoyantModule from "@voyant-travel/cruises/voyant"
import { dbVoyantModule } from "@voyant-travel/db/voyant"
import { distributionChannelPushVoyantPlugin } from "@voyant-travel/distribution/voyant"
import { financeVoyantModule } from "@voyant-travel/finance/voyant"
import { legalVoyantModule } from "@voyant-travel/legal/voyant"
import navigationPreferencesVoyantModule from "@voyant-travel/navigation-preferences/voyant"
import { notificationsVoyantModule } from "@voyant-travel/notifications/voyant"
import { operationsVoyantModule } from "@voyant-travel/operations/voyant"
import { publicApiVoyantModule } from "@voyant-travel/public-api/voyant"
import reportingVoyantModule from "@voyant-travel/reporting/voyant"
import { tripsVoyantModule } from "@voyant-travel/trips/voyant"
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
  it("includes the packaged admin shell in Tailwind source discovery", () => {
    const styles = readFileSync(new URL("../src/standard-styles.css", import.meta.url), "utf8")

    expect(styles).toContain('@source "../../admin-app/src/**/*.{ts,tsx}";')
    expect(styles).toContain('@source "../../admin-app/dist/**/*.{js,mjs}";')
  })

  it("declares its response-cache posture alongside the cache backend it selected", () => {
    // The profile is a single-instance self-hosted deployment with nothing but
    // Postgres, so it declares that nothing caches responses in front of the
    // origin. ADR 0021 section 7: the posture has to be one the deployment can
    // observe, whichever backend it chose.
    expect(STANDARD_OPERATOR_DEPLOYMENT.responseCache).toEqual({ edge: "none" })
    expect(STANDARD_OPERATOR_DEPLOYMENT.providers?.cache).toBe("postgres")
  })

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
    expect(validateGraphUnitManifest(publicApiVoyantModule)).toEqual([])
    expect(validateGraphUnitManifest(financeVoyantModule)).toEqual([])
    expect(publicApiVoyantModule.meta).not.toHaveProperty("presentation")

    const graph = await resolveDeploymentGraph({
      project: defineProject({ modules: [publicApiVoyantModule] }),
      target: "node",
      mode: "self-hosted",
      packageRecords: [
        { packageName: "@voyant-travel/public-api", source: { kind: "workspace" } },
        { packageName: "@voyant-travel/public-api-react", source: { kind: "workspace" } },
      ],
    })
    expect(graph.modules[0]?.presentations).toEqual([
      {
        id: "@voyant-travel/public-api#presentation.customer",
        runtime: {
          entry: "@voyant-travel/public-api-react/public-api/presentation-routes",
          export: "createPublicApiPresentationContribution",
        },
        contribution: "publicApi",
        routes: [
          { route: "/(public-api)", member: "layout" },
          { route: "/(public-api)/shop", member: "shop" },
          { route: "/(public-api)/shop_/account", member: "account" },
          { route: "/(public-api)/shop_/account/sign-in", member: "accountSignIn" },
          { route: "/(public-api)/shop_/account/sign-up", member: "accountSignUp" },
          { route: "/(public-api)/shop_/account/verify-email", member: "accountVerifyEmail" },
          { route: "/(public-api)/shop_/composer", member: "composer" },
          { route: "/(public-api)/shop_/confirmation/$bookingId", member: "confirmation" },
          {
            route: "/(public-api)/shop_/products/$entityModule/$entityId",
            member: "productDetail",
          },
        ],
      },
    ])
  })

  it("runs selected product jobs in the standard Operator by default", () => {
    expect(STANDARD_OPERATOR_DEPLOYMENT.providers?.scheduledJobs).toBe("node-cron")
    expect(STANDARD_OPERATOR_DEPLOYMENT.providers?.legalDocumentArtifact).toBe("standard")
  })

  it("resolves the provider-neutral scale-to-zero recovery profile across standard jobs", async () => {
    const graph = await resolveDeploymentGraph({
      project: defineProject({
        modules: [
          bookingsVoyantModule,
          catalogVoyantModule,
          commerceVoyantModule,
          cruisesVoyantModule,
          dbVoyantModule,
          legalVoyantModule,
          notificationsVoyantModule,
          operationsVoyantModule,
          publicApiVoyantModule,
          tripsVoyantModule,
        ],
        extensions: [distributionChannelPushVoyantPlugin],
        jobScheduling: { profile: "scale-to-zero" },
      }),
      target: "node",
      mode: "self-hosted",
    })

    expect(
      graph.diagnostics.filter((diagnostic) => diagnostic.code.includes("JOB_SCHEDULE")),
    ).toEqual([])
    const schedules = new Map(graph.provisioning.jobs.map((job) => [job.id, job.schedule]))
    expect(schedules.get("infrastructure.event-outbox-drain")).toEqual({
      cron: "*/15 * * * *",
      overlap: "skip",
    })
    expect(schedules.get("notifications.deliver-durable-sends")).toEqual({
      cron: "*/15 * * * *",
      overlap: "skip",
    })
    expect(schedules.get("channel.availability.push")).toEqual({
      cron: "*/15 * * * *",
      overlap: "skip",
    })
    expect(schedules.get("distribution.channel-push-reconcile-booking-links")).toEqual({
      cron: "0 */6 * * *",
      overlap: "skip",
    })
    expect(schedules.get("cruises.external-catalog-refresh")).toEqual({
      cron: "30 3 * * *",
      overlap: "skip",
    })
    expect(
      graph.provisioning.jobs
        .filter((job) => job.scheduling?.profiles["scale-to-zero"])
        .every((job) => job.scheduling?.selected === "scale-to-zero"),
    ).toBe(true)
    expect(
      graph.provisioning.jobs.filter(
        (job) => job.scheduling?.selected === "scale-to-zero" && job.schedule.every === "15m",
      ),
    ).toEqual([])
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
