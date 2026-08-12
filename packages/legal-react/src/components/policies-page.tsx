import { formatMessage } from "@voyant-travel/i18n"
import {
  Badge,
  Button,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
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
import { ListFilter, Plus, Search, X } from "lucide-react"
import type { ReactNode } from "react"
import { useState } from "react"
import { useLegalUiI18nOrDefault, useLegalUiMessagesOrDefault } from "../i18n/index.js"
import { legalPolicyKinds } from "../i18n/messages.js"
import { type LegalPolicyRecord, useLegalPolicies } from "../index.js"

const PAGE_SIZE = 25
const KIND_ALL = "__all__"

export interface PolicyDialogRenderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export interface PoliciesPageProps {
  className?: string
  onOpenPolicy?: (policyId: string) => void
  renderPolicyDialog?: (props: PolicyDialogRenderProps) => ReactNode
}

export function PoliciesPage({
  className,
  onOpenPolicy,
  renderPolicyDialog,
}: PoliciesPageProps = {}) {
  const i18n = useLegalUiI18nOrDefault()
  const messages = useLegalUiMessagesOrDefault()
  const f = messages.policiesPage
  const [search, setSearch] = useState("")
  const [kind, setKind] = useState<string>(KIND_ALL)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const activeFilterCount = kind !== KIND_ALL ? 1 : 0
  const hasActiveFilters = activeFilterCount > 0 || search !== ""
  const clearFilters = () => {
    setSearch("")
    setKind(KIND_ALL)
    setPageIndex(0)
  }

  const { data, isPending, isFetching, isError, refetch } = useLegalPolicies({
    search,
    kind: kind === KIND_ALL ? "all" : kind,
    limit: PAGE_SIZE,
    offset: pageIndex * PAGE_SIZE,
  })

  const policies = data?.data ?? []
  const total = data?.total ?? 0
  const page = pageIndex + 1
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const showSkeleton = isPending || (isFetching && policies.length === 0)

  const resetPage = () => setPageIndex(0)

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{f.title}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Label htmlFor="policies-search" className="sr-only">
            {f.searchPlaceholder}
          </Label>
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="policies-search"
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
                <Label htmlFor="policies-filter-kind">{f.filters.kind}</Label>
                <Select
                  value={kind}
                  onValueChange={(value) => {
                    setKind(value ?? KIND_ALL)
                    resetPage()
                  }}
                >
                  <SelectTrigger id="policies-filter-kind" className="w-full">
                    <SelectValue>
                      {(value) =>
                        value === KIND_ALL
                          ? f.allKinds
                          : (messages.common.policyKindLabels[
                              value as keyof typeof messages.common.policyKindLabels
                            ] ?? value)
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={KIND_ALL}>{f.allKinds}</SelectItem>
                    {legalPolicyKinds.map((value) => (
                      <SelectItem key={value} value={value}>
                        {messages.common.policyKindLabels[value]}
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
            <X className="mr-1 size-4" />
            {f.filters.clear}
          </Button>
        )}

        {renderPolicyDialog ? (
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
              <TableHead>{f.columns.name}</TableHead>
              <TableHead>{f.columns.slug}</TableHead>
              <TableHead>{f.columns.kind}</TableHead>
              <TableHead>{f.columns.language}</TableHead>
              <TableHead>{f.columns.created}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {showSkeleton ? (
              <PolicyRowSkeleton rows={6} />
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-sm text-destructive">
                  {f.loadFailed}
                </TableCell>
              </TableRow>
            ) : policies.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                  {f.empty}
                </TableCell>
              </TableRow>
            ) : (
              policies.map((policy) => (
                <PolicyRow
                  key={policy.id}
                  policy={policy}
                  created={i18n.formatDate(policy.createdAt)}
                  kindLabel={
                    messages.common.policyKindLabels[
                      policy.kind as keyof typeof messages.common.policyKindLabels
                    ] ?? policy.kind
                  }
                  onOpenPolicy={onOpenPolicy}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationBar
        shown={policies.length}
        total={total}
        page={page}
        pageCount={pageCount}
        onPrevious={() => setPageIndex((prev) => Math.max(0, prev - 1))}
        onNext={() => setPageIndex((prev) => prev + 1)}
        canGoBack={pageIndex > 0}
        canGoForward={(pageIndex + 1) * PAGE_SIZE < total}
      />

      {renderPolicyDialog?.({
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

function PolicyRow({
  policy,
  created,
  kindLabel,
  onOpenPolicy,
}: {
  policy: LegalPolicyRecord
  created: string
  kindLabel: string
  onOpenPolicy?: (policyId: string) => void
}) {
  return (
    <TableRow
      onClick={() => onOpenPolicy?.(policy.id)}
      className={cn(onOpenPolicy && "cursor-pointer")}
    >
      <TableCell className="font-medium">{policy.name}</TableCell>
      <TableCell className="font-mono text-xs">{policy.slug}</TableCell>
      <TableCell>
        <Badge variant="outline">{kindLabel}</Badge>
      </TableCell>
      <TableCell>{policy.language}</TableCell>
      <TableCell>{created}</TableCell>
    </TableRow>
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
  const f = messages.policiesPage.pagination
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

function PolicyRowSkeleton({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders are stable -- owner: legal-react; existing suppression is intentional pending typed cleanup.
        <TableRow key={`policy-skeleton-${index}`}>
          <TableCell>
            <Skeleton className="h-4 w-40" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-32" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-28 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-12" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
