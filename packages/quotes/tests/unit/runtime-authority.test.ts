import { assertPortConforms } from "@voyant-travel/core/project"
import { describe, expect, it, vi } from "vitest"
import {
  createQuotesVoyantRuntime,
  quotesProposalRuntimePort,
  quotesRuntimePort,
  quotesSnapshotRuntimePort,
  createQuoteProposalVoyantRuntime as rootProposalRuntime,
  createQuoteVersionSnapshotVoyantRuntime as rootSnapshotRuntime,
} from "../../src/index.js"
import {
  createQuoteProposalVoyantRuntime,
  createQuoteVersionSnapshotVoyantRuntime,
} from "../../src/proposal-routes.js"
import {
  quotesProposalVoyantPlugin,
  quotesVersionSnapshotVoyantPlugin,
  quotesVoyantModule,
} from "../../src/voyant.js"

function factoryContext<T>(
  provider: T,
  api: readonly { id: string; surface: "admin" | "public" }[],
) {
  return {
    unitId: "quotes-test",
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

describe("quotes deployment authority", () => {
  it("exports extension factories from the manifest entry", () => {
    expect(rootProposalRuntime).toBe(createQuoteProposalVoyantRuntime)
    expect(rootSnapshotRuntime).toBe(createQuoteVersionSnapshotVoyantRuntime)
  })

  it("declares package-owned factories and their narrow ports", () => {
    expect(quotesVoyantModule).toMatchObject({
      provides: {
        ports: [
          { id: "quotes.checkout-inquiry.runtime" },
          { id: "quotes.runtime" },
          { id: "custom-fields.value-lifecycle" },
          { id: "custom-fields.value-operations" },
        ],
      },
      runtimePorts: [{ id: "quotes.runtime" }],
      api: [{ runtime: { export: "createQuotesVoyantRuntime" } }],
    })
    expect(quotesProposalVoyantPlugin).toMatchObject({
      requires: { capabilities: ["notifications.delivery"] },
      runtimePorts: [
        { id: "quotes.proposal-runtime" },
        { id: "quotes.notifications.runtime", optional: true },
        { id: "notifications.durable-provider", optional: true },
      ],
      api: [
        { surface: "admin", runtime: { export: "createQuoteProposalVoyantRuntime" } },
        { surface: "public", runtime: { export: "createQuoteProposalVoyantRuntime" } },
      ],
      presentations: [
        {
          id: "@voyant-travel/quotes#presentation.public",
          runtime: {
            entry: "@voyant-travel/quotes-react/public-routes",
            export: "createQuotesPublicRouteContribution",
          },
        },
      ],
    })
    expect(quotesVersionSnapshotVoyantPlugin).toMatchObject({
      runtimePorts: [{ id: "quotes.snapshot-runtime" }],
      api: [{ runtime: { export: "createQuoteVersionSnapshotVoyantRuntime" } }],
    })
  })

  it("assembles the Quotes module from its deployment provider", async () => {
    const provider = { resolveParticipantPersonById: vi.fn(async () => true) }
    await expect(assertPortConforms(quotesRuntimePort, provider)).resolves.toBeUndefined()
    await expect(assertPortConforms(quotesRuntimePort, {} as never)).rejects.toThrow(
      /resolveParticipantPersonById/,
    )

    const runtime = await createQuotesVoyantRuntime(
      factoryContext(provider, quotesVoyantModule.api ?? []),
    )
    expect(runtime.module).toMatchObject({ name: "quotes", requiresTransactionalDb: true })
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
      assertPortConforms(quotesProposalRuntimePort, proposalProvider as never),
    ).resolves.toBeUndefined()
    await expect(
      assertPortConforms(quotesSnapshotRuntimePort, snapshotProvider as never),
    ).resolves.toBeUndefined()
    await expect(assertPortConforms(quotesProposalRuntimePort, {} as never)).rejects.toThrow(
      /resolveDb/,
    )

    const proposal = await createQuoteProposalVoyantRuntime(
      factoryContext(proposalProvider, quotesProposalVoyantPlugin.api ?? []),
    )
    expect(proposal).toMatchObject({
      extension: { name: "proposal", module: "quote-versions" },
      publicPath: "proposals",
      anonymous: true,
    })
    expect(proposal.lazyAdminRoutes).toBeTypeOf("function")
    expect(proposal.lazyPublicRoutes).toBeTypeOf("function")

    const snapshot = await createQuoteVersionSnapshotVoyantRuntime(
      factoryContext(snapshotProvider, quotesVersionSnapshotVoyantPlugin.api ?? []),
    )
    expect(snapshot).toMatchObject({
      extension: { name: "quote-version-snapshot", module: "trips" },
    })
    expect(snapshot.lazyAdminRoutes).toBeTypeOf("function")
  })
})
