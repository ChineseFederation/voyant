"use client"

import {
  createLocaleFormatters,
  createPackageMessagesContext,
  type LocaleMessageDefinitions,
  type PackageI18nValue,
} from "@voyant-travel/i18n"
import type { ReactNode } from "react"

/**
 * Customer-facing messages shared by storefront routes and standalone public
 * pages. Applications select the locale and pass it to the provider.
 *
 * Romanian strings follow the codebase convention of ASCII (no diacritics),
 * matching the operator admin message files.
 */

const fallbackLocale = "en"

export const storefrontMessagesEn = {
  layout: {
    brand: "Voyant Storefront",
    account: "Account",
    signIn: "Sign in",
  },
  scope: {
    market: "Market",
    currency: "Currency",
    language: "Language",
    selectMarket: "Select market",
  },
  pay: {
    missingIdentifierTitle: "Payment link missing identifier",
    missingIdentifierBody:
      "The link you followed didn't include a payment reference. Please contact your travel agent for a fresh link.",
    lookingUp: "Looking up your payment…",
    notFoundTitle: "Payment link not found",
    notFoundBody:
      "This payment link is invalid or has been removed. Please contact your travel agent for a fresh link.",
    retryFailed: "Couldn't create a fresh payment link.",
  },
  proposal: {
    unavailableTitle: "Proposal unavailable",
    noLongerAvailable: "This proposal is no longer available.",
    notFound: "Proposal not found",
    declineFailed: "Could not decline proposal",
    acceptFailed: "Could not accept proposal",
    requestEditsFailed: "Could not send edit request",
    requestFailed: "Request failed",
    operatorFallbackName: "Your travel specialist",
    operatorContactFallback: "Travel specialist",
    metricTotal: "Total",
    validUntil: "Valid until",
    statusLabel: "Status",
    colItem: "Item",
    colQty: "Qty",
    colPrice: "Price",
    colTotal: "Total",
    noLines: "No proposal lines",
    subtotal: "Subtotal",
    tax: "Tax",
    accept: "Accept",
    accepting: "Accepting...",
    decline: "Decline",
    declining: "Declining...",
    requestEdits: "Request edits",
    requestingEdits: "Sending...",
    requestEditsMessageLabel: "Message to your travel specialist",
    requestEditsPlaceholder: "Tell us what you would like changed — or, if you are declining, why.",
    requestEditsSent: "Your edit request was sent.",
    declineConfirm: "Decline this proposal?",
    notSet: "Not set",
    acceptUnavailable:
      "This proposal isn't ready to accept online yet. Send a message or contact your travel specialist and they'll finish it for you.",
    paymentTermsHeading: "Payment terms",
    paymentTermsDepositDue: "{amount} due on acceptance",
    paymentTermsBalanceDue: "{amount} due {days} days before departure",
    paymentTermsBalanceOnAcceptance: "{amount} balance due on acceptance",
    paymentTermsFullOnAcceptance: "{amount} due in full on acceptance",
    statuses: {
      draft: "Draft",
      sent: "Sent",
      accepted: "Accepted",
      declined: "Declined",
      expired: "Expired",
    },
  },
  shop: {
    heading: "Browse travel",
    intro: "Explore the products and departures currently published by the operator.",
    buildTrip: "Build a trip",
    searchPlaceholder: "Search products, tours, stays…",
    verticalProducts: "Tours & products",
    verticalCruises: "Cruises",
    verticalAccommodations: "Stays",
    verticalCharters: "Charters",
    unavailableTitle: "Catalog search isn't configured",
    unavailableBody: "The catalog search provider is unavailable. Please try again later.",
    viewAndBook: "View details",
    nonBookableTitle: "Not available for online booking",
    nonBookableBody:
      "{vertical} are not available for online booking yet. Contact the operator to plan this request.",
    percentOff: "{percent}% off",
    amountOff: "{amount} off",
    emptyPrefix: "No",
    emptyMatch: "match",
    emptyYourFilters: "your filters",
    emptySuffix: "Try a broader query or a different vertical.",
  },
  shopDetailShared: {
    priceFrom: "from {amount}",
    pricePending: "Pending",
    bookThis: "Book this",
    guestSingular: "guest",
    guestPlural: "guests",
    subtotal: "Subtotal",
    book: "Book",
    noChargeYet: "You won't be charged yet. The next step collects traveler details.",
    departure: "Departure",
    departuresUnavailable: "Departures unavailable.",
    noUpcomingDepartures: "No upcoming departures.",
    travelers: "Travelers",
    adults: "Adults",
    adultsHint: "12 yrs+",
    children: "Children",
    childrenHint: "2–11 yrs",
    infants: "Infants",
    infantsHint: "under 2",
    servedIn: "Served in {locale}",
    machineTranslated: "Machine-translated",
    limitedContent: "Limited content available",
    refreshing: "Refreshing in the background",
    backToAll: "← Back to all",
    slotLeft: "left",
    nightsShort: "{count}n",
    daysShort: "{count}d",
    detailUnavailable: "Detail content isn't available for this item yet.",
    unavailableTargetNotFound: "This item is no longer available. Choose another.",
    unavailableTargetNotBookable: "This item can't be booked online right now.",
    unavailablePriceUnavailable:
      "No price for the chosen dates and travelers. Try a different selection.",
    unavailablePolicyUnavailable: "Booking terms couldn't be confirmed for this selection.",
    unavailableSelectionUnavailable: "This selection isn't available. Try changing your choices.",
  },
  shopDetailAccommodations: {
    checkIn: "Check-in",
    checkOut: "Check-out",
    chooseRoom: "Choose a room",
    sleepsUpTo: "Sleeps up to {count}",
    ratePlan: "Rate plan",
    cancellation: "Cancellation: {policy}",
    includes: "Includes: {inclusions}",
    unavailableTitle: "Stay unavailable",
    unavailableNoRooms:
      "This stay can't be booked online right now because no rooms are available.",
    unavailableNoRatePlan:
      "This room can't be booked online right now because no compatible rate plan is available.",
    unavailableQuoteFailed:
      "This stay can't be booked online right now because pricing couldn't be confirmed.",
  },
  shopDetailCruises: {
    occupancy: "Occupancy",
    guestsInCabin: "Guests in cabin",
    perPaxPricing: "Per-pax pricing",
    aboard: "Aboard",
    nights: "{count} nights",
    chooseSailing: "Choose a sailing",
    colDate: "Date",
    colRoute: "Route",
    colNights: "Nights",
    colStatus: "Status",
    soldOut: "Sold out",
    available: "Available",
    chooseCabin: "Choose a cabin",
    pricingPerGuest:
      "Pricing is per guest at occupancy {occupancy}; the sidebar total reflects the cabin charge.",
    guestsCount: "{count} guests",
    decksCount: "{count} decks",
    builtYear: "Built {year}",
    deckPlan: "Deck plan",
    openDeckPlan: "Open deck plan",
    deckLabel: "Deck {level}: {name}",
    wheelchairAccessible: "Wheelchair accessible",
    sleeps: "Sleeps {count}",
    grades: "Grades {codes}",
    floorPlan: "Floor plan",
  },
  shopDetailProducts: {
    highlights: "Highlights",
    itinerary: "Itinerary",
    day: "Day {number}",
    gallery: "Gallery",
    policies: "Policies",
  },
  confirmation: {
    bankTransferTitle: "Reservation pending bank transfer",
    bankTransferIntro:
      "Your reservation is held while we wait for your payment to land. Use the details below when you initiate the bank transfer — please include the reference exactly so we can match the payment to your booking.",
    bookingReference: "Booking reference",
    proformaNumber: "Proforma number",
    beneficiary: "Beneficiary",
    bank: "Bank",
    iban: "IBAN",
    reference: "Reference",
    amount: "Amount",
    dueBy: "Due by",
    bankTransferEmailed:
      "Your bank-transfer instructions were also emailed to you. Check your inbox.",
    bankTransferFollowUp:
      "Once we receive the payment we'll generate your final invoice and contract automatically and email them through.",
    paymentNotCompletedTitle: "Payment not completed",
    paymentNotCompletedBody:
      "The card processor did not confirm this payment. If money left your account, contact us with the booking reference so we can reconcile it.",
    processingTitle: "Processing your payment",
    processingBody:
      "We're waiting for the card processor to confirm your payment. This page will update once we hear back — usually within a minute. You can also close this tab; we'll email you the contract and invoice once the booking is confirmed.",
    confirmedTitle: "Thank you — your booking is confirmed",
    paymentReceived: "Payment received:",
    confirmedFollowUp:
      "We'll email your contract and invoice shortly. You can safely close this tab.",
    inquiryTitle: "Inquiry received",
    inquiryBody:
      "Thanks — we've got your details and will reach out with availability and a quote.",
    referenceLabel: "Reference:",
    holdTitle: "Booking on hold",
    holdBody:
      "We've placed a hold on your reservation. Our team will reach out to confirm the next steps.",
    defaultTitle: "Booking confirmed",
    defaultBody:
      "We've placed a hold on your reservation. You'll receive a confirmation email shortly with the next steps.",
    backToStorefront: "Back to storefront",
  },
  composer: {
    gateTitle: "Sign in to build a trip",
    gateBody:
      "The trip composer saves a working draft against your account, so you need to be signed in before you can start one. Browsing remains open to everyone.",
    gateSignIn: "Sign in to continue",
    gateBrowse: "Back to browsing",
  },
}

