// agent-quality: file-size exception -- owner: inventory-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
"use client"

import { confirmDialog } from "@voyant-travel/ui/components"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@voyant-travel/ui/components/card"
import { cn } from "@voyant-travel/ui/lib/utils"
import { ArrowLeft, Edit, FileText, Loader2, ReceiptText, Trash2 } from "lucide-react"
import * as React from "react"
import { useProductsUiI18nOrDefault, useProductsUiMessagesOrDefault } from "../i18n/provider.js"
import { type ProductRecord, useProduct, useProductMutation } from "../index.js"
import { ProductActionLedgerCard } from "./product-action-ledger-card.js"
import { ProductDialog } from "./product-dialog.js"
import {
  ProductItinerarySection,
  type ProductItinerarySectionProps,
} from "./product-itinerary-section.js"
import { ProductMediaSection, type ProductMediaSectionProps } from "./product-media-section.js"
import {
  ProductOptionsSection,
  type ProductOptionsSectionProps,
} from "./product-options-section.js"
import { ProductTranslationsCard } from "./product-translations-card.js"
import { ProductVersionsSection } from "./product-versions-section.js"

export interface ProductDetailPageSlots {
  header?: React.ReactNode
  afterHeader?: React.ReactNode
  overviewStart?: React.ReactNode
  overviewEnd?: React.ReactNode
  sidebar?: React.ReactNode
  mediaEnd?: React.ReactNode
  itineraryEnd?: React.ReactNode
  optionsEnd?: React.ReactNode
  versionsEnd?: React.ReactNode
}

export interface ProductDetailPageProps {
  id: string
  className?: string
  onBack?: () => void
  onBookingCreate?: (product: ProductRecord) => void
  onDeleted?: () => void
  uploadMedia?: ProductMediaSectionProps["uploadMedia"]
  renderOptionDetails?: ProductOptionsSectionProps["renderOptionDetails"]
  renderItineraryDayDetails?: ProductItinerarySectionProps["renderDayDetails"]
  renderItineraryServiceActions?: ProductItinerarySectionProps["renderServiceActions"]
  renderSupplierServiceField?: ProductItinerarySectionProps["renderSupplierServiceField"]
  onSupplierServiceSelected?: ProductItinerarySectionProps["onSupplierServiceSelected"]
  slots?: ProductDetailPageSlots
}

export function ProductDetailPage({
  id,
  className,
  onBack,
  onBookingCreate,
  onDeleted,
  uploadMedia,
  renderOptionDetails,
  renderItineraryDayDetails,
  renderItineraryServiceActions,
  renderSupplierServiceField,
  onSupplierServiceSelected,
  slots,
}: ProductDetailPageProps) {
  const messages = useProductsUiMessagesOrDefault()
  const pageMessages = messages.productDetailPage
  const productQuery = useProduct(id)
  const { remove } = useProductMutation()
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  if (productQuery.isPending) {
    return <ProductDetailPageLoading className={className} />
  }

  if (productQuery.isError) {
    return (
      <ProductDetailPageState
        className={className}
        title={pageMessages.states.loadFailed}
        description={productQuery.error instanceof Error ? productQuery.error.message : undefined}
        onBack={onBack}
      />
    )
  }

  const product = productQuery.data
  if (!product) {
    return (
      <ProductDetailPageState
        className={className}
        title={pageMessages.states.notFoundTitle}
        description={pageMessages.states.notFoundDescription}
        onBack={onBack}
      />
    )
  }

  const handleDelete = async () => {
    setDeleteError(null)
    if (
      !(await confirmDialog({
        description: pageMessages.states.deleteConfirm.replace("{name}", product.name),
        destructive: true,
      }))
    )
      return

    try {
      await remove.mutateAsync(product.id)
      onDeleted?.()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : pageMessages.states.deleteFailed)
    }
  }

  return (
    <div data-slot="product-detail-page" className={cn("flex flex-col gap-6", className)}>
      <ProductDetailHeader
        product={product}
        onBack={onBack}
        onEdit={() => setEditOpen(true)}
        onDelete={() => void handleDelete()}
        onBookingCreate={onBookingCreate ? () => onBookingCreate(product) : undefined}
        deleting={remove.isPending}
        actionsSlot={slots?.header}
      />

      {deleteError ? <p className="text-sm text-destructive">{deleteError}</p> : null}
      {slots?.afterHeader}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          {slots?.overviewStart}
          <ProductOverviewCard product={product} />
          <ProductInclusionsCard product={product} />
          <ProductExclusionsCard product={product} />
          <ProductTermsCard product={product} />
          <ProductTranslationsCard product={product} />
          <ProductCommercialCard product={product} />
          {slots?.overviewEnd}

          <ProductMediaSection productId={product.id} uploadMedia={uploadMedia} />
          {slots?.mediaEnd}

          <ProductItinerarySection
            productId={product.id}
            renderDayDetails={renderItineraryDayDetails}
            renderServiceActions={renderItineraryServiceActions}
            renderSupplierServiceField={renderSupplierServiceField}
            onSupplierServiceSelected={onSupplierServiceSelected}
          />
          {slots?.itineraryEnd}

          <ProductOptionsSection productId={product.id} renderOptionDetails={renderOptionDetails} />
          {slots?.optionsEnd}

          <ProductVersionsSection productId={product.id} />
          {slots?.versionsEnd}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <ProductDetailSidebar product={product} />
          <ProductActionLedgerCard productId={product.id} />
          {slots?.sidebar}
        </div>
      </div>

      <ProductDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        product={product}
        onSuccess={() => setEditOpen(false)}
      />
    </div>
  )
}

