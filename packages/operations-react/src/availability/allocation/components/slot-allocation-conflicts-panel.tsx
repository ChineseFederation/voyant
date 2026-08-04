"use client"

import type { AllocationConflict } from "@voyant-travel/operations-react/availability"
import {
  Badge,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@voyant-travel/ui/components"
import { AlertTriangle, CheckCircle2, TriangleAlert } from "lucide-react"

import type { AllocationUiMessages } from "../i18n/index.js"

/**
 * The UI half of `service-allocation-conflicts.ts`.
 *
 * The server ships a stable machine `code`, a severity and an English
 * `message`. The message is the fallback for a consumer with no catalogue — a
 * Tool transport, a webhook — NOT the string an operator reads. This renders
 * the localized entry for every code it knows and falls back to the server
 * string only for a code a newer server invented, so version skew degrades to
 * English rather than to a blank row.
 *
 * The deleted client-side `buildValidationIssues` covered three of these seven
 * cases and was never mounted; nothing here re-derives a conflict.
 */

const severityStyles = {
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
} as const

const severityIcons = {
  critical: TriangleAlert,
  warning: AlertTriangle,
} as const

export interface AllocationConflictsPanelProps {
  conflicts: readonly AllocationConflict[]
  messages: AllocationUiMessages
  /** Human label for a subject id, so a row names the room, not its typeid. */
  resolveSubjectLabel?: (conflict: AllocationConflict) => string | null
  /** Rendered instead of the list when the projection could not be loaded. */
  loadFailed?: boolean
}

export function AllocationConflictsPanel({
  conflicts,
  messages,
  resolveSubjectLabel,
  loadFailed = false,
}: AllocationConflictsPanelProps) {
  const copy = messages.conflicts

  if (loadFailed) {
    return (
      <p
        data-slot="allocation-conflicts-error"
        className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        {copy.loadFailed}
      </p>
    )
  }

  if (conflicts.length === 0) {
    return (
      <Empty data-slot="allocation-conflicts-clear" className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CheckCircle2 aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{copy.clearTitle}</EmptyTitle>
          <EmptyDescription>{copy.clearDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const critical = conflicts.filter((conflict) => conflict.severity === "critical")
  const warning = conflicts.filter((conflict) => conflict.severity === "warning")

  return (
    <section data-slot="allocation-conflicts" className="flex flex-col gap-4">
      <header className="flex flex-col gap-0.5">
        <h2 className="font-semibold text-sm">{copy.title}</h2>
        <p className="text-muted-foreground text-xs">{copy.description}</p>
      </header>
      {critical.length > 0 ? (
        <ConflictGroup
          heading={copy.criticalGroup}
          conflicts={critical}
          messages={messages}
          resolveSubjectLabel={resolveSubjectLabel}
        />
      ) : null}
      {warning.length > 0 ? (
        <ConflictGroup
          heading={copy.warningGroup}
          conflicts={warning}
          messages={messages}
          resolveSubjectLabel={resolveSubjectLabel}
        />
      ) : null}
    </section>
  )
}

function ConflictGroup({
  heading,
  conflicts,
  messages,
  resolveSubjectLabel,
}: {
  heading: string
  conflicts: readonly AllocationConflict[]
  messages: AllocationUiMessages
  resolveSubjectLabel?: (conflict: AllocationConflict) => string | null
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
        {heading}
      </h3>
      <ul className="flex flex-col gap-2">
        {conflicts.map((conflict) => (
          <ConflictRow
            key={`${conflict.code}:${conflict.subjectType}:${conflict.subjectId}`}
            conflict={conflict}
            messages={messages}
            subjectLabel={resolveSubjectLabel?.(conflict) ?? null}
          />
        ))}
      </ul>
    </section>
  )
}

function ConflictRow({
  conflict,
  messages,
  subjectLabel,
}: {
  conflict: AllocationConflict
  messages: AllocationUiMessages
  subjectLabel: string | null
}) {
  const styles = severityStyles[conflict.severity]
  const Icon = severityIcons[conflict.severity]
  const entry = messages.conflicts.codes[conflict.code]
  // Unknown code: a server one release ahead. Render its English fallback
  // rather than dropping a row the operator has to act on.
  const title = entry?.title ?? conflict.message
  const description = entry?.description ?? null

  return (
    <li
      data-slot="allocation-conflict"
      data-severity={conflict.severity}
      data-code={conflict.code}
      className={`flex flex-wrap items-start gap-3 rounded-md border p-3 ${styles.row}`}
    >
      <Icon className={`mt-0.5 size-4 shrink-0 ${styles.icon}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-sm">{title}</p>
          {subjectLabel ? <Badge variant="outline">{subjectLabel}</Badge> : null}
          <Badge variant="outline" className={styles.badge}>
            {conflict.severity === "critical"
              ? messages.conflicts.criticalBadge
              : messages.conflicts.warningBadge}
          </Badge>
          {conflict.count > 1 ? (
            <Badge variant="outline">
              {messages.conflicts.affectedLabel.replace("{count}", String(conflict.count))}
            </Badge>
          ) : null}
        </div>
        {description ? <p className="mt-1 text-muted-foreground text-sm">{description}</p> : null}
      </div>
    </li>
  )
}

/** Severity counts for a compact header chip. */
export function summarizeAllocationConflicts(conflicts: readonly AllocationConflict[]) {
  let critical = 0
  let warning = 0
  for (const conflict of conflicts) {
    if (conflict.severity === "critical") critical += 1
    else warning += 1
  }
  return { critical, warning, total: conflicts.length }
}
