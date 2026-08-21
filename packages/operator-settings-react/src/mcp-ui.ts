import { useLocale } from "@voyant-travel/admin/providers/locale"

/** Admin mount of the in-deployment MCP server (`@voyant-travel/mcp`). */
export const MCP_ENDPOINT_PATH = "/v1/admin/mcp"

/** Placeholder shown in every snippet — operators paste their own `voy_` token. */
export const MCP_TOKEN_PLACEHOLDER = "voy_your_api_token"

export type McpToolRisk = "low" | "medium" | "high" | "critical"
export type McpToolOverride = "allow" | "deny"

export interface McpExposurePolicy {
  allowedRiskLevels: McpToolRisk[]
  allowWrites: boolean
  allowSensitiveData: boolean
  toolOverrides: Record<string, McpToolOverride>
}

export interface McpToolExposure {
  enabled: boolean
  sensitive: boolean
  remoteSafe: boolean
  reason: string
}

/** One entry of `GET /v1/admin/mcp/manifest`, narrowed to what this page renders. */
export interface McpManifestTool {
  capabilityId: string
  owner: string
  name: string
  description: string
  requiredScopes: string[]
  deploymentRisk: McpToolRisk
  audience?: { allowed?: string[] }
  annotations?: { readOnlyHint?: boolean }
  actionPolicy?: { approval?: "never" | "conditional" | "required" }
  exposure: McpToolExposure
}

export interface McpManifest {
  version: string
  serverInfo: { name: string; version: string }
  policy: McpExposurePolicy
  tools: McpManifestTool[]
}

export type McpClientId = "claude-code" | "cursor" | "vscode" | "curl"

export interface McpClientConfig {
  id: McpClientId
  /** Rendered as a syntax hint only — the snippet is plain text. */
  language: "bash" | "json"
  /** Where the snippet goes (a file path) or `null` for a command. */
  file: string | null
  snippet: string
}

/**
 * Absolute endpoint an external MCP client dials. The admin runtime's `baseUrl`
 * is usually the relative API prefix (`/api`), so it is joined to the browser
 * origin; an already-absolute base is used as-is (split-host deployments).
 */
export function resolveMcpEndpoint(baseUrl: string, origin?: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "")
  if (/^https?:\/\//i.test(base)) return `${base}${MCP_ENDPOINT_PATH}`
  const prefix = base === "" || base.startsWith("/") ? base : `/${base}`
  return `${(origin ?? "").replace(/\/+$/, "")}${prefix}${MCP_ENDPOINT_PATH}`
}

/**
 * Connection snippets for the MCP clients operators actually use. Every client
 * speaks the same Streamable HTTP transport with a Bearer API token, so the
 * snippets differ only in the file/wrapper each client expects.
 */
