/**
 * OAuth calls made by the MCP consent screen.
 *
 * The admin shell's fetcher maps the shared `/auth` prefix into the admin realm.
 * Callers must not spell `/auth/admin` themselves or the request becomes
 * `/api/auth/admin/admin/...`.
 */

export const MCP_CONSENT_PUBLIC_CLIENT_PATH = "/auth/oauth2/public-client"
export const MCP_CONSENT_DECISION_PATH = "/auth/oauth2/consent"

export type McpConsentFetcher = (input: string, init?: RequestInit) => Promise<Response>

export interface McpConsentClientDetails {
  name?: string | null
  client_name?: string | null
}

export class McpConsentError extends Error {
  readonly status: number
  readonly detail: string | undefined

  constructor(message: string, status: number, detail?: string) {
    super(message)
    this.name = "McpConsentError"
    this.status = status
    this.detail = detail
  }

  get diagnostic(): string {
    return this.detail ? `${this.status} ${this.detail}` : String(this.status)
  }
}

async function readErrorDetail(response: Response): Promise<string | undefined> {
  let text: string
  try {
    text = await response.text()
  } catch {
    return undefined
  }
  if (!text) return undefined
  try {
    const body: unknown = JSON.parse(text)
    if (typeof body === "object" && body !== null) {
      const record = body as Record<string, unknown>
      const candidate =
        record.error_description ?? record.error ?? record.message ?? record.code ?? undefined
      if (typeof candidate === "string" && candidate) return candidate
    }
  } catch {
    // A non-JSON response is itself the best available diagnostic.
  }
  return text.slice(0, 200)
}

export async function fetchMcpConsentClient(input: {
  baseUrl: string
  fetcher: McpConsentFetcher
  clientId: string
}): Promise<McpConsentClientDetails | null> {
  const query = new URLSearchParams({ client_id: input.clientId })
  const response = await input.fetcher(
    `${input.baseUrl}${MCP_CONSENT_PUBLIC_CLIENT_PATH}?${query.toString()}`,
    { credentials: "include" },
  )
  if (!response.ok) return null
  return (await response.json()) as McpConsentClientDetails
}

export async function submitMcpConsentDecision(input: {
  baseUrl: string
  fetcher: McpConsentFetcher
  accept: boolean
  oauthQuery: string
}): Promise<string> {
  const response = await input.fetcher(`${input.baseUrl}${MCP_CONSENT_DECISION_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ accept: input.accept, oauth_query: input.oauthQuery }),
  })

  if (!response.ok) {
    throw new McpConsentError(
      "consent request failed",
      response.status,
      await readErrorDetail(response),
    )
  }

  const result = (await response.json()) as { redirectURI?: string; url?: string }
  const redirectUri = result.redirectURI ?? result.url
  if (!redirectUri) {
    throw new McpConsentError("consent response carried no redirect", response.status)
  }
  return redirectUri
}
