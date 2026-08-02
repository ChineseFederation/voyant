"use client"

import { useOperatorAdminMessages as useAdminMessages } from "@voyant-travel/admin"
import { type Draft, setAccommodation, setAddons } from "@voyant-travel/bookings-react/journey"
import type { BookingDraftShape } from "@voyant-travel/catalog-contracts/booking-engine/draft-shape"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { Minus, Plus } from "lucide-react"

export function CatalogComponentOptions({
  draft,
  shape,
  onDraftChange,
}: {
  draft: Draft | null
  shape: BookingDraftShape
  onDraftChange(draft: Draft): void
}) {
  if (!draft) return null
  const hasAccommodation =
    shape.showsAccommodation &&
    ((shape.accommodation?.roomOptions?.length ?? 0) > 0 ||
      (shape.accommodation?.subSteps?.length ?? 0) > 0)
  const productOptionStep = shape.configureSubSteps?.find((step) => step.kind === "product-option")
  const hasAddons =
    shape.showsAddons &&
    ((shape.addons?.catalog?.length ?? 0) > 0 || (shape.addons?.groups?.length ?? 0) > 0)
  if (!productOptionStep && !hasAccommodation && !hasAddons) return null
  return (
    <div className="flex flex-col gap-4 border-t pt-4">
      {productOptionStep ? (
        <CatalogProductOptionOptions
          draft={draft}
          options={productOptionStep.options}
          onDraftChange={onDraftChange}
        />
      ) : null}
      {hasAccommodation ? (
        <CatalogAccommodationOptions draft={draft} shape={shape} onDraftChange={onDraftChange} />
      ) : null}
      {hasAddons ? (
        <CatalogExtrasOptions draft={draft} shape={shape} onDraftChange={onDraftChange} />
      ) : null}
    </div>
  )
}