export type StorefrontMessages = typeof storefrontMessagesEn

export const storefrontMessagesRo: StorefrontMessages = {
  layout: {
    brand: "Magazin Voyant",
    account: "Cont",
    signIn: "Autentificare",
  },
  scope: {
    market: "Piata",
    currency: "Moneda",
    language: "Limba",
    selectMarket: "Alege piata",
  },
  pay: {
    missingIdentifierTitle: "Linkul de plata nu contine un identificator",
    missingIdentifierBody:
      "Linkul accesat nu continea o referinta de plata. Contacteaza agentul tau de turism pentru un link nou.",
    lookingUp: "Cautam plata ta…",
    notFoundTitle: "Linkul de plata nu a fost gasit",
    notFoundBody:
      "Acest link de plata este invalid sau a fost eliminat. Contacteaza agentul tau de turism pentru un link nou.",
    retryFailed: "Nu am putut crea un link de plata nou.",
  },
  proposal: {
    unavailableTitle: "Oferta indisponibila",
    noLongerAvailable: "Aceasta oferta nu mai este disponibila.",
    notFound: "Oferta negasita",
    declineFailed: "Nu am putut respinge oferta",
    acceptFailed: "Nu am putut accepta oferta",
    requestEditsFailed: "Nu am putut trimite cererea de editare",
    requestFailed: "Cererea a esuat",
    operatorFallbackName: "Specialistul tau de turism",
    operatorContactFallback: "Specialist de turism",
    metricTotal: "Total",
    validUntil: "Valabil pana la",
    statusLabel: "Status",
    colItem: "Articol",
    colQty: "Cant.",
    colPrice: "Pret",
    colTotal: "Total",
    noLines: "Nicio linie in oferta",
    subtotal: "Subtotal",
    tax: "Taxe",
    accept: "Accepta",
    accepting: "Se accepta...",
    decline: "Respinge",
    declining: "Se respinge...",
    requestEdits: "Cere editari",
    requestingEdits: "Se trimite...",
    requestEditsMessageLabel: "Mesaj pentru specialistul tau de turism",
    requestEditsPlaceholder: "Spune-ne ce ai vrea modificat sau, daca respingi, de ce.",
    requestEditsSent: "Cererea de editare a fost trimisa.",
    declineConfirm: "Respingi aceasta oferta?",
    notSet: "Nestabilit",
    acceptUnavailable:
      "Aceasta oferta nu poate fi acceptata online inca. Trimite un mesaj sau contacteaza specialistul tau de turism si o va finaliza.",
    paymentTermsHeading: "Conditii de plata",
    paymentTermsDepositDue: "{amount} la acceptare",
    paymentTermsBalanceDue: "{amount} cu {days} zile inainte de plecare",
    paymentTermsBalanceOnAcceptance: "{amount} diferenta, la acceptare",
    paymentTermsFullOnAcceptance: "{amount} integral, la acceptare",
    statuses: {
      draft: "Ciorna",
      sent: "Trimisa",
      accepted: "Acceptata",
      declined: "Respinsa",
      expired: "Expirata",
    },
  },
  shop: {
    heading: "Exploreaza calatorii",
    intro: "Descopera produsele si plecarile publicate in prezent de operator.",
    buildTrip: "Construieste o calatorie",
    searchPlaceholder: "Cauta produse, tururi, sejururi…",
    verticalProducts: "Tururi si produse",
    verticalCruises: "Croaziere",
    verticalAccommodations: "Sejururi",
    verticalCharters: "Charter",
    unavailableTitle: "Cautarea in catalog nu este configurata",
    unavailableBody:
      "Furnizorul de cautare in catalog nu este disponibil. Incearca din nou mai tarziu.",
    viewAndBook: "Vezi detalii",
    nonBookableTitle: "Indisponibil pentru rezervare online",
    nonBookableBody:
      "{vertical} nu este disponibil pentru rezervare online inca. Contacteaza operatorul pentru a planifica aceasta cerere.",
    percentOff: "{percent}% reducere",
    amountOff: "{amount} reducere",
    emptyPrefix: "Niciun",
    emptyMatch: "nu corespunde",
    emptyYourFilters: "filtrelor tale",
    emptySuffix: "Incearca o cautare mai larga sau alta categorie.",
  },
  shopDetailShared: {
    priceFrom: "de la {amount}",
    pricePending: "In asteptare",
    bookThis: "Rezerva acest produs",
    guestSingular: "oaspete",
    guestPlural: "oaspeti",
    subtotal: "Subtotal",
    book: "Rezerva",
    noChargeYet: "Nu vei fi taxat inca. Pasul urmator colecteaza detaliile calatorilor.",
    departure: "Plecare",
    departuresUnavailable: "Plecari indisponibile.",
    noUpcomingDepartures: "Nicio plecare in viitor.",
    travelers: "Calatori",
    adults: "Adulti",
    adultsHint: "12 ani+",
    children: "Copii",
    childrenHint: "2–11 ani",
    infants: "Bebelusi",
    infantsHint: "sub 2 ani",
    servedIn: "Servit in {locale}",
    machineTranslated: "Tradus automat",
    limitedContent: "Continut limitat disponibil",
    refreshing: "Se reimprospateaza in fundal",
    backToAll: "← Inapoi la toate",
    slotLeft: "ramase",
    nightsShort: "{count}n",
    daysShort: "{count}z",
    detailUnavailable: "Continutul detaliat nu este inca disponibil pentru acest produs.",
    unavailableTargetNotFound: "Acest produs nu mai este disponibil. Alege altul.",
    unavailableTargetNotBookable: "Acest produs nu poate fi rezervat online acum.",
    unavailablePriceUnavailable:
      "Niciun pret pentru datele si calatorii alesi. Incearca o alta selectie.",
    unavailablePolicyUnavailable:
      "Conditiile de rezervare nu au putut fi confirmate pentru aceasta selectie.",
    unavailableSelectionUnavailable:
      "Aceasta selectie nu este disponibila. Incearca sa schimbi optiunile.",
  },
  shopDetailAccommodations: {
    checkIn: "Check-in",
    checkOut: "Check-out",
    chooseRoom: "Alege o camera",
    sleepsUpTo: "Dormeste pana la {count}",
    ratePlan: "Plan tarifar",
    cancellation: "Anulare: {policy}",
    includes: "Include: {inclusions}",
    unavailableTitle: "Sejur indisponibil",
    unavailableNoRooms:
      "Acest sejur nu poate fi rezervat online acum deoarece nu exista camere disponibile.",
    unavailableNoRatePlan:
      "Aceasta camera nu poate fi rezervata online acum deoarece nu exista un plan tarifar compatibil.",
    unavailableQuoteFailed:
      "Acest sejur nu poate fi rezervat online acum deoarece pretul nu a putut fi confirmat.",
  },
  shopDetailCruises: {
    occupancy: "Ocupare",
    guestsInCabin: "Oaspeti in cabina",
    perPaxPricing: "Pret per persoana",
    aboard: "La bord",
    nights: "{count} nopti",
    chooseSailing: "Alege o navigare",
    colDate: "Data",
    colRoute: "Ruta",
    colNights: "Nopti",
    colStatus: "Status",
    soldOut: "Epuizat",
    available: "Disponibil",
    chooseCabin: "Alege o cabina",
    pricingPerGuest:
      "Pretul este per oaspete la ocuparea {occupancy}; totalul din bara laterala reflecta tariful cabinei.",
    guestsCount: "{count} oaspeti",
    decksCount: "{count} punti",
    builtYear: "Construit {year}",
    deckPlan: "Plan punte",
    openDeckPlan: "Deschide planul puntii",
    deckLabel: "Puntea {level}: {name}",
    wheelchairAccessible: "Accesibil cu scaun cu rotile",
    sleeps: "Dormeste {count}",
    grades: "Categorii {codes}",
    floorPlan: "Plan etaj",
  },
  shopDetailProducts: {
    highlights: "Puncte forte",
    itinerary: "Itinerar",
    day: "Ziua {number}",
    gallery: "Galerie",
    policies: "Politici",
  },
  confirmation: {
    bankTransferTitle: "Rezervare in asteptarea transferului bancar",
    bankTransferIntro:
      "Rezervarea ta este pastrata cat timp asteptam plata. Foloseste detaliile de mai jos cand initiezi transferul bancar — te rugam sa incluzi referinta exact pentru a putea asocia plata cu rezervarea ta.",
    bookingReference: "Referinta rezervare",
    proformaNumber: "Numar proforma",
    beneficiary: "Beneficiar",
    bank: "Banca",
    iban: "IBAN",
    reference: "Referinta",
    amount: "Suma",
    dueBy: "Scadent la",
    bankTransferEmailed:
      "Instructiunile de transfer bancar ti-au fost trimise si pe email. Verifica-ti inbox-ul.",
    bankTransferFollowUp:
      "Dupa ce primim plata vom genera automat factura finala si contractul si ti le vom trimite pe email.",
    paymentNotCompletedTitle: "Plata nu a fost finalizata",
    paymentNotCompletedBody:
      "Procesatorul de carduri nu a confirmat aceasta plata. Daca ti s-au retras bani din cont, contacteaza-ne cu referinta rezervarii pentru a o reconcilia.",
    processingTitle: "Se proceseaza plata ta",
    processingBody:
      "Asteptam ca procesatorul de carduri sa confirme plata ta. Aceasta pagina se va actualiza dupa ce primim raspuns — de obicei intr-un minut. Poti inchide si aceasta fila; iti vom trimite pe email contractul si factura dupa ce rezervarea este confirmata.",
    confirmedTitle: "Multumim — rezervarea ta este confirmata",
    paymentReceived: "Plata primita:",
    confirmedFollowUp:
      "Iti vom trimite pe email contractul si factura in scurt timp. Poti inchide aceasta fila.",
    inquiryTitle: "Cerere primita",
    inquiryBody:
      "Multumim — am primit detaliile tale si te vom contacta cu disponibilitate si o oferta.",
    referenceLabel: "Referinta:",
    holdTitle: "Rezervare in asteptare",
    holdBody:
      "Am pastrat o rezervare pentru tine. Echipa noastra te va contacta pentru a confirma pasii urmatori.",
    defaultTitle: "Rezervare confirmata",
    defaultBody:
      "Am pastrat o rezervare pentru tine. Vei primi in scurt timp un email de confirmare cu pasii urmatori.",
    backToStorefront: "Inapoi la magazin",
  },
  composer: {
    gateTitle: "Autentifica-te pentru a construi o calatorie",
    gateBody:
      "Compozitorul de calatorie salveaza o ciorna de lucru in contul tau, asa ca trebuie sa fii autentificat inainte de a incepe. Navigarea ramane deschisa tuturor.",
    gateSignIn: "Autentifica-te pentru a continua",
    gateBrowse: "Inapoi la navigare",
  },
}

const storefrontMessageDefinitions = {
  en: storefrontMessagesEn,
  ro: storefrontMessagesRo,
} satisfies LocaleMessageDefinitions<StorefrontMessages>

const storefrontContext = createPackageMessagesContext<StorefrontMessages>("StorefrontMessages")

const defaultStorefrontI18n: PackageI18nValue<StorefrontMessages> = {
  messages: storefrontMessagesEn,
  ...createLocaleFormatters(fallbackLocale),
}

/**
 * Supplies storefront messages without coupling the package to an app locale
 * provider.
 */
export function StorefrontMessagesProvider({
  children,
  locale = fallbackLocale,
}: {
  children: ReactNode
  locale?: string
}) {
  return (
    <storefrontContext.ResolvedMessagesProvider
      definitions={storefrontMessageDefinitions}
      fallbackLocale={fallbackLocale}
      locale={locale}
    >
      {children}
    </storefrontContext.ResolvedMessagesProvider>
  )
}

export const useStorefrontMessages = storefrontContext.useMessages

export function useStorefrontMessagesOrDefault(): StorefrontMessages {
  return storefrontContext.useOptionalI18n()?.messages ?? defaultStorefrontI18n.messages
}
