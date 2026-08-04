// agent-quality: file-size exception -- owner: bookings-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
"use client"

import type { BookingRequirementsV1 } from "@voyant-travel/catalog-contracts/booking-engine/requirements-contracts"
import { Separator } from "@voyant-travel/ui/components"
import { Button } from "@voyant-travel/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { Input } from "@voyant-travel/ui/components/input"
import { Label } from "@voyant-travel/ui/components/label"
import { RadioGroup, RadioGroupItem } from "@voyant-travel/ui/components/radio-group"
import { Minus, Plus } from "lucide-react"
import { formatMessage, useBookingsUiMessagesOrDefault } from "../../../i18n/index.js"
import { type Draft, patchConfigure, patchPaxCount, totalPax } from "../../lib/draft-state.js"
import {
  evaluatePaxBandDependencies,
  type PaxBandDependencyViolation,
} from "../../lib/pax-band-dependencies.js"
import {
  configureSubStepMessages,
  describeUnsatisfiedRequirements,
  paxBandMessages,
  stepLevelUnsatisfiedMessages,
} from "../../lib/unsatisfied-requirements.js"
import {
  ageHint,
  DateField,
  JourneyErrors,
  type RenderDeparturePicker,
  type RenderUnitsPicker,
  type StepCommonProps,
} from "./shared.js"

// ─────────────────────────────────────────────────────────────────
// Configure
// ─────────────────────────────────────────────────────────────────

export function DepartureStep({
  draft,
  setDraft,
  shape,
  productId,
  renderDeparturePicker,
  unsatisfied,
}: StepCommonProps & {
  /** Owned product id — passed to the injected departure picker. */
  productId?: string
  renderDeparturePicker?: RenderDeparturePicker
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault()
  const subSteps = shape.configureSubSteps ?? []
  // `configureSubSteps.departure` belongs under the departure picker itself.
  // The picker is an injected slot, so the message sits directly below it
  // rather than on one of its inputs — the closest anchor available without
  // reaching into a component this package does not own.
  const described = describeUnsatisfiedRequirements(unsatisfied, messages, shape)
  const departureErrors = configureSubStepMessages(described).get("departure") ?? []
  const stepErrors = stepLevelUnsatisfiedMessages(
    described,
    "departure",
    (entry) => entry.anchor.kind === "configureSubStep" && entry.anchor.subStepKind === "departure",
  )
  // With no descriptor sub-steps, still offer a departure (storefront
  // free-date fallback).
  const showsDeparture = subSteps.length === 0 || subSteps.some((s) => s.kind === "departure")

  const departureNode = showsDeparture ? (
    renderDeparturePicker && productId ? (
      renderDeparturePicker({
        productId,
        optionId: draft.configure.variantId ?? null,
        slotId: draft.configure.departureSlotId ?? null,
        departureDate: draft.configure.departureDate ?? null,
        departureTime: draft.configure.departureTime ?? null,
        onChange: (next) =>
          setDraft(
            patchConfigure(draft, {
              ...(next.slotId !== undefined ? { departureSlotId: next.slotId ?? undefined } : {}),
              ...(next.departureDate !== undefined
                ? { departureDate: next.departureDate ?? undefined }
                : {}),
              ...(next.departureTime !== undefined
                ? { departureTime: next.departureTime ?? undefined }
                : {}),
            }),
          ),
      })
    ) : (
      <DepartureBasic draft={draft} setDraft={setDraft} />
    )
  ) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.bookingJourney.steps.departure}</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-6">
        {departureNode}
        <JourneyErrors errors={departureErrors} />
        <JourneyErrors errors={stepErrors} />
      </CardContent>
    </Card>
  )
}

