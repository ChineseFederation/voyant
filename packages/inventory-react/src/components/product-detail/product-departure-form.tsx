// agent-quality: file-size exception -- owner: inventory-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.

import { formatMessage } from "@voyant-travel/i18n"
import {
  instantToSlotLocal,
  localToInstant,
  type SlotLocalDateTime,
} from "@voyant-travel/operations/scheduling"
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@voyant-travel/ui/components"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@voyant-travel/ui/components/combobox"
import { DatePicker } from "@voyant-travel/ui/components/date-picker"
import { Loader2 } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"
import { useProductItineraries, useProductOptions } from "../../index.js"
import { useProductResourceTemplates } from "./commerce-client.js"
import { deriveDepartureEndIso } from "./departure-duration.js"
import { useProductDetailApi, useProductDetailMessages } from "./host.js"
import { getTimezoneLabel, TIMEZONE_IDS, TIMEZONE_OPTIONS } from "./timezone-options.js"
import { zodResolver } from "./zod-resolver.js"

type DepartureMessages = ReturnType<
  typeof useProductDetailMessages
>["products"]["operations"]["departures"]

const buildDepartureFormSchema = (messages: DepartureMessages) =>
  z
    .object({
      startDate: z.string().min(1, messages.validationStartDateRequired),
      startTime: z.string().min(1, messages.validationStartTimeRequired),
      endDate: z.string().optional().nullable(),
      endTime: z.string().optional().nullable(),
      itineraryId: z.string().optional().nullable(),
      optionId: z.string().optional().nullable(),
      timezone: z.string().min(1, messages.validationTimezoneRequired),
      status: z.enum(["open", "closed", "sold_out", "cancelled"]),
      unlimited: z.boolean(),
      initialPax: z.coerce.number().int().min(0).optional().or(z.literal("")).nullable(),
      nights: z.coerce.number().int().min(0).optional().or(z.literal("")).nullable(),
      days: z.coerce.number().int().min(0).optional().or(z.literal("")).nullable(),
      notes: z.string().optional().nullable(),
    })
    .refine(
      (v) => {
        if (!v.endDate || typeof v.endDate !== "string" || v.endDate.length === 0) return true
        return v.endDate >= v.startDate
      },
      { message: messages.validationEndDateOrder, path: ["endDate"] },
    )
    .refine(
      (v) => {
        const endDate =
          v.endDate && typeof v.endDate === "string" && v.endDate.length > 0
            ? v.endDate
            : v.startDate
        const endTime =
          v.endTime && typeof v.endTime === "string" && v.endTime.length > 0 ? v.endTime : null
        if (!endTime) return true
        if (endDate > v.startDate) return true
        return endTime >= v.startTime
      },
      { message: messages.validationEndTimeOrder, path: ["endTime"] },
    )

type DepartureFormSchema = ReturnType<typeof buildDepartureFormSchema>
type DepartureFormValues = z.input<DepartureFormSchema>
type DepartureFormOutput = z.output<DepartureFormSchema>

export type DepartureSlot = {
  id: string
  productId: string
  optionId: string | null
  itineraryId: string | null
  dateLocal: string
  startsAt: string
  endsAt: string | null
  timezone: string
  status: "open" | "closed" | "sold_out" | "cancelled"
  unlimited: boolean
  initialPax: number | null
  remainingPax: number | null
  nights: number | null
  days: number | null
  notes: string | null
}

export interface DepartureFormProps {
  productId: string
  /** Explicit product duration used when a new departure has no manual end. */
  durationMinutes?: number | null
  slot?: DepartureSlot
  onSuccess: () => void
  onCancel?: () => void
}

/**
 * The operator picks a wall-clock time and a timezone; the slot stores a true
 * UTC instant. `localToInstant` resolves the two DST-safely and rejects a local
 * time that does not exist (the spring-forward gap), which `onSubmit` surfaces
 * as a field error rather than writing a silently shifted instant.
 */