export interface ProductDetailHeaderProps {
  product: ProductRecord
  onBack?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onBookingCreate?: () => void
  deleting?: boolean
  actionsSlot?: React.ReactNode
  className?: string
}

export function ProductDetailHeader({
  product,
  onBack,
  onEdit,
  onDelete,
  onBookingCreate,
  deleting = false,
  actionsSlot,
  className,
}: ProductDetailHeaderProps) {
  const messages = useProductsUiMessagesOrDefault()

  return (
    <div
      data-slot="product-detail-header"
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}
    >
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          {onBack ? (
            <Button type="button" variant="ghost" size="icon-sm" onClick={onBack}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              <span className="sr-only">{messages.productDetailPage.actions.back}</span>
            </Button>
          ) : null}
          <Badge
            variant={
              product.status === "active"
                ? "default"
                : product.status === "archived"
                  ? "secondary"
                  : "outline"
            }
          >
            {messages.common.productStatusLabels[product.status]}
          </Badge>
          <Badge variant="outline">
            {messages.common.productBookingModeLabels[product.bookingMode]}
          </Badge>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{product.id}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {actionsSlot}
        {onBookingCreate ? (
          <Button type="button" variant="outline" onClick={onBookingCreate}>
            <ReceiptText className="mr-2 size-4" aria-hidden="true" />
            {messages.productDetailPage.actions.createBooking}
          </Button>
        ) : null}
        {onEdit ? (
          <Button type="button" variant="outline" onClick={onEdit}>
            <Edit className="mr-2 size-4" aria-hidden="true" />
            {messages.productDetailPage.actions.edit}
          </Button>
        ) : null}
        {onDelete ? (
          <Button type="button" variant="destructive" disabled={deleting} onClick={onDelete}>
            {deleting ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="mr-2 size-4" aria-hidden="true" />
            )}
            {messages.productDetailPage.actions.delete}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export interface ProductOverviewCardProps {
  product: ProductRecord
  className?: string
}

export function ProductOverviewCard({ product, className }: ProductOverviewCardProps) {
  const messages = useProductsUiMessagesOrDefault()
  const pageMessages = messages.productDetailPage

  return (
    <Card data-slot="product-overview-card" className={className}>
      <CardHeader>
        <CardTitle>{pageMessages.sections.overview.title}</CardTitle>
        <CardDescription>{pageMessages.sections.overview.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
          {product.description || pageMessages.states.noDescription}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <ProductField label={pageMessages.fields.capacityMode} value={product.capacityMode} />
          <ProductField label={pageMessages.fields.timezone} value={product.timezone} />
          <ProductField label={pageMessages.fields.productType} value={product.productTypeId} />
          <ProductField label={pageMessages.fields.facility} value={product.facilityId} />
          <ProductField
            label={pageMessages.fields.contractTemplate}
            value={product.contractTemplateId}
          />
          <ProductField label={pageMessages.fields.taxClass} value={product.taxClassId} />
          <ProductField label={pageMessages.fields.startDate} value={product.startDate} />
          <ProductField label={pageMessages.fields.endDate} value={product.endDate} />
        </div>
      </CardContent>
    </Card>
  )
}

export function ProductInclusionsCard({ product, className }: ProductOverviewCardProps) {
  const messages = useProductsUiMessagesOrDefault()
  const pageMessages = messages.productDetailPage
  const html = product.inclusionsHtml?.trim()

  return (
    <Card data-slot="product-inclusions-card" className={className}>
      <CardHeader>
        <CardTitle>{pageMessages.sections.inclusions.title}</CardTitle>
        <CardDescription>{pageMessages.sections.inclusions.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {html ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: operator-authored rich text from the products module -- owner: inventory-react; existing suppression is intentional pending typed cleanup.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{pageMessages.states.noInclusions}</p>
        )}
      </CardContent>
    </Card>
  )
}

export function ProductExclusionsCard({ product, className }: ProductOverviewCardProps) {
  const messages = useProductsUiMessagesOrDefault()
  const pageMessages = messages.productDetailPage
  const html = product.exclusionsHtml?.trim()

  return (
    <Card data-slot="product-exclusions-card" className={className}>
      <CardHeader>
        <CardTitle>{pageMessages.sections.exclusions.title}</CardTitle>
        <CardDescription>{pageMessages.sections.exclusions.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {html ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: operator-authored rich text from the products module -- owner: inventory-react; existing suppression is intentional pending typed cleanup.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{pageMessages.states.noExclusions}</p>
        )}
      </CardContent>
    </Card>
  )
}

export function ProductTermsCard({ product, className }: ProductOverviewCardProps) {
  const messages = useProductsUiMessagesOrDefault()
  const pageMessages = messages.productDetailPage
  const html = product.termsHtml?.trim()

  return (
    <Card data-slot="product-terms-card" className={className}>
      <CardHeader>
        <CardTitle>{pageMessages.sections.terms.title}</CardTitle>
        <CardDescription>{pageMessages.sections.terms.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {html ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: operator-authored rich text from the products module -- owner: inventory-react; existing suppression is intentional pending typed cleanup.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{pageMessages.states.noTerms}</p>
        )}
      </CardContent>
    </Card>
  )
}

export function ProductCommercialCard({ product, className }: ProductOverviewCardProps) {
  const messages = useProductsUiMessagesOrDefault()
  const pageMessages = messages.productDetailPage
  const { formatCurrency, formatNumber } = useProductsUiI18nOrDefault()

  return (
    <Card data-slot="product-commercial-card" className={className}>
      <CardHeader>
        <CardTitle>{pageMessages.sections.commercial.title}</CardTitle>
        <CardDescription>{pageMessages.sections.commercial.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <ProductField
          label={pageMessages.fields.sellAmount}
          value={formatMoney(product.sellAmountCents, product.sellCurrency, formatCurrency)}
        />
        <ProductField
          label={pageMessages.fields.costAmount}
          value={formatMoney(product.costAmountCents, product.sellCurrency, formatCurrency)}
        />
        <ProductField
          label={pageMessages.fields.margin}
          value={product.marginPercent == null ? null : `${formatNumber(product.marginPercent)}%`}
        />
        <ProductField
          label={pageMessages.fields.pax}
          value={product.pax == null ? null : formatNumber(product.pax)}
        />
        <ProductField
          label={pageMessages.fields.reservationTimeout}
          value={
            product.reservationTimeoutMinutes == null
              ? null
              : pageMessages.states.minutes.replace(
                  "{count}",
                  formatNumber(product.reservationTimeoutMinutes),
                )
          }
        />
      </CardContent>
    </Card>
  )
}

export interface ProductDetailSidebarProps {
  product: ProductRecord
  className?: string
}

export function ProductDetailSidebar({ product, className }: ProductDetailSidebarProps) {
  const messages = useProductsUiMessagesOrDefault()
  const pageMessages = messages.productDetailPage
  const { formatDateTime } = useProductsUiI18nOrDefault()

  return (
    <Card data-slot="product-detail-sidebar" className={className}>
      <CardHeader>
        <CardTitle>{pageMessages.sections.sidebar.title}</CardTitle>
        <CardDescription>{pageMessages.sections.sidebar.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge>{messages.common.productStatusLabels[product.status]}</Badge>
          <Badge variant="outline">
            {messages.common.productBookingModeLabels[product.bookingMode]}
          </Badge>
        </div>
        <ProductField label={pageMessages.fields.tags} value={product.tags.join(", ")} />
        <ProductField
          label={pageMessages.fields.createdAt}
          value={formatDateTime(product.createdAt)}
        />
        <ProductField
          label={pageMessages.fields.updatedAt}
          value={formatDateTime(product.updatedAt)}
        />
      </CardContent>
    </Card>
  )
}

function ProductDetailPageLoading({ className }: { className?: string }) {
  const messages = useProductsUiMessagesOrDefault()

  return (
    <div
      data-slot="product-detail-page-loading"
      className={cn("flex min-h-48 items-center justify-center p-6", className)}
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {messages.productDetailPage.states.loading}
      </div>
    </div>
  )
}

function ProductDetailPageState({
  className,
  title,
  description,
  onBack,
}: {
  className?: string
  title: string
  description?: string
  onBack?: () => void
}) {
  const messages = useProductsUiMessagesOrDefault()

  return (
    <div data-slot="product-detail-page-state" className={cn("flex flex-col gap-4", className)}>
      {onBack ? (
        <Button type="button" variant="ghost" className="w-fit" onClick={onBack}>
          <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
          {messages.productDetailPage.actions.back}
        </Button>
      ) : null}
      <Card>
        <CardContent className="flex min-h-40 flex-col items-center justify-center gap-2 text-center">
          <FileText className="size-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}

function ProductField({ label, value }: { label: string; value: React.ReactNode }) {
  const messages = useProductsUiMessagesOrDefault()
  const hasValue =
    value !== null &&
    value !== undefined &&
    !(typeof value === "string" && value.trim().length === 0)

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
      <div className="break-words text-sm">{hasValue ? value : messages.common.none}</div>
    </div>
  )
}

function formatMoney(
  amountCents: number | null,
  currency: string,
  formatCurrency: (value: number, currency: string) => string,
) {
  return amountCents == null ? null : formatCurrency(amountCents / 100, currency)
}
