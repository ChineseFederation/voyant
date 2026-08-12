"use client"

import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { Input } from "@voyant-travel/ui/components/input"
import { Label } from "@voyant-travel/ui/components/label"
import { Popover, PopoverContent, PopoverTrigger } from "@voyant-travel/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import { ArrowDown, ArrowUp, ArrowUpDown, ListFilter, Plus, Search, X } from "lucide-react"
import * as React from "react"
import { useCrmUiI18nOrDefault } from "../i18n/index.js"
import type { CrmRecordStatus, CrmRelationType } from "../i18n/messages.js"
import { crmRecordStatuses, crmRelationTypes } from "../i18n/messages.js"
import {
  type OrganizationRecord,
  type OrganizationsListSortDir,
  type OrganizationsListSortField,
  useOrganizations,
} from "../index.js"
import { OrganizationDialog } from "./organization-dialog.js"

export interface OrganizationListProps {
  pageSize?: number
  onSelectOrganization?: (organization: OrganizationRecord) => void
}

const RELATION_ALL = "__all__"
const STATUS_ALL = "__all__"
const SKELETON_ROW_COUNT = 6
const TABLE_COLUMN_COUNT = 6

type SortableField = "name" | "industry" | "relation" | "status" | "updatedAt"

const SORTABLE_COLUMNS = {
  name: "name",
  industry: "industry",
  relation: "relation",
  status: "status",
  updatedAt: "updatedAt",
} as const satisfies Record<SortableField, SortableField>

function formatRelative(
  value: string,
  messages: ReturnType<typeof useCrmUiI18nOrDefault>["messages"],
): string {
  const timestamp = new Date(value)
  const diff = Date.now() - timestamp.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days < 1) return messages.common.today
  if (days < 7) return messages.common.relativeTime.daysAgo.replace("{count}", String(days))
  if (days < 30) {
    return messages.common.relativeTime.weeksAgo.replace("{count}", String(Math.floor(days / 7)))
  }
  if (days < 365) {
    return messages.common.relativeTime.monthsAgo.replace("{count}", String(Math.floor(days / 30)))
  }
  return messages.common.relativeTime.yearsAgo.replace("{count}", String(Math.floor(days / 365)))
}

