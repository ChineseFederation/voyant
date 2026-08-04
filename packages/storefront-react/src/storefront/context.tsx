import {
  type AnchorHTMLAttributes,
  createContext,
  type MouseEvent,
  type ReactNode,
  useContext,
} from "react"

export interface StorefrontUiScope {
  marketId?: string
  locale?: string
  currency?: string
}

type RequiredMessageSet<TKey extends string> = Record<TKey, string> & Record<string, string>

export interface StorefrontUiMessages {
  shop: RequiredMessageSet<
    | "amountOff"
    | "buildTrip"
    | "emptyMatch"
    | "emptyPrefix"
    | "emptySuffix"
    | "emptyYourFilters"
    | "heading"
    | "intro"
    | "percentOff"
    | "searchPlaceholder"
    | "unavailableBody"
    | "unavailableTitle"
    | "verticalAccommodations"
    | "verticalProducts"
    | "viewAndBook"
  >
  shopDetailShared: RequiredMessageSet<
    | "adults"
    | "adultsHint"
    | "backToAll"
    | "book"
    | "bookThis"
    | "children"
    | "childrenHint"
    | "daysShort"
    | "departure"
    | "departuresUnavailable"
    | "detailUnavailable"
    | "guestPlural"
    | "guestSingular"
    | "infants"
    | "infantsHint"
    | "limitedContent"
    | "machineTranslated"
    | "nightsShort"
    | "noChargeYet"
    | "noUpcomingDepartures"
    | "priceFrom"
    | "pricePending"
    | "refreshing"
    | "servedIn"
    | "slotLeft"
    | "subtotal"
    | "travelers"
    | "unavailablePolicyUnavailable"
    | "unavailablePriceUnavailable"
    | "unavailableSelectionUnavailable"
    | "unavailableTargetNotBookable"
    | "unavailableTargetNotFound"
  >
  shopDetailProducts: RequiredMessageSet<
    "day" | "gallery" | "highlights" | "itinerary" | "policies"
  >
  shopDetailAccommodations: RequiredMessageSet<
    | "cancellation"
    | "checkIn"
    | "checkOut"
    | "chooseRoom"
    | "includes"
    | "ratePlan"
    | "sleepsUpTo"
    | "unavailableNoRatePlan"
    | "unavailableNoRooms"
    | "unavailableQuoteFailed"
    | "unavailableTitle"
  >
  shopDetailCruises: RequiredMessageSet<
    | "aboard"
    | "available"
    | "builtYear"
    | "chooseCabin"
    | "chooseSailing"
    | "colDate"
    | "colNights"
    | "colRoute"
    | "colStatus"
    | "deckLabel"
    | "deckPlan"
    | "decksCount"
    | "floorPlan"
    | "grades"
    | "guestsCount"
    | "guestsInCabin"
    | "nights"
    | "occupancy"
    | "openDeckPlan"
    | "perPaxPricing"
    | "pricingPerGuest"
    | "sleeps"
    | "soldOut"
    | "wheelchairAccessible"
  >
}

export interface StorefrontUiNavigation {
  to: string
  params?: Record<string, string>
  search?: Record<string, unknown>
}

export interface StorefrontUiContextValue {
  apiUrl: string
  messages: StorefrontUiMessages
  navigate: (navigation: StorefrontUiNavigation) => void
  scope: StorefrontUiScope
}

const StorefrontUiContext = createContext<StorefrontUiContextValue | null>(null)

export function StorefrontUiProvider({
  children,
  value,
}: {
  children: ReactNode
  value: StorefrontUiContextValue
}): React.ReactElement {
  return <StorefrontUiContext.Provider value={value}>{children}</StorefrontUiContext.Provider>
}

export function useStorefrontUi(): StorefrontUiContextValue {
  const context = useContext(StorefrontUiContext)
  if (!context) throw new Error("useStorefrontUi must be used within StorefrontUiProvider")
  return context
}

export function StorefrontLink({
  children,
  href,
  params,
  search,
  to,
  ...anchorProps
}: AnchorHTMLAttributes<HTMLAnchorElement> & StorefrontUiNavigation): React.ReactElement {
  const { navigate } = useStorefrontUi()

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    anchorProps.onClick?.(event)
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }
    event.preventDefault()
    navigate({ to, params, search })
  }

  return (
    <a {...anchorProps} href={href ?? to} onClick={onClick}>
      {children}
    </a>
  )
}
