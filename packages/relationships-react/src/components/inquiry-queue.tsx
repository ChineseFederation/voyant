"use client"

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
import type {
  InquiryKind,
  InquiryPriority,
  InquiryRecord,
  InquiryStatus,
} from "../inquiry-schemas.js"

export type InquirySavedView =
  | "new"
  | "mine"
  | "unassigned"
  | "overdue"
  | "waiting"
  | "qualified"
  | "converted"
  | "closed"

export interface InquiryQueueFilters {
  view?: InquirySavedView
  search?: string
  status?: InquiryStatus
  priority?: InquiryPriority
  kind?: InquiryKind
}

export interface InquiryQueueProps {
  inquiries: InquiryRecord[]
  filters: InquiryQueueFilters
  onFiltersChange: (filters: InquiryQueueFilters) => void
  onInquiryOpen: (inquiry: InquiryRecord) => void
  isPending?: boolean
  error?: unknown
}

const views: InquirySavedView[] = [
  "new",
  "mine",
  "unassigned",
  "overdue",
  "waiting",
  "qualified",
  "converted",
  "closed",
]
const statuses: InquiryStatus[] = [
  "new",
  "in_progress",
  "waiting_on_customer",
  "qualified",
  "converted",
  "closed",
]
const priorities: InquiryPriority[] = ["low", "normal", "high", "urgent"]
const kinds: InquiryKind[] = ["product", "custom_trip", "general"]

const label = (value: string) => value.replaceAll("_", " ")
const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value)) : "—"

export function InquiryQueue({
  inquiries,
  filters,
  onFiltersChange,
  onInquiryOpen,
  isPending,
  error,
}: InquiryQueueProps) {
  const messages = useCrmUiMessagesOrDefault().inquiryQueue
  const patch = (next: Partial<InquiryQueueFilters>) => onFiltersChange({ ...filters, ...next })

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{messages.title}</h1>
        <p className="text-sm text-muted-foreground">{messages.description}</p>
      </div>

      <fieldset className="flex flex-wrap gap-2" aria-label="Saved inquiry views">
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
          placeholder={messages.searchPlaceholder}
          onChange={(event) => patch({ search: event.target.value || undefined })}
        />
        <FilterSelect
          value={filters.status}
          allLabel={messages.filters.allStatuses}
          values={statuses}
          onChange={(status) =>
            patch({ status: status as InquiryStatus | undefined, view: undefined })
          }
        />
        <FilterSelect
          value={filters.priority}
          allLabel={messages.filters.allPriorities}
          values={priorities}
          onChange={(priority) => patch({ priority: priority as InquiryPriority | undefined })}
        />
        <FilterSelect
          value={filters.kind}
          allLabel={messages.filters.allKinds}
          values={kinds}
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
                    Loading…
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
                  <TableRow
                    key={inquiry.id}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => onInquiryOpen(inquiry)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onInquiryOpen(inquiry)
                    }}
                  >
                    <TableCell>
                      <div className="font-medium">{inquiry.subject}</div>
                      <div className="text-xs capitalize text-muted-foreground">
                        {label(inquiry.kind)} · {inquiry.source}
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
                        {label(inquiry.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={inquiry.priority === "urgent" ? "destructive" : "secondary"}
                        className="capitalize"
                      >
                        {inquiry.priority}
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
    </div>
  )
}

function FilterSelect({
  value,
  values,
  allLabel,
  onChange,
}: {
  value?: string
  values: readonly string[]
  allLabel: string
  onChange: (value: string | undefined) => void
}) {
  return (
    <Select
      value={value ?? "all"}
      onValueChange={(next) => onChange(!next || next === "all" ? undefined : next)}
    >
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {values.map((item) => (
          <SelectItem key={item} value={item} className="capitalize">
            {label(item)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
