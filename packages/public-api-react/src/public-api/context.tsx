import {
  type AnchorHTMLAttributes,
  createContext,
  type MouseEvent,
  type ReactNode,
  useContext,
} from "react"

export interface PublicApiUiScope {
  marketId?: string
  locale?: string
  currency?: string
}

type RequiredMessageSet<TKey extends string> = Record<TKey, string> & Record<string, string>

export interface PublicApiUiMessages {
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

export interface PublicApiUiNavigation {
  to: string
  params?: Record<string, string>
  search?: Record<string, unknown>
}

export interface PublicApiUiContextValue {
  apiUrl: string
  messages: PublicApiUiMessages
  navigate: (navigation: PublicApiUiNavigation) => void
  scope: PublicApiUiScope
}

const PublicApiUiContext = createContext<PublicApiUiContextValue | null>(null)

export function PublicApiUiProvider({
  children,
  value,
}: {
  children: ReactNode
  value: PublicApiUiContextValue
}): React.ReactElement {
  return <PublicApiUiContext.Provider value={value}>{children}</PublicApiUiContext.Provider>
}

export function usePublicApiUi(): PublicApiUiContextValue {
  const context = useContext(PublicApiUiContext)
  if (!context) throw new Error("usePublicApiUi must be used within PublicApiUiProvider")
  return context
}

export function PublicApiLink({
  children,
  href,
  params,
  search,
  to,
  ...anchorProps
}: AnchorHTMLAttributes<HTMLAnchorElement> & PublicApiUiNavigation): React.ReactElement {
  const { navigate } = usePublicApiUi()

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
