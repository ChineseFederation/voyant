import { useQuery } from "@tanstack/react-query"
import type { AccommodationContent } from "@voyant-travel/accommodations/content-shape"
import type {
  OfferPreviewRequestV1,
  OfferPreviewTargetV1,
} from "@voyant-travel/catalog-contracts/booking-engine/preview-contracts"
import { useOfferPreview } from "@voyant-travel/catalog-react/booking-engine"
import { type ContentResolution, fetchContent } from "@voyant-travel/catalog-react/storefront"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { DatePicker } from "@voyant-travel/ui/components/date-picker"
import { Label } from "@voyant-travel/ui/components/label"
import { useEffect, useMemo, useState } from "react"

import { useStorefrontUi } from "./context.js"
import {
  BackLink,
  BodyMissing,
  BodySkeleton,
  BookingSidebar,
  ContentResolutionHint,
  DetailLayout,
  HeroImage,
  PaxBlock,
} from "./detail-shared.js"

export function AccommodationDetailPage({ entityId }: { entityId: string }): React.ReactElement {
  const { apiUrl, messages, scope } = useStorefrontUi()
  const t = messages.shopDetailAccommodations

  const content = useQuery({
    queryKey: [
      "public-accommodations-content",
      entityId,
      scope.marketId,
      scope.locale,
      scope.currency,
    ],
    queryFn: () =>
      fetchContent<AccommodationContent>(
        `${apiUrl}/v1/public/accommodations/${encodeURIComponent(entityId)}/content`,
        { locale: scope.locale, market: scope.marketId, currency: scope.currency },
      ),
    staleTime: 30_000,
  })

  const today = new Date().toISOString().slice(0, 10)
  const [checkIn, setCheckIn] = useState(today)
  const [checkOut, setCheckOut] = useState(
    new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  )
  const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>(undefined)
  const [selectedRatePlanId, setSelectedRatePlanId] = useState<string | undefined>(undefined)
  const [adultCount, setAdultCount] = useState(2)
  const [childCount, setChildCount] = useState(0)
  const [appliedSelectionKey, setAppliedSelectionKey] = useState<string | null>(null)

  const initialSelection = useMemo(
    () =>
      content.data ? resolveInitialAccommodationSelection(content.data.content, entityId) : null,
    [content.data, entityId],
  )
  const initialSelectionKey = content.data ? `${entityId}:${content.data.content.hotel.id}` : null

  useEffect(() => {
    if (!initialSelectionKey || appliedSelectionKey === initialSelectionKey) return
    setSelectedRoomId(initialSelection?.roomId)
    setSelectedRatePlanId(initialSelection?.ratePlanId)
    setAppliedSelectionKey(initialSelectionKey)
  }, [appliedSelectionKey, initialSelection, initialSelectionKey])

  const ratePlansForRoom = useMemo(() => {
    if (!content.data || !selectedRoomId) return []
    return getAccommodationRatePlansForRoom(content.data.content, selectedRoomId)
  }, [content.data, selectedRoomId])

  useEffect(() => {
    const firstRatePlanId = ratePlansForRoom[0]?.id
    const selectedRatePlanIsCompatible = ratePlansForRoom.some(
      (plan) => plan.id === selectedRatePlanId,
    )
    if (!selectedRoomId || !firstRatePlanId) {
      if (selectedRatePlanId) setSelectedRatePlanId(undefined)
      return
    }
    if (!selectedRatePlanId || !selectedRatePlanIsCompatible) {
      setSelectedRatePlanId(firstRatePlanId)
    }
  }, [ratePlansForRoom, selectedRatePlanId, selectedRoomId])

  // An accommodation is an `owned_entity` target — the preview admits it
  // because a preview is a read; Session creation would not (voyant#4188).
  const previewTarget = useMemo<OfferPreviewTargetV1>(
    () => ({ kind: "owned_entity", entityModule: "accommodations", entityId }),
    [entityId],
  )

  const probeSelection = useMemo<OfferPreviewRequestV1["selection"] | null>(() => {
    if (!selectedRoomId || !selectedRatePlanId || !checkIn || !checkOut) return null
    return {
      configure: {
        dateRange: { checkIn, checkOut },
        pax: { adult: adultCount, child: childCount },
      },
      accommodation: {
        rooms: [
          {
            optionUnitId: selectedRoomId,
            quantity: 1,
            ...(selectedRatePlanId ? { ratePlanId: selectedRatePlanId } : {}),
          },
        ],
        travelerAssignments: {},
      },
    }
  }, [checkIn, checkOut, selectedRoomId, selectedRatePlanId, adultCount, childCount])

  // A price probe, not a booking attempt: this opens no Booking Session.
  const preview = useOfferPreview({
    surface: "public",
    target: previewTarget,
    selection: probeSelection,
    enabled: probeSelection !== null,
    // Honor the selected storefront scope (voyant#2643).
    scope: { market: scope.marketId, locale: scope.locale, currency: scope.currency },
  })
  const totalCents = preview.data?.pricing?.total ?? 0
  const currency = preview.data?.pricing?.currency

  const totalPax = adultCount + childCount
  const datesValid = checkIn && checkOut && new Date(checkOut) > new Date(checkIn)

  // Calendar guards (replacing the old native `min` constraints): check-in can't
  // be in the past, and check-out must be after check-in. Parse date-only strings
  // at local midnight so the matcher doesn't shift a day in negative-offset zones.
  const parseLocalDate = (value: string) => new Date(`${value}T00:00:00`)
  const minCheckInDate = parseLocalDate(today)
  const minCheckOutDate = (() => {
    const base = checkIn ? parseLocalDate(checkIn) : minCheckInDate
    const next = new Date(base)
    next.setDate(next.getDate() + 1)
    return next
  })()
  const bookingSidebar =
    content.isLoading || !content.data ? null : !selectedRoomId ? (
      <AccommodationUnavailableSidebar reason="noRooms" />
    ) : !selectedRatePlanId ? (
      <AccommodationUnavailableSidebar reason="noRatePlan" />
    ) : preview.error ? (
      <AccommodationUnavailableSidebar reason="quoteFailed" />
    ) : (
      <BookingSidebar
        totalPax={totalPax}
        totalCents={totalCents}
        currency={currency}
        isPreviewing={preview.isPreviewing}
        preview={preview.data}
        disabled={
          !datesValid ||
          totalPax < 1 ||
          preview.isPreviewing ||
          !preview.data ||
          preview.data.available === false
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="hp-checkin">{t.checkIn}</Label>
            <DatePicker
              value={checkIn || null}
              onChange={(value) => setCheckIn(value ?? "")}
              dateDisabled={{ before: minCheckInDate }}
              className="w-full"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="hp-checkout">{t.checkOut}</Label>
            <DatePicker
              value={checkOut || null}
              onChange={(value) => setCheckOut(value ?? "")}
              dateDisabled={{ before: minCheckOutDate }}
              className="w-full"
            />
          </div>
        </div>

        <PaxBlock
          adult={adultCount}
          child={childCount}
          infant={0}
          setAdult={setAdultCount}
          setChild={setChildCount}
          setInfant={() => {}}
          showInfants={false}
          // The server's description of what this stay's booking needs, in
          // place of the page's hardcoded guesses.
          bands={preview.data?.requirements.paxBands}
        />
      </BookingSidebar>
    )

  return (
    <DetailLayout
      body={
        content.isLoading ? (
          <BodySkeleton />
        ) : !content.data ? (
          <BodyMissing entityModule="accommodations" entityId={entityId} />
        ) : (
          <AccommodationDetailBody
            content={content.data.content}
            resolution={content.data.resolution}
            selectedRoomId={selectedRoomId}
            onSelectRoom={(id) => {
              setSelectedRoomId(id)
              setSelectedRatePlanId(undefined)
            }}
            selectedRatePlanId={selectedRatePlanId}
            onSelectRatePlan={setSelectedRatePlanId}
            ratePlansForRoom={ratePlansForRoom}
          />
        )
      }
      sidebar={bookingSidebar}
    />
  )
}

type AccommodationSelection = {
  roomId: string
  ratePlanId: string | undefined
}

export function getAccommodationRatePlansForRoom(
  content: AccommodationContent,
  roomId: string,
): ReadonlyArray<AccommodationContent["rate_plans"][number]> {
  return content.rate_plans.filter((plan) => ratePlanAppliesToRoom(plan, roomId))
}

export function resolveInitialAccommodationSelection(
  content: AccommodationContent,
  entityId: string,
): AccommodationSelection | null {
  const roomIds = new Set(content.room_types.map((room) => room.id))
  if (roomIds.has(entityId)) {
    return {
      roomId: entityId,
      ratePlanId: getAccommodationRatePlansForRoom(content, entityId)[0]?.id,
    }
  }

  for (const room of content.room_types) {
    const ratePlanId = getAccommodationRatePlansForRoom(content, room.id)[0]?.id
    if (ratePlanId) return { roomId: room.id, ratePlanId }
  }

  const firstRoomId = content.room_types[0]?.id
  return firstRoomId ? { roomId: firstRoomId, ratePlanId: undefined } : null
}

function ratePlanAppliesToRoom(
  plan: AccommodationContent["rate_plans"][number],
  roomId: string,
): boolean {
  return (
    !plan.applies_to_room_type_ids ||
    plan.applies_to_room_type_ids.length === 0 ||
    plan.applies_to_room_type_ids.includes(roomId)
  )
}

function AccommodationUnavailableSidebar({
  reason,
}: {
  reason: "noRooms" | "noRatePlan" | "quoteFailed"
}): React.ReactElement {
  const t = useStorefrontUi().messages.shopDetailAccommodations
  const body =
    reason === "noRooms"
      ? t.unavailableNoRooms
      : reason === "quoteFailed"
        ? t.unavailableQuoteFailed
        : t.unavailableNoRatePlan
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.unavailableTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-muted-foreground text-sm">
        <p>{body}</p>
        <BackLink />
      </CardContent>
    </Card>
  )
}

