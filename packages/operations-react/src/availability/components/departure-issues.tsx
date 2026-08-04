"use client"

import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@voyant-travel/ui/components"
import { AlertTriangle, CheckCircle2, TriangleAlert } from "lucide-react"
import type { DepartureIssue, DepartureIssueSeverity } from "../index.js"

/**
 * The UI half of the typed attention vocabulary (`service-departure-issues.ts`).
 *
 * The server ships a stable machine `code` plus an English `message`. The
 * message is a fallback for consumers with no catalogue — a Tool transport, a
 * webhook — NOT the string an operator reads. This component renders the
 * localized entry for every code it knows and falls back to the server string
 * only for a code a newer server invented, so a version skew degrades to
 * English instead of to a blank row.
 */

export interface DepartureIssueCodeMessage {
  title: string
  description: string
}

export interface DepartureIssueMessages {
  title: string
  summary: string
  criticalGroup: string
  warningGroup: string
  criticalBadge: string
  warningBadge: string
  affectedLabel: string
  clearTitle: string
  clearDescription: string
  clearAction: string
  codes: Record<string, DepartureIssueCodeMessage>
}

export interface DepartureIssueAction {
  label: string
  onSelect: () => void
}

const severityStyles: Record<DepartureIssueSeverity, { row: string; icon: string; badge: string }> =
  {
    critical: {
      row: "border-red-500/40 bg-red-500/5",
      icon: "text-red-600 dark:text-red-400",
      badge: "border-transparent bg-red-500/10 text-red-600 dark:text-red-400",
    },
    warning: {
      row: "border-yellow-500/40 bg-yellow-500/5",
      icon: "text-yellow-700 dark:text-yellow-400",
      badge: "border-transparent bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    },
  }

const severityIcons = {
  critical: TriangleAlert,
  warning: AlertTriangle,
}

/**
 * Group the issues the way the operator triages them: everything that can
 * oversell or overfill the departure first, then the reconciliations they own.
 * The server already sorts by severity then code, so grouping preserves order.
 */
export function DepartureIssueList({
  issues,
  messages,
  resolveAction,
  onClearAction,
}: {
  issues: readonly DepartureIssue[]
  messages: DepartureIssueMessages
  resolveAction?: (issue: DepartureIssue) => DepartureIssueAction | null
  /** Next action offered when nothing needs attention (AC7). */
  onClearAction?: () => void
}) {
  const critical = issues.filter((issue) => issue.severity === "critical")
  const warning = issues.filter((issue) => issue.severity === "warning")

  if (issues.length === 0) {
    return (
      <Empty data-slot="departure-issues-clear" className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CheckCircle2 aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{messages.clearTitle}</EmptyTitle>
          <EmptyDescription>{messages.clearDescription}</EmptyDescription>
        </EmptyHeader>
        {onClearAction ? (
          <Button variant="outline" onClick={onClearAction}>
            {messages.clearAction}
          </Button>
        ) : null}
      </Empty>
    )
  }

  return (
    <div data-slot="departure-issues" className="flex flex-col gap-4">
      {critical.length > 0 ? (
        <DepartureIssueGroup
          heading={messages.criticalGroup}
          issues={critical}
          messages={messages}
          resolveAction={resolveAction}
        />
      ) : null}
      {warning.length > 0 ? (
        <DepartureIssueGroup
          heading={messages.warningGroup}
          issues={warning}
          messages={messages}
          resolveAction={resolveAction}
        />
      ) : null}
    </div>
  )
}

function DepartureIssueGroup({
  heading,
  issues,
  messages,
  resolveAction,
}: {
  heading: string
  issues: readonly DepartureIssue[]
  messages: DepartureIssueMessages
  resolveAction?: (issue: DepartureIssue) => DepartureIssueAction | null
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {heading}
      </h3>
      <ul className="flex flex-col gap-2">
        {issues.map((issue) => (
          <DepartureIssueRow
            key={`${issue.code}:${issue.subjectId}`}
            issue={issue}
            messages={messages}
            action={resolveAction?.(issue) ?? null}
          />
        ))}
      </ul>
    </section>
  )
}

function DepartureIssueRow({
  issue,
  messages,
  action,
}: {
  issue: DepartureIssue
  messages: DepartureIssueMessages
  action: DepartureIssueAction | null
}) {
  const styles = severityStyles[issue.severity]
  const Icon = severityIcons[issue.severity]
  const copy = messages.codes[issue.code]
  // Unknown code: a server one release ahead. Render its English fallback
  // rather than dropping a row the operator has to act on.
  const title = copy?.title ?? issue.message
  const description = copy?.description ?? null

  return (
    <li
      data-slot="departure-issue"
      data-severity={issue.severity}
      data-code={issue.code}
      className={`flex flex-wrap items-start gap-3 rounded-md border p-3 ${styles.row}`}
    >
      <Icon className={`mt-0.5 size-4 shrink-0 ${styles.icon}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{title}</p>
          <Badge variant="outline" className={styles.badge}>
            {issue.severity === "critical" ? messages.criticalBadge : messages.warningBadge}
          </Badge>
          {issue.count > 1 ? (
            <Badge variant="outline">
              {messages.affectedLabel.replace("{count}", String(issue.count))}
            </Badge>
          ) : null}
        </div>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? (
        <Button variant="outline" size="sm" onClick={action.onSelect}>
          {action.label}
        </Button>
      ) : null}
    </li>
  )
}

/** Compact severity counts for the workspace header / overview banner. */
export function DepartureIssueSummary({
  criticalCount,
  warningCount,
  messages,
}: {
  criticalCount: number
  warningCount: number
  messages: Pick<DepartureIssueMessages, "summary">
}) {
  return (
    <span data-slot="departure-issue-summary" className="text-sm text-muted-foreground">
      {messages.summary
        .replace("{critical}", String(criticalCount))
        .replace("{warning}", String(warningCount))}
    </span>
  )
}
