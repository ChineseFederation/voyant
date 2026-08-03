"use client"

import { Badge } from "@voyant-travel/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@voyant-travel/ui/components/card"
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react"
import { useProductReadiness } from "../hooks/use-product-readiness.js"
import type { ProductReadinessIssueMessage } from "../i18n/messages-operations.js"
import { useProductsUiMessagesOrDefault } from "../i18n/provider.js"
import type { ProductReadinessIssueRecord } from "../schemas.js"

export interface ProductReadinessPanelProps {
  productId: string
  /**
   * Called when the operator activates an issue, with the authoring `field`
   * the issue belongs to. Hosts use it to deep-link to the section that fixes
   * it. Omitted issues stay readable — they just are not actionable.
   */
  onNavigateToField?: (field: string) => void
}

/**
 * Stable readiness `code` (snake_case, from the API) to message key
 * (camelCase). Unknown codes fall back to a generic entry rather than
 * rendering a raw code at the operator, so a server that grows a new check
 * degrades readably instead of leaking an identifier.
 */
const ISSUE_MESSAGE_KEYS = {
  no_future_open_departure: "noFutureOpenDeparture",
  missing_default_option: "missingDefaultOption",
  default_option_not_active: "defaultOptionNotActive",
  no_option_units: "noOptionUnits",
  no_price: "noPrice",
  missing_itinerary: "missingItinerary",
  empty_itinerary: "emptyItinerary",
  non_consecutive_itinerary_days: "nonConsecutiveItineraryDays",
  unresolved_duration: "unresolvedDuration",
  missing_family: "missingFamily",
  missing_capacity_source: "missingCapacitySource",
  missing_meeting_point: "missingMeetingPoint",
  missing_allocation_template: "missingAllocationTemplate",
  missing_default_language: "missingDefaultLanguage",
  missing_description: "missingDescription",
  missing_contract_template: "missingContractTemplate",
  incomplete_cost_basis: "incompleteCostBasis",
  no_active_channel: "noActiveChannel",
} as const

export function ProductReadinessPanel({
  productId,
  onNavigateToField,
}: ProductReadinessPanelProps) {
  const { data, isPending, isError } = useProductReadiness(productId)
  const messages = useProductsUiMessagesOrDefault()
  const panelMessages = messages.productReadinessPanel
  const readiness = data?.data

  function messageFor(issue: ProductReadinessIssueRecord): ProductReadinessIssueMessage {
    const key = ISSUE_MESSAGE_KEYS[issue.code as keyof typeof ISSUE_MESSAGE_KEYS]
    return key ? panelMessages.issues[key] : panelMessages.issues.unknown
  }

  return (
    <Card data-slot="product-readiness-panel">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle>{panelMessages.title}</CardTitle>
          <CardDescription>
            {readiness?.ready === false
              ? panelMessages.descriptions.blocked
              : panelMessages.descriptions.ready}
          </CardDescription>
        </div>
        {readiness?.ready ? (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
            {panelMessages.badges.ready}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isPending ? (
          <div className="flex min-h-24 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : isError || !readiness ? (
          <p className="text-sm text-destructive">{panelMessages.loadingError}</p>
        ) : readiness.issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">{panelMessages.empty}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {readiness.issues.map((issue) => {
              const issueMessage = messageFor(issue)
              const blocking = issue.severity === "blocking"

              return (
                <li key={issue.code} className="py-2 first:pt-0 last:pb-0">
                  <ReadinessIssueRow
                    blocking={blocking}
                    badgeLabel={
                      blocking ? panelMessages.badges.blocking : panelMessages.badges.warning
                    }
                    message={issueMessage}
                    onNavigate={
                      onNavigateToField ? () => onNavigateToField(issue.field) : undefined
                    }
                  />
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function ReadinessIssueRow({
  blocking,
  badgeLabel,
  message,
  onNavigate,
}: {
  blocking: boolean
  badgeLabel: string
  message: ProductReadinessIssueMessage
  onNavigate?: () => void
}) {
  const Icon = blocking ? XCircle : AlertTriangle
  const body = (
    <div className="flex items-start gap-3">
      <Icon
        className={blocking ? "mt-0.5 size-4 text-destructive" : "mt-0.5 size-4 text-amber-600"}
        aria-hidden="true"
      />
      <div className="flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{message.title}</span>
          <Badge variant={blocking ? "destructive" : "outline"}>{badgeLabel}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{message.fix}</p>
      </div>
    </div>
  )

  if (!onNavigate) return body

  return (
    <button
      type="button"
      onClick={onNavigate}
      className="w-full rounded-md text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </button>
  )
}
