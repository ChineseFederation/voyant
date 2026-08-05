"use client"

import {
  AdminWidgetSlotRenderer,
  resolveAdminWidgets,
  useAdminExtensions,
  useAdminNavigate,
  useLocale,
} from "@voyant-travel/admin"
import { SupplierDetailPage } from "../components/supplier-detail-page.js"
import type { Supplier, UpdateSupplierInput } from "../index.js"
import { supplierDetailPaymentPolicySlot } from "./slots.js"

/**
 * Render context handed to widget contributions targeting
 * {@link supplierDetailPaymentPolicySlot}. Mirrors the canonical page's
 * `renderCustomerPaymentPolicy` args: the supplier plus the page-owned
 * update mutation so contributed cards persist without re-deriving it.
 */
export interface SupplierDetailHostSlotContext {
  supplier: Supplier
  updateSupplier: (input: UpdateSupplierInput) => Promise<Supplier>
  isUpdating: boolean
}

export interface SupplierDetailHostProps {
  id: string
}

/**
 * Packaged admin host for the canonical `SupplierDetailPage` (packaged-admin
 * RFC Phase 3). Owns everything package-clean:
 *
 *   - Cross-route links resolve through semantic destinations (RFC §4.7):
 *     back/deleted navigate to `"supplier.list"` — no host route tree import.
 *   - Locale comes from the admin chrome (`useLocale`).
 *   - The customer-payment-policy section mounts through
 *     {@link supplierDetailPaymentPolicySlot} whenever a widget contribution
 *     targets it (finance-ui contributes its card there).
 */
export function SupplierDetailHost({ id }: SupplierDetailHostProps) {
  const { resolvedLocale } = useLocale()
  const navigateTo = useAdminNavigate()
  // Finance (or any extension that may not be imported by this package)
  // contributes the payment-policy card as widget contributions; the section
  // renders only when at least one widget targets the slot.
  const adminExtensions = useAdminExtensions()
  const hasPaymentPolicyWidgets =
    resolveAdminWidgets({ slot: supplierDetailPaymentPolicySlot, extensions: adminExtensions })
      .length > 0

  return (
    <SupplierDetailPage
      id={id}
      locale={resolvedLocale}
      onBack={() => navigateTo("supplier.list", {})}
      onDeleted={() => navigateTo("supplier.list", {})}
      renderCustomerPaymentPolicy={
        hasPaymentPolicyWidgets
          ? (context) => (
              <AdminWidgetSlotRenderer
                slot={supplierDetailPaymentPolicySlot}
                props={{ ...context }}
              />
            )
          : undefined
      }
    />
  )
}
