import { useQuery } from "@tanstack/react-query"
import { Badge, Button, DropdownMenuItem } from "@voyant-travel/ui/components"
import { AlertTriangle, Pencil } from "lucide-react"
import { useProductDetailApi, useProductDetailMessages } from "./host.js"
import { ActionMenu, DetailRow, Section } from "./product-detail-section-shell.js"
import {
  formatProductDuration,
  formatProductSubtype,
  getProductBookingModeLabel,
  type ProductRecord,
} from "./product-detail-shared.js"

type TaxClassSummary = {
  id: string
  label: string
}

type ProductCoreMessages = ReturnType<typeof useProductDetailMessages>["products"]["core"]

function ReviewWarning({
  classification,
  messages,
  onEdit,
}: {
  classification: NonNullable<ProductRecord["classification"]>
  messages: ProductCoreMessages
  onEdit: () => void
}) {
  if (!classification.reviewRequired) return null
  return (
    <div
      data-slot="product-classification-review"
      className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900 text-xs dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <div>
        <div className="font-medium">{messages.reviewNeededTitle}</div>
        <ul className="list-disc pl-4">
          {classification.reviewReasons.includes("missing_family") ? (
            <li>{messages.reviewMissingFamily}</li>
          ) : null}
          {classification.reviewReasons.includes("unresolved_duration") ? (
            <li>{messages.reviewUnresolvedDuration}</li>
          ) : null}
        </ul>
        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onEdit}>
          {messages.reviewClassificationAction}
        </Button>
      </div>
    </div>
  )
}

export function ProductOrganizeSection({
  product,
  onEdit,
}: {
  product: ProductRecord
  onEdit: () => void
}) {
  const api = useProductDetailApi()
  const messages = useProductDetailMessages()
  const productMessages = messages.products.core
  const taxClassQuery = useQuery({
    queryKey: ["tax-class", product.taxClassId],
    enabled: !!product.taxClassId,
    queryFn: () =>
      api.get<{ data: TaxClassSummary }>(`/v1/admin/finance/tax-classes/${product.taxClassId}`),
  })

  const classification = product.classification
  const familyLabel =
    classification?.familyName ?? product.productTypeName ?? classification?.familyCode ?? null
  const subtypeCode = classification?.subtypeCode ?? product.productSubtypeCode ?? null
  const subtypeLabel = subtypeCode ? formatProductSubtype(subtypeCode) : null
  const supplyModel = product.supplyModel

  return (
    <Section
      title={productMessages.organizeTitle}
      actions={
        <ActionMenu label={`${productMessages.organizeTitle}: ${productMessages.edit}`}>
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            {productMessages.edit}
          </DropdownMenuItem>
        </ActionMenu>
      }
    >
      {classification ? (
        <ReviewWarning classification={classification} messages={productMessages} onEdit={onEdit} />
      ) : null}
      <DetailRow
        label={productMessages.tagsLabel}
        value={
          product.tags.length > 0 ? (
            <div className="flex flex-wrap justify-end gap-1">
              {product.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">{productMessages.noValue}</span>
          )
        }
      />
      {/* Merchandising family — independent of booking mode and duration. */}
      <DetailRow
        label={productMessages.familyLabel}
        value={
          familyLabel ? (
            <span>{familyLabel}</span>
          ) : (
            <span className="text-muted-foreground">{productMessages.noValue}</span>
          )
        }
      />
      <DetailRow
        label={productMessages.subtypeLabel}
        value={
          subtypeLabel ? (
            <Badge variant="outline" className="text-xs">
              {subtypeLabel}
            </Badge>
          ) : (
            <span className="text-muted-foreground">{productMessages.noValue}</span>
          )
        }
      />
      <DetailRow
        label={productMessages.durationLabel}
        value={<span>{formatProductDuration(product, productMessages)}</span>}
      />
      {/* The booking mode — the booking mechanic. Previously mislabeled "Type". */}
      <DetailRow
        label={productMessages.bookingModeLabel}
        value={<span>{getProductBookingModeLabel(product.bookingMode, messages)}</span>}
      />
      {/* Supply model — derived from booking mode (ADR-0010). */}
      <DetailRow
        label={productMessages.supplyModelLabel}
        value={
          <span>
            {supplyModel === "dynamic"
              ? productMessages.supplyModelDynamic
              : supplyModel === "scheduled"
                ? productMessages.supplyModelScheduled
                : productMessages.noValue}
          </span>
        }
      />
      <DetailRow
        label={productMessages.taxClassLabel}
        value={
          taxClassQuery.data?.data.label ? (
            <span>{taxClassQuery.data.data.label}</span>
          ) : (
            <span className="text-muted-foreground">{productMessages.taxClassNone}</span>
          )
        }
      />
    </Section>
  )
}
