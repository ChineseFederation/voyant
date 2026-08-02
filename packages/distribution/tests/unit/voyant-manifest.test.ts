import { createContainer, createEventBus } from "@voyant-travel/core"
import { assertPortConforms } from "@voyant-travel/core/project"
import { describe, expect, it, vi } from "vitest"
import { channelPushRuntimePort } from "../../src/channel-push/runtime-port.js"
import {
  createChannelPushExtension,
  createChannelPushVoyantRuntime,
  distributionApiModule,
  distributionBookingExtension,
  externalRefsApiModule,
  suppliersApiModule,
} from "../../src/index.js"
import {
  distributionBookingVoyantPlugin,
  distributionChannelPushVoyantPlugin,
  distributionVoyantModule,
} from "../../src/voyant.js"

describe("distribution deployment manifests", () => {
  it("owns the module runtime and persistence facets", () => {
    expect(distributionVoyantModule).toMatchObject({
      schemaVersion: "voyant.module.v1",
      id: "@voyant-travel/distribution",
      packageName: "@voyant-travel/distribution",
      provides: {
        ports: [
          { id: "distribution.channel-push-runtime" },
          { id: "catalog.extension.distribution" },
          { id: "catalog.publication.runtime" },
          { id: "distribution.publication-intent-worker-runtime" },
          { id: "finance.distribution-payment-policy.runtime" },
        ],
      },
      requires: {
        ports: [{ id: "catalog.runtime-services" }, { id: "catalog.projection-runtime" }],
      },
      runtimePorts: [{ id: "distribution.publication-intent-worker-runtime" }],
      api: [
        {
          id: "@voyant-travel/distribution#api.external-refs",
          surface: "admin",
          mount: "external-refs",
          openapi: { document: "external-refs" },
          runtime: {
            entry: "@voyant-travel/distribution",
            export: "externalRefsApiModule",
          },
        },
        {
          id: "@voyant-travel/distribution#api",
          surface: "admin",
          mount: "distribution",
          openapi: { document: "distribution" },
          runtime: {
            entry: "@voyant-travel/distribution",
            export: "distributionApiModule",
          },
        },
        {
          id: "@voyant-travel/distribution#api.suppliers",
          surface: "admin",
          mount: "suppliers",
          openapi: { document: "suppliers" },
          runtime: {
            entry: "@voyant-travel/distribution",
            export: "suppliersApiModule",
          },
        },
      ],
      schema: [{ id: "@voyant-travel/distribution#schema" }],
      migrations: [{ id: "@voyant-travel/distribution#migrations" }],
      setupMigrations: [
        {
          id: "@voyant-travel/distribution#setup.publication-catalog-backfill.v1",
          runtime: {
            entry: "@voyant-travel/distribution/setup/publication-catalog-backfill",
            export: "runPublicationCatalogBackfillSetupMigration",
          },
          dependsOn: ["@voyant-travel/distribution#migrations"],
        },
        {
          id: "@voyant-travel/distribution#setup.storefront-channel-bindings.v1",
          runtime: {
            entry: "@voyant-travel/distribution/setup/storefront-channel-bindings",
            export: "runStorefrontChannelBindingSetupMigration",
          },
          dependsOn: [
            "@voyant-travel/db#migrations",
            "@voyant-travel/distribution#migrations",
            "@voyant-travel/storefront#migrations",
          ],
        },
      ],
      links: [
        { id: "@voyant-travel/distribution#linkable.channel" },
        { id: "@voyant-travel/distribution#linkable.supplier" },
      ],
    })
    expect(distributionVoyantModule.actions).toContainEqual(
      expect.objectContaining({
        id: "@voyant-travel/distribution#action.create-external-reference",
        targetLifecycle: "created",
        createdTarget: {
          commandTargetType: "external-reference-create-command",
          resultReferenceType: "external_reference",
          durability: "handler-command-claim-v1",
          parentAnchor: { targetTypeField: "entityType", targetIdField: "entityId" },
        },
        reversible: false,
        allowedActorTypes: ["staff"],
      }),
    )
    for (const id of ["update-channel", "update-external-reference", "update-supplier"]) {
      expect(
        distributionVoyantModule.actions?.find(
          ({ id: actionId }) => actionId === `@voyant-travel/distribution#action.${id}`,
        ),
      ).toMatchObject({ commandTargetField: "id" })
    }
  })

  it("owns the booking and channel-push extensions", () => {
    expect(distributionBookingVoyantPlugin).toMatchObject({
      schemaVersion: "voyant.extension.v1",
      id: "@voyant-travel/distribution#extension",
      localId: "distribution",
      api: [
        {
          id: "@voyant-travel/distribution#extension.api",
          surface: "admin",
          mount: "bookings",
          openapi: { document: "distribution-booking" },
          runtime: {
            entry: "@voyant-travel/distribution",
            export: "distributionBookingExtension",
          },
        },
      ],
    })

    expect(distributionChannelPushVoyantPlugin).toMatchObject({
      schemaVersion: "voyant.extension.v1",
      id: "@voyant-travel/distribution#channel-push-extension",
      localId: "distribution.channel-push-extension",
      runtimePorts: [{ id: "distribution.channel-push-runtime" }],
      api: [
        {
          id: "@voyant-travel/distribution#channel-push-extension.api",
          surface: "admin",
          mount: "distribution",
          openapi: { document: "distribution-channel-push" },
          runtime: {
            entry: "@voyant-travel/distribution",
            export: "createChannelPushVoyantRuntime",
          },
        },
      ],
      admin: {
        routes: [
          {
            id: "@voyant-travel/distribution#channel-push-extension.admin.route.channel-sync",
            path: "/channel-sync",
          },
        ],
      },
    })
  })

  it("keeps access and admin ownership aligned with executable mounts", () => {
    expect(distributionVoyantModule.access?.resources).toEqual([
      expect.objectContaining({ resource: "external-refs" }),
      expect.objectContaining({ resource: "distribution" }),
      expect.objectContaining({ resource: "suppliers" }),
    ])
    for (const resource of distributionVoyantModule.access?.resources ?? []) {
      expect(resource.label).toEqual(expect.any(String))
      expect(resource.description).toEqual(expect.any(String))
      expect(resource.actions).toEqual([
        expect.objectContaining({
          action: "read",
          label: expect.any(String),
          description: expect.any(String),
        }),
        expect.objectContaining({
          action: "write",
          label: expect.any(String),
          description: expect.any(String),
        }),
        expect.objectContaining({
          action: "delete",
          label: expect.any(String),
          description: expect.any(String),
          sensitive: true,
        }),
      ])
    }
    expect(distributionVoyantModule.admin?.routes?.map((route) => route.path)).toEqual([
      "/suppliers",
      "/suppliers/$id",
    ])
    expect(distributionVoyantModule.admin?.routes).toEqual([
      expect.objectContaining({ requiredScopes: ["suppliers:read"] }),
      expect.objectContaining({ requiredScopes: ["suppliers:read"] }),
    ])
    expect(distributionVoyantModule.admin?.nav).toEqual([
      expect.objectContaining({
        routeId: "@voyant-travel/distribution#admin.route.suppliers-index",
        label: { namespace: "operator.admin.navigation", key: "nav.suppliers" },
      }),
    ])
    expect(distributionChannelPushVoyantPlugin.admin?.routes?.map((route) => route.path)).toEqual([
      "/channel-sync",
    ])
    expect(distributionChannelPushVoyantPlugin.admin?.routes?.[0]?.requiredScopes).toEqual([
      "distribution:read",
    ])
    expect(distributionChannelPushVoyantPlugin.admin?.nav).toEqual([
      expect.objectContaining({
        routeId: "@voyant-travel/distribution#channel-push-extension.admin.route.channel-sync",
        label: { namespace: "operator.admin.navigation", key: "nav.channelSync" },
      }),
    ])
  })

  it("declares the emitted publication and supplier payloads", () => {
    const schemas = Object.fromEntries(
      (distributionVoyantModule.events ?? []).map((event) => [
        event.eventType,
        event.payloadSchema,
      ]),
    )

    expect(schemas["product.publication.changed"]).toEqual({
      type: "object",
      properties: {
        productId: { type: "string" },
        channelId: { type: "string" },
        publicationId: { type: ["string", "null"] },
        operation: {
          type: "string",
          enum: ["created", "updated", "deleted"],
        },
        channelKind: { type: ["string", "null"] },
        channelStatus: { type: ["string", "null"] },
      },
      required: [
        "productId",
        "channelId",
        "publicationId",
        "operation",
        "channelKind",
        "channelStatus",
      ],
      additionalProperties: false,
    })
    expect(schemas["channel.product_mapping.changed"]).toEqual({
      type: "object",
      properties: {
        productId: { type: "string" },
        channelId: { type: "string" },
        mappingId: { type: ["string", "null"] },
        previousActive: { type: ["boolean", "null"] },
        nextActive: { type: ["boolean", "null"] },
        operation: {
          type: "string",
          enum: ["created", "updated", "deleted", "activated", "deactivated"],
        },
        channelKind: { type: ["string", "null"] },
        channelStatus: { type: ["string", "null"] },
      },
      required: [
        "productId",
        "channelId",
        "mappingId",
        "previousActive",
        "nextActive",
        "operation",
        "channelKind",
        "channelStatus",
      ],
      additionalProperties: false,
    })
    for (const eventType of ["supplier.created", "supplier.updated", "supplier.deleted"]) {
      expect(schemas[eventType]).toEqual({
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      })
    }
    for (const eventType of ["channel.created", "channel.updated", "channel.deleted"]) {
      expect(schemas[eventType]).toEqual({
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      })
    }
    expect(schemas["product.supplier.reassigned"]).toEqual({
      type: "object",
      properties: {
        productId: { type: "string" },
        previousSupplierId: { type: ["string", "null"] },
        nextSupplierId: { type: ["string", "null"] },
      },
      required: ["productId"],
      additionalProperties: false,
    })
  })

  it("references exported runtimes with matching mounts", () => {
    expect(externalRefsApiModule.module.name).toBe("external-refs")
    expect(distributionApiModule.module.name).toBe("distribution")
    expect(suppliersApiModule.module.name).toBe("suppliers")
    expect(distributionBookingExtension.extension.module).toBe("bookings")
    expect(createChannelPushExtension).toBeTypeOf("function")
    expect(createChannelPushVoyantRuntime).toBeTypeOf("function")
  })

  it("owns typed channel-push route and subscriber composition", async () => {
    const registerSubscriberRuntime = vi.fn()
    const provider = {
      resolveRegistry: vi.fn(() => ({ resolveByConnection: vi.fn() })),
      registerSubscriberRuntime,
      withDeps: vi.fn(),
    }

    await expect(assertPortConforms(channelPushRuntimePort, provider)).resolves.toBeUndefined()
    await expect(assertPortConforms(channelPushRuntimePort, {} as never)).rejects.toThrow(
      /resolveRegistry/,
    )

    const extension = await createChannelPushVoyantRuntime({
      unitId: distributionChannelPushVoyantPlugin.id,
      projectConfig: {},
      getUnitProjectConfig: () => undefined,
      api: distributionChannelPushVoyantPlugin.api ?? [],
      graph: {
        providerSelections: {},
        accessCatalog: { resources: [], presets: [] },
        references: [],
        setupSteps: [],
        tools: [],
      },
      runtimePorts: {},
      hasPort: () => true,
      getPort: vi.fn(async () => provider) as never,
      getPorts: vi.fn(async () => []) as never,
    })
    const context = {
      bindings: { DATABASE_URL: "postgres://test" },
      container: createContainer(),
      eventBus: createEventBus(),
    }

    expect(extension.extension).toMatchObject({ name: "channel-push", module: "distribution" })
    expect(extension.adminRoutes).toBeDefined()
    await extension.extension.bootstrap?.(context)
    expect(registerSubscriberRuntime).toHaveBeenCalledOnce()
    expect(registerSubscriberRuntime).toHaveBeenCalledWith(context)
  })

  it("references each payload-free package job", () => {
    expect(distributionVoyantModule.jobs).toEqual([
      expect.objectContaining({
        id: "distribution.publication-reindex-intents",
        wakeup: true,
        runtime: {
          entry: "@voyant-travel/distribution/publication-intent-worker",
          export: "runDistributionPublicationIntentWorkerJob",
        },
      }),
    ])
    expect(distributionVoyantModule.subscribers?.map(({ eventType }) => eventType)).toEqual([
      "product.created",
      "product.updated",
      "product.deleted",
      "supplier.created",
      "supplier.updated",
      "supplier.deleted",
      "channel.created",
      "channel.updated",
      "channel.deleted",
      "product.supplier.reassigned",
    ])
    expect(distributionVoyantModule.subscribers).toContainEqual(
      expect.objectContaining({
        id: "@voyant-travel/distribution#subscriber.publication-intent-product-supplier-reassigned",
        runtime: {
          entry: "@voyant-travel/distribution/publication-intent-subscribers",
          export: "createPublicationSupplierReassignedIntentSubscriberGraphRuntime",
        },
      }),
    )
    expect(distributionChannelPushVoyantPlugin.jobs).toEqual([
      expect.objectContaining({
        id: "channel.booking.push",
        scheduling: {
          required: true,
          profiles: {
            economical: { every: "5m", overlap: "skip" },
            "scale-to-zero": { cron: "*/15 * * * *", overlap: "skip" },
          },
        },
        wakeup: true,
        runtime: {
          entry: "@voyant-travel/distribution/channel-push-jobs",
          export: "runChannelBookingPushJob",
        },
      }),
      expect.objectContaining({
        id: "channel.availability.push",
        wakeup: true,
      }),
      expect.objectContaining({
        id: "channel.content.push",
        wakeup: true,
      }),
      expect.objectContaining({
        id: "distribution.channel-push-reconcile-booking-links",
        scheduling: expect.objectContaining({
          profiles: expect.objectContaining({
            "scale-to-zero": { cron: "0 */6 * * *", overlap: "skip" },
          }),
        }),
      }),
      expect.objectContaining({
        id: "distribution.channel-push-reconcile-availability",
        scheduling: expect.objectContaining({
          profiles: expect.objectContaining({
            "scale-to-zero": { cron: "0 */6 * * *", overlap: "skip" },
          }),
        }),
      }),
      expect.objectContaining({
        id: "distribution.channel-push-reconcile-content",
        scheduling: expect.objectContaining({
          profiles: expect.objectContaining({
            "scale-to-zero": { cron: "0 3 * * *", overlap: "skip" },
          }),
        }),
      }),
    ])
  })

  it("owns executable channel-push subscriber runtime references", () => {
    expect(distributionChannelPushVoyantPlugin.subscribers).toEqual([
      expect.objectContaining({
        id: "@voyant-travel/distribution#subscriber.channel-push-booking-confirmed",
        eventType: "booking.confirmed",
        runtime: {
          entry: "@voyant-travel/distribution/channel-push-subscribers",
          export: "channelPushBookingConfirmedSubscriber",
        },
      }),
      expect.objectContaining({
        id: "@voyant-travel/distribution#subscriber.channel-push-availability-changed",
        eventType: "availability.slot.changed",
        runtime: {
          entry: "@voyant-travel/distribution/channel-push-subscribers",
          export: "channelPushAvailabilityChangedSubscriber",
        },
      }),
      expect.objectContaining({
        id: "@voyant-travel/distribution#subscriber.channel-push-content-changed",
        eventType: "product.content.changed",
        runtime: {
          entry: "@voyant-travel/distribution/channel-push-subscribers",
          export: "channelPushContentChangedSubscriber",
        },
      }),
    ])
  })
})
