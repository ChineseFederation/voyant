// agent-quality: file-size exception -- owner: inventory-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
import { formatMessage } from "@voyant-travel/i18n"
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
import { ToggleGroup, ToggleGroupItem } from "@voyant-travel/ui/components/toggle-group"
import { Loader2 } from "lucide-react"
import { useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"
import { useProductDetailApi, useProductDetailMessages } from "./host.js"
import { getTimezoneLabel, TIMEZONE_IDS, TIMEZONE_OPTIONS } from "./timezone-options.js"
import { zodResolver } from "./zod-resolver.js"

type ScheduleMessages = ReturnType<
  typeof useProductDetailMessages
>["products"]["operations"]["schedules"]

const WEEKDAY_VALUES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const
type Weekday = (typeof WEEKDAY_VALUES)[number]

const FREQUENCY_OPTIONS = ["DAILY", "WEEKLY", "MONTHLY"] as const
type Frequency = (typeof FREQUENCY_OPTIONS)[number]

const buildScheduleFormSchema = (messages: ScheduleMessages) =>
  z
    .object({
      timezone: z.string().min(1, messages.validationTimezoneRequired),
      frequency: z.enum(FREQUENCY_OPTIONS),
      interval: z.coerce.number().int().min(1).max(365),
      byWeekdays: z.array(z.enum(WEEKDAY_VALUES)),
      byMonthDays: z.array(z.coerce.number().int().min(1).max(31)),
      maxCapacity: z.coerce.number().int().min(0),
      cutoffMinutes: z.coerce.number().int().min(0).optional().or(z.literal("")).nullable(),
      active: z.boolean(),
    })
    .refine(
      (v) => {
        if (v.frequency !== "WEEKLY") return true
        return v.byWeekdays.length > 0
      },
      { message: messages.validationWeekdayRequired, path: ["byWeekdays"] },
    )
    .refine(
      (v) => {
        if (v.frequency !== "MONTHLY") return true
        return v.byMonthDays.length > 0
      },
      { message: messages.validationMonthdayRequired, path: ["byMonthDays"] },
    )

type ScheduleFormSchema = ReturnType<typeof buildScheduleFormSchema>
type ScheduleFormValues = z.input<ScheduleFormSchema>
type ScheduleFormOutput = z.output<ScheduleFormSchema>

export type AvailabilityRule = {
  id: string
  productId: string
  timezone: string
  recurrenceRule: string
  maxCapacity: number
  cutoffMinutes: number | null
  active: boolean
}

export interface ScheduleFormProps {
  productId: string
  rule?: AvailabilityRule
  onSuccess: () => void
  onCancel?: () => void
}

function parseRRule(rrule: string): {
  frequency: Frequency
  interval: number
  byWeekdays: Weekday[]
  byMonthDays: number[]
} {
  const parts = rrule
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
  const map = new Map<string, string>()
  for (const part of parts) {
    const [key, value] = part.split("=")
    if (key && value !== undefined) map.set(key.toUpperCase(), value)
  }

  const rawFreq = (map.get("FREQ") ?? "DAILY").toUpperCase()
  const frequency: Frequency =
    rawFreq === "WEEKLY" || rawFreq === "MONTHLY" ? (rawFreq as Frequency) : "DAILY"

  const interval = Number.parseInt(map.get("INTERVAL") ?? "1", 10) || 1

  const byday = map.get("BYDAY") ?? ""
  const byWeekdays = byday
    .split(",")
    .map((d) => d.trim().toUpperCase())
    .filter((d): d is Weekday => WEEKDAY_VALUES.includes(d as Weekday))

  const bymonthday = map.get("BYMONTHDAY") ?? ""
  const byMonthDays = bymonthday
    .split(",")
    .map((d) => Number.parseInt(d.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 31)

  return { frequency, interval, byWeekdays, byMonthDays }
}

function buildRRule(values: {
  frequency: Frequency
  interval: number
  byWeekdays: Weekday[]
  byMonthDays: number[]
}): string {
  const parts = [`FREQ=${values.frequency}`]
  if (values.interval > 1) parts.push(`INTERVAL=${values.interval}`)
  if (values.frequency === "WEEKLY" && values.byWeekdays.length > 0) {
    const ordered = WEEKDAY_VALUES.filter((d) => values.byWeekdays.includes(d))
    parts.push(`BYDAY=${ordered.join(",")}`)
  }
  if (values.frequency === "MONTHLY" && values.byMonthDays.length > 0) {
    const ordered = [...values.byMonthDays].sort((a, b) => a - b)
    parts.push(`BYMONTHDAY=${ordered.join(",")}`)
  }
  return parts.join(";")
}

function describeRRule(
  values: {
    frequency: Frequency
    interval: number
    byWeekdays: Weekday[]
    byMonthDays: number[]
  },
  messages: ScheduleMessages,
  weekdayOptions: ReadonlyArray<{ value: Weekday; label: string }>,
): string {
  const { frequency, interval, byWeekdays, byMonthDays } = values

  const cadence =
    frequency === "DAILY"
      ? interval > 1
        ? formatMessage(messages.previewEveryDays, { interval })
        : messages.previewEveryDay
      : frequency === "WEEKLY"
        ? interval > 1
          ? formatMessage(messages.previewEveryWeeks, { interval })
          : messages.previewEveryWeek
        : interval > 1
          ? formatMessage(messages.previewEveryMonths, { interval })
          : messages.previewEveryMonth

  if (frequency === "WEEKLY") {
    if (byWeekdays.length === 0) return `${cadence}${messages.previewPickWeekday}`
    const labels = weekdayOptions.filter((d) => byWeekdays.includes(d.value)).map((d) => d.label)
    return formatMessage(messages.previewWeekly, { cadence, days: labels.join(", ") })
  }
  if (frequency === "MONTHLY") {
    if (byMonthDays.length === 0) return `${cadence}${messages.previewPickMonthday}`
    const ordered = [...byMonthDays].sort((a, b) => a - b)
    return formatMessage(messages.previewMonthly, {
      cadence,
      suffix: ordered.length === 1 ? "" : messages.previewSuffixDays,
      days: ordered.join(", "),
    })
  }
  return cadence
}

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

function initialValues(rule: AvailabilityRule | undefined, defaultTz: string): ScheduleFormValues {
  if (rule) {
    const parsed = parseRRule(rule.recurrenceRule)
    return {
      timezone: rule.timezone,
      frequency: parsed.frequency,
      interval: parsed.interval,
      byWeekdays: parsed.byWeekdays,
      byMonthDays: parsed.byMonthDays,
      maxCapacity: rule.maxCapacity,
      cutoffMinutes: rule.cutoffMinutes ?? "",
      active: rule.active,
    }
  }
  return {
    timezone: defaultTz,
    frequency: "WEEKLY",
    interval: 1,
    byWeekdays: ["MO"],
    byMonthDays: [],
    maxCapacity: 0,
    cutoffMinutes: "",
    active: true,
  }
}

export function ScheduleForm({ productId, rule, onSuccess, onCancel }: ScheduleFormProps) {
  const messages = useProductDetailMessages()
  const api = useProductDetailApi()
  const productMessages = messages.products.core
  const scheduleMessages = messages.products.operations.schedules
  const isEditing = !!rule
  const scheduleFormSchema = buildScheduleFormSchema(scheduleMessages)
  const weekdayOptions = [
    { value: "MO", label: scheduleMessages.weekdayMon },
    { value: "TU", label: scheduleMessages.weekdayTue },
    { value: "WE", label: scheduleMessages.weekdayWed },
    { value: "TH", label: scheduleMessages.weekdayThu },
    { value: "FR", label: scheduleMessages.weekdayFri },
    { value: "SA", label: scheduleMessages.weekdaySat },
    { value: "SU", label: scheduleMessages.weekdaySun },
  ] as const satisfies ReadonlyArray<{ value: Weekday; label: string }>
  const frequencyOptions = [
    { value: "DAILY", label: scheduleMessages.frequencyDaily },
    { value: "WEEKLY", label: scheduleMessages.frequencyWeekly },
    { value: "MONTHLY", label: scheduleMessages.frequencyMonthly },
  ] as const

  const defaultTz =
    typeof Intl !== "undefined"
      ? (Intl.DateTimeFormat() // i18n-format-ok -- timezone discovery does not render output.
          .resolvedOptions().timeZone ?? "UTC")
      : "UTC"

  const form = useForm<ScheduleFormValues, unknown, ScheduleFormOutput>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: initialValues(rule, defaultTz),
  })

  const active = form.watch("active")
  const timezone = form.watch("timezone")
  const frequency = form.watch("frequency")
  const interval = form.watch("interval")
  const byWeekdays = form.watch("byWeekdays") as Weekday[]
  const byMonthDays = form.watch("byMonthDays") as number[]

  const preview = useMemo(
    () =>
      describeRRule(
        {
          frequency,
          interval: typeof interval === "number" ? interval : Number(interval) || 1,
          byWeekdays,
          byMonthDays,
        },
        scheduleMessages,
        weekdayOptions,
      ),
    [byMonthDays, byWeekdays, frequency, interval, scheduleMessages, weekdayOptions],
  )

  useEffect(() => {
    form.reset(initialValues(rule, defaultTz))
  }, [rule, form, defaultTz])

  const onSubmit = async (values: ScheduleFormOutput) => {
    const cutoffMinutes = typeof values.cutoffMinutes === "number" ? values.cutoffMinutes : null
    const recurrenceRule = buildRRule({
      frequency: values.frequency,
      interval: values.interval,
      byWeekdays: values.byWeekdays,
      byMonthDays: values.byMonthDays,
    })

    const payload = {
      productId,
      timezone: values.timezone,
      recurrenceRule,
      maxCapacity: values.maxCapacity,
      cutoffMinutes,
      active: values.active,
    }

    if (isEditing) {
      await api.patch(`/v1/admin/operations/availability/rules/${rule.id}`, payload)
    } else {
      await api.post("/v1/admin/operations/availability/rules", payload)
    }
    onSuccess()
  }

  const unitLabel =
    frequency === "DAILY"
      ? scheduleMessages.unitDays
      : frequency === "WEEKLY"
        ? scheduleMessages.unitWeeks
        : scheduleMessages.unitMonths

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-1 flex-col gap-4 overflow-hidden"
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-[160px_1fr] gap-4">
          <div className="flex flex-col gap-2">
            <Label>{scheduleMessages.repeatsLabel}</Label>
            <Select
              value={frequency}
              onValueChange={(v) =>
                form.setValue("frequency", v as Frequency, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
              items={frequencyOptions}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {frequencyOptions.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{scheduleMessages.everyLabel}</Label>
            <div className="flex items-center gap-2">
              <Input
                {...form.register("interval")}
                type="number"
                min="1"
                max="365"
                step="1"
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">{unitLabel}</span>
            </div>
            {form.formState.errors.interval && (
              <p className="text-xs text-destructive">{form.formState.errors.interval.message}</p>
            )}
          </div>
        </div>

        {frequency === "WEEKLY" && (
          <div className="flex flex-col gap-2">
            <Label>{scheduleMessages.weeklyDaysLabel}</Label>
            <ToggleGroup
              multiple
              value={byWeekdays}
              onValueChange={(next) =>
                form.setValue("byWeekdays", next as Weekday[], {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
              variant="outline"
              spacing={1}
            >
              {weekdayOptions.map((d) => (
                <ToggleGroupItem key={d.value} value={d.value} className="w-14">
                  {d.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {form.formState.errors.byWeekdays && (
              <p className="text-xs text-destructive">{form.formState.errors.byWeekdays.message}</p>
            )}
          </div>
        )}

        {frequency === "MONTHLY" && (
          <div className="flex flex-col gap-2">
            <Label>{scheduleMessages.monthlyDaysLabel}</Label>
            <ToggleGroup
              multiple
              value={byMonthDays.map(String)}
              onValueChange={(next) =>
                form.setValue(
                  "byMonthDays",
                  next.map((n) => Number.parseInt(n, 10)),
                  { shouldValidate: true, shouldDirty: true },
                )
              }
              variant="outline"
              spacing={1}
              className="flex-wrap"
            >
              {MONTH_DAYS.map((d) => (
                <ToggleGroupItem key={d} value={String(d)} className="w-10">
                  {d}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {form.formState.errors.byMonthDays && (
              <p className="text-xs text-destructive">
                {form.formState.errors.byMonthDays.message}
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{preview}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex flex-col gap-2">
            <Label>{scheduleMessages.timezoneLabel}</Label>
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
              <ComboboxInput placeholder={scheduleMessages.timezoneSearchPlaceholder} />
              <ComboboxContent>
                <ComboboxEmpty>{scheduleMessages.timezoneEmpty}</ComboboxEmpty>
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
          <div className="flex flex-col gap-2">
            <Label>{scheduleMessages.maxCapacityLabel}</Label>
            <Input {...form.register("maxCapacity")} type="number" min="0" step="1" />
            {form.formState.errors.maxCapacity && (
              <p className="text-xs text-destructive">
                {form.formState.errors.maxCapacity.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label>{scheduleMessages.cutoffLabel}</Label>
            <Input
              {...form.register("cutoffMinutes")}
              type="number"
              min="0"
              step="1"
              placeholder="0"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="schedule-active"
            checked={active}
            onCheckedChange={(c) => form.setValue("active", c)}
          />
          <Label htmlFor="schedule-active" className="font-normal cursor-pointer">
            {scheduleMessages.activeDescription}
          </Label>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {productMessages.cancel}
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? productMessages.saveChanges : scheduleMessages.create}
        </Button>
      </div>
    </form>
  )
}