function combineLocalToIso(date: string, time: string, timezone: string): string {
  return localToInstant({ date, time, timezone })
}

/** Reading back is total — fall back to UTC so a bad zone can't break the dialog. */
function slotLocal(iso: string, timezone: string): SlotLocalDateTime {
  try {
    return instantToSlotLocal(iso, timezone)
  } catch {
    return instantToSlotLocal(iso, "UTC")
  }
}

function isoToLocalDate(iso: string, timezone: string): string {
  return slotLocal(iso, timezone).date
}

function isoToLocalTime(iso: string, timezone: string): string {
  return slotLocal(iso, timezone).time
}

function initialValues(slot: DepartureSlot | undefined, defaultTz: string): DepartureFormValues {
  if (slot) {
    return {
      startDate: slot.dateLocal,
      startTime: isoToLocalTime(slot.startsAt, slot.timezone),
      endDate: slot.endsAt ? isoToLocalDate(slot.endsAt, slot.timezone) : "",
      endTime: slot.endsAt ? isoToLocalTime(slot.endsAt, slot.timezone) : "",
      itineraryId: slot.itineraryId ?? "",
      optionId: slot.optionId ?? "",
      timezone: slot.timezone,
      status: slot.status,
      unlimited: slot.unlimited,
      initialPax: slot.initialPax != null ? slot.initialPax : "",
      nights: slot.nights != null ? slot.nights : "",
      days: slot.days != null ? slot.days : "",
      notes: slot.notes ?? "",
    }
  }
  return {
    startDate: "",
    startTime: "09:00",
    endDate: "",
    endTime: "",
    itineraryId: "",
    optionId: "",
    timezone: defaultTz,
    status: "open",
    unlimited: false,
    initialPax: "",
    nights: "",
    days: "",
    notes: "",
  }
}

