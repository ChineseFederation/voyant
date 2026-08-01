import path from "node:path"
import { describe, expect, it, type Mock, vi } from "vitest"
import {
  createGeneratedProject,
  getRuntimeCompositionMocks,
  loadVoyantProject,
} from "./runtime-composition.test-support.js"

const mocks = getRuntimeCompositionMocks()

describe("Voyant outbound webhook composition", () => {
  it("uses the explicitly selected Postgres provider", async () => {
    const projectRoot = await createGeneratedProject()
    await loadVoyantProject({
      projectRoot,
      adminAssetsDir: path.join(projectRoot, "admin"),
      env: { DATABASE_URL: "postgres://example.invalid/voyant" },
    })

    const options = mocks.loadVoyantNodeRuntime.mock.calls[0]?.[0] as {
      outboundWebhooks: { enqueue(event: unknown, bindings: unknown): Promise<unknown> }
      appWebhooks?: unknown
    }
    expect(options).toMatchObject({
      runtimePorts: mocks.runtimePorts,
      resources: {},
      outboundWebhooks: { enqueue: expect.any(Function) },
    })

    const event = { name: "catalog.entity.updated" }
    const bindings = { DATABASE_URL: "postgres://example.invalid/voyant" }
    await expect(options.outboundWebhooks.enqueue(event, bindings)).resolves.toEqual(["queued"])
    expect(mocks.createPostgresWebhookDeliveryEnqueuer).toHaveBeenCalledOnce()
    expect(mocks.postgresEnqueue).toHaveBeenCalledWith(event, bindings)
    expect(options.appWebhooks).toBeUndefined()
  })

  it("uses an explicitly selected host enqueuer", async () => {
    mocks.deploymentProviders = {
      adminAuth: "better-auth",
      customerAuth: "better-auth",
      outboundWebhooks: "host",
    }
    const deliverEvent = vi.fn(async () => ["hosted"])
    const projectRoot = await createGeneratedProject()
    await loadVoyantProject({
      projectRoot,
      adminAssetsDir: path.join(projectRoot, "admin"),
      env: { DATABASE_URL: "postgres://example.invalid/voyant" },
      host: { deliverEvent },
    })

    const options = mocks.loadVoyantNodeRuntime.mock.calls[0]?.[0] as {
      outboundWebhooks: { enqueue(event: unknown, bindings: unknown): Promise<unknown> }
    }
    const event = { name: "catalog.entity.updated" }
    const bindings = { DATABASE_URL: "postgres://example.invalid/voyant" }
    await expect(options.outboundWebhooks.enqueue(event, bindings)).resolves.toEqual(["hosted"])
    expect(deliverEvent).toHaveBeenCalledWith(event, bindings)
    expect(mocks.createPostgresWebhookDeliveryEnqueuer).not.toHaveBeenCalled()
  })

  it("composes installed-app delivery from the selected external catalog", async () => {
    mocks.graphRuntime = {
      modules: [
        {
          id: "@voyant-travel/apps",
          packageName: "@voyant-travel/apps",
          requiredPorts: ["apps.webhook-delivery"],
        },
        {
          id: "@voyant-travel/webhook-delivery",
          packageName: "@voyant-travel/webhook-delivery",
          requiredPorts: [],
        },
      ],
      extensions: [],
      plugins: [],
      accessCatalog: { resources: [] },
      eventCatalog: {
        schemaVersion: "voyant.event-catalog.v1",
        events: [
          {
            id: "@voyant-travel/finance#event.invoice.issued",
            eventType: "invoice.issued",
            version: "1.0.0",
            visibility: "external",
            payloadSchema: {
              type: "object",
              properties: { invoiceId: { type: "string" } },
            },
          },
        ],
      },
    }
    const webhookDelivery = {
      issueSigningKey: vi.fn(),
      verifySigningKeyProof: vi.fn(),
      resolveSigningKey: vi.fn(async () => ({ id: "key_1", secret: "s".repeat(32) })),
    }
    const projectRoot = await createGeneratedProject()
    const project = await loadVoyantProject({
      projectRoot,
      adminAssetsDir: path.join(projectRoot, "admin"),
      env: { DATABASE_URL: "postgres://example.invalid/voyant" },
      host: { runtimePorts: { "apps.webhook-delivery": webhookDelivery } },
    })

    const options = mocks.loadVoyantNodeRuntime.mock.calls[0]?.[0] as {
      outboundWebhooks: { enqueue(event: unknown, bindings: unknown): Promise<unknown> }
      appWebhooks: { enqueue(event: unknown, bindings: unknown): Promise<unknown> }
    }
    const event = { name: "invoice.issued" }
    const bindings = { DATABASE_URL: "postgres://example.invalid/voyant" }

    await expect(options.outboundWebhooks.enqueue(event, bindings)).resolves.toEqual(["queued"])
    await expect(options.appWebhooks.enqueue(event, bindings)).resolves.toEqual(["app-queued"])
    expect(mocks.createAppWebhookDeliveryEnqueuer).toHaveBeenCalledWith(
      expect.objectContaining({
        contracts: [
          expect.objectContaining({
            eventType: "invoice.issued",
            eventVersion: "1.0.0",
          }),
        ],
        resolveSigningKey: webhookDelivery.resolveSigningKey,
      }),
    )

    expect(mocks.createAppWebhookDeliveryWorker).not.toHaveBeenCalled()
    const server = project.start()
    expect(mocks.createAppWebhookDeliveryWorker).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "database" }),
      { resolveSigningKey: webhookDelivery.resolveSigningKey },
    )
    expect(mocks.createAppWebhookDeliveryLoop).toHaveBeenCalledWith(
      mocks.appWebhookDeliveryWorker,
      { onError: expect.any(Function) },
    )
    expect(mocks.createNodeServer).toHaveBeenCalledWith(
      expect.objectContaining({
        residentServices: [mocks.webhookDeliveryLoop, mocks.appWebhookDeliveryLoop],
      }),
    )
    expect(mocks.webhookDeliveryLoop.start).toHaveBeenCalledOnce()
    expect(mocks.appWebhookDeliveryLoop.start).toHaveBeenCalledOnce()

    const nodeServer = mocks.createNodeServer.mock.results[0]?.value as { close: Mock }
    await server.close()
    expect(nodeServer.close).toHaveBeenCalledOnce()
    expect(mocks.webhookDeliveryLoop.stop).toHaveBeenCalledOnce()
    expect(mocks.appWebhookDeliveryLoop.stop).toHaveBeenCalledOnce()
  })

  it("keeps the selected generic subscription loop resident when Apps has no webhook runtime port", async () => {
    mocks.graphRuntime = {
      modules: [
        {
          id: "@voyant-travel/apps",
          packageName: "@voyant-travel/apps",
          requiredPorts: [],
        },
        {
          id: "@voyant-travel/webhook-delivery",
          packageName: "@voyant-travel/webhook-delivery",
          requiredPorts: [],
        },
      ],
      extensions: [],
      plugins: [],
      accessCatalog: { resources: [] },
    }
    const projectRoot = await createGeneratedProject()
    const project = await loadVoyantProject({
      projectRoot,
      adminAssetsDir: path.join(projectRoot, "admin"),
      env: { DATABASE_URL: "postgres://example.invalid/voyant" },
    })

    const server = project.start()
    expect(mocks.createAppWebhookDeliveryEnqueuer).not.toHaveBeenCalled()
    expect(mocks.createAppWebhookDeliveryWorker).not.toHaveBeenCalled()
    expect(mocks.createAppWebhookDeliveryLoop).not.toHaveBeenCalled()
    expect(mocks.createWebhookDeliveryWorker).toHaveBeenCalledWith({
      store: { kind: "subscription-store" },
    })
    expect(mocks.createNodeServer).toHaveBeenCalledWith(
      expect.objectContaining({ residentServices: [mocks.webhookDeliveryLoop] }),
    )
    await server.close()
    expect(mocks.webhookDeliveryLoop.start).toHaveBeenCalledOnce()
    expect(mocks.webhookDeliveryLoop.stop).toHaveBeenCalledOnce()
  })

  it("does not start the generic worker when the webhook module is not selected", async () => {
    mocks.graphRuntime = {
      modules: [],
      extensions: [],
      plugins: [],
      accessCatalog: { resources: [] },
    }
    const projectRoot = await createGeneratedProject()
    const project = await loadVoyantProject({
      projectRoot,
      adminAssetsDir: path.join(projectRoot, "admin"),
      env: { DATABASE_URL: "postgres://example.invalid/voyant" },
    })

    const server = project.start()
    expect(mocks.createWebhookDeliveryWorker).not.toHaveBeenCalled()
    expect(mocks.createWebhookDeliveryLoop).not.toHaveBeenCalled()
    expect(mocks.createNodeServer).toHaveBeenCalledWith(
      expect.not.objectContaining({ residentServices: expect.anything() }),
    )
    await server.close()
  })

  it("does not let a host callback override the explicitly selected Postgres provider", async () => {
    const deliverEvent = vi.fn(async () => ["hosted"])
    const projectRoot = await createGeneratedProject()
    await loadVoyantProject({
      projectRoot,
      adminAssetsDir: path.join(projectRoot, "admin"),
      env: { DATABASE_URL: "postgres://example.invalid/voyant" },
      host: { deliverEvent },
    })

    const options = mocks.loadVoyantNodeRuntime.mock.calls[0]?.[0] as {
      outboundWebhooks: { enqueue(event: unknown, bindings: unknown): Promise<unknown> }
    }
    await expect(options.outboundWebhooks.enqueue({ name: "event" }, {})).resolves.toEqual([
      "queued",
    ])
    expect(mocks.createPostgresWebhookDeliveryEnqueuer).toHaveBeenCalledOnce()
    expect(deliverEvent).not.toHaveBeenCalled()
  })

  it("does not let Postgres credentials select outbound webhooks when the provider is none", async () => {
    mocks.deploymentProviders = {
      adminAuth: "better-auth",
      customerAuth: "better-auth",
      outboundWebhooks: "none",
    }
    const projectRoot = await createGeneratedProject()
    await loadVoyantProject({
      projectRoot,
      adminAssetsDir: path.join(projectRoot, "admin"),
      env: { DATABASE_URL: "postgres://example.invalid/voyant" },
    })

    const options = mocks.loadVoyantNodeRuntime.mock.calls[0]?.[0] as {
      outboundWebhooks?: unknown
    }
    expect(options.outboundWebhooks).toBeUndefined()
    expect(mocks.createPostgresWebhookDeliveryEnqueuer).not.toHaveBeenCalled()
  })

  it("rejects unsupported outbound webhook providers before server start", async () => {
    mocks.deploymentProviders = {
      adminAuth: "better-auth",
      customerAuth: "better-auth",
      outboundWebhooks: "external-queue",
    }
    const projectRoot = await createGeneratedProject()

    await expect(
      loadVoyantProject({
        projectRoot,
        adminAssetsDir: path.join(projectRoot, "admin"),
        env: { DATABASE_URL: "postgres://example.invalid/voyant" },
      }),
    ).rejects.toThrow(/outboundWebhooks.*is not supported/)
    expect(mocks.loadVoyantNodeRuntime).not.toHaveBeenCalled()
  })

  it("rejects a missing outbound webhook provider before server start", async () => {
    mocks.deploymentProviders = {
      adminAuth: "better-auth",
      customerAuth: "better-auth",
    }
    const projectRoot = await createGeneratedProject()

    await expect(
      loadVoyantProject({
        projectRoot,
        adminAssetsDir: path.join(projectRoot, "admin"),
        env: { DATABASE_URL: "postgres://example.invalid/voyant" },
      }),
    ).rejects.toThrow(/outboundWebhooks must be explicitly selected/)
    expect(mocks.loadVoyantNodeRuntime).not.toHaveBeenCalled()
  })
})
