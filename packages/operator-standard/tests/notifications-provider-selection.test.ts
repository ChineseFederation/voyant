import { defineModule, defineProvider, providePort } from "@voyant-travel/core/project"
import { durableNotificationProviderPort } from "@voyant-travel/notifications/durable-provider-port"
import { notificationsVoyantModule } from "@voyant-travel/notifications/voyant"
import { quotesProposalVoyantPlugin } from "@voyant-travel/quotes/voyant"
import { describe, expect, it } from "vitest"

import {
  defineProject,
  resolveDeploymentGraph,
  validateGraphUnitManifest,
} from "../../framework/src/deployment-graph.js"

describe("notifications durable provider selection", () => {
  it("rejects proposal delivery when the Notifications adapter owner is absent", async () => {
    const provider = defineProvider({
      id: "@example/voyant-notifications-provider",
      provides: { ports: [providePort(durableNotificationProviderPort)] },
      providers: [
        {
          id: "@example/voyant-notifications-provider#provider.durable-email",
          port: durableNotificationProviderPort.id,
          selection: { role: "notifications", value: "durable-email" },
          runtime: { entry: "@example/voyant-notifications-provider", export: "createProvider" },
        },
      ],
    })
    const graph = await resolveDeploymentGraph({
      project: defineProject({
        modules: [defineModule({ id: "@example/voyant-quotes-host" })],
        extensions: [quotesProposalVoyantPlugin],
        providers: [provider],
      }),
      deployment: {
        target: "node",
        providers: { notifications: "durable-email" },
        requirements: { resources: [] },
      },
    })

    expect(graph.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "VOYANT_GRAPH_MISSING_CAPABILITY",
        source: quotesProposalVoyantPlugin.id,
        facet: "requires.capabilities",
      }),
    )
    expect(graph.extensions[0]?.requires.capabilities).toContain("notifications.delivery")
  })

  it("resolves an external conformant provider as the conditional send authority", async () => {
    expect(validateGraphUnitManifest(notificationsVoyantModule, "module")).toEqual([])
    const provider = defineProvider({
      id: "@example/voyant-notifications-provider",
      provides: { ports: [providePort(durableNotificationProviderPort)] },
      providers: [
        {
          id: "@example/voyant-notifications-provider#provider.durable-email",
          port: durableNotificationProviderPort.id,
          selection: { role: "notifications", value: "durable-email" },
          runtime: { entry: "@example/voyant-notifications-provider", export: "createProvider" },
        },
      ],
    })
    const graph = await resolveDeploymentGraph({
      project: defineProject({
        modules: [notificationsVoyantModule],
        providers: [provider],
      }),
      deployment: {
        target: "node",
        providers: { notifications: "durable-email" },
        requirements: { resources: [] },
      },
      packageRecords: [
        { packageName: "@voyant-travel/notifications", source: { kind: "workspace" } },
        { packageName: "@voyant-travel/notifications-react", source: { kind: "workspace" } },
      ],
    })
    expect(graph.diagnostics).toEqual([])
    expect(graph.providers[0]?.providers).toContainEqual(
      expect.objectContaining({
        port: durableNotificationProviderPort.id,
        selection: { role: "notifications", value: "durable-email" },
      }),
    )
    expect(graph.modules[0]?.actions).toContainEqual(
      expect.objectContaining({
        id: "@voyant-travel/notifications#action.send-notification",
        availability: expect.objectContaining({
          enableWhen: {
            selectedProviderPorts: {
              mode: "all",
              ports: [durableNotificationProviderPort.id],
            },
          },
        }),
      }),
    )
  })
})
