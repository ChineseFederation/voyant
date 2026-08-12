"use client"

import type { RowSelectionState } from "@tanstack/react-table"
import { Badge, Button, cn, Input, Label } from "@voyant-travel/ui/components"
import { Popover, PopoverContent, PopoverTrigger } from "@voyant-travel/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { Tabs, TabsList, TabsTrigger } from "@voyant-travel/ui/components/tabs"
import { ListFilter, Search, X } from "lucide-react"
import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import { useResourcesUiI18nOrDefault } from "../i18n/index.js"
import { formatResourceSlotLabel, RESOURCE_KIND_VALUES } from "../i18n/utils.js"
import {
  labelById,
  type ProductOption,
  type ResourceAllocationRow,
  type ResourceCloseoutRow,
  type ResourcePoolRow,
  type ResourceRow,
  type ResourceSlotAssignmentRow,
  type SupplierOption,
  type UseAllocationsOptions,
  type UseAssignmentsOptions,
  type UseBookingsOptions,
  type UseCloseoutsOptions,
  type UsePoolsOptions,
  type UseProductsOptions,
  type UseResourcesOptions,
  type UseRulesOptions,
  type UseSlotsOptions,
  type UseStartTimesOptions,
  type UseSuppliersOptions,
  useAllocations,
  useAssignments,
  useBookings,
  useCloseouts,
  usePools,
  useProducts,
  useResources,
  useRules,
  useSlots,
  useStartTimes,
  useSuppliers,
} from "../index.js"
import { ResourcesOverview } from "./resources-overview.js"
import { ResourcesFilterPopover } from "./resources-page-filters.js"
import { AllocationsTab, PoolsTab, ResourcesTab } from "./resources-tabs-primary.js"
import { AssignmentsTab, CloseoutsTab } from "./resources-tabs-secondary.js"

export type ResourcesPageTab = "resources" | "pools" | "allocations" | "assignments" | "closeouts"

export type ResourcesPageActiveFilter = "all" | "active" | "inactive"

export type ResourcesPageBulkUpdateArgs = {
  ids: string[]
  endpoint: string
  target: string
  nounSingular: string
  nounPlural: string
  payload: Record<string, unknown>
  successVerb: string
  clearSelection: () => void
}

export type ResourcesPageBulkDeleteArgs = {
  ids: string[]
  endpoint: string
  target: string
  nounSingular: string
  nounPlural: string
  clearSelection: () => void
}

export type ResourcesPageBulkUpdateHandler = (args: ResourcesPageBulkUpdateArgs) => Promise<void>

export type ResourcesPageBulkDeleteHandler = (args: ResourcesPageBulkDeleteArgs) => Promise<void>

export interface ResourcesPageSlots {
  headerEnd?: ReactNode
  beforeTabs?: ReactNode
  afterOverview?: ReactNode
  afterTabs?: ReactNode
  dialogs?: ReactNode
}

/**
 * Per-list query options the page's data hooks run with. Hosts that SSR
 * prefetch (route loaders) pass the same filters here so the loader-seeded
 * cache entries and the page's hooks share query keys.
 */
export interface ResourcesPageQueryFilters {
  suppliers?: UseSuppliersOptions
  products?: UseProductsOptions
  bookings?: UseBookingsOptions
  slots?: UseSlotsOptions
  rules?: UseRulesOptions
  startTimes?: UseStartTimesOptions
  resources?: UseResourcesOptions
  pools?: UsePoolsOptions
  allocations?: UseAllocationsOptions
  assignments?: UseAssignmentsOptions
  closeouts?: UseCloseoutsOptions
}

