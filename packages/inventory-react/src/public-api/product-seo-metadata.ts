import type { ProductContent } from "@voyant-travel/inventory/content-shape"
import { useEffect } from "react"

export interface ProductSeoMetadata {
  title: string
  description: string | null
  openGraphImage: {
    url: string
    width: number | null
    height: number | null
    type: string | null
    alt: string | null
  } | null
}

export function resolveProductSeoMetadata(content: ProductContent): ProductSeoMetadata {
  const imageUrl = content.product.open_graph_image_url ?? content.product.hero_image_url ?? null
  return {
    title: content.product.seo_title ?? content.product.name,
    description: content.product.seo_description ?? content.product.description ?? null,
    openGraphImage: imageUrl
      ? {
          url: imageUrl,
          width: content.product.open_graph_image_width ?? null,
          height: content.product.open_graph_image_height ?? null,
          type: content.product.open_graph_image_type ?? null,
          alt: content.product.open_graph_image_alt ?? content.product.name,
        }
      : null,
  }
}

type MetaIdentity = { attribute: "name" | "property"; value: string }

function manageMeta(identity: MetaIdentity, content: string | number | null): () => void {
  if (content === null) return () => undefined

  const selector = `meta[${identity.attribute}="${identity.value}"]`
  const existing = document.head.querySelector<HTMLMetaElement>(selector)
  const element = existing ?? document.createElement("meta")
  const previousContent = existing?.getAttribute("content") ?? null
  const managedContent = String(content)

  if (!existing) {
    element.setAttribute(identity.attribute, identity.value)
    document.head.append(element)
  }
  element.setAttribute("content", managedContent)

  return () => {
    // The storefront host may update this tag while the product page is
    // mounted. Only undo the value we installed, never newer host-owned state.
    if (element.getAttribute("content") !== managedContent) return
    if (!existing) {
      element.remove()
    } else if (previousContent === null) {
      element.removeAttribute("content")
    } else {
      element.setAttribute("content", previousContent)
    }
  }
}

export function ProductSeoHead({ content }: { content: ProductContent | null }): null {
  useEffect(() => {
    if (!content || typeof document === "undefined") return

    const metadata = resolveProductSeoMetadata(content)
    const previousTitle = document.title
    document.title = metadata.title

    const image = metadata.openGraphImage
    const cleanups = [
      manageMeta({ attribute: "name", value: "description" }, metadata.description),
      manageMeta({ attribute: "property", value: "og:title" }, metadata.title),
      manageMeta({ attribute: "property", value: "og:description" }, metadata.description),
      manageMeta({ attribute: "property", value: "og:image" }, image?.url ?? null),
      manageMeta({ attribute: "property", value: "og:image:width" }, image?.width ?? null),
      manageMeta({ attribute: "property", value: "og:image:height" }, image?.height ?? null),
      manageMeta({ attribute: "property", value: "og:image:type" }, image?.type ?? null),
      manageMeta({ attribute: "property", value: "og:image:alt" }, image?.alt ?? null),
      manageMeta({ attribute: "name", value: "twitter:card" }, "summary_large_image"),
      manageMeta({ attribute: "name", value: "twitter:title" }, metadata.title),
      manageMeta({ attribute: "name", value: "twitter:description" }, metadata.description),
      manageMeta({ attribute: "name", value: "twitter:image" }, image?.url ?? null),
    ]

    return () => {
      for (const cleanup of cleanups.reverse()) cleanup()
      if (document.title === metadata.title) document.title = previousTitle
    }
  }, [content])

  return null
}