export function OptionsStep({
  draft,
  setDraft,
  shape,
  productId,
  renderUnitsPicker,
  unsatisfied,
}: StepCommonProps & {
  /** Owned product id — passed to the injected units picker. */
  productId?: string
  renderUnitsPicker?: RenderUnitsPicker
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault()
  const subSteps = shape.configureSubSteps ?? []
  // Each configure sub-step draws its own block here, so a finding keyed
  // `configureSubSteps.<kind>` lands on the block that owns it. Anything the
  // options step owns but has no block for falls through to the step list.
  const described = describeUnsatisfiedRequirements(unsatisfied, messages, shape)
  const subStepErrors = configureSubStepMessages(described)
  const anchoredKinds = new Set(["option-units", "date-range", "cabin-category", "air-arrangement"])
  // The cabin-number block only exists once a category is picked. Without one
  // there is nothing to anchor to, so the message stays in the step list rather
  // than being attached to a block that renders nothing.
  if (draft.configure.cabinCategoryId) anchoredKinds.add("cabin-number")
  const stepErrors = stepLevelUnsatisfiedMessages(
    described,
    "options",
    (entry) =>
      entry.anchor.kind === "configureSubStep" && anchoredKinds.has(entry.anchor.subStepKind),
  )
  const optionList = subSteps.flatMap((s) => (s.kind === "product-option" ? s.options : []))
  const multipleOptions = optionList.length > 1
  const showsUnits = subSteps.some((s) => s.kind === "option-units")
  const otherSteps = subSteps.filter(
    (s) =>
      s.kind !== "departure" &&
      s.kind !== "product-option" &&
      s.kind !== "option-units" &&
      s.kind !== "occupancy",
  )

  const unitsNode =
    showsUnits && renderUnitsPicker && productId
      ? renderUnitsPicker({
          productId,
          optionId: draft.configure.variantId ?? null,
          slotId: draft.configure.departureSlotId ?? null,
          selections: draft.configure.optionSelections ?? [],
          onChange: (selections) =>
            setDraft(patchConfigure(draft, { optionSelections: selections })),
        })
      : null

  const optionNode =
    optionList.length > 0 ? (
      <ProductOptionFields
        draft={draft}
        setDraft={setDraft}
        options={optionList}
        // With a real choice between options, nest the rooms under the
        // SELECTED option so switching reveals that option's inventory in
        // place. With a single/no option there's nothing to switch, so the
        // rooms render directly below instead.
        renderSelectedUnits={multipleOptions && unitsNode ? () => unitsNode : undefined}
      />
    ) : null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.bookingJourney.steps.options}</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-6">
        {/* Option + its rooms. Multiple options → rooms nested under the
            selected option (handled inside ProductOptionFields). Single/no
            option → rooms rendered directly here. */}
        {optionNode || unitsNode ? (
          <div className="space-y-3">
            {optionNode}
            {unitsNode && !multipleOptions ? unitsNode : null}
          </div>
        ) : null}
        {/* Outside the block above: a surface with no units picker wired still
            has to be told the rooms are missing. */}
        <JourneyErrors errors={subStepErrors.get("option-units")} />
        {/* Vertical-specific sub-steps (cruise cabins, date ranges, air). */}
        {otherSteps.length > 0 ? (
          <div className="space-y-4">
            {otherSteps.map((sub) =>
              renderOtherConfigureSubStep(sub, draft, setDraft, subStepErrors.get(sub.kind)),
            )}
          </div>
        ) : null}
        <JourneyErrors errors={stepErrors} />
      </CardContent>
    </Card>
  )
}

export function PaxBands({
  draft,
  setDraft,
  shape,
  unsatisfied,
}: StepCommonProps): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault()
  // `paxBands.<code>` names a band, and a band is one stepper row — the
  // tightest anchor in the whole descriptor.
  const bandErrors = paxBandMessages(describeUnsatisfiedRequirements(unsatisfied, messages, shape))
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <Label>{messages.bookingJourney.travelers.partySize}</Label>
      <div className="flex flex-col gap-2">
        {shape.paxBands.map((band) => {
          const value = draft.configure.pax?.[band.code] ?? 0
          return (
            <div key={band.code} className="space-y-1">
              <div className="flex items-center gap-3 rounded-md border px-3 py-2">
                <div className="flex-1">
                  <div className="text-sm font-medium">{band.label}</div>
                  {band.minAge != null || band.maxAge != null ? (
                    <div className="text-muted-foreground text-xs">
                      {ageHint(band.minAge, band.maxAge, messages)}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="h-7 w-7 p-0"
                    disabled={value <= band.minCount}
                    onClick={() => setDraft(patchPaxCount(draft, band.code, value - 1))}
                    aria-label={formatMessage(messages.bookingJourney.travelers.decrease, {
                      label: band.label,
                    })}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="min-w-[1.5rem] text-center text-sm tabular-nums">{value}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    className="h-7 w-7 p-0"
                    disabled={value >= band.maxCount}
                    onClick={() => setDraft(patchPaxCount(draft, band.code, value + 1))}
                    aria-label={formatMessage(messages.bookingJourney.travelers.increase, {
                      label: band.label,
                    })}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <JourneyErrors errors={bandErrors.get(band.code)} />
            </div>
          )
        })}
      </div>
      <PaxValidation draft={draft} shape={shape} />
    </div>
  )
}

