/**
 * Connected MCP assistants, read from the OAuth consent records.
 *
 * A "connector" from the operator's point of view is one consent row: an
 * assistant they approved. Revoking deletes that row, and the MCP surface
 * re-checks it on every request, so disconnecting takes effect on the
 * assistant's next call.
 */

export interface McpConsentRecord {
  id: string
  clientId: string
  scopes: string[]
  createdAt: string
}

export interface McpConnector extends McpConsentRecord {
  /** Registered client name, or `null` when the client did not supply one. */
  name: string | null
  /** Whether the assistant may change data, not only read it. */
  canWrite: boolean
}

interface ClientDetails {
  name?: string | null
  client_name?: string | null
}

function clientDisplayName(details: ClientDetails | null): string | null {
  const name = details?.name ?? details?.client_name
  return typeof name === "string" && name.trim() ? name.trim() : null
}

/** Normalize a consent row plus its client record into one display row. */
export function toMcpConnector(
  consent: McpConsentRecord,
  client: ClientDetails | null,
): McpConnector {
  return {
    ...consent,
    name: clientDisplayName(client),
    canWrite: consent.scopes.includes("mcp:write"),
  }
}

export type McpFetcher = (input: string, init?: RequestInit) => Promise<Response>

/**
 * List the assistants this staff member has connected.
 *
 * Consent rows carry only a client id, so each one is resolved to its
 * registered name. A client lookup that fails is not fatal — the connector
 * still lists, just without a friendly name, which beats hiding a live grant
 * from the person who might want to revoke it.
 */
export async function listMcpConnectors(
  baseUrl: string,
  fetcher: McpFetcher,
): Promise<McpConnector[]> {
  const response = await fetcher(`${baseUrl}/auth/admin/oauth2/get-consents`, {
    credentials: "include",
  })
  if (!response.ok) throw new Error("consents")
  const consents = (await response.json()) as McpConsentRecord[]

  return Promise.all(
    consents.map(async (consent) => {
      try {
        const clientResponse = await fetcher(
          `${baseUrl}/auth/admin/oauth2/get-client?client_id=${encodeURIComponent(consent.clientId)}`,
          { credentials: "include" },
        )
        return toMcpConnector(consent, clientResponse.ok ? await clientResponse.json() : null)
      } catch {
        return toMcpConnector(consent, null)
      }
    }),
  )
}

/** Revoke one connector's grant. */
export async function revokeMcpConnector(
  baseUrl: string,
  fetcher: McpFetcher,
  consentId: string,
): Promise<void> {
  const response = await fetcher(`${baseUrl}/auth/admin/oauth2/delete-consent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ id: consentId }),
  })
  if (!response.ok) throw new Error("revoke")
}
