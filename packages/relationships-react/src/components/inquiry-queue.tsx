"use client"

import type {
  InquiryKind,
  InquiryListQueryInput,
  InquiryPriority,
  InquiryRecord,
  InquiryStatus,
} from "@voyant-travel/relationships-contracts"
import {
  Badge,
  Card,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components"
import { useCrmUiMessagesOrDefault } from "../i18n/index.js"
import { inquiryPageState } from "../inquiry-ui-model.js"

export type InquirySavedView = InquiryListQueryInput["view"]

export interface InquiryQueueFilters {
  view?: InquirySavedView
  search?: string
  status?: InquiryStatus
  priority?: InquiryPriority
  kind?: InquiryKind
}

export function withInquiryStatus(
  filters: InquiryQueueFilters,
  status: InquiryStatus | undefined,
): InquiryQueueFilters {
  return {
    ...filters,
    status,
    view: status === "converted" || status === "closed" ? status : undefined,
  }
}

export interface InquiryQueueProps {
  inquiries: InquiryRecord[]
  filters: InquiryQueueFilters
  onFiltersChange: (filters: InquiryQueueFilters) => void
  onInquiryOpen: (inquiry: InquiryRecord) => void
  getInquiryHref: (inquiry: InquiryRecord) => string
  total: number
  limit: number
  offset: number
  onPageChange: (offset: number) => void
  isPending?: boolean
  error?: unknown
}

const views = [
  "new",
  "mine",
  "unassigned",
  "overdue",
  "waiting",
  "qualified",
  "converted",
  "closed",
] as const satisfies readonly InquirySavedView[]
const statuses: InquiryStatus[] = [
  "new",
  "triaged",
  "in_progress",
  "waiting_on_customer",
  "qualified",
  "converted",
  "closed",
]
const priorities: InquiryPriority[] = ["low", "normal", "high", "urgent"]
const kinds: InquiryKind[] = ["product", "custom_trip", "general"]

const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—"

export function InquiryQueue({
  inquiries,
  filters,
  onFiltersChange,
  onInquiryOpen,
  getInquiryHref,
  total,
  limit,
  offset,
  onPageChange,
  isPending,
  error,
}: InquiryQueueProps) {
  const i18n = useCrmUiMessagesOrDefault()
  const messages = i18n.inquiryQueue
  const labels = i18n.inquiryLabels
  const patch = (next: Partial<InquiryQueueFilters>) => onFiltersChange({ ...filters, ...next })
  const page = inquiryPageState(total, limit, offset)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{messages.title}</h1>
        <p className="text-sm text-muted-foreground">{messages.description}</p>
      </div>

      <fieldset className="flex flex-wrap gap-2" aria-label={messages.savedViewsLabel}>
        {views.map((view) => (
          <button
            type="button"
            key={view}
            className={`rounded-md border px-3 py-1.5 text-sm ${filters.view === view ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
            aria-pressed={filters.view === view}
            onClick={() => patch({ view })}
          >
            {messages.views[view]}
          </button>
        ))}
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-64 flex-1"
          value={filters.search ?? ""}
          aria-label={messages.searchLabel}
          placeholder={messages.searchPlaceholder}
          onChange={(event) => patch({ search: event.target.value || undefined })}
        />
        <FilterSelect
          value={filters.status}
          allLabel={messages.filters.allStatuses}
          values={statuses}
          ariaLabel={messages.statusFilterLabel}
          labels={labels.statuses}
          onChange={(status) =>
            onFiltersChange(withInquiryStatus(filters, status as InquiryStatus | undefined))
          }
        />
        <FilterSelect
          value={filters.priority}
          allLabel={messages.filters.allPriorities}
          values={priorities}
          ariaLabel={messages.priorityFilterLabel}
          labels={labels.priorities}
          onChange={(priority) => patch({ priority: priority as InquiryPriority | undefined })}
        />
        <FilterSelect
          value={filters.kind}
          allLabel={messages.filters.allKinds}
          values={kinds}
          ariaLabel={messages.kindFilterLabel}
          labels={labels.kinds}
          onChange={(kind) => patch({ kind: kind as InquiryKind | undefined })}
        />
      </div>

      {error ? (
        <Card className="p-8 text-center text-sm text-destructive">{messages.loadFailed}</Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{messages.columns.inquiry}</TableHead>
                <TableHead>{messages.columns.contact}</TableHead>
                <TableHead>{messages.columns.status}</TableHead>
                <TableHead>{messages.columns.priority}</TableHead>
                <TableHead>{messages.columns.owner}</TableHead>
                <TableHead>{messages.columns.nextAction}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                    {messages.loading}
                  </TableCell>
                </TableRow>
              ) : inquiries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                    {messages.empty}
                  </TableCell>
                </TableRow>
              ) : (
                inquiries.map((inquiry) => (
                  <TableRow key={inquiry.id}>
                    <TableCell>
                      <a
                        href={getInquiryHref(inquiry)}
                        className="rounded-sm font-medium outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={(event) => {
                          if (
                            event.button !== 0 ||
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey ||
                            event.altKey
                          )
                            return
                          event.preventDefault()
                          onInquiryOpen(inquiry)
                        }}
                      >
                        {inquiry.subject}
                      </a>
                      <div className="text-xs capitalize text-muted-foreground">
                        {labels.kinds[inquiry.kind]} ·{" "}
                        {labels.sources[inquiry.source as keyof typeof labels.sources] ??
                          inquiry.source}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        {inquiry.contactSnapshot.name ?? inquiry.contactSnapshot.email ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {inquiry.contactSnapshot.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {labels.statuses[inquiry.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={inquiry.priority === "urgent" ? "destructive" : "secondary"}
                        className="capitalize"
                      >
                        {labels.priorities[inquiry.priority as InquiryPriority] ?? inquiry.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>{inquiry.ownerId ?? "—"}</TableCell>
                    <TableCell
                      className={
                        inquiry.nextActionAt && new Date(inquiry.nextActionAt) < new Date()
                          ? "font-medium text-destructive"
                          : ""
                      }
                    >
                      {formatDate(inquiry.nextActionAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {i18n.common.pageSummary
            .replace("{shown}", String(Math.min(offset + inquiries.length, total)))
            .replace("{total}", String(total))}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
            disabled={!page.hasPrevious || isPending}
            onClick={() => onPageChange(page.previousOffset)}
          >
            {i18n.common.previous}
          </button>
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
            disabled={!page.hasNext || isPending}
            onClick={() => onPageChange(page.nextOffset)}
          >
            {i18n.common.next}
          </button>
        </div>
      </div>
    </div>
  )
}

function FilterSelect({
  value,
  values,
  allLabel,
  ariaLabel,
  labels,
  onChange,
}: {
  value?: string
  values: readonly string[]
  allLabel: string
  ariaLabel: string
  labels: Record<string, string>
  onChange: (value: string | undefined) => void
}) {
  return (
    <Select
      value={value ?? "all"}
      onValueChange={(next) => onChange(!next || next === "all" ? undefined : next)}
    >
      <SelectTrigger className="w-44" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {values.map((item) => (
          <SelectItem key={item} value={item} className="capitalize">
            {labels[item] ?? item}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