export function DepartureForm({
  productId,
  durationMinutes,
  slot,
  onSuccess,
  onCancel,
}: DepartureFormProps) {
  const messages = useProductDetailMessages()
  const api = useProductDetailApi()
  const productMessages = messages.products.core
  const departureMessages = messages.products.operations.departures
  const itineraryMessages = messages.products.operations.itineraries
  const isEditing = !!slot
  const departureFormSchema = buildDepartureFormSchema(departureMessages)
  const slotStatuses = [
    { value: "open", label: productMessages.departureStatusOpen },
    { value: "closed", label: productMessages.departureStatusClosed },
    { value: "sold_out", label: productMessages.departureStatusSoldOut },
    { value: "cancelled", label: productMessages.departureStatusCancelled },
  ] as const

  const defaultTz =
    typeof Intl !== "undefined"
      ? (Intl.DateTimeFormat() // i18n-format-ok -- timezone discovery does not render output.
          .resolvedOptions().timeZone ?? "UTC")
      : "UTC"

  const form = useForm<DepartureFormValues, unknown, DepartureFormOutput>({
    resolver: zodResolver(departureFormSchema),
    defaultValues: initialValues(slot, defaultTz),
  })

  const unlimited = form.watch("unlimited")
  const startDate = form.watch("startDate")
  const endDate = form.watch("endDate")
  const timezone = form.watch("timezone")
  const { data: itineraryData } = useProductItineraries(productId)
  const itineraries = itineraryData?.data ?? []
  const defaultItinerary = itineraries.find((itinerary) => itinerary.isDefault) ?? itineraries[0]
  const { data: optionData } = useProductOptions({ productId, status: "active", limit: 100 })
  const productOptions = optionData?.data ?? []
  const defaultOption = productOptions.find((option) => option.isDefault) ?? productOptions[0]
  const selectedOptionId = form.watch("optionId")
  const shouldShowOptionSelect =
    productOptions.length > 1 || (isEditing && !selectedOptionId && Boolean(defaultOption))

  // Suggested pax = total physical capacity of the configured departure
  // inventory (each room/seat type's count × its capacity, e.g. 20 doubles
  // sleeping 2 = 40). Lets a new departure inherit capacity from the rooms the
  // operator already set up, while staying editable for an override.
  const { data: resourceTemplateData } = useProductResourceTemplates(productId)
  const suggestedPax = useMemo(
    () =>
      (resourceTemplateData?.data ?? []).reduce(
        (optionTotal, option) =>
          optionTotal +
          option.templates.reduce(
            (sum, template) => sum + (template.defaultCount ?? 0) * template.capacity,
            0,
          ),
        0,
      ),
    [resourceTemplateData?.data],
  )

  // Pre-fill capacity once for a brand-new departure, only while the field is
  // still untouched — never clobber an edit or an existing slot's value.
  const prefilledPaxRef = useRef(false)
  useEffect(() => {
    if (isEditing || prefilledPaxRef.current || suggestedPax <= 0) return
    const current = form.getValues("initialPax")
    if (current === "" || current == null) {
      form.setValue("initialPax", suggestedPax)
      prefilledPaxRef.current = true
    }
  }, [isEditing, suggestedPax, form])

  const nights = (() => {
    if (!startDate || !endDate || typeof endDate !== "string" || endDate.length === 0) return 0
    const start = new Date(`${startDate}T00:00:00Z`).getTime()
    const end = new Date(`${endDate}T00:00:00Z`).getTime()
    const diffDays = Math.round((end - start) / 86_400_000)
    return diffDays > 0 ? diffDays : 0
  })()

  useEffect(() => {
    form.reset(initialValues(slot, defaultTz))
  }, [slot, form, defaultTz])

  useEffect(() => {
    if (!defaultOption) return
    const current = form.getValues("optionId")
    if (current) return

    form.setValue("optionId", defaultOption.id, {
      shouldDirty: false,
      shouldValidate: true,
    })
  }, [defaultOption, form])

  const onSubmit = async (values: DepartureFormOutput) => {
    let startsAt: string
    try {
      startsAt = combineLocalToIso(values.startDate, values.startTime, values.timezone)
    } catch {
      form.setError("startTime", {
        type: "manual",
        message: departureMessages.nonexistentLocalTime,
      })
      return
    }

    const effectiveEndDate =
      values.endDate && typeof values.endDate === "string" && values.endDate.length > 0
        ? values.endDate
        : values.startDate
    const hasEndTime =
      values.endTime && typeof values.endTime === "string" && values.endTime.length > 0
    const hasExplicitEndDate =
      values.endDate && typeof values.endDate === "string" && values.endDate.length > 0

    let endsAt: string | null = null
    if (hasEndTime || hasExplicitEndDate) {
      try {
        endsAt = combineLocalToIso(
          effectiveEndDate,
          hasEndTime ? (values.endTime as string) : "18:00",
          values.timezone,
        )
      } catch {
        form.setError("endTime", {
          type: "manual",
          message: departureMessages.nonexistentLocalTime,
        })
        return
      }
    } else if (!isEditing) {
      endsAt = deriveDepartureEndIso(startsAt, durationMinutes)
    }

    const initialPax =
      !values.unlimited && typeof values.initialPax === "number" ? values.initialPax : null

    // Treat blank / zero overrides as `null` so the slot card doesn't show
    // "0 nights / 0 days" after the operator clears the override (#1087 side
    // bug). The schema accepts `null` for both; sending `0` was the bug.
    const nightsOverride =
      typeof values.nights === "number" && values.nights > 0 ? values.nights : null
    const daysOverride = typeof values.days === "number" && values.days > 0 ? values.days : null
    const optionId = values.optionId || defaultOption?.id || null

    // `remainingPax` is intentionally omitted on edit — the slot service is
    // the source of truth for that field. Concurrent flows (holds, bookings,
    // refunds) mutate it atomically while a form is open, so any snapshot
    // we computed in JS would be stale by save time (#1087, Codex review on
    // #1088). The backend's `updateSlot` recomputes remaining_pax in the
    // same UPDATE statement when initialPax / unlimited change.
    const baseFields = {
      productId,
      itineraryId: values.itineraryId ? values.itineraryId : null,
      optionId,
      dateLocal: values.startDate,
      startsAt,
      endsAt,
      timezone: values.timezone,
      status: values.status,
      unlimited: values.unlimited,
      initialPax,
      nights: nightsOverride,
      days: daysOverride,
      notes: values.notes || null,
    }

    if (isEditing) {
      await api.patch(`/v1/admin/operations/availability/slots/${slot.id}`, baseFields)
    } else {
      // New slots haven't been booked against yet, so seeding remainingPax
      // from initialPax is correct on create.
      await api.post("/v1/admin/operations/availability/slots", {
        ...baseFields,
        remainingPax: initialPax,
      })
    }
    onSuccess()
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-1 flex-col gap-6 overflow-hidden"
    >
      <fieldset className="grid gap-3">
        <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {departureMessages.scheduleLegend}
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>{departureMessages.startDateLabel}</Label>
            <DatePicker
              value={startDate || null}
              onChange={(v) =>
                form.setValue("startDate", v ?? "", {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
              placeholder={departureMessages.datePlaceholder}
            />
            {form.formState.errors.startDate && (
              <p className="text-xs text-destructive">{form.formState.errors.startDate.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{departureMessages.startTimeLabel}</Label>
            <Input {...form.register("startTime")} type="time" />
            {form.formState.errors.startTime && (
              <p className="text-xs text-destructive">{form.formState.errors.startTime.message}</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>
              {departureMessages.endDateLabel}{" "}
              <span className="text-muted-foreground font-normal">
                {departureMessages.endDateOptional}
              </span>
            </Label>
            <DatePicker
              value={typeof endDate === "string" && endDate.length > 0 ? endDate : null}
              onChange={(v) =>
                form.setValue("endDate", v ?? "", {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
              placeholder={departureMessages.datePlaceholder}
              clearable
              dateDisabled={startDate ? { before: new Date(`${startDate}T00:00:00`) } : undefined}
            />
            {form.formState.errors.endDate && (
              <p className="text-xs text-destructive">{form.formState.errors.endDate.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>
              {departureMessages.endTimeLabel}{" "}
              <span className="text-muted-foreground font-normal">
                {departureMessages.endTimeOptional}
              </span>
            </Label>
            <Input {...form.register("endTime")} type="time" />
            {form.formState.errors.endTime && (
              <p className="text-xs text-destructive">{form.formState.errors.endTime.message}</p>
            )}
          </div>
        </div>
        {nights > 0 && (
          <>
            <p className="text-xs text-muted-foreground">
              {formatMessage(departureMessages.multiDayHint, {
                nights,
                nightSuffix: nights === 1 ? "" : "s",
                days: nights + 1,
              })}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>{departureMessages.nightsOverrideLabel}</Label>
                <Input
                  {...form.register("nights")}
                  type="number"
                  min="0"
                  step="1"
                  placeholder={String(nights)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{departureMessages.daysOverrideLabel}</Label>
                <Input
                  {...form.register("days")}
                  type="number"
                  min="0"
                  step="1"
                  placeholder={String(nights + 1)}
                />
              </div>
            </div>
          </>
        )}
        {itineraries.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <Label>{itineraryMessages.formLabel}</Label>
            <Select
              items={[
                {
                  label: defaultItinerary
                    ? formatMessage(itineraryMessages.defaultWithName, {
                        name: defaultItinerary.name,
                      })
                    : itineraryMessages.defaultBadge,
                  value: "",
                },
                ...itineraries.map((itinerary) => ({
                  label: itinerary.name,
                  value: itinerary.id,
                })),
              ]}
              value={form.watch("itineraryId") ?? ""}
              onValueChange={(value) => form.setValue("itineraryId", value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">
                  {defaultItinerary
                    ? formatMessage(itineraryMessages.defaultWithName, {
                        name: defaultItinerary.name,
                      })
                    : itineraryMessages.defaultBadge}
                </SelectItem>
                {itineraries.map((itinerary) => (
                  <SelectItem key={itinerary.id} value={itinerary.id}>
                    {itinerary.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{itineraryMessages.overrideHint}</p>
          </div>
        ) : null}
        {shouldShowOptionSelect ? (
          <div className="flex flex-col gap-1.5">
            <Label>{departureMessages.optionLabel}</Label>
            <Select
              value={selectedOptionId || defaultOption?.id || ""}
              onValueChange={(value) =>
                form.setValue("optionId", value, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              items={productOptions.map((option) => ({
                label: option.isDefault
                  ? formatMessage(departureMessages.defaultOptionLabel, { name: option.name })
                  : option.name,
                value: option.id,
              }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {productOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.isDefault
                      ? formatMessage(departureMessages.defaultOptionLabel, { name: option.name })
                      : option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{departureMessages.optionRepairHint}</p>
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label>{departureMessages.timezoneLabel}</Label>
          <Combobox
            items={TIMEZONE_IDS}
            value={timezone || null}
            autoHighlight
            itemToStringLabel={(id) => getTimezoneLabel(id as string)}
            itemToStringValue={(id) => getTimezoneLabel(id as string)}
            onValueChange={(next) => {
              if (typeof next === "string") {
                form.setValue("timezone", next, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
            }}
          >
            <ComboboxInput
              placeholder={departureMessages.timezoneSearchPlaceholder}
              className="w-full"
            />
            <ComboboxContent>
              <ComboboxEmpty>{departureMessages.timezoneEmpty}</ComboboxEmpty>
              <ComboboxList>
                <ComboboxCollection>
                  {(id) => {
                    const tz = TIMEZONE_OPTIONS.find((t) => t.id === (id as string))
                    return (
                      <ComboboxItem key={id as string} value={id as string}>
                        <span className="font-mono text-xs">{id as string}</span>
                        {tz ? (
                          <span className="ml-2 text-xs text-muted-foreground">{tz.label}</span>
                        ) : null}
                      </ComboboxItem>
                    )
                  }}
                </ComboboxCollection>
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          {form.formState.errors.timezone && (
            <p className="text-xs text-destructive">{form.formState.errors.timezone.message}</p>
          )}
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {departureMessages.availabilityLegend}
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>{departureMessages.statusLabel}</Label>
            <Select
              value={form.watch("status")}
              onValueChange={(v) => form.setValue("status", v as DepartureFormValues["status"])}
              items={slotStatuses}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {slotStatuses.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{departureMessages.capacityLabel}</Label>
            <Input
              {...form.register("initialPax")}
              type="number"
              min="0"
              step="1"
              placeholder="0"
              disabled={unlimited}
            />
            {!unlimited && suggestedPax > 0 ? (
              <button
                type="button"
                onClick={() => form.setValue("initialPax", suggestedPax)}
                className="text-left text-xs text-muted-foreground hover:text-foreground"
              >
                {formatMessage(departureMessages.capacityAutoHint, { count: suggestedPax })}
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="unlimited"
            checked={unlimited}
            onCheckedChange={(c) => form.setValue("unlimited", c)}
          />
          <Label htmlFor="unlimited" className="font-normal cursor-pointer">
            {departureMessages.unlimitedLabel}
          </Label>
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label>{departureMessages.notesLabel}</Label>
        <Textarea {...form.register("notes")} placeholder={departureMessages.notesPlaceholder} />
      </div>

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {productMessages.cancel}
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? productMessages.saveChanges : departureMessages.create}
        </Button>
      </div>
    </form>
  )
}
