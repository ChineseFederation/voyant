import type { ExtrasUiMessages } from "./messages.js"

export const extrasUiEn = {
  catalogCard: {
    untitled: "Untitled extra",
    unitPrefix: "/ {unit}",
  },
  productCombobox: {
    placeholder: "Search products...",
    loading: "Loading...",
    empty: "No products found.",
    statusLabels: {
      draft: "Draft",
      active: "Active",
      archived: "Archived",
    },
    // Short booking-mode labels, shared vocabulary with the products table and
    // editor picker. Keep in sync with the operator catalog `bookingMode*` keys.
    bookingModeLabels: {
      date: "Day trip",
      date_time: "Timed activity",
      open: "Open-dated voucher",
      stay: "Accommodation",
      transfer: "Transfer",
      itinerary: "Multi-day tour",
      other: "Other",
    },
  },
  slotManifest: {
    title: "Extras manifest",
    emptyExtras: "No extras are configured for this product.",
    emptyTravelers: "No active travelers are assigned to this extra.",
    travelerColumn: "Traveler",
    bookingColumn: "Booking",
    selectedLabel: "Selected",
    selectLabel: "Select",
    cancelLabel: "Cancel",
    collectedLabel: "Collected",
    pendingLabel: "Pending",
    waivedLabel: "Waived",
    notRequiredLabel: "No collection",
    collectionModeLabels: {
      cash_on_trip: "Cash on trip",
      external: "External",
      included: "Included",
      none: "No collection",
      booking_total: "Booking total",
    },
    markCollected: "Mark collected",
    markWaived: "Waive",
    selectAll: "Select all",
    clearAll: "Clear all",
    loading: "Loading extras...",
    summary: {
      heading: "On this departure",
      quantity: "{count} to carry",
      travelers: "{selected} of {eligible} travelers",
      applicability: "Applies: {selectionType}",
      toCollect: "{count} still to collect",
      collectionSettled: "Nothing left to collect",
      fulfilled: "{fulfilled} of {selected} fulfilled",
      fulfillmentComplete: "All fulfilled",
      nobodySelected: "Nobody has taken this yet",
      selectionTypeLabels: {
        optional: "optional",
        required: "required",
        default_selected: "selected by default",
        unavailable: "unavailable",
      },
    },
  },
} satisfies ExtrasUiMessages
