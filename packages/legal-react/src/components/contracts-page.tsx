// agent-quality: file-size exception -- owner: legal-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.

import { formatMessage } from "@voyant-travel/i18n"
import { type PersonRecord, usePeople } from "@voyant-travel/relationships-react"
import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@voyant-travel/ui/components/command"
import { Popover, PopoverContent, PopoverTrigger } from "@voyant-travel/ui/components/popover"
import { Skeleton } from "@voyant-travel/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components/table"
import { cn } from "@voyant-travel/ui/lib/utils"
import { ChevronDown, ListFilter, Plus, Search, User, X } from "lucide-react"
import type { ReactNode } from "react"
import { useMemo, useState } from "react"
import { useLegalUiI18nOrDefault, useLegalUiMessagesOrDefault } from "../i18n/index.js"
import { legalContractScopes, legalContractStatuses } from "../i18n/messages.js"
import { type LegalContractRecord, useLegalContracts } from "../index.js"

const PAGE_SIZE = 25
const SCOPE_ALL = "__all__"
const STATUS_ALL = "__all__"

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  issued: "secondary",
  sent: "secondary",
  signed: "default",
  executed: "default",
  expired: "destructive",
  void: "destructive",
}

export interface ContractDialogRenderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export interface ContractPersonSummary {
  id: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
}

export interface ContractPersonFilterRenderProps {
  personId: string | null
  selectedPerson: ContractPersonSummary | null
  onPersonChange: (personId: string | null, person?: ContractPersonSummary | null) => void
}

export interface ContractsPageProps {
  className?: string
  defaultPersonId?: string | null
  personId?: string | null
  onPersonIdChange?: (personId: string | null) => void
  onOpenContract?: (contractId: string) => void
  renderContractDialog?: (props: ContractDialogRenderProps) => ReactNode
  renderPersonCell?: (personId: string | null, person: ContractPersonSummary | null) => ReactNode
  renderPersonFilter?: (props: ContractPersonFilterRenderProps) => ReactNode
}