export function PaxValidation({
  draft,
  shape,
}: {
  draft: Draft
  shape: BookingRequirementsV1
}): React.ReactNode {
  const messages = useBookingsUiMessagesOrDefault()
  const total = totalPax(draft)
  const { min, max } = shape.paxBandsAllowedTotal
  if (total < min) {
    return (
      <p className="text-sm text-amber-600">
        {formatMessage(messages.bookingJourney.validation.addAtLeastTravelers, {
          count: min,
          plural: min === 1 ? "" : "s",
        })}
      </p>
    )
  }
  if (total > max) {
    return (
      <p className="text-sm text-destructive">
        {formatMessage(messages.bookingJourney.validation.maxTravelersPerBooking, {
          count: max,
        })}
      </p>
    )
  }
  return null
}

/** Formats one occupancy-rule violation into a localized message. */
function formatPaxDependencyViolation(
  violation: PaxBandDependencyViolation,
  messages: ReturnType<typeof useBookingsUiMessagesOrDefault>["bookingJourney"]["validation"],
): string {
  switch (violation.type) {
    case "requires":
      return formatMessage(messages.dependencyRequires, {
        dependent: violation.dependentLabel,
        master: violation.masterLabel,
      })
    case "excludes":
      return formatMessage(messages.dependencyExcludes, {
        dependent: violation.dependentLabel,
        master: violation.masterLabel,
      })
    case "limits_per_master":
      return formatMessage(messages.dependencyLimitPerMaster, {
        limit: violation.limit ?? 0,
        dependent: violation.dependentLabel,
        master: violation.masterLabel,
      })
    case "limits_sum":
      return formatMessage(messages.dependencyLimitSum, {
        limit: violation.limit ?? 0,
        dependent: violation.dependentLabel,
      })
  }
}

/**
 * Surfaces broken cross-band occupancy rules (e.g. "Child under 6
 * requires an Adult") as hard validation errors under the pax steppers.
 * These also block step advancement via `canAdvanceFromStep`.
 */
export function PaxDependencyWarnings({
  draft,
  shape,
}: {
  draft: Draft
  shape: BookingRequirementsV1
}): React.ReactNode {
  const messages = useBookingsUiMessagesOrDefault()
  const violations = evaluatePaxBandDependencies(
    draft.configure.pax,
    shape.paxBandDependencies,
    shape.paxBands,
  )
  if (violations.length === 0) return null
  return (
    <div className="space-y-1">
      {violations.map((violation) => (
        <p
          key={`${violation.type}-${violation.dependentCode}-${violation.masterCode}`}
          className="text-destructive text-sm"
        >
          {formatPaxDependencyViolation(violation, messages.bookingJourney.validation)}
        </p>
      ))}
    </div>
  )
}

/**
 * Renders the vertical-specific Configure sub-steps that aren't part of the
 * fixed products layout (departure / option / rooms / occupancy are handled
 * explicitly in `ConfigureStep`). Cruise cabins, date ranges, and air
 * arrangement land here, in descriptor order.
 */
function renderOtherConfigureSubStep(
  sub: NonNullable<BookingRequirementsV1["configureSubSteps"]>[number],
  draft: Draft,
  setDraft: (next: Draft) => void,
  /** Server findings keyed to this sub-step, rendered inside its own block. */
  errors?: ReadonlyArray<string>,
): React.ReactNode {
  if (sub.kind === "date-range") {
    return (
      <DateRangeFields
        key="date-range"
        draft={draft}
        setDraft={setDraft}
        minNights={sub.minNights}
        maxNights={sub.maxNights}
        errors={errors}
      />
    )
  }
  if (sub.kind === "cabin-category") {
    return (
      <CabinCategoryFields
        key="cabin-category"
        draft={draft}
        setDraft={setDraft}
        categories={sub.categories}
        errors={errors}
      />
    )
  }
  if (sub.kind === "cabin-number") {
    return (
      <CabinNumberFields
        key="cabin-number"
        draft={draft}
        setDraft={setDraft}
        perCategory={sub.perCategory}
        errors={errors}
      />
    )
  }
  if (sub.kind === "air-arrangement") {
    return (
      <AirArrangementFields
        key="air-arrangement"
        draft={draft}
        setDraft={setDraft}
        errors={errors}
      />
    )
  }
  return null
}

