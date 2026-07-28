import { Badge, Button, DropdownMenuItem } from "@voyant-travel/ui/components"
import { Copy, Pencil, ReceiptText, Trash2 } from "lucide-react"
import { useEffect } from "react"
import { useProductDetailHost, useProductDetailMessages } from "./host.js"

import { ActionMenu } from "./product-detail-sections.js"
import type { ProductRecord } from "./product-detail-shared.js"
import { getProductStatusLabel, statusVariant } from "./product-detail-shared.js"

export interface ProductDetailHeaderProps {
  product: ProductRecord
  isDuplicating: boolean
  isDeleting: boolean
  onEdit: () => void
  onBookingCreate?: () => void
  onDuplicate: () => void
  onDelete: () => void
}

export function ProductDetailHeader({
  product,
  isDuplicating,
  isDeleting,
  onEdit,
  onBookingCreate,
  onDuplicate,
  onDelete,
}: ProductDetailHeaderProps) {
  const messages = useProductDetailMessages()
  const productMessages = messages.products.core
  const { setBreadcrumbs } = useProductDetailHost()
  useEffect(() => {
    setBreadcrumbs?.([
      { label: productMessages.breadcrumbProducts, href: "/products" },
      { label: product.name },
    ])
  }, [setBreadcrumbs, productMessages.breadcrumbProducts, product.name])
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{product.name}</h1>
        <Badge variant={statusVariant[product.status] ?? "secondary"}>
          {getProductStatusLabel(product.status, messages)}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onBookingCreate ? (
          <Button size="sm" onClick={onBookingCreate}>
            <ReceiptText data-icon="inline-start" aria-hidden="true" />
            {productMessages.addBooking}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          {productMessages.edit}
        </Button>
        <ActionMenu label={`${productMessages.pageTitle}: ${product.name}`}>
          <DropdownMenuItem disabled={isDuplicating} onClick={onDuplicate}>
            <Copy className="h-4 w-4" />
            {productMessages.duplicate}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" disabled={isDeleting} onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
            {productMessages.delete}
          </DropdownMenuItem>
        </ActionMenu>
      </div>
    </div>
  )
}
