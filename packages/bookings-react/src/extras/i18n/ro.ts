import type { ExtrasUiMessages } from "./messages.js"

export const extrasUiRo = {
  catalogCard: {
    untitled: "Extra fara nume",
    unitPrefix: "/ {unit}",
  },
  productCombobox: {
    placeholder: "Cauta produse...",
    loading: "Se incarca...",
    empty: "Nu s-au gasit produse.",
    statusLabels: {
      draft: "Ciorna",
      active: "Activ",
      archived: "Arhivat",
    },
    // Etichete scurte, vocabular comun cu tabelul de produse si selectorul din
    // editor. Sincronizeaza cu cheile `bookingMode*` din catalogul operatorului.
    bookingModeLabels: {
      date: "Excursie de o zi",
      date_time: "Activitate cu oră",
      open: "Voucher cu dată deschisă",
      stay: "Cazare",
      transfer: "Transfer",
      itinerary: "Tur de mai multe zile",
      other: "Altul",
    },
  },
  slotManifest: {
    title: "Manifest extra",
    emptyExtras: "Nu exista extra configurate pentru acest produs.",
    emptyTravelers: "Nu exista calatori activi alocati acestui extra.",
    travelerColumn: "Calator",
    bookingColumn: "Rezervare",
    selectedLabel: "Selectat",
    selectLabel: "Selecteaza",
    cancelLabel: "Anuleaza",
    collectedLabel: "Incasat",
    pendingLabel: "In asteptare",
    waivedLabel: "Renuntat",
    notRequiredLabel: "Fara incasare",
    collectionModeLabels: {
      cash_on_trip: "Cash in excursie",
      external: "Extern",
      included: "Inclus",
      none: "Fara incasare",
      booking_total: "Total rezervare",
    },
    markCollected: "Marcheaza incasat",
    markWaived: "Renunta",
    selectAll: "Selecteaza tot",
    clearAll: "Sterge tot",
    loading: "Se incarca extra...",
    summary: {
      heading: "Pe aceasta plecare",
      quantity: "{count} de dus",
      travelers: "{selected} din {eligible} calatori",
      applicability: "Se aplica: {selectionType}",
      toCollect: "{count} de incasat",
      collectionSettled: "Nu mai e nimic de incasat",
      fulfilled: "{fulfilled} din {selected} onorate",
      fulfillmentComplete: "Toate onorate",
      nobodySelected: "Nimeni nu l-a luat inca",
      selectionTypeLabels: {
        optional: "optional",
        required: "obligatoriu",
        default_selected: "selectat implicit",
        unavailable: "indisponibil",
      },
    },
  },
} satisfies ExtrasUiMessages
