import { assertPortConforms } from "@voyant-travel/core/project"
import { describe, expect, it, vi } from "vitest"
import {
  createProposalsVoyantRuntime,
  proposalsPresentationRuntimePort,
  proposalsRuntimePort,
  proposalsSnapshotRuntimePort,
  createProposalPresentationVoyantRuntime as rootProposalRuntime,
  createProposalVersionSnapshotVoyantRuntime as rootSnapshotRuntime,
} from "../../src/index.js"
import {
  createProposalPresentationVoyantRuntime,
  createProposalVersionSnapshotVoyantRuntime,
} from "../../src/proposal-routes.js"
import {
  proposalsPresentationVoyantExtension,
  proposalsVersionSnapshotVoyantPlugin,
  proposalsVoyantModule,
} from "../../src/voyant.js"

function factoryContext<T>(
  provider: T,
  api: readonly { id: string; surface: "admin" | "public" }[],
) {
  return {
    unitId: "proposals-test",
    projectConfig: {},
    getUnitProjectConfig: () => undefined,
    api,
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
  }
}

describe("proposals deployment authority", () => {
  it("exports extension factories from the manifest entry", () => {
    expect(rootProposalRuntime).toBe(createProposalPresentationVoyantRuntime)
    expect(rootSnapshotRuntime).toBe(createProposalVersionSnapshotVoyantRuntime)
  })

  it("declares package-owned factories and their narrow ports", () => {
    expect(proposalsVoyantModule).toMatchObject({
      provides: {
        ports: [
          { id: "proposals.checkout-inquiry.runtime" },
          { id: "proposals.runtime" },
          { id: "custom-fields.value-lifecycle" },
          { id: "custom-fields.value-operations" },
        ],
      },
      runtimePorts: [{ id: "proposals.runtime" }],
      api: [{ runtime: { export: "createProposalsVoyantRuntime" } }],
    })
    expect(proposalsPresentationVoyantExtension).toMatchObject({
      requires: { capabilities: ["notifications.delivery"] },
      runtimePorts: [
        { id: "proposals.presentation-runtime" },
        { id: "proposals.notifications.runtime", optional: true },
        { id: "notifications.durable-provider", optional: true },
      ],
      api: [
        { surface: "admin", runtime: { export: "createProposalPresentationVoyantRuntime" } },
        { surface: "public", runtime: { export: "createProposalPresentationVoyantRuntime" } },
      ],
      presentations: [
        {
          id: "@voyant-travel/proposals#presentation.public",
          runtime: {
            entry: "@voyant-travel/proposals-react/public-routes",
            export: "createProposalsPublicRouteContribution",
          },
        },
      ],
    })
    expect(proposalsVersionSnapshotVoyantPlugin).toMatchObject({
      runtimePorts: [{ id: "proposals.snapshot-runtime" }],
      api: [{ runtime: { export: "createProposalVersionSnapshotVoyantRuntime" } }],
    })
  })

  it("assembles the Proposals module from its deployment provider", async () => {
    const provider = { resolveParticipantPersonById: vi.fn(async () => true) }
    await expect(assertPortConforms(proposalsRuntimePort, provider)).resolves.toBeUndefined()
    await expect(assertPortConforms(proposalsRuntimePort, {} as never)).rejects.toThrow(
      /resolveParticipantPersonById/,
    )

    const runtime = await createProposalsVoyantRuntime(
      factoryContext(provider, proposalsVoyantModule.api ?? []),
    )
    expect(runtime.module).toMatchObject({ name: "proposals", requiresTransactionalDb: true })
    expect(runtime.adminRoutes).toBeDefined()
  })

  it("assembles proposal and snapshot extensions from separate providers", async () => {
    const proposalProvider = {
      resolveDb: vi.fn(),
      resolvePublicProposalBaseUrl: vi.fn(() => null),
      resolveOperatorProfile: vi.fn(async () => null),
    }
    const snapshotProvider = { resolveDb: vi.fn() }

    await expect(
      assertPortConforms(proposalsPresentationRuntimePort, proposalProvider as never),
    ).resolves.toBeUndefined()
    await expect(
      assertPortConforms(proposalsSnapshotRuntimePort, snapshotProvider as never),
    ).resolves.toBeUndefined()
    await expect(assertPortConforms(proposalsPresentationRuntimePort, {} as never)).rejects.toThrow(
      /resolveDb/,
    )

    const proposal = await createProposalPresentationVoyantRuntime(
      factoryContext(proposalProvider, proposalsPresentationVoyantExtension.api ?? []),
    )
    expect(proposal).toMatchObject({
      extension: { name: "proposal", module: "proposal-versions" },
      publicPath: "proposals",
      anonymous: true,
    })
    expect(proposal.lazyAdminRoutes).toBeTypeOf("function")
    expect(proposal.lazyPublicRoutes).toBeTypeOf("function")

    const snapshot = await createProposalVersionSnapshotVoyantRuntime(
      factoryContext(snapshotProvider, proposalsVersionSnapshotVoyantPlugin.api ?? []),
    )
    expect(snapshot).toMatchObject({
      extension: { name: "proposal-version-snapshot", module: "trips" },
    })
    expect(snapshot.lazyAdminRoutes).toBeTypeOf("function")
  })
})
