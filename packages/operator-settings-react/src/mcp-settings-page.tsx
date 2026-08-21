"use client"

/**
 * Settings → MCP (source-free, package-delivered).
 *
 * Documents how to connect an external MCP client to the in-deployment MCP
 * server (`@voyant-travel/mcp`, mounted at `/v1/admin/mcp`) and shows the tool
 * surface the signed-in staff member is authorized for. Read-only: tokens are
 * minted on Settings → API tokens, never here.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useVoyantReactContext } from "@voyant-travel/react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Spinner,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@voyant-travel/ui/components"
import { Check, Copy, KeyRound, Plug } from "lucide-react"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { listMcpConnectors, revokeMcpConnector } from "./mcp-connectors.js"
import {
  buildMcpClientConfigs,
  enableAllMcpTools,
  filterMcpTools,
  isMcpToolExposed,
  MCP_TOKEN_PLACEHOLDER,
  type McpClientConfig,
  type McpClientId,
  type McpExposurePolicy,
  type McpManifest,
  type McpToolRisk,
  mcpRiskLabel,
  recommendedMcpPolicy,
  resolveMcpEndpoint,
  useMcpMessages,
} from "./mcp-ui.js"

type McpMessages = ReturnType<typeof useMcpMessages>

const manifestKey = ["operator-mcp", "manifest"] as const
const connectorsKey = ["operator-mcp", "connectors"] as const
const risks: McpToolRisk[] = ["low", "medium", "high", "critical"]

const riskVariant: Record<string, "secondary" | "outline" | "destructive"> = {
  low: "secondary",
  medium: "outline",
  high: "destructive",
  critical: "destructive",
}

function clientLabel(id: McpClientId, t: McpMessages): string {
  switch (id) {
    case "claude-code":
      return t.clientClaudeCode
    case "cursor":
      return t.clientCursor
    case "vscode":
      return t.clientVsCode
    default:
      return t.clientCurl
  }
}

function CopyButton({ value, label, copiedLabel }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 2000)
        })
      }}
    >
      {copied ? (
        <Check className="mr-2 h-4 w-4" aria-hidden="true" />
      ) : (
        <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
      )}
      {copied ? copiedLabel : label}
    </Button>
  )
}

interface CopyButtonProps {
  value: string
  label: string
  copiedLabel: string
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all text-sm">{children}</span>
    </div>
  )
}

function SetupStep({ index, title, body, children }: SetupStepProps) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {index}
      </span>
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
        {children}
      </div>
    </li>
  )
}

interface SetupStepProps {
  index: number
  title: string
  body: string
  children?: ReactNode
}

function ClientSnippet({ config, t }: { config: McpClientConfig; t: McpMessages }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {config.file ? (
          <p className="text-sm text-muted-foreground">
            {t.fileLabel}: <code className="font-mono text-xs">{config.file}</code>
          </p>
        ) : (
          <span />
        )}
        <CopyButton value={config.snippet} label={t.copy} copiedLabel={t.copied} />
      </div>
      <pre className="overflow-x-auto rounded-md bg-muted p-4 text-xs leading-relaxed">
        <code className="font-mono">{config.snippet}</code>
      </pre>
    </div>
  )
}

export function McpSettingsPage() {
  const { baseUrl, fetcher } = useVoyantReactContext()
  const queryClient = useQueryClient()
  const t = useMcpMessages()
  const [search, setSearch] = useState("")
  const [policyDraft, setPolicyDraft] = useState<McpExposurePolicy>()
  const [policySaved, setPolicySaved] = useState(false)

  const endpoint = useMemo(
    () =>
      resolveMcpEndpoint(
        baseUrl,
        typeof window === "undefined" ? undefined : window.location.origin,
      ),
    [baseUrl],
  )
  const clients = useMemo(() => buildMcpClientConfigs(endpoint), [endpoint])

  const connectors = useQuery({
    queryKey: connectorsKey,
    queryFn: () => listMcpConnectors(baseUrl, fetcher),
  })
  const revoke = useMutation({
    mutationFn: (consentId: string) => revokeMcpConnector(baseUrl, fetcher, consentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: connectorsKey }),
  })

  const manifest = useQuery({
    queryKey: manifestKey,
    queryFn: async () => {
      const response = await fetcher(`${baseUrl}/v1/admin/mcp/manifest`)
      if (!response.ok) throw new Error(t.loadFailed)
      return (await response.json()) as McpManifest
    },
  })

  useEffect(() => {
    if (manifest.data?.policy) setPolicyDraft(manifest.data.policy)
  }, [manifest.data?.policy])

  const savePolicy = useMutation({
    mutationFn: async (policy: McpExposurePolicy) => {
      const response = await fetcher(`${baseUrl}/v1/admin/mcp/policy`, {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(policy),
      })
      if (!response.ok) throw new Error(t.policySaveFailed)
      return (await response.json()) as McpExposurePolicy
    },
    onSuccess: (policy) => {
      setPolicyDraft(policy)
      setPolicySaved(true)
      void queryClient.invalidateQueries({ queryKey: manifestKey })
    },
  })

  const tools = manifest.data?.tools ?? []
  const visible = useMemo(() => filterMcpTools(tools, search), [tools, search])

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
      </header>

      {/* The primary path: a chat assistant needs nothing but this address. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-4 w-4" aria-hidden="true" />
            {t.connectTitle}
          </CardTitle>
          <CardDescription>{t.connectDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-sm">{endpoint}</code>
            <CopyButton value={endpoint} label={t.copy} copiedLabel={t.copied} />
          </div>
          <ol className="flex flex-col gap-4">
            <SetupStep index={1} title={t.connectStep1} body="" />
            <SetupStep index={2} title={t.connectStep2} body="" />
            <SetupStep index={3} title={t.connectStep3} body="" />
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.policyTitle}</CardTitle>
          <CardDescription>{t.policyDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {policyDraft ? (
            <>
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-sm font-medium">{t.policyPresets}</p>
                  <p className="text-sm text-muted-foreground">{t.policyPresetsDescription}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={savePolicy.isPending || tools.length === 0}
                    onClick={() => {
                      setPolicySaved(false)
                      setPolicyDraft(enableAllMcpTools(tools))
                    }}
                  >
                    {t.enableAll}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={savePolicy.isPending}
                    onClick={() => {
                      setPolicySaved(false)
                      setPolicyDraft(recommendedMcpPolicy())
                    }}
                  >
                    {t.useRecommended}
                  </Button>
                </div>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{t.policyWrites}</p>
                  <p className="text-sm text-muted-foreground">{t.policyWritesDescription}</p>
                </div>
                <Switch
                  checked={policyDraft.allowWrites}
                  onCheckedChange={(allowWrites) => {
                    setPolicySaved(false)
                    setPolicyDraft({ ...policyDraft, allowWrites })
                  }}
                  aria-label={t.policyWrites}
                />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{t.policySensitive}</p>
                  <p className="text-sm text-muted-foreground">{t.policySensitiveDescription}</p>
                </div>
                <Switch
                  checked={policyDraft.allowSensitiveData}
                  onCheckedChange={(allowSensitiveData) => {
                    setPolicySaved(false)
                    setPolicyDraft({ ...policyDraft, allowSensitiveData })
                  }}
                  aria-label={t.policySensitive}
                />
              </div>
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-sm font-medium">{t.policyRisk}</p>
                  <p className="text-sm text-muted-foreground">{t.policyRiskDescription}</p>
                </div>
                <div className="flex flex-wrap gap-4">
                  {risks.map((risk) => (
                    <label
                      key={risk}
                      htmlFor={`mcp-risk-${risk}`}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        id={`mcp-risk-${risk}`}
                        checked={policyDraft.allowedRiskLevels.includes(risk)}
                        onCheckedChange={(checked) => {
                          setPolicySaved(false)
                          setPolicyDraft({
                            ...policyDraft,
                            allowedRiskLevels: checked
                              ? [...new Set([...policyDraft.allowedRiskLevels, risk])]
                              : policyDraft.allowedRiskLevels.filter((item) => item !== risk),
                          })
                        }}
                      />
                      {mcpRiskLabel(risk, t)}
                    </label>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">{t.policyCriticalNote}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  disabled={savePolicy.isPending}
                  onClick={() => savePolicy.mutate(policyDraft)}
                >
                  {savePolicy.isPending ? t.savingPolicy : t.savePolicy}
                </Button>
                {policySaved ? (
                  <p className="text-sm text-muted-foreground">{t.policySaved}</p>
                ) : null}
                {savePolicy.error ? (
                  <p className="text-sm text-destructive">{t.policySaveFailed}</p>
                ) : null}
              </div>
            </>
          ) : manifest.isPending ? (
            <Spinner />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.connectedTitle}</CardTitle>
          <CardDescription>{t.connectedDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {connectors.isPending ? (
            <div className="flex justify-center p-4">
              <Spinner />
            </div>
          ) : connectors.error ? (
            <p className="text-sm text-destructive">{t.connectorsFailed}</p>
          ) : connectors.data?.length ? (
            <ul className="flex flex-col divide-y">
              {connectors.data.map((connector) => (
                <li
                  key={connector.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{connector.name ?? connector.clientId}</p>
                    <p className="text-sm text-muted-foreground">
                      {connector.canWrite ? t.accessWrite : t.accessRead}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={() => {
                      const name = connector.name ?? connector.clientId
                      if (!window.confirm(t.disconnectConfirm.replace("{name}", name))) return
                      revoke.mutate(connector.id)
                    }}
                  >
                    {revoke.isPending && revoke.variables === connector.id
                      ? t.disconnecting
                      : t.disconnect}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t.connectedEmpty}</p>
          )}
        </CardContent>
      </Card>

      {/* Secondary: coding tools still authenticate with an API token. */}
      <Card>
        <CardHeader>
          <CardTitle>{t.developersTitle}</CardTitle>
          <CardDescription>{t.developersDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            render={<a href="/settings/api-tokens" />}
          >
            <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
            {t.step1Action}
          </Button>
          <DetailRow label={t.transportLabel}>{t.transportValue}</DetailRow>
          <DetailRow label={t.authLabel}>
            <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{t.authValue}</code>
          </DetailRow>
          {manifest.data ? (
            <DetailRow label={t.serverLabel}>
              <code className="font-mono text-xs">
                {manifest.data.serverInfo.name} {manifest.data.serverInfo.version}
              </code>
            </DetailRow>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.clientsTitle}</CardTitle>
          <CardDescription>{t.clientsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Tabs defaultValue={clients[0]?.id}>
            <TabsList>
              {clients.map((config) => (
                <TabsTrigger key={config.id} value={config.id}>
                  {clientLabel(config.id, t)}
                </TabsTrigger>
              ))}
            </TabsList>
            {clients.map((config) => (
              <TabsContent key={config.id} value={config.id}>
                <ClientSnippet config={config} t={t} />
              </TabsContent>
            ))}
          </Tabs>
          <p className="text-sm text-muted-foreground">
            {t.tokenNotice.replace("{placeholder}", MCP_TOKEN_PLACEHOLDER)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.toolsTitle}</CardTitle>
          <CardDescription>{t.toolsDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {manifest.isPending ? (
            <div className="flex justify-center p-6">
              <Spinner />
            </div>
          ) : manifest.error ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-destructive">
                {manifest.error instanceof Error ? manifest.error.message : t.loadFailed}
              </p>
              <Button variant="outline" size="sm" onClick={() => void manifest.refetch()}>
                {t.retry}
              </Button>
            </div>
          ) : tools.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.toolsEmpty}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t.toolsSearchPlaceholder}
                  className="max-w-xs"
                />
                <p className="text-sm text-muted-foreground">
                  {t.toolsCount
                    .replace("{count}", String(visible.length))
                    .replace("{total}", String(tools.length))}
                </p>
              </div>
              {visible.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.toolsNoMatch}</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {visible.map((tool) => (
                    <li key={tool.capabilityId} className="flex flex-col gap-2 py-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="font-mono text-sm font-medium">{tool.name}</code>
                          <Badge variant={riskVariant[tool.deploymentRisk] ?? "secondary"}>
                            {mcpRiskLabel(tool.deploymentRisk, t)}
                          </Badge>
                          {tool.annotations?.readOnlyHint ? (
                            <Badge variant="outline">{t.readOnly}</Badge>
                          ) : null}
                          {tool.actionPolicy?.approval === "required" ? (
                            <Badge variant="outline">{t.approvalRequired}</Badge>
                          ) : null}
                        </div>
                        {policyDraft ? (
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {isMcpToolExposed(tool, policyDraft) ? t.exposed : t.blocked}
                            </Badge>
                            <Switch
                              checked={isMcpToolExposed(tool, policyDraft)}
                              onCheckedChange={(checked) => {
                                setPolicySaved(false)
                                setPolicyDraft({
                                  ...policyDraft,
                                  toolOverrides: {
                                    ...policyDraft.toolOverrides,
                                    [tool.capabilityId]: checked ? "allow" : "deny",
                                  },
                                })
                              }}
                              aria-label={`${tool.name}: ${isMcpToolExposed(tool, policyDraft) ? t.exposed : t.blocked}`}
                            />
                          </div>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground">{tool.description}</p>
                      {tool.requiredScopes.length > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {t.scopesLabel}:{" "}
                          <code className="font-mono">{tool.requiredScopes.join(", ")}</code>
                        </p>
                      ) : null}
                      {policyDraft?.toolOverrides[tool.capabilityId] ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="self-start"
                          onClick={() => {
                            const { [tool.capabilityId]: _, ...toolOverrides } =
                              policyDraft.toolOverrides
                            setPolicySaved(false)
                            setPolicyDraft({ ...policyDraft, toolOverrides })
                          }}
                        >
                          {t.useDefault}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
