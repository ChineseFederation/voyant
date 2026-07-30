import { defineModule } from "@voyant-travel/core/project"

/** Package-owned declaration for the in-deployment MCP transport. */
export const mcpVoyantModule = defineModule({
  id: "@voyant-travel/mcp",
  packageName: "@voyant-travel/mcp",
  localId: "mcp",
  api: [
    {
      id: "@voyant-travel/mcp#api.admin",
      surface: "admin",
      mount: "mcp",
      methods: ["GET", "POST"],
      openapi: { document: "mcp" },
      runtime: {
        entry: "@voyant-travel/mcp/runtime",
        export: "createMcpVoyantRuntime",
      },
    },
  ],
  presentations: [
    // The OAuth grant screen for this transport. It belongs to MCP rather than
    // to local auth: the authorization server issuing connector grants is local
    // to the deployment in every admin auth mode, so a broker-authenticated
    // deployment that ships no sign-in page must still answer /mcp-consent.
    {
      id: "@voyant-travel/mcp#presentation.consent",
      runtime: {
        entry: "@voyant-travel/auth-react/mcp-consent-routes",
        export: "createMcpConsentRouteContribution",
      },
    },
  ],
  access: {
    resources: [
      {
        id: "@voyant-travel/mcp#access.mcp",
        resource: "mcp",
        label: "MCP",
        description: "Connect to and invoke the selected deployment's MCP tool surface.",
        actions: [
          {
            action: "read",
            label: "Connect to MCP",
            description: "Open and inspect an MCP transport session.",
          },
          {
            action: "write",
            label: "Invoke MCP tools",
            description: "Send MCP requests and invoke tools admitted by the selected graph.",
          },
        ],
      },
    ],
  },
  meta: {
    ownership: "package",
  },
})

export default mcpVoyantModule
