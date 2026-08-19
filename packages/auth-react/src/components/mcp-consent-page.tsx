"use client"

/**
 * MCP connector consent screen.
 *
 * The one moment a human decides whether an AI assistant may act inside this
 * workspace. It is deliberately plain: a travel agent should be able to read it
 * without knowing what OAuth, a scope, or a token is. What it must convey is
 * (a) who is asking, (b) whether they can only look or also change things, and
 * (c) that the grant is bounded by the approver's own permissions.
 *
 * The authorization server redirects here with `client_id`, `scope`, and
 * `code`; approving posts the code back to `/oauth2/consent`, which returns the
 * redirect that hands the assistant its authorization code.
 */

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@voyant-travel/ui/components"
import { Check, Eye, Pencil, ShieldCheck } from "lucide-react"
import { type ReactNode, useState } from "react"
import { type McpConsentMessages, useMcpConsentMessages } from "../i18n/mcp-consent.js"
import {
  McpConsentError,
  type McpConsentFetcher,
  submitMcpConsentDecision,
} from "../mcp-consent-client.js"

export interface McpConsentPageProps {
  /** Display name of the connecting client, from dynamic registration. */
  clientName?: string | null
  /** Space-delimited OAuth scopes the client asked for. */
  scope?: string | null
  /**
   * The full signed query string the authorization server redirected with.
   * It must be posted back verbatim: the server verifies its signature and
   * recovers the pending authorization request from it. There is no short
   * "consent code" — the signed query IS the state.
   */
  oauthQuery: string
  /** Absolute base URL of the API (e.g. `/api`). */
  baseUrl: string
  fetcher: McpConsentFetcher
  messages?: McpConsentMessages
}

function GrantRow({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
    </li>
  )
}

export function McpConsentPage({
  clientName,
  scope,
  oauthQuery,
  baseUrl,
  fetcher,
  messages,
}: McpConsentPageProps) {
  const fallback = useMcpConsentMessages()
  const t = messages ?? fallback
  const [pending, setPending] = useState<"accept" | "deny" | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const name = clientName?.trim() || t.unknownClient
  const grantedScopes = new Set((scope ?? "").split(/\s+/).filter(Boolean))
  const allowsWrite = grantedScopes.has("mcp:write")

  const decide = async (accept: boolean) => {
    setPending(accept ? "accept" : "deny")
    setFailure(null)
    try {
      // Hand control back to the assistant with its authorization code.
      window.location.href = await submitMcpConsentDecision({
        baseUrl,
        fetcher,
        accept,
        oauthQuery,
      })
    } catch (error) {
      setFailure(error instanceof McpConsentError ? error.diagnostic : String(error))
      setPending(null)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t.title.replace("{client}", name)}</CardTitle>
        <CardDescription>{t.subtitle.replace("{client}", name)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ul className="flex flex-col gap-4">
          <GrantRow
            icon={<Eye className="h-4 w-4" aria-hidden="true" />}
            title={t.readTitle}
            body={t.readBody}
          />
          {allowsWrite ? (
            <GrantRow
              icon={<Pencil className="h-4 w-4" aria-hidden="true" />}
              title={t.writeTitle}
              body={t.writeBody}
            />
          ) : null}
          <GrantRow
            icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            title={t.boundaryTitle}
            body={t.boundaryBody}
          />
        </ul>

        {failure === null ? null : (
          <div role="alert" className="flex flex-col gap-1">
            <p className="text-sm text-destructive">{t.failed}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {t.failedDetail.replace("{detail}", failure)}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Button onClick={() => void decide(true)} disabled={pending !== null}>
            {pending === "accept" ? (
              t.approving
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" aria-hidden="true" />
                {t.approve}
              </>
            )}
          </Button>
          <Button variant="ghost" onClick={() => void decide(false)} disabled={pending !== null}>
            {t.deny}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
