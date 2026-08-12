"use client"

import { AsyncCombobox } from "@voyant-travel/ui/components/async-combobox"
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
import { useCrmUiMessagesOrDefault } from "../i18n/index.js"
import type { CrmRecordStatus, CrmRelationType } from "../i18n/messages.js"
import { crmRecordStatuses, crmRelationTypes } from "../i18n/messages.js"
import {
  type OrganizationRecord,
  type PeopleListSortDir,
  type PeopleListSortField,
  type PersonRecord,
  useOrganizations,
  usePeople,
} from "../index.js"
import { PersonDialog } from "./person-dialog.js"

export interface PersonListProps {
  pageSize?: number
  onSelectPerson?: (person: PersonRecord) => void
}

const RELATION_ALL = "__all__"
const STATUS_ALL = "__all__"
const SKELETON_ROW_COUNT = 6
const TABLE_COLUMN_COUNT = 5

type SortableField = "name" | "relation" | "status" | "updatedAt"

const SORTABLE_COLUMNS = {
  name: "name",
  relation: "relation",
  status: "status",
  updatedAt: "updatedAt",
} as const satisfies Record<SortableField, SortableField>

/**
 * Paginated list of people with search + filters + create/edit dialog.
 */
export function PersonList({ pageSize = 25, onSelectPerson }: PersonListProps = {}) {
  const messages = useCrmUiMessagesOrDefault()
  const [search, setSearch] = React.useState("")
  const [relation, setRelation] = React.useState<string>(RELATION_ALL)
  const [status, setStatus] = React.useState<string>(STATUS_ALL)
  const [organizationId, setOrganizationId] = React.useState<string | null>(null)
  const [selectedOrganization, setSelectedOrganization] = React.useState<OrganizationRecord | null>(
    null,
  )
  const [organizationSearch, setOrganizationSearch] = React.useState("")
  const [sortBy, setSortBy] = React.useState<PeopleListSortField>("updatedAt")
  const [sortDir, setSortDir] = React.useState<PeopleListSortDir>("desc")
  const [offset, setOffset] = React.useState(0)
  const [filterPopoverOpen, setFilterPopoverOpen] = React.useState(false)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<PersonRecord | undefined>(undefined)

  const { data, isPending, isFetching, isError } = usePeople({
    search: search || undefined,
    relation: relation === RELATION_ALL ? undefined : relation,
    status: status === STATUS_ALL ? undefined : status,
    organizationId: organizationId ?? undefined,
    sortBy,
    sortDir,
    limit: pageSize,
    offset,
  })

  const { data: organizationsData } = useOrganizations({
    search: organizationSearch || undefined,
    limit: 20,
  })
  const organizations = organizationsData?.data ?? []

  const people = data?.data ?? []
  const total = data?.total ?? 0
  const page = Math.floor(offset / pageSize) + 1
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const showSkeleton = isPending || (isFetching && people.length === 0)

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

  const handleEdit = (person: PersonRecord) => {
    if (onSelectPerson) {
      onSelectPerson(person)
      return
    }
    setEditing(person)
    setDialogOpen(true)
  }

  const handleCreate = () => {
    setEditing(undefined)
    setDialogOpen(true)
  }

  const activeFilterCount =
    (relation !== RELATION_ALL ? 1 : 0) +
    (status !== STATUS_ALL ? 1 : 0) +
    (organizationId !== null ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0 || search !== ""

  const clearFilters = () => {
    setSearch("")
    setRelation(RELATION_ALL)
    setStatus(STATUS_ALL)
    setOrganizationId(null)
    setSelectedOrganization(null)
    setOrganizationSearch("")
    resetOffset()
  }

  const filterMessages = messages.personList.filters
  const columnMessages = messages.personList.columns
  const relationLabels = messages.common.relationTypeLabels
  const statusLabels = messages.common.recordStatusLabels

  return (
    <div data-slot="person-list" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Label htmlFor="people-search" className="sr-only">
            {messages.personList.searchPlaceholder}
          </Label>
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="people-search"
            placeholder={messages.personList.searchPlaceholder}
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
                <Label htmlFor="people-filter-relation">{filterMessages.relationLabel}</Label>
                <Select
                  value={relation}
                  onValueChange={(value) => {
                    setRelation(value ?? RELATION_ALL)
                    resetOffset()
                  }}
                >
                  <SelectTrigger id="people-filter-relation" className="w-full">
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
                <Label htmlFor="people-filter-status">{filterMessages.statusLabel}</Label>
                <Select
                  value={status}
                  onValueChange={(value) => {
                    setStatus(value ?? STATUS_ALL)
                    resetOffset()
                  }}
                >
                  <SelectTrigger id="people-filter-status" className="w-full">
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

              <div className="flex flex-col gap-1.5">
                <Label>{filterMessages.organizationLabel}</Label>
                <AsyncCombobox<OrganizationRecord>
                  value={organizationId}
                  onChange={(value) => {
                    setOrganizationId(value)
                    if (!value) setSelectedOrganization(null)
                    else {
                      const match = organizations.find((o) => o.id === value)
                      if (match) setSelectedOrganization(match)
                    }
                    resetOffset()
                  }}
                  items={organizations}
                  selectedItem={selectedOrganization}
                  getKey={(o) => o.id}
                  getLabel={(o) => o.name}
                  onSearchChange={setOrganizationSearch}
                  placeholder={filterMessages.organizationAny}
                  emptyText={filterMessages.organizationEmpty}
                />
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
          <Button onClick={handleCreate} data-slot="person-list-create">
            <Plus className="mr-2 size-4" aria-hidden="true" />
            {messages.personList.create}
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
              <TableHead>{columnMessages.email}</TableHead>
              <TableHead>{columnMessages.phone}</TableHead>
              <TableHead>
                <SortHeader
                  label={columnMessages.relation}
                  field={SORTABLE_COLUMNS.relation}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </TableHead>
              <TableHead>
                <SortHeader
                  label={columnMessages.status}
                  field={SORTABLE_COLUMNS.status}
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {showSkeleton ? (
              <PeopleTableSkeleton rows={SKELETON_ROW_COUNT} />
            ) : isError ? (
              <TableRow>
                <TableCell
                  colSpan={TABLE_COLUMN_COUNT}
                  className="h-24 text-center text-sm text-destructive"
                >
                  {messages.personList.loadFailed}
                </TableCell>
              </TableRow>
            ) : people.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={TABLE_COLUMN_COUNT}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  {messages.personList.empty}
                </TableCell>
              </TableRow>
            ) : (
              people.map((person) => {
                const fullName =
                  [person.firstName, person.lastName].filter(Boolean).join(" ") ||
                  messages.common.none
                return (
                  <TableRow
                    key={person.id}
                    onClick={() => handleEdit(person)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium">{fullName}</TableCell>
                    <TableCell>{person.email ?? messages.common.none}</TableCell>
                    <TableCell>{person.phone ?? messages.common.none}</TableCell>
                    <TableCell>
                      {person.relation ? (
                        <Badge variant="secondary" className="capitalize">
                          {relationLabels[person.relation as CrmRelationType] ?? person.relation}
                        </Badge>
                      ) : (
                        messages.common.none
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {statusLabels[person.status as CrmRecordStatus] ?? person.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {messages.common.pageSummary
            .replace("{shown}", String(people.length))
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

      <PersonDialog open={dialogOpen} onOpenChange={setDialogOpen} person={editing} />
    </div>
  )
}

interface SortHeaderProps {
  label: string
  field: SortableField
  sortBy: PeopleListSortField
  sortDir: PeopleListSortDir
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

function PeopleTableSkeleton({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders are stable -- owner: relationships-react; existing suppression is intentional pending typed cleanup.
        <TableRow key={`skeleton-${idx}`}>
          <TableCell>
            <Skeleton className="h-4 w-40" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-48" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-16 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-16 rounded-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
