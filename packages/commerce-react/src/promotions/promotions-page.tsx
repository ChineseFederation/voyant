"use client"

/**
 * Operator-facing promotions list page.
 *
 * Lists every promotional offer with server-backed search, filters, pagination,
 * and optional row navigation for apps that expose a dedicated detail route.
 */

import type { QueryClient } from "@tanstack/react-query"
import { formatMessage } from "@voyant-travel/i18n"
import {
  Badge,
  Button,
  confirmDialog,
  DateRangePicker,
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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components"
import { cn } from "@voyant-travel/ui/lib/utils"
import { ListFilter, Plus, Search, X } from "lucide-react"
import type { ReactNode } from "react"
import { useState } from "react"
import type { PromotionsUiMessages } from "./i18n/messages.js"
import { usePromotionsUiMessagesOrDefault } from "./i18n/provider.js"
import {
  createPromotionsClientOptions,
  getPromotionsListQueryOptions,
  type PromotionalOfferApplicationMode,
  type PromotionalOfferListStatus,
  type PromotionalOfferRecord,
  type PromotionalOfferScopeKind,
  type PromotionsClientOptions,
  type PromotionsListQuery,
  useArchivePromotion,
  useDeletePromotion,
  usePromotionsList,
  useUpdatePromotion,
} from "./index.js"
import { PromotionDialog } from "./promotion-dialog.js"
import { formatPromotionActionError, PromotionRowActions } from "./promotions-page-actions.js"
import {
  ALL,
  applicationModes,
  DEFAULT_PAGE_SIZE,
  getOfferStatus,
  scopeKinds,
  statusBadgeVariant,
  statusFilters,
  summarizeDiscount,
  summarizeScope,
  summarizeValidity,
  TABLE_COLUMN_COUNT,
} from "./promotions-page-utils.js"

type DateRangeValue = {
  from: string | null
  to: string | null
}

export interface PromotionDialogRenderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  offer?: PromotionalOfferRecord
  onSuccess: () => void
}

export interface PromotionsPageProps {
  className?: string
  pageSize?: number
  onOpenPromotion?: (promotionId: string, promotion: PromotionalOfferRecord) => void
  renderPromotionDialog?: (props: PromotionDialogRenderProps) => ReactNode
}

export function loadPromotionsPage(
  queryClient: QueryClient,
  client?: Partial<PromotionsClientOptions>,
  query: PromotionsListQuery = {},
) {
  return queryClient.ensureQueryData(
    getPromotionsListQueryOptions(
      { limit: DEFAULT_PAGE_SIZE, offset: 0, ...query },
      createPromotionsClientOptions(client),
    ),
  )
}