function AccommodationDetailBody({
  content,
  resolution,
  selectedRoomId,
  onSelectRoom,
  selectedRatePlanId,
  onSelectRatePlan,
  ratePlansForRoom,
}: {
  content: AccommodationContent
  resolution: ContentResolution | null
  selectedRoomId: string | undefined
  onSelectRoom: (id: string) => void
  selectedRatePlanId: string | undefined
  onSelectRatePlan: (id: string) => void
  ratePlansForRoom: ReadonlyArray<AccommodationContent["rate_plans"][number]>
}): React.ReactElement {
  const t = useStorefrontUi().messages.shopDetailAccommodations
  return (
    <div className="space-y-4">
      {content.hotel.hero_image_url ? (
        <HeroImage url={content.hotel.hero_image_url} alt={content.hotel.name} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            {content.hotel.name}
            {content.hotel.star_rating ? (
              <span className="ml-2 text-amber-500">
                {"★".repeat(Math.floor(content.hotel.star_rating))}
              </span>
            ) : null}
          </CardTitle>
          <ContentResolutionHint resolution={resolution} />
        </CardHeader>
        <CardContent className="space-y-3">
          {content.hotel.description ? (
            <p className="whitespace-pre-line text-muted-foreground text-sm">
              {content.hotel.description}
            </p>
          ) : null}
          <BackLink />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.chooseRoom}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {content.room_types.map((room) => {
            const selected = room.id === selectedRoomId
            return (
              <button
                key={room.id}
                type="button"
                className={`w-full rounded border p-3 text-left ${
                  selected ? "border-primary ring-2 ring-primary" : ""
                }`}
                onClick={() => onSelectRoom(room.id)}
              >
                <div className="font-medium">{room.name}</div>
                {room.description ? (
                  <div className="text-muted-foreground text-xs">{room.description}</div>
                ) : null}
                {room.max_occupancy ? (
                  <div className="text-muted-foreground text-xs">
                    {t.sleepsUpTo.replace("{count}", String(room.max_occupancy))}
                  </div>
                ) : null}
              </button>
            )
          })}
        </CardContent>
      </Card>

      {selectedRoomId && ratePlansForRoom.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.ratePlan}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ratePlansForRoom.map((plan) => {
              const selected = plan.id === selectedRatePlanId
              return (
                <button
                  key={plan.id}
                  type="button"
                  className={`w-full rounded border p-3 text-left ${
                    selected ? "border-primary ring-2 ring-primary" : ""
                  }`}
                  onClick={() => onSelectRatePlan(plan.id)}
                >
                  <div className="font-medium">{plan.name}</div>
                  {plan.description ? (
                    <div className="text-muted-foreground text-xs">{plan.description}</div>
                  ) : null}
                  {plan.cancellation_policy ? (
                    <div className="text-muted-foreground text-xs">
                      {t.cancellation.replace("{policy}", plan.cancellation_policy)}
                    </div>
                  ) : null}
                  {plan.inclusions && plan.inclusions.length > 0 ? (
                    <div className="text-muted-foreground text-xs">
                      {t.includes.replace("{inclusions}", plan.inclusions.join(", "))}
                    </div>
                  ) : null}
                </button>
              )
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