function ProductOptionFields({
  draft,
  setDraft,
  options,
  renderSelectedUnits,
}: {
  draft: Draft
  setDraft: (next: Draft) => void
  options: ReadonlyArray<{
    id: string
    code?: string | null
    name: string
    description?: string | null
    isDefault?: boolean
  }>
  /**
   * Renders the rooms/units nested directly under the SELECTED option, so
   * switching options reveals that option's inventory in place. Omitted
   * when there's no nesting (single/no option) — the caller renders units
   * separately then.
   */
  renderSelectedUnits?: () => React.ReactNode
}): React.ReactElement | null {
  const messages = useBookingsUiMessagesOrDefault()
  const selectedId = draft.configure.variantId
  if (options.length === 0) return null
  return (
    <div className="space-y-2">
      <Label>{messages.bookingJourney.configure.option}</Label>
      <RadioGroup
        value={selectedId ?? ""}
        // Switching options must clear the previous option's room/unit picks —
        // otherwise stale `optionSelections` from option A still drive the
        // quote/commit (price, item lines, rooms gate) under option B.
        onValueChange={(v) =>
          setDraft(
            patchConfigure(
              draft,
              v === selectedId ? { variantId: v } : { variantId: v, optionSelections: [] },
            ),
          )
        }
        className="grid grid-cols-1 gap-2"
      >
        {options.map((option) => {
          const selected = option.id === selectedId
          return (
            <div key={option.id} className="space-y-2">
              {/* biome-ignore lint/a11y/noLabelWithoutControl: radix RadioGroupItem provides the control  -- owner: bookings-react; existing suppression is intentional pending typed cleanup. */}
              <label
                className={
                  "flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors " +
                  (selected ? "border-primary bg-primary/5" : "border-input hover:bg-muted/50")
                }
              >
                <RadioGroupItem value={option.id} className="mt-0.5" />
                <div className="min-w-0">
                  <div className="font-medium">
                    {option.name}
                    {option.code ? (
                      <span className="ml-2 text-muted-foreground text-xs uppercase">
                        {option.code}
                      </span>
                    ) : null}
                  </div>
                  {option.description ? (
                    <div className="mt-1 text-muted-foreground text-xs">{option.description}</div>
                  ) : null}
                </div>
              </label>
              {selected && renderSelectedUnits ? (
                <div className="ml-7 space-y-2 border-muted border-l-2 pl-4">
                  {renderSelectedUnits()}
                </div>
              ) : null}
            </div>
          )
        })}
      </RadioGroup>
    </div>
  )
}

function DepartureBasic({
  draft,
  setDraft,
}: {
  draft: Draft
  setDraft: (next: Draft) => void
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault()
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <DateField
        id="bj-departure-date"
        label={messages.bookingJourney.configure.departureDate}
        value={draft.configure.departureDate ?? ""}
        onChange={(v) => setDraft(patchConfigure(draft, { departureDate: v }))}
        range="future"
      />
      <div className="space-y-1">
        <Label htmlFor="bj-departure-time">{messages.bookingJourney.configure.timeOptional}</Label>
        <Input
          id="bj-departure-time"
          type="time"
          value={draft.configure.departureTime ?? ""}
          onChange={(e) => setDraft(patchConfigure(draft, { departureTime: e.target.value }))}
        />
      </div>
    </div>
  )
}