export function ContractsPage({
  className,
  defaultPersonId,
  personId,
  onPersonIdChange,
  onOpenContract,
  renderContractDialog,
  renderPersonCell,
  renderPersonFilter,
}: ContractsPageProps = {}) {
  const i18n = useLegalUiI18nOrDefault()
  const messages = useLegalUiMessagesOrDefault()
  const f = messages.contractsPage
  const [search, setSearch] = useState("")
  const [scope, setScope] = useState<string>(SCOPE_ALL)
  const [status, setStatus] = useState<string>(STATUS_ALL)
  const [internalPersonId, setInternalPersonId] = useState(() =>
    getInitialPersonId(defaultPersonId),
  )
  const [selectedPerson, setSelectedPerson] = useState<ContractPersonSummary | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const resolvedPersonId = personId ?? internalPersonId
  const activeFilterCount =
    (scope !== SCOPE_ALL ? 1 : 0) + (status !== STATUS_ALL ? 1 : 0) + (resolvedPersonId ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0 || search !== ""

  const { data, isPending, isFetching, isError, refetch } = useLegalContracts({
    search,
    scope: scope === SCOPE_ALL ? "all" : scope,
    status: status === STATUS_ALL ? "all" : status,
    personId: resolvedPersonId || undefined,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
  })

  const contracts = data?.data ?? []
  const total = data?.total ?? 0
  const page = pageIndex + 1
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showSkeleton = isPending || (isFetching && contracts.length === 0)

  const resetPage = () => setPageIndex(0)
  const contractPersonSummary = useMemo(() => {
    if (!resolvedPersonId) return null
    if (selectedPerson?.id === resolvedPersonId) return selectedPerson
    for (const contract of contracts) {
      const person = getContractPersonSummary(contract)
      if (person?.id === resolvedPersonId) return person
    }
    return { id: resolvedPersonId }
  }, [contracts, resolvedPersonId, selectedPerson])
  const handlePersonChange = (
    nextPersonId: string | null,
    person?: ContractPersonSummary | null,
  ) => {
    if (personId === undefined) setInternalPersonId(nextPersonId ?? "")
    setSelectedPerson(person ?? null)
    onPersonIdChange?.(nextPersonId)
    resetPage()
  }

  const clearFilters = () => {
    setSearch("")
    setScope(SCOPE_ALL)
    setStatus(STATUS_ALL)
    handlePersonChange(null, null)
    resetPage()
  }

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{f.title}</h1>
        <p className="text-sm text-muted-foreground">{f.description}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Label htmlFor="contracts-search" className="sr-only">
            {f.searchPlaceholder}
          </Label>
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="contracts-search"
            placeholder={f.searchPlaceholder}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              resetPage()
            }}
            className="pl-9"
          />
        </div>

        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger
            render={
              <Button variant="outline" size="default">
                <ListFilter className="mr-2 size-4" />
                {f.filters.button}
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
                <Label htmlFor="contracts-filter-scope">{f.filters.scope}</Label>
                <Select
                  value={scope}
                  onValueChange={(value) => {
                    setScope(value ?? SCOPE_ALL)
                    resetPage()
                  }}
                >
                  <SelectTrigger id="contracts-filter-scope" className="w-full">
                    <SelectValue>
                      {(value) =>
                        value === SCOPE_ALL
                          ? f.filters.allScopes
                          : (messages.common.contractScopeLabels[
                              value as keyof typeof messages.common.contractScopeLabels
                            ] ?? value)
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SCOPE_ALL}>{f.filters.allScopes}</SelectItem>
                    {legalContractScopes.map((value) => (
                      <SelectItem key={value} value={value}>
                        {messages.common.contractScopeLabels[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contracts-filter-status">{f.filters.status}</Label>
                <Select
                  value={status}
                  onValueChange={(value) => {
                    setStatus(value ?? STATUS_ALL)
                    resetPage()
                  }}
                >
                  <SelectTrigger id="contracts-filter-status" className="w-full">
                    <SelectValue>
                      {(value) =>
                        value === STATUS_ALL
                          ? f.filters.allStatuses
                          : (messages.common.contractStatusLabels[
                              value as keyof typeof messages.common.contractStatusLabels
                            ] ?? value)
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={STATUS_ALL}>{f.filters.allStatuses}</SelectItem>
                    {legalContractStatuses.map((value) => (
                      <SelectItem key={value} value={value}>
                        {messages.common.contractStatusLabels[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>{f.filters.person}</Label>
                {renderPersonFilter ? (
                  renderPersonFilter({
                    personId: resolvedPersonId || null,
                    selectedPerson: contractPersonSummary,
                    onPersonChange: handlePersonChange,
                  })
                ) : (
                  <ContractsPersonFilter
                    value={resolvedPersonId || null}
                    selectedPerson={contractPersonSummary}
                    onChange={handlePersonChange}
                  />
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 size-4" />
            {f.filters.clear}
          </Button>
        )}

        {renderContractDialog ? (
          <div className="ml-auto">
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1 size-4" aria-hidden="true" />
              {f.create}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{f.columns.number}</TableHead>
              <TableHead>{f.columns.title}</TableHead>
              <TableHead>{f.columns.scope}</TableHead>
              <TableHead>{f.columns.status}</TableHead>
              <TableHead>{f.columns.person}</TableHead>
              <TableHead>{f.columns.created}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {showSkeleton ? (
              <ContractRowSkeleton rows={6} />
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-sm text-destructive">
                  {f.loadFailed}
                </TableCell>
              </TableRow>
            ) : contracts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                  {f.empty}
                </TableCell>
              </TableRow>
            ) : (
              contracts.map((contract) => (
                <TableRow
                  key={contract.id}
                  onClick={() => onOpenContract?.(contract.id)}
                  className={cn(onOpenContract && "cursor-pointer")}
                >
                  <TableCell className="font-mono text-xs">
                    {contract.contractNumber ?? messages.common.noResultsDash}
                  </TableCell>
                  <TableCell className="font-medium">{contract.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {messages.common.contractScopeLabels[
                        contract.scope as keyof typeof messages.common.contractScopeLabels
                      ] ?? contract.scope}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[contract.status] ?? "secondary"}>
                      {messages.common.contractStatusLabels[contract.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ContractPersonCell contract={contract} renderPersonCell={renderPersonCell} />
                  </TableCell>
                  <TableCell>{i18n.formatDate(contract.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationBar
        shown={contracts.length}
        total={total}
        page={page}
        pageCount={pageCount}
        onPrevious={() => setPageIndex((prev) => Math.max(0, prev - 1))}
        onNext={() => setPageIndex((prev) => prev + 1)}
        canGoBack={pageIndex > 0}
        canGoForward={(pageIndex + 1) * PAGE_SIZE < total}
      />

      {renderContractDialog?.({
        open: dialogOpen,
        onOpenChange: setDialogOpen,
        onSuccess: () => {
          setDialogOpen(false)
          setPageIndex(0)
          void refetch()
        },
      })}
    </div>
  )
}

function getInitialPersonId(defaultPersonId: string | null | undefined) {
  if (defaultPersonId !== undefined) return defaultPersonId ?? ""
  if (typeof window === "undefined") return ""
  return new URLSearchParams(window.location.search).get("personId") ?? ""
}

function personSummaryFromRecord(person: PersonRecord): ContractPersonSummary {
  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email,
    phone: person.phone,
  }
}

function getContractPersonSummary(contract: LegalContractRecord): ContractPersonSummary | null {
  if (!contract.personId) return null
  return {
    id: contract.personId,
    firstName: contract.personFirstName,
    lastName: contract.personLastName,
    email: contract.personEmail,
    phone: contract.personPhone,
  }
}

function formatPersonName(person: ContractPersonSummary | null) {
  if (!person) return null
  const name = [person.firstName, person.lastName].filter(Boolean).join(" ").trim()
  return name || null
}

function formatPersonLabel(person: ContractPersonSummary | null, fallback?: string | null) {
  return formatPersonName(person) ?? person?.email ?? person?.phone ?? fallback ?? null
}

function ContractsPersonFilter({
  value,
  selectedPerson,
  onChange,
}: {
  value: string | null
  selectedPerson: ContractPersonSummary | null
  onChange: (personId: string | null, person?: ContractPersonSummary | null) => void
}) {
  const messages = useLegalUiMessagesOrDefault().contractsPage.filters
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const peopleQuery = usePeople({
    search: search.trim() || undefined,
    limit: 25,
    enabled: open,
  })
  const people = peopleQuery.data?.data ?? []
  const label = formatPersonLabel(selectedPerson, value) ?? messages.allPeople

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="w-full flex-1 justify-between gap-2 px-3"
            />
          }
        >
          <span className="flex min-w-0 items-center gap-2">
            <User className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent className="w-[20rem] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder={messages.personSearchPlaceholder}
            />
            <CommandList>
              <CommandEmpty>
                {peopleQuery.isLoading ? messages.personSearching : messages.personEmpty}
              </CommandEmpty>
              <CommandGroup>
                {people.map((person) => {
                  const summary = personSummaryFromRecord(person)
                  const name = formatPersonName(summary)
                  return (
                    <CommandItem
                      key={person.id}
                      value={`${name ?? ""} ${person.email ?? ""} ${person.phone ?? ""}`}
                      onSelect={() => {
                        onChange(person.id, summary)
                        setOpen(false)
                        setSearch("")
                      }}
                    >
                      <div className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span className="truncate font-medium text-sm">{name ?? person.id}</span>
                        {(person.email || person.phone) && (
                          <span className="truncate text-muted-foreground text-xs">
                            {person.email ?? person.phone}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
              {value ? (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="__clear_person_filter"
                      onSelect={() => {
                        onChange(null, null)
                        setOpen(false)
                        setSearch("")
                      }}
                    >
                      <X className="mr-2 size-4" aria-hidden="true" />
                      {messages.clearPerson}
                    </CommandItem>
                  </CommandGroup>
                </>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={messages.clearPerson}
          onClick={() => onChange(null, null)}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}

function ContractPersonCell({
  contract,
  renderPersonCell,
}: {
  contract: LegalContractRecord
  renderPersonCell?: (personId: string | null, person: ContractPersonSummary | null) => ReactNode
}) {
  const messages = useLegalUiMessagesOrDefault()
  const person = getContractPersonSummary(contract)
  if (renderPersonCell) return renderPersonCell(contract.personId, person)
  if (!contract.personId) {
    return <span className="text-muted-foreground text-xs">{messages.common.noResultsDash}</span>
  }

  const name = formatPersonName(person)
  if (!name && !person?.email && !person?.phone) {
    return <span className="font-mono text-xs">{contract.personId}</span>
  }

  return (
    <div className="flex min-w-0 flex-col leading-tight">
      <span className="truncate font-medium text-sm">{name ?? contract.personId}</span>
      {(person?.email || person?.phone) && (
        <span className="truncate text-muted-foreground text-xs">
          {person.email ?? person.phone}
        </span>
      )}
    </div>
  )
}

function PaginationBar({
  shown,
  total,
  page,
  pageCount,
  onPrevious,
  onNext,
  canGoBack,
  canGoForward,
}: {
  shown: number
  total: number
  page: number
  pageCount: number
  onPrevious: () => void
  onNext: () => void
  canGoBack: boolean
  canGoForward: boolean
}) {
  const messages = useLegalUiMessagesOrDefault()
  const f = messages.contractsPage.pagination
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>{formatMessage(f.showing, { count: shown, total })}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={!canGoBack} onClick={onPrevious}>
          {f.previous}
        </Button>
        <span>{formatMessage(f.page, { page, pageCount })}</span>
        <Button variant="outline" size="sm" disabled={!canGoForward} onClick={onNext}>
          {f.next}
        </Button>
      </div>
    </div>
  )
}

function ContractRowSkeleton({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders are stable -- owner: legal-react; existing suppression is intentional pending typed cleanup.
        <TableRow key={`contract-skeleton-${index}`}>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-40" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-24 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
