const FORBIDDEN_TOKENS = [
  "VOYANT_SELECTED_EXECUTABLE_FACETS_SCHEMA_VERSION",
  "buildSelectedGraphExecutableFacetArtifacts",
  "voyant.selected-executable-facets.v1",
  "manifests/tools.json",
  "manifests/actions.json",
  "manifests/webhooks.json",
  "npm/operator#mcp",
  "OPERATOR_LOCAL_MODULE_IDS",
  "mcpRuntimePort",
  "mcp-deployment-resources",
  "buildMcpAdminRoutes",
]

const REQUIRED_TOKENS = new Map([
  [
    "packages/mcp/src/voyant.ts",
    [
      "defineModule",
      'id: "@voyant-travel/mcp"',
      'mount: "mcp"',
      'entry: "@voyant-travel/mcp/runtime"',
    ],
  ],
  [
    "packages/mcp/src/runtime.ts",
    [
      "defineGraphRuntimeFactory",
      "createGraphMcpApiRoutes",
      "graph, runtimePorts",
      "buildMcpBaseContext",
    ],
  ],
  [
    "packages/core/src/project.ts",
    ["VoyantGraphRuntimeFactoryGraph", "readonly graph:", "readonly runtimePorts:"],
  ],
  [
    "packages/framework/src/node-runtime.ts",
    ["composeVoyantGraphRuntime", "graphRuntime", "runtimePorts"],
  ],
  ["packages/operator-standard/src/index.ts", ['resolve: "@voyant-travel/mcp"']],
  [
    "packages/runtime/src/index.ts",
    ["loadVoyantNodeRuntime", "generated.graphRuntime", "deploymentResources.ports"],
  ],
])

export function inspectPhase5ToolsMcpAuthority(files) {
  const failures = []
  const compatibilityModule = "apps/operator/src/modules/mcp/index.ts"
  if (files.has(compatibilityModule)) {
    failures.push(`${compatibilityModule}: Operator-local MCP compatibility module must be removed`)
  }
  if (files.has("packages/mcp/src/runtime-port.ts")) {
    failures.push(
      "packages/mcp/src/runtime-port.ts: MCP must consume generic graph factory context",
    )
  }

  for (const [file, tokens] of REQUIRED_TOKENS) {
    const source = files.get(file)
    if (source === undefined) {
      failures.push(`${file}: required graph authority file is missing`)
      continue
    }
    for (const token of tokens) {
      if (!source.includes(token))
        failures.push(`${file}: missing required authority token ${token}`)
    }
  }

  const packageJsonSource = files.get("packages/mcp/package.json")
  if (packageJsonSource === undefined) {
    failures.push("packages/mcp/package.json: package manifest is missing")
  } else {
    try {
      const packageJson = JSON.parse(packageJsonSource)
      if (packageJson.voyant?.kind !== "module" || packageJson.voyant?.manifest !== "./voyant") {
        failures.push(
          "packages/mcp/package.json: voyant metadata must select the package-owned module manifest",
        )
      }
      if (!packageJson.exports?.["./runtime"] || !packageJson.exports?.["./voyant"]) {
        failures.push(
          "packages/mcp/package.json: runtime and voyant exports must be public package surfaces",
        )
      }
    } catch {
      failures.push("packages/mcp/package.json: invalid JSON")
    }
  }

  for (const [file, source] of files) {
    for (const token of FORBIDDEN_TOKENS) {
      if (source.includes(token)) failures.push(`${file}: forbidden compatibility token ${token}`)
    }
  }
  return failures
}
