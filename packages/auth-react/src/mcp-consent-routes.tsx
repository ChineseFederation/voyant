import { useQuery } from "@tanstack/react-query"
import { Outlet, useSearch } from "@tanstack/react-router"
import { useVoyantReactContext } from "@voyant-travel/react"
import type { ReactNode } from "react"
import { z } from "zod"
import { AuthLayout } from "./components/auth-layout.js"
import { McpConsentPage } from "./components/mcp-consent-page.js"
import { fetchMcpConsentClient } from "./mcp-consent-client.js"

/**
 * The OAuth consent screen an MCP connector sends the operator to.
 *
 * It is deliberately not part of the local-auth contribution. The authorization
 * server issuing connector grants is local to the deployment in *every* admin
 * auth mode, so a broker-authenticated deployment — one that ships no sign-in,
 * sign-up, or password-reset page — still has to answer this route or the
 * connector handshake dies on its last step. Keeping it in its own presentation
 * lets a cloud-auth Operator mount consent without mounting local sign-in.
 */
export interface McpConsentRouteContribution {
  readonly id: "@voyant-travel/mcp#presentation.consent"
  readonly routes: {
    readonly layout: McpConsentRouteOptions
    readonly consent: McpConsentRouteOptions
  }
}

export interface McpConsentRouteOptions {
  readonly component: () => ReactNode
  readonly validateSearch?: z.ZodType
}

export function createMcpConsentRouteContribution(): McpConsentRouteContribution {
  return {
    id: "@voyant-travel/mcp#presentation.consent",
    routes: {
      layout: { component: McpConsentLayout },
      consent: {
        // No auth guard: the authorization server sends the operator through
        // sign-in (local mode) or the broker (cloud mode) before redirecting
        // here, so reaching this route already implies a session. Guarding
        // again would bounce a mid-flight consent.
        // Permissive: the authorization server forwards its entire signed query
        // (including `sig`, `exp`, and repeated `ba_param` entries), and a
        // strict schema would reject the redirect outright.
        validateSearch: z.object({}).passthrough(),
        component: McpConsentRoute,
      },
    },
  }
}

function McpConsentLayout() {
  return (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  )
}

function McpConsentRoute() {
  const { client_id, scope } = useSearch({ strict: false }) as {
    client_id?: string
    scope?: string
  }
  const { baseUrl, fetcher } = useVoyantReactContext()
  // The authorization server signs the whole query and expects it back
  // verbatim, so read it from the address bar rather than reserializing the
  // parsed params (which would reorder them and break the signature).
  const oauthQuery = typeof window === "undefined" ? "" : window.location.search.replace(/^\?/, "")

  // The redirect carries `client_id` but no display name; look it up so the
  // operator sees "Claude", not an opaque identifier.
  const client = useQuery({
    queryKey: ["mcp-consent-client", client_id],
    enabled: Boolean(client_id),
    queryFn: () => fetchMcpConsentClient({ baseUrl, fetcher, clientId: client_id ?? "" }),
  })

  return (
    <McpConsentPage
      clientName={client.data?.name ?? client.data?.client_name ?? null}
      scope={scope ?? null}
      oauthQuery={oauthQuery}
      baseUrl={baseUrl}
      fetcher={fetcher}
    />
  )
}
