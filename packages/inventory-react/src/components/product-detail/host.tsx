"use client"

import type { OperatorAdminMessages } from "@voyant-travel/i18n"
import { createContext, type ReactNode, useContext } from "react"

import type { ProductMediaUploadHandler } from "../product-media-section.js"

/**
 * The product-detail page and its sections are transport- and app-agnostic.
 * The host application injects everything app-specific — localized messages, a
 * REST client, the active locale, navigation, and a media upload handler — via
 * this context so the same page can be mounted by any template.
 */

// The full admin message tree. The sections mostly read `messages.products.*`
// but a few touch sibling namespaces (e.g. `messages.pricing.*`), so we carry
// the whole bundle and let the host pass its `useAdminMessages()` result.
export type ProductDetailMessages = OperatorAdminMessages

export interface ProductDetailApi {
  get: <T = unknown>(path: string) => Promise<T>
  post: <T = unknown>(path: string, body?: unknown) => Promise<T>
  patch: <T = unknown>(path: string, body?: unknown) => Promise<T>
  /**
   * Optional so existing hosts keep compiling. Surfaces that need PUT (the
   * editorial-overlay editor) render read-only when a host omits it.
   */
  put?: <T = unknown>(path: string, body?: unknown) => Promise<T>
  delete: <T = unknown>(path: string) => Promise<T>
}

export interface ProductDetailNavigation {
  toProducts: () => void
  toProduct: (productId: string) => void
  toAvailability: (slotId: string) => void
}

export interface ProductDetailBreadcrumb {
  label: string
  href?: string
}

export interface ProductDetailHostValue {
  messages: ProductDetailMessages
  api: ProductDetailApi
  locale: string
  navigate: ProductDetailNavigation
  uploadMedia?: ProductMediaUploadHandler
  /** Optional app-shell breadcrumb sink (e.g. the operator admin shell). */
  setBreadcrumbs?: (items: ProductDetailBreadcrumb[]) => void
  /**
   * Storefront locales the deployment has configured. The editorial-overlay
   * editor switches among these; falls back to the locales the backend
   * reports when a host does not supply the list.
   */
  configuredLocales?: readonly string[]
  /** Optional extra content rendered under each product option (e.g. an app-specific resource panel). */
  renderOptionExtras?: (productId: string, optionId: string) => ReactNode
}

const ProductDetailHostContext = createContext<ProductDetailHostValue | null>(null)

export function ProductDetailHostProvider({
  value,
  children,
}: {
  value: ProductDetailHostValue
  children: ReactNode
}) {
  return (
    <ProductDetailHostContext.Provider value={value}>{children}</ProductDetailHostContext.Provider>
  )
}

export function useProductDetailHost(): ProductDetailHostValue {
  const context = useContext(ProductDetailHostContext)
  if (!context) {
    throw new Error("useProductDetailHost must be used within a ProductDetailHostProvider")
  }
  return context
}

export function useOptionalProductDetailHost(): ProductDetailHostValue | null {
  return useContext(ProductDetailHostContext)
}

/**
 * Components keep their `messages.products.*` (and occasional sibling-namespace)
 * access verbatim — the only change at the call site is the hook name
 * (`useAdminMessages` → `useProductDetailMessages`).
 */
export type ProductMessagesRoot = ProductDetailMessages

export function useProductDetailMessages(): ProductMessagesRoot {
  return useProductDetailHost().messages
}

export function useProductDetailApi(): ProductDetailApi {
  return useProductDetailHost().api
}

/** The active locale string (BCP-47), e.g. for `toLocaleString`/`Intl`. */
export function useProductLocale(): string {
  return useProductDetailHost().locale
}
