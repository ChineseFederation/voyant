import type { ProductRecord } from "@voyant-travel/inventory-react"

export type ProductStatus = ProductRecord["status"]
export type ProductBookingMode = ProductRecord["bookingMode"]

export type ExtrasUiMessages = {
  catalogCard: {
    untitled: string
    unitPrefix: string
  }
  productCombobox: {
    placeholder: string
    loading: string
    empty: string
    statusLabels: Record<ProductStatus, string>
    bookingModeLabels: Record<ProductBookingMode, string>
  }
  slotManifest: {
    title: string
    emptyExtras: string
    emptyTravelers: string
    travelerColumn: string
    bookingColumn: string
    selectedLabel: string
    selectLabel: string
    cancelLabel: string
    collectedLabel: string
    pendingLabel: string
    waivedLabel: string
    notRequiredLabel: string
    collectionModeLabels: Record<
      "cash_on_trip" | "external" | "included" | "none" | "booking_total",
      string
    >
    markCollected: string
    markWaived: string
    selectAll: string
    clearAll: string
    loading: string
    /** Departure-level rollup strip. `{n}`-style placeholders are interpolated. */
    summary: {
      heading: string
      quantity: string
      travelers: string
      applicability: string
      toCollect: string
      collectionSettled: string
      fulfilled: string
      fulfillmentComplete: string
      nobodySelected: string
      selectionTypeLabels: Record<
        "optional" | "required" | "default_selected" | "unavailable",
        string
      >
    }
  }
}
