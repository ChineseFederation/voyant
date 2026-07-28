"use client"

import { useAdminNavigate } from "@voyant-travel/admin"
import { ManualBookingCreateForm } from "../../components/manual-booking-create-form.js"
import { useBookingsUiMessagesOrDefault } from "../../i18n/index.js"

export interface BookingNewPageProps {
  productId?: string
  slotId?: string
}

export default function BookingNewPage({ productId, slotId }: BookingNewPageProps) {
  const navigate = useAdminNavigate()
  const messages = useBookingsUiMessagesOrDefault()
  return (
    <main className="mx-auto flex w-full max-w-screen-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {messages.bookingCreatePage.title}
        </h1>
        <p className="text-sm text-muted-foreground">{messages.bookingCreatePage.description}</p>
      </header>
      <ManualBookingCreateForm
        defaultProductId={productId}
        defaultSlotId={slotId}
        onCancel={() => navigate("booking.list", {})}
        onCreated={(bookingId) => navigate("booking.detail", { bookingId })}
      />
    </main>
  )
}
