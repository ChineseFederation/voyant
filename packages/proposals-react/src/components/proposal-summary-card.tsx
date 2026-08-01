import { Badge, Card, CardContent } from "@voyant-travel/ui/components"
import { TrendingUp } from "lucide-react"

import { useCrmUiI18nOrDefault } from "../i18n/index.js"
import type { CrmProposalStatus } from "../i18n/messages.js"
import { formatCrmDate, formatCrmMoney } from "./crm-format.js"

export interface ProposalSummaryCardProps {
  title: string
  pipelineName?: string | null
  stageName?: string | null
  status: string
  valueAmountCents?: number | null
  valueCurrency?: string | null
  expectedCloseDate?: string | null
}

export function ProposalSummaryCard({
  title,
  pipelineName,
  stageName,
  status,
  valueAmountCents,
  valueCurrency,
  expectedCloseDate,
}: ProposalSummaryCardProps) {
  const i18n = useCrmUiI18nOrDefault()
  const { messages } = i18n
  const statusLabel = messages.common.proposalStatusLabels[status as CrmProposalStatus] ?? status

  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-tight">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {pipelineName ?? messages.proposalSummaryCard.unknown} -{" "}
              {stageName ?? messages.proposalSummaryCard.unknown}
            </p>
          </div>
          <Badge variant="outline">{statusLabel}</Badge>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <TrendingUp className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="text-lg font-semibold">
            {formatCrmMoney(i18n, valueAmountCents, valueCurrency)}
          </span>
        </div>
        {expectedCloseDate ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {messages.proposalSummaryCard.expectedClose}: {formatCrmDate(i18n, expectedCloseDate)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