export function OrganizationList({
  pageSize = 25,
  onSelectOrganization,
}: OrganizationListProps = {}) {
  const i18n = useCrmUiI18nOrDefault()
  const { messages } = i18n
  const [search, setSearch] = React.useState("")
  const [relation, setRelation] = React.useState<string>(RELATION_ALL)
  const [status, setStatus] = React.useState<string>(STATUS_ALL)
  const [sortBy, setSortBy] = React.useState<OrganizationsListSortField>("updatedAt")
  const [sortDir, setSortDir] = React.useState<OrganizationsListSortDir>("desc")
  const [offset, setOffset] = React.useState(0)
  const [filterPopoverOpen, setFilterPopoverOpen] = React.useState(false)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<OrganizationRecord | undefined>(undefined)

  const { data, isPending, isFetching, isError } = useOrganizations({
    search: search || undefined,
    relation: relation === RELATION_ALL ? undefined : relation,
    status: status === STATUS_ALL ? undefined : status,
    sortBy,
    sortDir,
    limit: pageSize,
    offset,
  })

  const organizations = data?.data ?? []
  const total = data?.total ?? 0
  const page = Math.floor(offset / pageSize) + 1
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const showSkeleton = isPending || (isFetching && organizations.length === 0)

  const resetOffset = () => setOffset(0)

  const handleSort = (field: SortableField) => {
    resetOffset()
    if (sortBy !== field) {
      setSortBy(field)
      setSortDir("asc")
      return
    }
    if (sortDir === "asc") {
      setSortDir("desc")
      return
    }
    setSortBy("updatedAt")
    setSortDir("desc")
  }

  const handleEdit = (organization: OrganizationRecord) => {
    if (onSelectOrganization) {
      onSelectOrganization(organization)
      return
    }
    setEditing(organization)
    setDialogOpen(true)
  }

  const handleCreate = () => {
    setEditing(undefined)
    setDialogOpen(true)
  }

  const activeFilterCount = (relation !== RELATION_ALL ? 1 : 0) + (status !== STATUS_ALL ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0 || search !== ""

  const clearFilters = () => {
    setSearch("")
    setRelation(RELATION_ALL)
    setStatus(STATUS_ALL)
    resetOffset()
  }

  const filterMessages = messages.organizationList.filters
  const columnMessages = messages.organizationList.columns
  const relationLabels = messages.common.relationTypeLabels
  const statusLabels = messages.common.recordStatusLabels

  return (
    <div data-slot="organization-list" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Label htmlFor="orgs-search" className="sr-only">
            {messages.organizationList.searchPlaceholder}
          </Label>
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="orgs-search"
            placeholder={messages.organizationList.searchPlaceholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              resetOffset()
            }}
            className="pl-9"
          />
        </div>

        <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
          <PopoverTrigger
            render={
              <Button variant="outline" size="default">
                <ListFilter className="mr-2 size-4" aria-hidden="true" />
                {filterMessages.button}
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-2 px-1.5">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            }
          />
          <PopoverContent
            align="start"
            className="max-h-[75vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-4"
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="orgs-filter-relation">{filterMessages.relationLabel}</Label>
                <Select
                  value={relation}
                  onValueChange={(value) => {
                    setRelation(value ?? RELATION_ALL)
                    resetOffset()
                  }}
                >
                  <SelectTrigger id="orgs-filter-relation" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={RELATION_ALL}>{filterMessages.relationAll}</SelectItem>
                    {crmRelationTypes.map((value) => (
                      <SelectItem key={value} value={value}>
                        {relationLabels[value as CrmRelationType] ?? value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="orgs-filter-status">{filterMessages.statusLabel}</Label>
                <Select
                  value={status}
                  onValueChange={(value) => {
                    setStatus(value ?? STATUS_ALL)
                    resetOffset()
                  }}
                >
                  <SelectTrigger id="orgs-filter-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={STATUS_ALL}>{filterMessages.statusAll}</SelectItem>
                    {crmRecordStatuses.map((value) => (
                      <SelectItem key={value} value={value}>
                        {statusLabels[value as CrmRecordStatus] ?? value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 size-4" aria-hidden="true" />
            {filterMessages.clear}
          </Button>
        )}

        <div className="ml-auto">
          <Button onClick={handleCreate} data-slot="organization-list-create">
            <Plus className="mr-2 size-4" aria-hidden="true" />
            {messages.organizationList.create}
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortHeader
                  label={columnMessages.name}
                  field={SORTABLE_COLUMNS.name}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead>
                <SortHeader
                  label={columnMessages.industry}
                  field={SORTABLE_COLUMNS.industry}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead>
                <SortHeader
                  label={columnMessages.relation}
                  field={SORTABLE_COLUMNS.relation}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead>{columnMessages.website}</TableHead>
              <TableHead>
                <SortHeader
                  label={columnMessages.status}
                  field={SORTABLE_COLUMNS.status}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead>
                <SortHeader
                  label={columnMessages.updated}
                  field={SORTABLE_COLUMNS.updatedAt}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {showSkeleton ? (
              <OrganizationsTableSkeleton rows={SKELETON_ROW_COUNT} />
            ) : isError ? (
              <TableRow>
                <TableCell
                  colSpan={TABLE_COLUMN_COUNT}
                  className="h-24 text-center text-sm text-destructive"
                >
                  {messages.organizationList.loadFailed}
                </TableCell>
              </TableRow>
            ) : organizations.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={TABLE_COLUMN_COUNT}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  {messages.organizationList.empty}
                </TableCell>
              </TableRow>
            ) : (
              organizations.map((organization) => (
                <TableRow
                  key={organization.id}
                  onClick={() => handleEdit(organization)}
                  className="cursor-pointer"
                >
                  <TableCell>
                    <div className="font-medium">{organization.name}</div>
                    {organization.taxId ? (
                      <div className="text-xs text-muted-foreground">{organization.taxId}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>{organization.industry ?? messages.common.none}</TableCell>
                  <TableCell>
                    {organization.relation ? (
                      <Badge variant="secondary" className="capitalize">
                        {relationLabels[organization.relation as CrmRelationType] ??
                          organization.relation}
                      </Badge>
                    ) : (
                      messages.common.none
                    )}
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate">
                    {organization.website ? (
                      <a
                        href={organization.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {organization.website}
                      </a>
                    ) : (
                      messages.common.none
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {statusLabels[organization.status as CrmRecordStatus] ?? organization.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRelative(organization.updatedAt, messages)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {messages.common.pageSummary
            .replace("{shown}", String(organizations.length))
            .replace("{total}", String(total))}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset((prev) => Math.max(0, prev - pageSize))}
          >
            {messages.common.previous}
          </Button>
          <span>
            {messages.common.page} {page} / {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + pageSize >= total}
            onClick={() => setOffset((prev) => prev + pageSize)}
          >
            {messages.common.next}
          </Button>
        </div>
      </div>

      <OrganizationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        organization={editing}
        onSuccess={(organization) => {
          if (onSelectOrganization) {
            onSelectOrganization(organization)
          }
        }}
      />
    </div>
  )
}

interface SortHeaderProps {
  label: string
  field: SortableField
  sortBy: OrganizationsListSortField
  sortDir: OrganizationsListSortDir
  onSort: (field: SortableField) => void
}

function SortHeader({ label, field, sortBy, sortDir, onSort }: SortHeaderProps) {
  const active = sortBy === field
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className="-ml-2 inline-flex h-8 items-center gap-1 rounded-sm px-2 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span>{label}</span>
      <Icon
        className={`size-3.5 ${active ? "text-foreground" : "text-muted-foreground/60"}`}
        aria-hidden
      />
    </button>
  )
}

function OrganizationsTableSkeleton({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders are stable -- owner: relationships-react; existing suppression is intentional pending typed cleanup.
        <TableRow key={`skeleton-${idx}`}>
          <TableCell>
            <Skeleton className="h-4 w-40" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-16 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-48" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-16 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
