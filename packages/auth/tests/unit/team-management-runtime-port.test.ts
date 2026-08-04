import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import { describe, expect, it } from "vitest"

import { createAuthRuntimePortContribution } from "../../src/runtime-contributor.js"
import type { TeamManagementRuntimeProvider } from "../../src/team-management-runtime-port.js"
import { teamManagementRuntimePort } from "../../src/team-management-runtime-port.js"

describe("team-management runtime port", () => {
  it("validates the graph-contributed provider", () => {
    const contribution = createAuthRuntimePortContribution(hostWithAuthProvider("better-auth"))
    const provider = contribution[teamManagementRuntimePort.id] as TeamManagementRuntimeProvider

    expect(() => teamManagementRuntimePort.test(provider)).not.toThrow()
  })

  it("rejects incomplete providers", () => {
    expect(() => teamManagementRuntimePort.test({} as TeamManagementRuntimeProvider)).toThrow(
      /getCapabilities/,
    )
  })

  it("requires the provider-neutral activation operation", () => {
    const contribution = createAuthRuntimePortContribution(hostWithAuthProvider("better-auth"))
    const provider = contribution[teamManagementRuntimePort.id] as TeamManagementRuntimeProvider
    const incomplete = { ...provider, activateMember: undefined }

    expect(() =>
      teamManagementRuntimePort.test(incomplete as TeamManagementRuntimeProvider),
    ).toThrow(/activateMember/)
  })
})

function hostWithAuthProvider(provider: "better-auth" | "voyant-cloud") {
  return {
    primitives: {
      env: (bindings) => bindings as Readonly<Record<string, unknown>>,
      database: {} as VoyantRuntimeHostPrimitives["database"],
      storage: {} as VoyantRuntimeHostPrimitives["storage"],
      events: {} as VoyantRuntimeHostPrimitives["events"],
      jobs: {} as VoyantRuntimeHostPrimitives["jobs"],
      config: {
        read: (_bindings, key) => (key === "deployment.providers.adminAuth" ? provider : undefined),
      },
    } satisfies VoyantRuntimeHostPrimitives,
  }
}