export interface ResourcesPageProps {
  className?: string
  defaultTab?: ResourcesPageTab
  bulkActionTarget?: string | null
  onBulkUpdate: ResourcesPageBulkUpdateHandler
  onBulkDelete: ResourcesPageBulkDeleteHandler
  onResourceCreate?: () => void
  onResourceOpen?: (resourceId: string) => void
  onResourceEdit?: (resource: ResourceRow) => void
  onPoolCreate?: () => void
  onPoolOpen?: (poolId: string) => void
  onPoolEdit?: (pool: ResourcePoolRow) => void
  onAllocationCreate?: () => void
  onAllocationOpen?: (allocationId: string) => void
  onAllocationEdit?: (allocation: ResourceAllocationRow) => void
  onAssignmentCreate?: () => void
  onAssignmentOpen?: (assignmentId: string) => void
  onAssignmentEdit?: (assignment: ResourceSlotAssignmentRow) => void
  onCloseoutCreate?: () => void
  onCloseoutEdit?: (closeout: ResourceCloseoutRow) => void
  slots?: ResourcesPageSlots
  /** Options forwarded to the page's list hooks (e.g. to match SSR-prefetched query keys). */
  queryFilters?: ResourcesPageQueryFilters
  /** Rendered instead of the default loading hint while the list queries resolve. */
  loadingFallback?: ReactNode
}

const noop = () => undefined
const noopId = (_id: string) => undefined
const noopRow = (_row: unknown) => undefined
const RESOURCE_PAGE_STATE_KEY = "voyant.resources.pageState"

type PersistedResourcesPageState = {
  activeTab?: ResourcesPageTab
  search?: string
  kindFilter?: string
  activeFilter?: ResourcesPageActiveFilter
  supplierFilter?: string | null
  productFilter?: string | null
  assignmentStatusFilter?: string
}

function loadPersistedPageState(): PersistedResourcesPageState {
  if (typeof window === "undefined") return {}

  try {
    const raw = window.sessionStorage.getItem(RESOURCE_PAGE_STATE_KEY)
    return raw ? (JSON.parse(raw) as PersistedResourcesPageState) : {}
  } catch {
    return {}
  }
}