export function PromotionsPage({
  className,
  pageSize = DEFAULT_PAGE_SIZE,
  onOpenPromotion,
  renderPromotionDialog,
}: PromotionsPageProps = {}) {
  const messages = usePromotionsUiMessagesOrDefault()
  const pageMessages = messages.promotionsPage
  const [search, setSearch] = useState("")
  const [applicationMode, setApplicationMode] = useState<string>(ALL)
  const [status, setStatus] = useState<string>(ALL)
  const [scopeKind, setScopeKind] = useState<string>(ALL)
  const [validityRange, setValidityRange] = useState<DateRangeValue | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingOffer, setEditingOffer] = useState<PromotionalOfferRecord | undefined>()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const archiveMutation = useArchivePromotion()
  const updateMutation = useUpdatePromotion()
  const deleteMutation = useDeletePromotion()

  const query: PromotionsListQuery = {
    search: search || undefined,
    applicationMode:
      applicationMode === ALL ? undefined : (applicationMode as PromotionalOfferApplicationMode),
    status: status === ALL ? undefined : (status as PromotionalOfferListStatus),
    scopeKind: scopeKind === ALL ? undefined : (scopeKind as PromotionalOfferScopeKind),
    validFrom: validityRange?.from ?? undefined,
    validUntil: validityRange?.to ?? undefined,
    limit: pageSize,
    offset: pageIndex * pageSize,
  }

  const { data, isPending, isFetching, isError, error, refetch } = usePromotionsList(query)

  const offers = data?.data ?? []
  const total = data?.total ?? 0
  const page = pageIndex + 1
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const showSkeleton = isPending || (isFetching && offers.length === 0)
  const actionPending =
    archiveMutation.isPending || updateMutation.isPending || deleteMutation.isPending
  const activeFilterCount =
    (applicationMode !== ALL ? 1 : 0) +
    (status !== ALL ? 1 : 0) +
    (scopeKind !== ALL ? 1 : 0) +
    (validityRange?.from || validityRange?.to ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0 || search !== ""

  const resetPage = () => setPageIndex(0)

  function openCreate() {
    setActionError(null)
    setEditingOffer(undefined)
    setDialogOpen(true)
  }

  function openEdit(offer: PromotionalOfferRecord) {
    setActionError(null)
    setEditingOffer(offer)
    setDialogOpen(true)
  }

  function openOffer(offer: PromotionalOfferRecord) {
    if (onOpenPromotion) {
      onOpenPromotion(offer.id, offer)
      return
    }
    openEdit(offer)
  }

  function clearFilters() {
    setSearch("")
    setApplicationMode(ALL)
    setStatus(ALL)
    setScopeKind(ALL)
    setValidityRange(null)
    resetPage()
  }

  async function runPromotionAction(action: string, callback: () => Promise<unknown>) {
    setActionError(null)
    try {
      await callback()
      resetPage()
    } catch (err) {
      setActionError(formatPromotionActionError(err, action, pageMessages))
    }
  }

  async function archiveOffer(offer: PromotionalOfferRecord) {
    if (
      !(await confirmDialog({
        description: pageMessages.actions.archiveConfirm,
        destructive: true,
      }))
    )
      return
    await runPromotionAction(pageMessages.actions.archive, () =>
      archiveMutation.mutateAsync(offer.id),
    )
  }

  async function activateOffer(offer: PromotionalOfferRecord) {
    if (!(await confirmDialog(pageMessages.actions.activateConfirm))) return
    await runPromotionAction(pageMessages.actions.activate, () =>
      updateMutation.mutateAsync({ id: offer.id, patch: { active: true } }),
    )
  }

  async function deleteOffer(offer: PromotionalOfferRecord) {
    if (
      !(await confirmDialog({ description: pageMessages.actions.deleteConfirm, destructive: true }))
    )
      return
    await runPromotionAction(pageMessages.actions.delete, () =>
      deleteMutation.mutateAsync(offer.id),
    )
  }

  const dialog = renderPromotionDialog ? (
    renderPromotionDialog({
      open: dialogOpen,
      onOpenChange: setDialogOpen,
      offer: editingOffer,
      onSuccess: () => {
        setDialogOpen(false)
        resetPage()
        void refetch()
      },
    })
  ) : (
    <PromotionDialog open={dialogOpen} onOpenChange={setDialogOpen} offer={editingOffer} />
  )

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{pageMessages.title}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Label htmlFor="promotions-search" className="sr-only">
            {pageMessages.searchLabel}
          </Label>
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="promotions-search"
            placeholder={pageMessages.searchPlaceholder}
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
                {pageMessages.filtersButton}
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
                <Label htmlFor="promotions-filter-mode">{pageMessages.modePlaceholder}</Label>
                <Select
                  value={applicationMode}
                  onValueChange={(value) => {
                    setApplicationMode(value ?? ALL)
                    resetPage()
                  }}
                >
                  <SelectTrigger id="promotions-filter-mode" className="w-full">
                    <SelectValue>
                      {(value) =>
                        value === ALL
                          ? pageMessages.allModes
                          : (messages.common.applicationModeLabels[
                              value as PromotionalOfferApplicationMode
                            ] ?? value)
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{pageMessages.allModes}</SelectItem>
                    {applicationModes.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {messages.common.applicationModeLabels[mode]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="promotions-filter-status">{pageMessages.statusPlaceholder}</Label>
                <Select
                  value={status}
                  onValueChange={(value) => {
                    setStatus(value ?? ALL)
                    resetPage()
                  }}
                >
                  <SelectTrigger id="promotions-filter-status" className="w-full">
                    <SelectValue>
                      {(value) =>
                        value === ALL
                          ? pageMessages.allStatuses
                          : (messages.common.statusLabels[value as PromotionalOfferListStatus] ??
                            value)
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{pageMessages.allStatuses}</SelectItem>
                    {statusFilters.map((value) => (
                      <SelectItem key={value} value={value}>
                        {messages.common.statusLabels[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="promotions-filter-scope">{pageMessages.scopePlaceholder}</Label>
                <Select
                  value={scopeKind}
                  onValueChange={(value) => {
                    setScopeKind(value ?? ALL)
                    resetPage()
                  }}
                >
                  <SelectTrigger id="promotions-filter-scope" className="w-full">
                    <SelectValue>
                      {(value) =>
                        value === ALL
                          ? pageMessages.allScopes
                          : (messages.common.scopeKindLabels[value as PromotionalOfferScopeKind] ??
                            value)
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{pageMessages.allScopes}</SelectItem>
                    {scopeKinds.map((value) => (
                      <SelectItem key={value} value={value}>
                        {messages.common.scopeKindLabels[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="promotions-filter-validity">
                  {pageMessages.validityRangePlaceholder}
                </Label>
                <DateRangePicker
                  value={validityRange}
                  onChange={(value) => {
                    setValidityRange(value)
                    resetPage()
                  }}
                  placeholder={pageMessages.validityRangePlaceholder}
                  className="w-full"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {hasActiveFilters ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 size-4" aria-hidden="true" />
            {pageMessages.clearFilters}
          </Button>
        ) : null}

        <div className="ml-auto">
          <Button onClick={openCreate}>
            <Plus className="mr-1 size-4" aria-hidden="true" />
            {pageMessages.newPromotion}
          </Button>
        </div>
      </div>

      {actionError ? (
        <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <p>{actionError}</p>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-destructive"
            onClick={() => setActionError(null)}
            aria-label={pageMessages.actions.dismissError}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{pageMessages.columns.name}</TableHead>
              <TableHead>{pageMessages.columns.mode}</TableHead>
              <TableHead>{pageMessages.columns.scope}</TableHead>
              <TableHead>{pageMessages.columns.discount}</TableHead>
              <TableHead>{pageMessages.columns.validity}</TableHead>
              <TableHead>{pageMessages.columns.code}</TableHead>
              <TableHead>{pageMessages.columns.status}</TableHead>
              <TableHead className="w-12 text-right">{pageMessages.columns.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {showSkeleton ? (
              <PromotionRowSkeleton rows={6} />
            ) : isError ? (
              <TableRow>
                <TableCell
                  colSpan={TABLE_COLUMN_COUNT}
                  className="h-24 text-center text-sm text-destructive"
                >
                  {formatMessage(pageMessages.loadFailedPrefix, {
                    message: error instanceof Error ? error.message : String(error),
                  })}
                </TableCell>
              </TableRow>
            ) : offers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={TABLE_COLUMN_COUNT}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  {pageMessages.empty}
                </TableCell>
              </TableRow>
            ) : (
              offers.map((offer) => (
                <TableRow
                  key={offer.id}
                  className="cursor-pointer"
                  onClick={() => openOffer(offer)}
                >
                  <TableCell>
                    <div className="font-medium">{offer.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{offer.slug}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={offer.code == null ? "secondary" : "outline"}>
                      {offer.code == null ? pageMessages.badges.auto : pageMessages.badges.code}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {summarizeScope(offer.scope, messages)}
                  </TableCell>
                  <TableCell>{summarizeDiscount(offer, pageMessages)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {summarizeValidity(offer.validFrom, offer.validUntil, pageMessages)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {offer.code ?? pageMessages.summaries.noCode}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={statusBadgeVariant(getOfferStatus(offer))}>
                        {messages.common.statusLabels[getOfferStatus(offer)]}
                      </Badge>
                      {offer.stackable ? (
                        <Badge variant="secondary">{pageMessages.badges.stackable}</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                    <PromotionRowActions
                      offer={offer}
                      disabled={actionPending}
                      onEdit={openEdit}
                      onArchive={archiveOffer}
                      onActivate={activateOffer}
                      onDelete={deleteOffer}
                      messages={pageMessages.actions}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationBar
        shown={offers.length}
        total={total}
        page={page}
        pageCount={pageCount}
        onPrevious={() => setPageIndex((prev) => Math.max(0, prev - 1))}
        onNext={() => setPageIndex((prev) => prev + 1)}
        canGoBack={pageIndex > 0}
        canGoForward={(pageIndex + 1) * pageSize < total}
        messages={pageMessages.pagination}
      />

      {dialog}
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
  messages,
}: {
  shown: number
  total: number
  page: number
  pageCount: number
  onPrevious: () => void
  onNext: () => void
  canGoBack: boolean
  canGoForward: boolean
  messages: PromotionsUiMessages["promotionsPage"]["pagination"]
}) {
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {formatMessage(messages.showing, {
          shown,
          total,
        })}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={!canGoBack} onClick={onPrevious}>
          {messages.previous}
        </Button>
        <span>
          {formatMessage(messages.page, {
            page,
            pageCount,
          })}
        </span>
        <Button variant="outline" size="sm" disabled={!canGoForward} onClick={onNext}>
          {messages.next}
        </Button>
      </div>
    </div>
  )
}

function PromotionRowSkeleton({ rows }: { rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders are stable -- owner: promotions-react; existing suppression is intentional pending typed cleanup.
        <TableRow key={`promotion-skeleton-${index}`}>
          <TableCell>
            <Skeleton className="h-4 w-40" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-16 rounded-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-28" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-32" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-20 rounded-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}