export function buildMcpClientConfigs(
  endpoint: string,
  token: string = MCP_TOKEN_PLACEHOLDER,
): McpClientConfig[] {
  const authorization = `Bearer ${token}`
  const remote = { type: "http", url: endpoint, headers: { Authorization: authorization } }
  return [
    {
      id: "claude-code",
      language: "bash",
      file: null,
      snippet: [
        `claude mcp add --transport http voyant ${endpoint} \\`,
        `  --header "Authorization: ${authorization}"`,
      ].join("\n"),
    },
    {
      id: "cursor",
      language: "json",
      file: "~/.cursor/mcp.json",
      snippet: JSON.stringify({ mcpServers: { voyant: remote } }, null, 2),
    },
    {
      id: "vscode",
      language: "json",
      file: ".vscode/mcp.json",
      snippet: JSON.stringify({ servers: { voyant: remote } }, null, 2),
    },
    {
      id: "curl",
      language: "bash",
      file: null,
      snippet: [
        `curl -X POST ${endpoint} \\`,
        `  -H "Authorization: ${authorization}" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -H "Accept: application/json, text/event-stream" \\`,
        `  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
      ].join("\n"),
    },
  ]
}

interface McpMessages {
  title: string
  description: string
  connectionTitle: string
  connectionDescription: string
  endpointLabel: string
  transportLabel: string
  transportValue: string
  authLabel: string
  authValue: string
  serverLabel: string
  contractLabel: string
  copy: string
  copied: string
  stepsTitle: string
  stepsDescription: string
  step1Title: string
  step1Body: string
  step1Action: string
  step2Title: string
  step2Body: string
  step3Title: string
  step3Body: string
  connectTitle: string
  connectDescription: string
  connectStep1: string
  connectStep2: string
  connectStep3: string
  connectedTitle: string
  connectedDescription: string
  connectedEmpty: string
  connectedSince: string
  accessRead: string
  accessWrite: string
  disconnect: string
  disconnecting: string
  disconnectConfirm: string
  connectorsFailed: string
  developersTitle: string
  developersDescription: string
  clientsTitle: string
  clientsDescription: string
  clientClaudeCode: string
  clientCursor: string
  clientVsCode: string
  clientCurl: string
  fileLabel: string
  tokenNotice: string
  toolsTitle: string
  toolsDescription: string
  toolsSearchPlaceholder: string
  toolsEmpty: string
  toolsNoMatch: string
  toolsCount: string
  scopesLabel: string
  readOnly: string
  approvalRequired: string
  riskLow: string
  riskMedium: string
  riskHigh: string
  riskCritical: string
  loadFailed: string
  retry: string
  policyTitle: string
  policyDescription: string
  policyWrites: string
  policyWritesDescription: string
  policySensitive: string
  policySensitiveDescription: string
  policyRisk: string
  policyRiskDescription: string
  policyCriticalNote: string
  policyPresets: string
  policyPresetsDescription: string
  enableAll: string
  useRecommended: string
  savePolicy: string
  savingPolicy: string
  policySaved: string
  policySaveFailed: string
  exposed: string
  blocked: string
  useDefault: string
}

const en: McpMessages = {
  title: "MCP",
  description:
    "Let AI assistants work in this deployment over the Model Context Protocol. Every tool is gated by the scopes of the API token you connect with.",
  connectionTitle: "Connection",
  connectionDescription: "Point any MCP client at this endpoint.",
  endpointLabel: "Endpoint",
  transportLabel: "Transport",
  transportValue: "Streamable HTTP (no stdio bridge required)",
  authLabel: "Authentication",
  authValue: "Authorization: Bearer <API token>",
  serverLabel: "Server",
  contractLabel: "Tool contract",
  copy: "Copy",
  copied: "Copied",
  stepsTitle: "Set up a client",
  stepsDescription: "Three steps, once per client.",
  step1Title: "Create an API token",
  step1Body:
    "Mint a token with only the permissions the assistant needs. Tools outside those scopes are never listed and cannot be called.",
  step1Action: "Open API tokens",
  step2Title: "Add the server to your client",
  step2Body:
    "Copy the snippet for your client below and replace the placeholder with the token you just created.",
  step3Title: "Restart and verify",
  step3Body:
    "Restart the client, then ask it to list its tools. You should see the tools your token allows.",
  connectTitle: "Connect an AI assistant",
  connectDescription:
    "Claude and ChatGPT only need this address. They will ask you to sign in and approve before they can do anything.",
  connectStep1: "Copy the address below.",
  connectStep2:
    "In your assistant, add a custom connector and paste it. Leave any optional fields empty.",
  connectStep3: "Sign in when prompted and approve the request. That's it.",
  connectedTitle: "Connected assistants",
  connectedDescription: "Assistants you approved. Disconnecting takes effect immediately.",
  connectedEmpty: "No assistants are connected yet.",
  connectedSince: "Connected {date}",
  accessRead: "Can see your data",
  accessWrite: "Can see and change your data",
  disconnect: "Disconnect",
  disconnecting: "Disconnecting…",
  disconnectConfirm: "Disconnect {name}? It will lose access straight away.",
  connectorsFailed: "Could not load connected assistants.",
  developersTitle: "For developers",
  developersDescription:
    "Coding tools connect with an API token instead. Create one under API tokens, then use the snippet for your tool.",
  clientsTitle: "Client configuration",
  clientsDescription: "The same endpoint and token, in the shape each client expects.",
  clientClaudeCode: "Claude Code",
  clientCursor: "Cursor",
  clientVsCode: "VS Code",
  clientCurl: "curl",
  fileLabel: "File",
  tokenNotice:
    "Replace {placeholder} with a real token. Voyant never stores it — the client sends it on every request.",
  toolsTitle: "Available tools",
  toolsDescription:
    "What this deployment exposes to you right now. A connected client sees the subset its own token is scoped for.",
  toolsSearchPlaceholder: "Search tools",
  toolsEmpty: "No tools are available for your permissions.",
  toolsNoMatch: "No tools match your search.",
  toolsCount: "Showing {count} of {total}",
  scopesLabel: "Scopes",
  readOnly: "Read only",
  approvalRequired: "Approval required",
  riskLow: "Low risk",
  riskMedium: "Medium risk",
  riskHigh: "High risk",
  riskCritical: "Critical risk",
  loadFailed: "Could not load the MCP tool list.",
  retry: "Try again",
  policyTitle: "MCP exposure policy",
  policyDescription:
    "Choose the maximum tool surface any connected assistant may use. User permissions and OAuth scopes still apply.",
  policyWrites: "Allow tools that change data",
  policyWritesDescription: "Write tools remain subject to their normal approval rules.",
  policySensitive: "Allow tools that access sensitive or personal data",
  policySensitiveDescription: "The risk policy and per-tool choices still apply.",
  policyRisk: "Automatically expose remote-safe tools at these risk levels",
  policyRiskDescription: "Low risk is the recommended baseline.",
  policyCriticalNote:
    "Critical and package-restricted tools always require an explicit per-tool enable.",
  policyPresets: "Policy presets",
  policyPresetsDescription:
    "Enable all includes every current tool, including writes, sensitive data, and critical or restricted tools. Review the draft below, then save it.",
  enableAll: "Enable all",
  useRecommended: "Recommended baseline",
  savePolicy: "Save policy",
  savingPolicy: "Saving…",
  policySaved: "Policy saved. Connected assistants use it on their next request.",
  policySaveFailed: "Could not save the MCP exposure policy.",
  exposed: "Exposed",
  blocked: "Blocked",
  useDefault: "Use policy default",
}

const ro: McpMessages = {
  title: "MCP",
  description:
    "Permite asistentilor AI sa lucreze in acest deployment prin Model Context Protocol. Fiecare tool este limitat de permisiunile tokenului API cu care te conectezi.",
  connectionTitle: "Conexiune",
  connectionDescription: "Indreapta orice client MCP catre acest endpoint.",
  endpointLabel: "Endpoint",
  transportLabel: "Transport",
  transportValue: "Streamable HTTP (fara punte stdio)",
  authLabel: "Autentificare",
  authValue: "Authorization: Bearer <token API>",
  serverLabel: "Server",
  contractLabel: "Contract tool",
  copy: "Copiaza",
  copied: "Copiat",
  stepsTitle: "Configureaza un client",
  stepsDescription: "Trei pasi, o singura data pentru fiecare client.",
  step1Title: "Creeaza un token API",
  step1Body:
    "Genereaza un token doar cu permisiunile de care are nevoie asistentul. Toolurile din afara acestor permisiuni nu sunt listate si nu pot fi apelate.",
  step1Action: "Deschide tokenurile API",
  step2Title: "Adauga serverul in client",
  step2Body:
    "Copiaza fragmentul pentru clientul tau de mai jos si inlocuieste substituentul cu tokenul creat.",
  step3Title: "Reporneste si verifica",
  step3Body:
    "Reporneste clientul, apoi cere-i lista de tooluri. Ar trebui sa vezi toolurile permise de token.",
  connectTitle: "Conecteaza un asistent AI",
  connectDescription:
    "Claude si ChatGPT au nevoie doar de aceasta adresa. Iti vor cere sa te autentifici si sa aprobi inainte de a putea face ceva.",
  connectStep1: "Copiaza adresa de mai jos.",
  connectStep2:
    "In asistentul tau, adauga un conector personalizat si lipeste adresa. Lasa goale campurile optionale.",
  connectStep3: "Autentifica-te cand ti se cere si aproba cererea. Gata.",
  connectedTitle: "Asistenti conectati",
  connectedDescription: "Asistentii pe care i-ai aprobat. Deconectarea are efect imediat.",
  connectedEmpty: "Nu exista asistenti conectati.",
  connectedSince: "Conectat {date}",
  accessRead: "Poate vedea datele tale",
  accessWrite: "Poate vedea si modifica datele tale",
  disconnect: "Deconecteaza",
  disconnecting: "Se deconecteaza…",
  disconnectConfirm: "Deconectezi {name}? Va pierde accesul imediat.",
  connectorsFailed: "Asistentii conectati nu au putut fi incarcati.",
  developersTitle: "Pentru dezvoltatori",
  developersDescription:
    "Uneltele de programare se conecteaza cu un token API. Creeaza unul la Tokenuri API, apoi foloseste fragmentul pentru unealta ta.",
  clientsTitle: "Configurare client",
  clientsDescription: "Acelasi endpoint si token, in formatul asteptat de fiecare client.",
  clientClaudeCode: "Claude Code",
  clientCursor: "Cursor",
  clientVsCode: "VS Code",
  clientCurl: "curl",
  fileLabel: "Fisier",
  tokenNotice:
    "Inlocuieste {placeholder} cu un token real. Voyant nu il stocheaza — clientul il trimite la fiecare cerere.",
  toolsTitle: "Tooluri disponibile",
  toolsDescription:
    "Ce expune acest deployment pentru tine acum. Un client conectat vede subsetul permis de tokenul lui.",
  toolsSearchPlaceholder: "Cauta tooluri",
  toolsEmpty: "Nu exista tooluri disponibile pentru permisiunile tale.",
  toolsNoMatch: "Niciun tool nu corespunde cautarii.",
  toolsCount: "Afisare {count} din {total}",
  scopesLabel: "Permisiuni",
  readOnly: "Doar citire",
  approvalRequired: "Necesita aprobare",
  riskLow: "Risc scazut",
  riskMedium: "Risc mediu",
  riskHigh: "Risc ridicat",
  riskCritical: "Risc critic",
  loadFailed: "Lista de tooluri MCP nu a putut fi incarcata.",
  retry: "Incearca din nou",
  policyTitle: "Politica de expunere MCP",
  policyDescription:
    "Alege suprafata maxima de tooluri disponibila asistentilor conectati. Permisiunile utilizatorului si scope-urile OAuth se aplica in continuare.",
  policyWrites: "Permite tooluri care modifica date",
  policyWritesDescription:
    "Toolurile de scriere respecta in continuare regulile normale de aprobare.",
  policySensitive: "Permite tooluri cu date sensibile sau personale",
  policySensitiveDescription: "Politica de risc si alegerile individuale se aplica in continuare.",
  policyRisk: "Expune automat toolurile remote-safe la aceste niveluri de risc",
  policyRiskDescription: "Riscul scazut este baza recomandata.",
  policyCriticalNote:
    "Toolurile critice si restrictionate de pachet necesita intotdeauna activare individuala.",
  policyPresets: "Preseturi de politica",
  policyPresetsDescription:
    "Activarea completa include toate toolurile curente, inclusiv scrieri, date sensibile si tooluri critice sau restrictionate. Verifica schita de mai jos, apoi salveaz-o.",
  enableAll: "Activeaza tot",
  useRecommended: "Configuratie recomandata",
  savePolicy: "Salveaza politica",
  savingPolicy: "Se salveaza…",
  policySaved: "Politica a fost salvata. Asistentii o folosesc la urmatoarea cerere.",
  policySaveFailed: "Politica de expunere MCP nu a putut fi salvata.",
  exposed: "Expus",
  blocked: "Blocat",
  useDefault: "Foloseste politica implicita",
}

export function useMcpMessages(): McpMessages {
  const { resolvedLocale } = useLocale()
  return resolvedLocale?.toLowerCase().startsWith("ro") ? ro : en
}

export function mcpRiskLabel(risk: McpToolRisk, messages: McpMessages): string {
  switch (risk) {
    case "critical":
      return messages.riskCritical
    case "high":
      return messages.riskHigh
    case "medium":
      return messages.riskMedium
    default:
      return messages.riskLow
  }
}

/** Case-insensitive match over the fields an operator would search by. */
export function filterMcpTools(tools: McpManifestTool[], query: string): McpManifestTool[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return tools
  return tools.filter((tool) =>
    [tool.name, tool.description, tool.owner, ...tool.requiredScopes]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  )
}

/** Mirror the server policy evaluator so unsaved controls preview the effective result. */
export function isMcpToolExposed(tool: McpManifestTool, policy: McpExposurePolicy): boolean {
  const override = policy.toolOverrides[tool.capabilityId]
  if (override === "deny") return false
  if (!tool.annotations?.readOnlyHint && !policy.allowWrites) return false
  if (tool.exposure.sensitive && !policy.allowSensitiveData) return false
  if (override === "allow") return true
  if (tool.deploymentRisk === "critical" || !tool.exposure.remoteSafe) return false
  return policy.allowedRiskLevels.includes(tool.deploymentRisk)
}

/** Draft that explicitly exposes every tool currently present in the manifest. */
export function enableAllMcpTools(tools: McpManifestTool[]): McpExposurePolicy {
  return {
    allowedRiskLevels: ["low", "medium", "high", "critical"],
    allowWrites: true,
    allowSensitiveData: true,
    toolOverrides: Object.fromEntries(tools.map((tool) => [tool.capabilityId, "allow"])),
  }
}

/** Recommended deployment baseline: remote-safe, low-risk, non-sensitive reads only. */
export function recommendedMcpPolicy(): McpExposurePolicy {
  return {
    allowedRiskLevels: ["low"],
    allowWrites: false,
    allowSensitiveData: false,
    toolOverrides: {},
  }
}