function DateRangeFields({
  draft,
  setDraft,
  minNights,
  maxNights,
  errors,
}: {
  draft: Draft
  setDraft: (next: Draft) => void
  minNights: number
  maxNights: number
  errors?: ReadonlyArray<string>
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault()
  const range = draft.configure.dateRange
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DateField
          id="bj-checkin"
          label={messages.bookingJourney.configure.checkIn}
          value={range?.checkIn ?? ""}
          onChange={(v) =>
            setDraft(
              patchConfigure(draft, {
                dateRange: { checkIn: v, checkOut: range?.checkOut ?? "" },
              }),
            )
          }
          range="future"
        />
        <DateField
          id="bj-checkout"
          label={formatMessage(messages.bookingJourney.configure.checkOutWithNights, {
            minNights,
            maxNights,
          })}
          value={range?.checkOut ?? ""}
          onChange={(v) =>
            setDraft(
              patchConfigure(draft, {
                dateRange: { checkIn: range?.checkIn ?? "", checkOut: v },
              }),
            )
          }
          range="future"
        />
      </div>
      <JourneyErrors errors={errors} />
    </div>
  )
}

function CabinCategoryFields({
  draft,
  setDraft,
  categories,
  errors,
}: {
  draft: Draft
  setDraft: (next: Draft) => void
  categories: ReadonlyArray<{ id: string; name: string; description?: string }>
  errors?: ReadonlyArray<string>
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault()
  return (
    <div className="space-y-2">
      <Label>{messages.bookingJourney.configure.cabinCategory}</Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {categories.map((cat) => {
          const selected = draft.configure.cabinCategoryId === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              className={`rounded-md border p-3 text-left ${
                selected ? "border-primary ring-2 ring-primary" : ""
              }`}
              onClick={() =>
                setDraft(
                  patchConfigure(draft, {
                    cabinCategoryId: cat.id,
                    cabinNumberId: undefined,
                  }),
                )
              }
            >
              <div className="font-medium">{cat.name}</div>
              {cat.description ? (
                <div className="text-muted-foreground text-xs">{cat.description}</div>
              ) : null}
            </button>
          )
        })}
      </div>
      <JourneyErrors errors={errors} />
    </div>
  )
}

function AirArrangementFields({
  draft,
  setDraft,
  errors,
}: {
  draft: Draft
  setDraft: (next: Draft) => void
  errors?: ReadonlyArray<string>
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault()
  const current = draft.configure.airArrangement
  const options: Array<{
    value: "cruise_line" | "independent" | "none"
    label: string
    description: string
  }> = [
    {
      value: "cruise_line",
      label: messages.bookingJourney.configure.airOptions.cruise_line.label,
      description: messages.bookingJourney.configure.airOptions.cruise_line.description,
    },
    {
      value: "independent",
      label: messages.bookingJourney.configure.airOptions.independent.label,
      description: messages.bookingJourney.configure.airOptions.independent.description,
    },
    {
      value: "none",
      label: messages.bookingJourney.configure.airOptions.none.label,
      description: messages.bookingJourney.configure.airOptions.none.description,
    },
  ]
  return (
    <div className="space-y-2">
      <Label>{messages.bookingJourney.configure.airArrangements}</Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {options.map((opt) => {
          const selected = current === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              className={`rounded-md border p-3 text-left text-sm ${
                selected ? "border-primary ring-2 ring-primary" : ""
              }`}
              onClick={() => setDraft(patchConfigure(draft, { airArrangement: opt.value }))}
            >
              <div className="font-medium">{opt.label}</div>
              <div className="text-muted-foreground text-xs">{opt.description}</div>
            </button>
          )
        })}
      </div>
      <JourneyErrors errors={errors} />
    </div>
  )
}

function CabinNumberFields({
  draft,
  setDraft,
  perCategory,
  errors,
}: {
  draft: Draft
  setDraft: (next: Draft) => void
  perCategory: Record<string, ReadonlyArray<{ id: string; label: string }>>
  errors?: ReadonlyArray<string>
}): React.ReactNode {
  const messages = useBookingsUiMessagesOrDefault()
  const catId = draft.configure.cabinCategoryId
  if (!catId) return null
  const cabins = perCategory[catId] ?? []
  return (
    <div className="space-y-2">
      <Label>{messages.bookingJourney.configure.cabinNumber}</Label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cabins.map((cabin) => {
          const selected = draft.configure.cabinNumberId === cabin.id
          return (
            <button
              key={cabin.id}
              type="button"
              className={`rounded-md border p-2 text-sm ${
                selected ? "border-primary ring-2 ring-primary" : ""
              }`}
              onClick={() => setDraft(patchConfigure(draft, { cabinNumberId: cabin.id }))}
            >
              {cabin.label}
            </button>
          )
        })}
      </div>
      <JourneyErrors errors={errors} />
    </div>
  )
}
