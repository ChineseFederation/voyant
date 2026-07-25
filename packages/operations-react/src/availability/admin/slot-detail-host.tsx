"use client"

import { useQuery } from "@tanstack/react-query"
import {
  useAdminBreadcrumbs,
  useAdminHref,
  useAdminNavigate,
  useOperatorAdminMessages,
} from "@voyant-travel/admin"
import {
  SlotExtrasManifestPanel,
  useExtrasUiMessagesOrDefault,
} from "@voyant-travel/bookings-react/extras"
import { ProductQuickViewSheet } from "@voyant-travel/inventory-react/ui"
import { lazy, Suspense, useState } from "react"
import { SlotAllocationPage } from "../allocation/index.js"
import { AvailabilitySlotDialog } from "../components/availability-dialogs.js"
import {
  AvailabilitySlotDetailPage,
  getAvailabilitySlotDetailQueryOptions,
  getAvailabilitySlotProductQueryOptions,
} from "../components/availability-slot-detail-page.js"
import {
  type CreateAvailabilitySlotInput,
  type UpdateAvailabilitySlotInput,
  useAvailabilitySlotMutation,
  useRules,
  useStartTimes,
  useVoyantAvailabilityContext,
} from "../index.js"

const BookingQuickViewSheet = lazy(() =>
  import("@voyant-travel/bookings-react/components/booking-quick-view-sheet").then((module) => ({
    default: module.BookingQuickViewSheet,
  })),
)

export interface AvailabilitySlotDetailHostProps {
  /** The availability slot id (route param, bound by the host route file). */
  slotId: string
}

/**
 * Packaged admin host for the availability slot detail page (packaged-admin
 * RFC Phase 3). Owns everything package-clean:
 *
 *   - Data wiring through the shared availability provider context
 *     (`useVoyantAvailabilityContext`) — the workspace shell mounts
 *     `VoyantAvailabilityProvider`, so no per-route provider or app env
 *     helper is needed.
 *   - Admin chrome breadcrumbs (`useAdminBreadcrumbs`).
 *   - Cross-route links resolve through semantic destinations (RFC §4.7):
 *     `availabilitySlot.list`, `availabilityStartTime.detail`,
 *     `booking.detail`, `product.detail` — no host route tree import.
 *   - The cross-domain composition the operator route previously assembled:
 *     the Allocation tab (`@voyant-travel/operations-react/availability/allocation`), the Extras manifest tab
 *     (`@voyant-travel/bookings-react/extras`), the booking create/quick-view sheets
 *     (`@voyant-travel/bookings-react/ui`, lazy) and the product quick-view sheet
 *     (`@voyant-travel/inventory-react/ui`).
 *   - The slot edit dialog, submitting through the package mutation
 *     (`useAvailabilitySlotMutation`) instead of an app RPC client.
 *
 * The SSR prefetch loader stays in the host route file (it runs outside the
 * React tree with the app's cookie-forwarding fetcher).
 */
export function AvailabilitySlotDetailHost({ slotId }: AvailabilitySlotDetailHostProps) {
  const messages = useOperatorAdminMessages()
  const extrasMessages = useExtrasUiMessagesOrDefault()
  const resolveHref = useAdminHref()
  const navigateTo = useAdminNavigate()
  const client = useVoyantAvailabilityContext()
  const slotMutation = useAvailabilitySlotMutation()
  const slotQuery = useQuery(getAvailabilitySlotDetailQueryOptions(client, slotId))
  const slot = slotQuery.data?.data
  const productQuery = useQuery({
    ...getAvailabilitySlotProductQueryOptions(client, slot?.productId ?? null),
    enabled: Boolean(slot?.productId),
  })
  const productName = productQuery.data?.data?.name ?? null
  const [bookingPreviewId, setBookingPreviewId] = useState<string | null>(null)
  const [productPreviewId, setProductPreviewId] = useState<string | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  // Lazy-load rules + start times only when the edit dialog opens —
  // the slot detail view itself doesn't need them. Scope to the slot's
  // product so the dialog only suggests recurring rules / start times
  // that already belong to this product.
  const rulesQuery = useRules({ productId: slot?.productId, enabled: editDialogOpen })
  const startTimesQuery = useStartTimes({
    productId: slot?.productId,
    enabled: editDialogOpen,
  })

  useAdminBreadcrumbs([
    { label: messages.availability.title, href: resolveHref("availabilitySlot.list", {}) },
    ...(slot
      ? [
          {
            label: productName ? `${productName} · ${slot.dateLocal}` : `Slot · ${slot.dateLocal}`,
          },
        ]
      : []),
  ])

  return (
    <>
      <AvailabilitySlotDetailPage
        id={slotId}
        onBack={() => navigateTo("availabilitySlot.list", {})}
        onDeleted={() => navigateTo("availabilitySlot.list", {})}
        onOpenProduct={(productId) => setProductPreviewId(productId)}
        onOpenStartTime={(startTimeId) =>
          navigateTo("availabilityStartTime.detail", { startTimeId })
        }
        onEdit={() => setEditDialogOpen(true)}
        renderAllocation={({ slotId: allocationSlotId }) => (
          <SlotAllocationPage
            slotId={allocationSlotId}
            embed
            onBookingOpen={(bookingId) => setBookingPreviewId(bookingId)}
          />
        )}
        renderExtras={({ slotId: extrasSlotId }) => (
          <SlotExtrasManifestPanel slotId={extrasSlotId} />
        )}
        extrasTabLabel={extrasMessages.slotManifest.title}
      />

      <Suspense fallback={null}>
        <BookingQuickViewSheet
          bookingId={bookingPreviewId}
          open={bookingPreviewId !== null}
          onOpenChange={(open) => {
            if (!open) setBookingPreviewId(null)
          }}
          onViewFull={(booking) => {
            setBookingPreviewId(null)
            navigateTo("booking.detail", { bookingId: booking.id })
          }}
        />
      </Suspense>

      <ProductQuickViewSheet
        productId={productPreviewId}
        open={productPreviewId !== null}
        onOpenChange={(open) => {
          if (!open) setProductPreviewId(null)
        }}
        onViewFull={(product) => {
          setProductPreviewId(null)
          navigateTo("product.detail", { productId: product.id })
        }}
      />

      {slot && productQuery.data?.data ? (
        <AvailabilitySlotDialog
          messages={messages.availability}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          slot={slot}
          products={[productQuery.data.data]}
          rules={rulesQuery.data?.data ?? []}
          startTimes={startTimesQuery.data?.data ?? []}
          onSubmit={async (payload, context) => {
            if (context.isEditing) {
              if (!context.id) throw new Error("Slot edit requires an id.")
              await slotMutation.update.mutateAsync({
                id: context.id,
                input: payload as UpdateAvailabilitySlotInput,
              })
              return
            }
            await slotMutation.create.mutateAsync(payload as CreateAvailabilitySlotInput)
          }}
          onSuccess={() => {
            setEditDialogOpen(false)
            void slotQuery.refetch()
          }}
        />
      ) : null}
    </>
  )
}
