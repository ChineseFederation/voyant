"use client"

import * as React from "react"

import { useProductsUiI18nOrDefault } from "../../i18n/index.js"
import {
  authoringGroupAnchorId,
  authoringGroupFromHash,
  PRODUCT_AUTHORING_GROUP_IDS,
  type ProductAuthoringGroupId,
} from "./product-authoring-nav.js"

export interface ProductAuthoringNavProps {
  /** Product id, so each group is a shareable contextual deep link. */
  productId: string
}

/**
 * The Product authoring group navigation — seven ordered, deep-linkable groups
 * (Overview & readiness → History). Each item is an anchor to the group's
 * in-page section id, so it works as an on-page jump and as a shareable deep
 * link (`/products/:id#authoring-plan`). The active group is derived from the
 * location hash, with no router dependency.
 */
export function ProductAuthoringNav({ productId }: ProductAuthoringNavProps) {
  const { messages } = useProductsUiI18nOrDefault()
  const nav = messages.productAuthoringNav
  const [active, setActive] = React.useState<ProductAuthoringGroupId | null>(null)

  React.useEffect(() => {
    const sync = () =>
      setActive(authoringGroupFromHash(typeof window === "undefined" ? null : window.location.hash))
    sync()
    if (typeof window === "undefined") return
    window.addEventListener("hashchange", sync)
    return () => window.removeEventListener("hashchange", sync)
  }, [])

  return (
    <nav
      aria-label={nav.label}
      className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-1 overflow-x-auto border-b bg-background/95 px-1 py-2 backdrop-blur"
    >
      {PRODUCT_AUTHORING_GROUP_IDS.map((id) => {
        const anchor = authoringGroupAnchorId(id)
        const isActive = active === id
        return (
          <a
            key={id}
            href={`#${anchor}`}
            aria-current={isActive ? "true" : undefined}
            data-product-id={productId}
            className={
              isActive
                ? "rounded-md bg-secondary px-3 py-1.5 font-medium text-secondary-foreground text-sm"
                : "rounded-md px-3 py-1.5 text-muted-foreground text-sm hover:bg-muted hover:text-foreground"
            }
          >
            {nav.groups[id]}
          </a>
        )
      })}
    </nav>
  )
}
