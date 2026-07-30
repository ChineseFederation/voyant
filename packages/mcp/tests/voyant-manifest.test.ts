import { describe, expect, it } from "vitest"

import { mcpVoyantModule } from "../src/voyant.js"

describe("@voyant-travel/mcp manifest", () => {
  it("owns the connector consent screen so every auth mode ships it", () => {
    // The consent page used to ride along with the local-auth presentation,
    // which a broker-authenticated deployment deliberately does not select —
    // so the connector handshake 404ed on its last step.
    expect(mcpVoyantModule.presentations).toHaveLength(1)
    expect(mcpVoyantModule.presentations?.[0]).toMatchObject({
      id: "@voyant-travel/mcp#presentation.consent",
      runtime: {
        entry: "@voyant-travel/auth-react/mcp-consent-routes",
        export: "createMcpConsentRouteContribution",
      },
    })
  })
})
