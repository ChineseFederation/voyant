/**
 * The two OAuth calls the MCP consent screen makes.
 *
 * Both are written on the **shared** `/auth` prefix, not on `/auth/admin`. The
 * admin shell injects a realm-scoping fetcher (`createAuthBasePathFetcher`)
 * that maps `/auth/*` into the admin realm exactly once, the same way every
 * other auth-react hook is routed. Spelling the realm out here as well produced
 * `/api/auth/admin/admin/oauth2/consent`, a deterministic 404 that surfaced to
 * the operator as "Could not complete the connection" and stopped both ChatGPT
 * and Claude from ever completing a grant
 * ([#4793](https://github.com/voyant-travel/voyant/issues/4793)).
 *
 * Keeping them here rather than inline in the component is what lets the URL
 * contract be tested against the real fetcher instead of a stub that would
 * happily accept either spelling.
 */

/** Looks up the display name of the client asking for consent. */
export const MCP_CONSENT_PUBLIC_CLIENT_PATH = "/auth/oauth2/public-client"
/** Records the operator's decision and returns the hand-back redirect. */
export const MCP_CONSENT_DECISION_PATH = "/auth/oauth2/consent"

export type McpConsentFetcher = (input: string, init?: RequestInit) => Promise<Response>

/** What dynamic registration recorded about the connecting client. */
export interface McpConsentClientDetails {
  name?: string | null
  client_name?: string | null
}

/**
 * A consent request that did not succeed, with the response still attached.
 *
 * The consent screen used to catch every failure into one boolean, which turned
 * a 404 on a malformed URL, an expired signature, and a lapsed session into the
 * same sentence — leaving nothing for the operator to report or for diagnostics
 * to key on. The status and server-supplied detail are carried so the failure
 * can name itself.
 */
export class McpConsentError extends Error {
  readonly status: number
  readonly detail: string | undefined

  constructor(message: string, status: number, detail?: string) {
    super(message)
    this.name = "McpConsentError"
    this.status = status
    this.detail = detail
  }

  /** One short line combining status and server detail, safe to show verbatim. */
  get diagnostic(): string {
    return this.detail ? `${this.status} ${this.detail}` : String(this.status)
  }
}

/** Pull whatever the server said out of the body, without assuming a shape. */
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
    // Not JSON — the raw body is the best detail available.
  }
  return text.slice(0, 200)
}

/**
 * Resolve the connecting client's registered name.
 *
 * A failed lookup is not fatal: the screen falls back to "This application"
 * rather than blocking a grant the operator asked for, so this answers `null`
 * instead of throwing.
 */
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

/**
 * Post the operator's decision and return the URI that hands control back.
 *
 * `oauthQuery` is the authorization server's own signed query and must be sent
 * byte for byte — it carries a `ba_param` entry per signed parameter, so
 * parsing it into an object and re-serializing collapses the repeats and
 * invalidates the signature.
 */
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
  // Accepting returns `redirectURI`; denying returns a `url` carrying the
  // `access_denied` error back to the client. Both hand control back.
  const redirectUri = result.redirectURI ?? result.url
  if (!redirectUri) {
    throw new McpConsentError("consent response carried no redirect", response.status)
  }
  return redirectUri
}