export function ResourcesPage({
  className,
  defaultTab = "resources",
  bulkActionTarget = null,
  onBulkUpdate,
  onBulkDelete,
  onResourceCreate = noop,
  onResourceOpen = noopId,
  onResourceEdit = noopRow,
  onPoolCreate = noop,
  onPoolOpen = noopId,
  onPoolEdit = noopRow,
  onAllocationCreate = noop,
  onAllocationOpen = noopId,
  onAllocationEdit = noopRow,
  onAssignmentCreate = noop,
  onAssignmentOpen = noopId,
  onAssignmentEdit = noopRow,
  onCloseoutCreate = noop,
  onCloseoutEdit = noopRow,
  slots,
  queryFilters,
  loadingFallback,
}: ResourcesPageProps) {
  const i18n = useResourcesUiI18nOrDefault()
  const m = i18n.messages
  const page = m.resourcesPage
  const [persistedPageState] = useState(loadPersistedPageState)
  const [search, setSearch] = useState(persistedPageState.search ?? "")
  const [kindFilter, setKindFilter] = useState(persistedPageState.kindFilter ?? "all")
  const [activeTab, setActiveTab] = useState<ResourcesPageTab>(
    persistedPageState.activeTab ?? defaultTab,
  )
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false)
  const [supplierFilter, setSupplierFilter] = useState<string | null>(
    persistedPageState.supplierFilter ?? null,
  )
  const [selectedSupplierOption, setSelectedSupplierOption] = useState<SupplierOption | null>(null)
  const [productFilter, setProductFilter] = useState<string | null>(
    persistedPageState.productFilter ?? null,
  )
  const [selectedProductOption, setSelectedProductOption] = useState<ProductOption | null>(null)
  const [activeFilter, setActiveFilter] = useState<ResourcesPageActiveFilter>(
    persistedPageState.activeFilter ?? "all",
  )
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState<string>(
    persistedPageState.assignmentStatusFilter ?? "all",
  )
  const [resourceSelection, setResourceSelectionState] = useState<RowSelectionState>({})
  const [poolSelection, setPoolSelectionState] = useState<RowSelectionState>({})
  const [allocationSelection, setAllocationSelectionState] = useState<RowSelectionState>({})
  const [assignmentSelection, setAssignmentSelectionState] = useState<RowSelectionState>({})
  const [closeoutSelection, setCloseoutSelectionState] = useState<RowSelectionState>({})

  const suppliersQuery = useSuppliers(queryFilters?.suppliers)
  const productsQuery = useProducts(queryFilters?.products)
  const bookingsQuery = useBookings(queryFilters?.bookings)
  const slotsQuery = useSlots(queryFilters?.slots)
  const rulesQuery = useRules(queryFilters?.rules)
  const startTimesQuery = useStartTimes(queryFilters?.startTimes)
  const resourcesQuery = useResources(queryFilters?.resources)
  const poolsQuery = usePools(queryFilters?.pools)
  const allocationsQuery = useAllocations(queryFilters?.allocations)
  const assignmentsQuery = useAssignments(queryFilters?.assignments)
  const closeoutsQuery = useCloseouts(queryFilters?.closeouts)

  const suppliers = suppliersQuery.data?.data ?? []
  const products = productsQuery.data?.data ?? []
  const bookings = bookingsQuery.data?.data ?? []
  const slotsData = slotsQuery.data?.data ?? []
  const rules = rulesQuery.data?.data ?? []
  const startTimes = startTimesQuery.data?.data ?? []
  const resources = resourcesQuery.data?.data ?? []
  const pools = poolsQuery.data?.data ?? []
  const allocations = allocationsQuery.data?.data ?? []
  const assignments = assignmentsQuery.data?.data ?? []
  const closeouts = closeoutsQuery.data?.data ?? []

  useEffect(() => {
    if (typeof window === "undefined") return

    const nextState: PersistedResourcesPageState = {
      activeTab,
      search,
      kindFilter,
      activeFilter,
      supplierFilter,
      productFilter,
      assignmentStatusFilter,
    }
    window.sessionStorage.setItem(RESOURCE_PAGE_STATE_KEY, JSON.stringify(nextState))
  }, [
    activeFilter,
    activeTab,
    assignmentStatusFilter,
    kindFilter,
    productFilter,
    search,
    supplierFilter,
  ])

  const kindOptions = useMemo(
    () =>
      RESOURCE_KIND_VALUES.map((value) => ({
        value,
        label: m.common.resourceKindLabels[value],
      })),
    [m.common.resourceKindLabels],
  )

  const normalizedSearch = search.trim().toLowerCase()
  const matchesSearch = (...values: Array<string | number | null | undefined>) =>
    !normalizedSearch ||
    values.some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(normalizedSearch),
    )
  const matchesKind = (kind: ResourceRow["kind"]) => kindFilter === "all" || kind === kindFilter
  const matchesActive = (active: boolean) =>
    activeFilter === "all" ||
    (activeFilter === "active" && active) ||
    (activeFilter === "inactive" && !active)

  const filteredResources = resources.filter(
    (resource) =>
      matchesKind(resource.kind) &&
      matchesActive(resource.active) &&
      (!supplierFilter || resource.supplierId === supplierFilter) &&
      matchesSearch(
        resource.name,
        resource.code,
        resource.kind,
        labelById(suppliers, resource.supplierId),
        resource.notes,
      ),
  )
  const filteredPools = pools.filter(
    (pool) =>
      matchesKind(pool.kind) &&
      matchesActive(pool.active) &&
      (!productFilter || pool.productId === productFilter) &&
      matchesSearch(pool.name, pool.kind, labelById(products, pool.productId), pool.notes),
  )
  const filteredAllocations = allocations.filter((allocation) => {
    const pool = pools.find((entry) => entry.id === allocation.poolId)
    return (
      (kindFilter === "all" || pool?.kind === kindFilter) &&
      matchesSearch(
        labelById(pools, allocation.poolId),
        labelById(products, allocation.productId),
        allocation.allocationMode,
        allocation.priority,
        allocation.quantityRequired,
        rules.find((rule) => rule.id === allocation.availabilityRuleId)?.recurrenceRule,
        startTimes.find((startTime) => startTime.id === allocation.startTimeId)?.label,
      )
    )
  })
  const filteredAssignments = assignments.filter((assignment) => {
    const resource = resources.find((entry) => entry.id === assignment.resourceId)
    return (
      (kindFilter === "all" || resource?.kind === kindFilter) &&
      (assignmentStatusFilter === "all" || assignment.status === assignmentStatusFilter) &&
      matchesSearch(
        assignment.status,
        assignment.assignedBy,
        assignment.notes,
        labelById(resources, assignment.resourceId),
        labelById(bookings, assignment.bookingId),
        formatResourceSlotLabel(
          slotsData.find((slot) => slot.id === assignment.slotId) ?? {
            id: assignment.slotId,
            productId: "",
            dateLocal: assignment.slotId,
            startsAt: assignment.slotId,
          },
          {
            template: m.common.slotLabel,
            formatDate: i18n.formatDate,
            products,
          },
        ),
      )
    )
  })
  const filteredCloseouts = closeouts.filter((closeout) => {
    const resource = resources.find((entry) => entry.id === closeout.resourceId)
    return (
      (kindFilter === "all" || resource?.kind === kindFilter) &&
      matchesSearch(
        labelById(resources, closeout.resourceId),
        closeout.dateLocal,
        closeout.reason,
        closeout.createdBy,
      )
    )
  })

  const liveAssignments = filteredAssignments.filter(
    (assignment) => assignment.status === "reserved" || assignment.status === "assigned",
  )
  const resourcesWithoutSupplier = filteredResources.filter((resource) => !resource.supplierId)
  const unassignedReservations = liveAssignments.filter((assignment) => !assignment.resourceId)
  const activeFilterCount =
    (kindFilter !== "all" ? 1 : 0) +
    (activeFilter !== "all" ? 1 : 0) +
    (supplierFilter !== null ? 1 : 0) +
    (productFilter !== null ? 1 : 0) +
    (assignmentStatusFilter !== "all" ? 1 : 0)
  const hasFilters = search.length > 0 || activeFilterCount > 0

  const clearAllFilters = () => {
    setSearch("")
    setKindFilter("all")
    setActiveFilter("all")
    setSupplierFilter(null)
    setSelectedSupplierOption(null)
    setProductFilter(null)
    setSelectedProductOption(null)
    setAssignmentStatusFilter("all")
  }

  const queries = [
    suppliersQuery,
    productsQuery,
    bookingsQuery,
    slotsQuery,
    rulesQuery,
    startTimesQuery,
    resourcesQuery,
    poolsQuery,
    allocationsQuery,
    assignmentsQuery,
    closeoutsQuery,
  ]
  const isLoading = queries.some((query) => query.isPending)
  const isError = queries.some((query) => query.isError)

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{page.title}</h1>
          <p className="text-sm text-muted-foreground">{page.description}</p>
        </div>
        {slots?.headerEnd}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Label htmlFor="resources-search" className="sr-only">
            {page.filters.searchPlaceholder}
          </Label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="resources-search"
            placeholder={page.filters.searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={kindFilter} onValueChange={(value) => setKindFilter(value ?? "all")}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">{m.common.allKinds}</SelectItem>
              {kindOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
          <PopoverTrigger
            render={
              <Button variant="outline">
                <ListFilter data-icon="inline-start" aria-hidden="true" />
                {page.filters.button}
                {activeFilterCount > 0 ? (
                  <Badge variant="secondary" className="ml-1 px-1.5">
                    {activeFilterCount}
                  </Badge>
                ) : null}
              </Button>
            }
          />
          <PopoverContent
            align="end"
            className="max-h-[75vh] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-4"
          >
            <ResourcesFilterPopover
              activeTab={activeTab}
              suppliers={suppliers}
              products={products}
              supplierFilter={supplierFilter}
              setSupplierFilter={setSupplierFilter}
              selectedSupplierOption={selectedSupplierOption}
              setSelectedSupplierOption={setSelectedSupplierOption}
              productFilter={productFilter}
              setProductFilter={setProductFilter}
              selectedProductOption={selectedProductOption}
              setSelectedProductOption={setSelectedProductOption}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              assignmentStatusFilter={assignmentStatusFilter}
              setAssignmentStatusFilter={setAssignmentStatusFilter}
            />
          </PopoverContent>
        </Popover>

        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={clearAllFilters}>
            <X data-icon="inline-start" aria-hidden="true" />
            {page.filters.clear}
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        (loadingFallback ?? (
          <div className="rounded-md border p-6 text-sm text-muted-foreground">{page.loading}</div>
        ))
      ) : isError ? (
        <div className="rounded-md border p-6 text-sm text-muted-foreground">{page.loadFailed}</div>
      ) : (
        <>
          <ResourcesOverview
            bookings={bookings}
            products={products}
            slots={slotsData}
            closeouts={closeouts}
            filteredResources={filteredResources}
            filteredPools={filteredPools}
            liveAssignments={liveAssignments}
            resourcesWithoutSupplier={resourcesWithoutSupplier}
            unassignedReservations={unassignedReservations}
            search={search}
            setSearch={setSearch}
            kindFilter={kindFilter}
            setKindFilter={setKindFilter}
            hasFilters={hasFilters}
            onClearFilters={clearAllFilters}
            onOpenAssignment={onAssignmentOpen}
            onOpenResource={onResourceOpen}
            showFilters={false}
          />
          {slots?.afterOverview}
          {slots?.beforeTabs}

          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab((value ?? "resources") as ResourcesPageTab)}
          >
            <TabsList className="flex w-full justify-start overflow-x-auto overflow-y-hidden">
              <TabsTrigger value="resources">{page.tabs.resources}</TabsTrigger>
              <TabsTrigger value="pools">{page.tabs.pools}</TabsTrigger>
              <TabsTrigger value="allocations">{page.tabs.allocations}</TabsTrigger>
              <TabsTrigger value="assignments">{page.tabs.assignments}</TabsTrigger>
              <TabsTrigger value="closeouts">{page.tabs.closeouts}</TabsTrigger>
            </TabsList>
            <ResourcesTab
              suppliers={suppliers}
              filteredResources={filteredResources}
              resourceSelection={resourceSelection}
              setResourceSelection={setResourceSelectionState}
              bulkActionTarget={bulkActionTarget}
              handleBulkUpdate={onBulkUpdate}
              handleBulkDelete={onBulkDelete}
              onCreate={onResourceCreate}
              onOpenRoute={onResourceOpen}
              onEdit={(row) => onResourceEdit(row)}
            />
            <PoolsTab
              products={products}
              filteredPools={filteredPools}
              poolSelection={poolSelection}
              setPoolSelection={setPoolSelectionState}
              bulkActionTarget={bulkActionTarget}
              handleBulkUpdate={onBulkUpdate}
              handleBulkDelete={onBulkDelete}
              onCreate={onPoolCreate}
              onOpenRoute={onPoolOpen}
              onEdit={(row) => onPoolEdit(row)}
            />
            <AllocationsTab
              pools={pools}
              products={products}
              filteredAllocations={filteredAllocations}
              allocationSelection={allocationSelection}
              setAllocationSelection={setAllocationSelectionState}
              bulkActionTarget={bulkActionTarget}
              handleBulkDelete={onBulkDelete}
              onCreate={onAllocationCreate}
              onOpenRoute={onAllocationOpen}
              onEdit={(row) => onAllocationEdit(row)}
            />
            <AssignmentsTab
              slots={slotsData}
              products={products}
              resources={resources}
              bookings={bookings}
              filteredAssignments={filteredAssignments}
              assignmentSelection={assignmentSelection}
              setAssignmentSelection={setAssignmentSelectionState}
              bulkActionTarget={bulkActionTarget}
              handleBulkUpdate={onBulkUpdate}
              handleBulkDelete={onBulkDelete}
              onCreate={onAssignmentCreate}
              onOpenRoute={onAssignmentOpen}
              onEdit={(row) => onAssignmentEdit(row)}
            />
            <CloseoutsTab
              resources={resources}
              filteredCloseouts={filteredCloseouts}
              closeoutSelection={closeoutSelection}
              setCloseoutSelection={setCloseoutSelectionState}
              bulkActionTarget={bulkActionTarget}
              handleBulkDelete={onBulkDelete}
              onCreate={onCloseoutCreate}
              onEdit={(row) => onCloseoutEdit(row)}
            />
          </Tabs>
          {slots?.afterTabs}
        </>
      )}
      {slots?.dialogs}
    </div>
  )
}
