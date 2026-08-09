import { cn } from "@voyant-travel/ui/lib/utils"
import { useProductsUiMessagesOrDefault } from "../i18n/index.js"
import type { ProductRecord } from "../index.js"
import { ProductList } from "./product-list.js"

export interface ProductsPageProps {
  pageSize?: number
  onProductOpen?: (product: ProductRecord) => void
  onProductOpenId?: (productId: string) => void
  className?: string
}

export function ProductsPage({
  pageSize,
  onProductOpen,
  onProductOpenId,
  className,
}: ProductsPageProps = {}) {
  const productMessages = useProductsUiMessagesOrDefault().productsPage

  return (
    <div data-slot="products-page" className={cn("flex flex-col gap-6", className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{productMessages.title}</h1>
        <p className="text-sm text-muted-foreground">{productMessages.description}</p>
      </div>

      <ProductList
        pageSize={pageSize}
        onSelectProduct={onProductOpen}
        onSelectProductId={onProductOpenId}
      />
    </div>
  )
}