function CatalogProductOptionOptions({
  draft,
  options,
  onDraftChange,
}: {
  draft: Draft
  options: ReadonlyArray<{
    id: string
    code?: string | null
    name: string
    description?: string | null
    isDefault?: boolean
    units?: ReadonlyArray<{
      id: string
      name: string
      description?: string | null
      unitType?: string | null
      minQuantity?: number | null
      maxQuantity?: number | null
    }>
  }>
  onDraftChange(draft: Draft): void
}) {
  const t = useAdminMessages().trips.adminComposer.panels
  const selections = draft.configure.optionSelections ?? []
  if (options.length === 0) return null
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h4 className="font-medium text-sm">{t.optionsHeading}</h4>
        <p className="text-muted-foreground text-xs">{t.optionsHint}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const unit = option.units?.[0]
          const selected = selections.find((selection) => selection.optionId === option.id)
          const quantity = selected?.quantity ?? 0
          const maxQuantity = unit?.maxQuantity ?? 99
          return (
            <div
              key={option.id}
              className={`rounded-md border p-3 text-left text-sm transition-colors ${
                quantity > 0 ? "border-primary bg-primary/10" : "bg-background"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{option.name}</span>
                    {option.code ? (
                      <span className="text-muted-foreground text-xs uppercase">{option.code}</span>
                    ) : null}
                    {option.isDefault ? <Badge variant="secondary">{t.defaultOption}</Badge> : null}
                  </span>
                  {option.description ? (
                    <span className="mt-1 block text-muted-foreground text-xs">
                      {option.description}
                    </span>
                  ) : null}
                  {unit ? (
                    <span className="mt-1 block text-muted-foreground text-xs">{unit.name}</span>
                  ) : null}
                </span>
                <QuantityStepper
                  value={quantity}
                  onDecrement={() => {
                    const nextQuantity = Math.max(0, quantity - 1)
                    onDraftChange(setDraftOptionQuantity(draft, option, unit ?? null, nextQuantity))
                  }}
                  onIncrement={() => {
                    const nextQuantity = Math.min(maxQuantity, quantity + 1)
                    onDraftChange(setDraftOptionQuantity(draft, option, unit ?? null, nextQuantity))
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function setDraftOptionQuantity(
  draft: Draft,
  option: {
    id: string
    name: string
  },
  unit: {
    id: string
    name: string
  } | null,
  quantity: number,
): Draft {
  const existingSelections = draft.configure.optionSelections ?? []
  const nextSelections = existingSelections.filter((selection) => selection.optionId !== option.id)
  if (quantity > 0) {
    nextSelections.push({
      optionId: option.id,
      optionName: option.name,
      ...(unit ? { optionUnitId: unit.id, optionUnitName: unit.name } : {}),
      quantity,
    })
  }
  const firstSelection = nextSelections[0]
  return {
    ...draft,
    configure: {
      ...draft.configure,
      variantId: firstSelection?.optionId,
      optionSelections: nextSelections,
    },
  }
}

function CatalogAccommodationOptions({
  draft,
  shape,
  onDraftChange,
}: {
  draft: Draft
  shape: BookingDraftShape
  onDraftChange(draft: Draft): void
}) {
  const t = useAdminMessages().trips.adminComposer.panels
  const rooms = shape.accommodation?.roomOptions ?? []
  const accommodation = draft.accommodation ?? { rooms: [], travelerAssignments: {} }
  if (rooms.length === 0) return null
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h4 className="font-medium text-sm">{t.roomsHeading}</h4>
        <p className="text-muted-foreground text-xs">{t.roomsHint}</p>
      </div>
      <div className="flex flex-col gap-2">
        {rooms.map((room) => {
          const current = accommodation.rooms.find((entry) => entry.optionUnitId === room.id)
          const ratePlans = room.ratePlans ?? []
          const quantity = current?.quantity ?? 0
          return (
            <div key={room.id} className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{room.name}</div>
                  {room.description ? (
                    <p className="text-muted-foreground text-xs">{room.description}</p>
                  ) : null}
                </div>
                <QuantityStepper
                  value={quantity}
                  onDecrement={() => {
                    const nextRooms = accommodation.rooms.filter(
                      (entry) => entry.optionUnitId !== room.id,
                    )
                    const nextQuantity = quantity - 1
                    if (nextQuantity > 0) {
                      nextRooms.push({
                        optionUnitId: room.id,
                        quantity: nextQuantity,
                        ratePlanId: current?.ratePlanId,
                      })
                    }
                    onDraftChange(setAccommodation(draft, { ...accommodation, rooms: nextRooms }))
                  }}
                  onIncrement={() => {
                    const nextRooms = accommodation.rooms.filter(
                      (entry) => entry.optionUnitId !== room.id,
                    )
                    const ratePlanId =
                      current?.ratePlanId ?? (ratePlans.length === 1 ? ratePlans[0]?.id : undefined)
                    nextRooms.push({ optionUnitId: room.id, quantity: quantity + 1, ratePlanId })
                    onDraftChange(setAccommodation(draft, { ...accommodation, rooms: nextRooms }))
                  }}
                />
              </div>
              {quantity > 0 && ratePlans.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {ratePlans.map((plan) => {
                    const selected = current?.ratePlanId === plan.id
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => {
                          const nextRooms = accommodation.rooms.map((entry) =>
                            entry.optionUnitId === room.id
                              ? { ...entry, ratePlanId: plan.id }
                              : entry,
                          )
                          onDraftChange(
                            setAccommodation(draft, { ...accommodation, rooms: nextRooms }),
                          )
                        }}
                        className={`rounded-md border p-3 text-left text-sm transition-colors ${
                          selected ? "border-primary bg-primary/10" : "bg-background"
                        }`}
                      >
                        <span className="font-medium">{plan.name}</span>
                        {plan.description ? (
                          <span className="mt-1 block text-muted-foreground text-xs">
                            {plan.description}
                          </span>
                        ) : null}
                        {plan.inclusions && plan.inclusions.length > 0 ? (
                          <span className="mt-1 block text-muted-foreground text-xs">
                            Includes {plan.inclusions.join(", ")}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CatalogExtrasOptions({
  draft,
  shape,
  onDraftChange,
}: {
  draft: Draft
  shape: BookingDraftShape
  onDraftChange(draft: Draft): void
}) {
  const t = useAdminMessages().trips.adminComposer.panels
  const flat = shape.addons?.catalog ?? []
  const groups = shape.addons?.groups ?? []
  const hasGroupedExtras = groups.some((group) => group.items.length > 0)
  if (flat.length === 0 && !hasGroupedExtras) return null
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h4 className="font-medium text-sm">{t.optionsAndExtras}</h4>
        <p className="text-muted-foreground text-xs">{t.optionsAndExtrasHint}</p>
      </div>
      <div className="flex flex-col gap-3">
        {groups.map((group) =>
          group.items.length > 0 ? (
            <div key={group.label} className="flex flex-col gap-2">
              <div className="text-muted-foreground text-xs uppercase">{group.label}</div>
              {group.items.map((item) => (
                <CatalogExtraRow
                  key={item.id}
                  draft={draft}
                  item={item}
                  onDraftChange={onDraftChange}
                />
              ))}
            </div>
          ) : null,
        )}
        {flat.map((item) => (
          <CatalogExtraRow key={item.id} draft={draft} item={item} onDraftChange={onDraftChange} />
        ))}
      </div>
    </div>
  )
}

function CatalogExtraRow({
  draft,
  item,
  onDraftChange,
}: {
  draft: Draft
  item: { id: string; name: string; description?: string | null }
  onDraftChange(draft: Draft): void
}) {
  const current = draft.addons.find((entry) => entry.extraId === item.id)
  const quantity = current?.quantity ?? 0
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 p-3">
      <div className="min-w-0">
        <div className="font-medium text-sm">{item.name}</div>
        {item.description ? (
          <p className="text-muted-foreground text-xs">{item.description}</p>
        ) : null}
      </div>
      <QuantityStepper
        value={quantity}
        onDecrement={() => {
          const nextAddons = draft.addons.filter((entry) => entry.extraId !== item.id)
          const nextQuantity = quantity - 1
          if (nextQuantity > 0) nextAddons.push({ extraId: item.id, quantity: nextQuantity })
          onDraftChange(setAddons(draft, nextAddons))
        }}
        onIncrement={() => {
          const nextAddons = draft.addons.filter((entry) => entry.extraId !== item.id)
          nextAddons.push({ extraId: item.id, quantity: quantity + 1 })
          onDraftChange(setAddons(draft, nextAddons))
        }}
      />
    </div>
  )
}

function QuantityStepper({
  value,
  onDecrement,
  onIncrement,
}: {
  value: number
  onDecrement(): void
  onIncrement(): void
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button variant="outline" size="sm" type="button" onClick={onDecrement} disabled={value <= 0}>
        <Minus className="size-3.5" />
      </Button>
      <span className="min-w-6 text-center text-sm">{value}</span>
      <Button variant="outline" size="sm" type="button" onClick={onIncrement}>
        <Plus className="size-3.5" />
      </Button>
    </div>
  )
}
