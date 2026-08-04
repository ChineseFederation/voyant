"use client"

// agent-quality: file-size exception -- owner: availability. This panel is a
// collapsible list plus the single create/edit form that writes its rows, and
// the two share one block of form state (kind, occupancy band, bed
// configuration, age band, seat map, naming). #4036 pushed it past the limit by
// adding the room-constraint fields to that form. Splitting the form out would
// mean threading twenty setters through props, or lifting the state into a hook
// whose only consumer is the component it came from -- neither makes this
// easier to review. Extracting the form together with its state is a worthwhile
// refactor; it is its own change.

import { useOperatorAdminMessages } from "@voyant-travel/admin"
import { formatMessage } from "@voyant-travel/i18n"
import { useOptionUnits } from "@voyant-travel/inventory-react"
import {
  Badge,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import {
  Armchair,
  Bed,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react"
import { useMemo, useState } from "react"
import { SeatMapBuilder } from "../allocation/index.js"
import {
  type SeatLayoutSpec,
  useMaterializeOpenSlotsMutation,
  useProductResourceTemplates,
  useResourceTemplateMutation,
} from "../index.js"
import {
  countSeats,
  extractLayoutSpec,
  SeatMapSummaryBadge,
} from "./option-resource-template-seat-map.js"

/**
 * Per-option Resource templates editor. Templates drive the Allocation
 * tab's "Generate resources" automation — without a template configured
 * for an option, no rooms/seats/etc. are materialized when bookings hit
 * a slot.
 *
 * Each template is identified by `(optionId, kind, refId)` — an option can
 * hold several templates of the same kind, one per `option_unit` (e.g. a
 * "room" template per room type), distinguished by `refId`. Common kinds:
 *   - `room` — accommodation rooms (default capacity 2)
 *   - `vehicle_seat` — coach/van seats (capacity 1)
 *   - `cabin` — cruise cabins
 *
 * The kind field is a free-form string on the server; we constrain the
 * picker to the known set for UX, but operators can extend by typing.
 */
export interface OptionResourceTemplatesPanelProps {
  productId: string
  optionId: string
}

type ResourceTemplateKind = "room" | "vehicle_seat" | "cabin" | "flight_seat"
// Defaults populate the namePattern field when the operator picks a kind. They
// are starting points the operator edits before saving, not display labels —
// the localized prompt copy lives in the dialog's namePatternPlaceholder.
const COMMON_KINDS: ReadonlyArray<{ value: ResourceTemplateKind; defaultPattern: string }> = [
  // i18n-literal-ok
  { value: "room", defaultPattern: "Room {sequence}" },
  // i18n-literal-ok
  { value: "vehicle_seat", defaultPattern: "Seat {sequence}" },
  // i18n-literal-ok
  { value: "cabin", defaultPattern: "Cabin {sequence}" },
  // i18n-literal-ok
  { value: "flight_seat", defaultPattern: "Seat {sequence}" },
]

/** An optional integer field: blank clears it, anything unparseable is ignored. */
function optionalInteger(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number.parseInt(trimmed, 10)
  return Number.isFinite(parsed) ? parsed : null
}

export function OptionResourceTemplatesPanel({
  productId,
  optionId,
}: OptionResourceTemplatesPanelProps) {
  const adminMessages = useOperatorAdminMessages()
  const t = adminMessages.availability.details.resourceTemplates
  const { data, isPending, isError } = useProductResourceTemplates({ productId })
  const { upsert, remove } = useResourceTemplateMutation(productId)
  const materializeOpenSlots = useMaterializeOpenSlotsMutation(productId)

  const templates = useMemo(() => {
    const option = (data?.data ?? []).find((entry) => entry.id === optionId)
    return option?.templates ?? []
  }, [data?.data, optionId])
  const totalPerDeparture = useMemo(
    () => templates.reduce((sum, template) => sum + (template.defaultCount ?? 0), 0),
    [templates],
  )

  // The option's room units already carry quantity (maxQuantity) and occupancy
  // — generate departure inventory straight from them instead of re-typing it.
  const { data: unitsData } = useOptionUnits({ optionId, limit: 100 })
  const roomUnits = useMemo(
    () => (unitsData?.data ?? []).filter((unit) => unit.unitType === "room"),
    [unitsData?.data],
  )

  const [open, setOpen] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [seatMapOpen, setSeatMapOpen] = useState(false)
  const [editingKind, setEditingKind] = useState<string | null>(null)
  // The ref of the template being edited, so submit updates that exact
  // (option, kind, refId) row rather than colliding with siblings of the same
  // kind. Null for ref-less templates (the manual "Add" path).
  const [editingRefType, setEditingRefType] = useState<string | null>(null)
  const [editingRefId, setEditingRefId] = useState<string | null>(null)
  const [kindValue, setKindValue] = useState<string>("room")
  const [capacityValue, setCapacityValue] = useState<number>(2)
  const [occupancyMinValue, setOccupancyMinValue] = useState<string>("")
  const [bedConfigurationValue, setBedConfigurationValue] = useState<string>("")
  const [accessibleValue, setAccessibleValue] = useState<boolean>(false)
  const [minAgeValue, setMinAgeValue] = useState<string>("")
  const [maxAgeValue, setMaxAgeValue] = useState<string>("")
  const [defaultCountValue, setDefaultCountValue] = useState<number>(1)
  const [namePatternValue, setNamePatternValue] = useState<string>("Room {sequence}")
  const [layoutSpec, setLayoutSpec] = useState<SeatLayoutSpec | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applyResult, setApplyResult] = useState<string | null>(null)

  const derivedSeatCount = useMemo(() => countSeats(layoutSpec), [layoutSpec])
  const usingSeatMap = kindValue === "vehicle_seat" && layoutSpec !== null

  function openCreate() {
    setEditingKind(null)
    setEditingRefType(null)
    setEditingRefId(null)
    setKindValue("room")
    setCapacityValue(2)
    setOccupancyMinValue("")
    setBedConfigurationValue("")
    setAccessibleValue(false)
    setMinAgeValue("")
    setMaxAgeValue("")
    setDefaultCountValue(1)
    setNamePatternValue("Room {sequence}")
    setLayoutSpec(null)
    setError(null)
    setDialogOpen(true)
  }

  function openEdit(template: {
    kind: string
    refType: string | null
    refId: string | null
    capacity: number
    occupancyMin: number | null
    bedConfiguration: string | null
    accessible: boolean
    minAge: number | null
    maxAge: number | null
    defaultCount: number | null
    namePattern: string
    flags: Record<string, unknown>
  }) {
    setEditingKind(template.kind)
    setEditingRefType(template.refType)
    setEditingRefId(template.refId)
    setKindValue(template.kind)
    setCapacityValue(template.capacity)
    setOccupancyMinValue(template.occupancyMin == null ? "" : String(template.occupancyMin))
    setBedConfigurationValue(template.bedConfiguration ?? "")
    setAccessibleValue(template.accessible)
    setMinAgeValue(template.minAge == null ? "" : String(template.minAge))
    setMaxAgeValue(template.maxAge == null ? "" : String(template.maxAge))
    setDefaultCountValue(template.defaultCount ?? 0)
    setNamePatternValue(template.namePattern)
    setLayoutSpec(extractLayoutSpec(template.flags))
    setError(null)
    setDialogOpen(true)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const trimmedKind = kindValue.trim()
    const trimmedPattern = namePatternValue.trim()
    const effectiveCapacity = usingSeatMap ? derivedSeatCount : capacityValue
    if (!trimmedKind || !trimmedPattern || effectiveCapacity < 1) {
      setError(t.validation)
      return
    }
    const flags: Record<string, unknown> = {}
    if (trimmedKind === "vehicle_seat" && layoutSpec) {
      flags.layoutSpec = layoutSpec
    }
    try {
      await upsert.mutateAsync({
        optionId,
        kind: trimmedKind,
        input: {
          capacity: effectiveCapacity,
          occupancyMin: optionalInteger(occupancyMinValue),
          occupancyMax: usingSeatMap ? null : effectiveCapacity,
          bedConfiguration: bedConfigurationValue.trim() || null,
          accessible: accessibleValue,
          minAge: optionalInteger(minAgeValue),
          maxAge: optionalInteger(maxAgeValue),
          defaultCount: defaultCountValue > 0 ? defaultCountValue : null,
          namePattern: trimmedPattern,
          // Preserve the edited template's ref so the upsert targets its exact
          // (option, kind, refId) row instead of clobbering a sibling.
          refType: editingRefType,
          refId: editingRefId,
          flags,
        },
      })
      setDialogOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.saveFailed)
    }
  }

  async function handleRemove(kind: string, refId: string | null, label: string) {
    if (!globalThis.confirm?.(formatMessage(t.deleteConfirm, { kind: label }))) return
    try {
      await remove.mutateAsync({ optionId, kind, refId })
    } catch (err) {
      setError(err instanceof Error ? err.message : t.deleteFailed)
    }
  }

  async function generateFromRooms() {
    setError(null)
    try {
      for (const unit of roomUnits) {
        await upsert.mutateAsync({
          optionId,
          // All room types share kind "room"; they're distinguished — and
          // travelers are constrained to their booked type — by the option_unit
          // ref (allocator's groupUnitMatchScore: refType "option_unit" + refId
          // === bookedOptionUnitId). The widened (option, kind, ref) unique
          // index lets one option carry a "room" template per unit.
          kind: "room",
          input: {
            // `capacity` is the maximum; `occupancyMin` is its floor. Collapsing
            // the two into one number (the old `occupancyMax ?? occupancyMin`)
            // threw the floor away, so a triple sold to two people was
            // indistinguishable from a double sold to two, and the empty bed
            // nobody was billing for could not be reported.
            capacity: unit.occupancyMax ?? unit.occupancyMin ?? 1,
            occupancyMin: unit.occupancyMin ?? null,
            occupancyMax: unit.occupancyMax ?? unit.occupancyMin ?? null,
            // The age band the unit is sold under travels with it, so a
            // child-share room stops accepting adults.
            minAge: unit.minAge ?? null,
            maxAge: unit.maxAge ?? null,
            defaultCount: unit.maxQuantity ?? null,
            // {index} numbers each room type from 1 (Double 1…20), not the
            // global {sequence}, so the shared "room" pool reads cleanly.
            namePattern: `${unit.name} {index}`,
            refType: "option_unit",
            refId: unit.id,
            flags: {},
          },
        })
      }
      setOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.saveFailed)
    }
  }

  async function applyToOpenDepartures() {
    if (!globalThis.confirm?.(t.applyToOpenConfirm)) return
    setError(null)
    setApplyResult(null)
    try {
      const result = await materializeOpenSlots.mutateAsync({ optionId })
      setApplyResult(
        result.slots === 0
          ? t.applyToOpenEmpty
          : formatMessage(t.applyToOpenResult, {
              created: result.created,
              slots: result.slots,
            }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : t.applyToOpenFailed)
    }
  }

  const matchingCommon = COMMON_KINDS.find((entry) => entry.value === kindValue)
  const isExtendedKind = !matchingCommon && kindValue.trim().length > 0

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border bg-background/60">
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
          <Bed className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium text-sm">{t.title}</span>
          <Badge variant="secondary" className="font-normal">
            {templates.length === 0
              ? t.collapsedEmpty
              : formatMessage(t.collapsedSummary, {
                  count: templates.length,
                  total: totalPerDeparture,
                })}
          </Badge>
          <span className="flex-1" />
          {open ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-3 border-t p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-muted-foreground text-xs">{t.description}</p>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {templates.length > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void applyToOpenDepartures()}
                    disabled={materializeOpenSlots.isPending}
                  >
                    <CalendarCheck className="mr-1 size-4" aria-hidden="true" />
                    {t.applyToOpenButton}
                  </Button>
                ) : null}
                {roomUnits.length > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void generateFromRooms()}
                    disabled={upsert.isPending}
                  >
                    <Sparkles className="mr-1 size-4" aria-hidden="true" />
                    {t.generateFromRooms}
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={openCreate}>
                  <Plus className="mr-1 size-4" aria-hidden="true" />
                  {t.addButton}
                </Button>
              </div>
            </div>
            {applyResult ? (
              <p className="rounded-md bg-muted/50 px-3 py-2 text-muted-foreground text-xs">
                {applyResult}
              </p>
            ) : null}
            {error ? <p className="text-destructive text-xs">{error}</p> : null}
            {isPending ? (
              <p className="flex items-center justify-center gap-2 py-4 text-muted-foreground text-sm">
                <Loader2 className="size-3.5 animate-spin" />
              </p>
            ) : isError ? (
              <p className="py-4 text-center text-destructive text-sm">{t.loadFailed}</p>
            ) : templates.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-muted-foreground text-xs">
                {roomUnits.length > 0 ? t.generateFromRoomsHint : t.emptyMessage}
              </p>
            ) : (
              <ul className="divide-y overflow-hidden rounded-md border">
                {templates.map((template) => {
                  const kindLabel =
                    (t.kinds as Record<string, string>)[template.kind] ?? template.kind
                  // Several "room" templates share a kind but map to different
                  // option_units — surface the unit name so the operator can
                  // tell Single / Double / Triple rows apart.
                  const unit = template.refId
                    ? roomUnits.find((entry) => entry.id === template.refId)
                    : undefined
                  const displayLabel = unit?.name ?? kindLabel
                  return (
                    <li
                      key={template.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {displayLabel}
                          </Badge>
                          <span className="text-sm">
                            {formatMessage(t.capacitySummary, {
                              capacity: template.capacity,
                              count: template.defaultCount ?? 0,
                              pattern: template.namePattern,
                            })}
                          </span>
                          {template.kind === "vehicle_seat" ? (
                            <SeatMapSummaryBadge flags={template.flags} messages={t} />
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() =>
                            openEdit({
                              kind: template.kind,
                              refType: template.refType,
                              refId: template.refId,
                              capacity: template.capacity,
                              occupancyMin: template.occupancyMin,
                              bedConfiguration: template.bedConfiguration,
                              accessible: template.accessible,
                              minAge: template.minAge,
                              maxAge: template.maxAge,
                              defaultCount: template.defaultCount,
                              namePattern: template.namePattern,
                              flags: template.flags,
                            })
                          }
                        >
                          <Pencil className="size-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          onClick={() =>
                            void handleRemove(template.kind, template.refId, displayLabel)
                          }
                          disabled={remove.isPending}
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </CollapsibleContent>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingKind ? formatMessage(t.editTitle, { kind: editingKind }) : t.newTitle}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DialogBody className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="resource-template-kind">{t.kindLabel}</Label>
                <Select
                  value={isExtendedKind ? "__custom__" : kindValue}
                  onValueChange={(value) => {
                    if (!value || value === "__custom__") {
                      setKindValue("")
                      return
                    }
                    setKindValue(value)
                    const found = COMMON_KINDS.find((entry) => entry.value === value)
                    if (found && namePatternValue === "Room {sequence}") {
                      setNamePatternValue(found.defaultPattern)
                    }
                  }}
                  disabled={editingKind !== null}
                >
                  <SelectTrigger id="resource-template-kind" className="w-full">
                    <SelectValue placeholder={t.kindPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_KINDS.map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>
                        {t.kinds[entry.value]}
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom__">{t.kindCustomOption}</SelectItem>
                  </SelectContent>
                </Select>
                {isExtendedKind || editingKind ? (
                  <Input
                    value={kindValue}
                    onChange={(event) => setKindValue(event.target.value)}
                    placeholder={t.kindCustomInputPlaceholder}
                    disabled={editingKind !== null}
                  />
                ) : null}
              </div>
              {kindValue === "vehicle_seat" ? (
                <div className="grid gap-1.5">
                  <Label>{t.seatMapLabel}</Label>
                  {layoutSpec ? (
                    <div className="flex items-center gap-2 rounded-md border p-3">
                      <Armchair className="size-4 text-muted-foreground" aria-hidden="true" />
                      <div className="min-w-0 flex-1 text-sm">
                        {formatMessage(t.seatMapSummary, {
                          rows: layoutSpec.rows.length,
                          count: derivedSeatCount,
                        })}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setSeatMapOpen(true)}
                      >
                        <Pencil className="mr-1 size-3.5" aria-hidden="true" />
                        {t.seatMapEditButton}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 rounded-md border border-dashed p-3 text-sm">
                      <p className="text-muted-foreground">{t.seatMapEmpty}</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setSeatMapOpen(true)}
                      >
                        <Armchair className="mr-1 size-3.5" aria-hidden="true" />
                        {t.seatMapEditButton}
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}
              <div className="grid gap-1.5">
                <Label htmlFor="resource-template-capacity">{t.capacityLabel}</Label>
                <Input
                  id="resource-template-capacity"
                  type="number"
                  min={1}
                  value={usingSeatMap ? derivedSeatCount : capacityValue}
                  onChange={(event) => setCapacityValue(Number(event.target.value) || 1)}
                  disabled={usingSeatMap}
                />
                {usingSeatMap ? (
                  <p className="text-muted-foreground text-xs">
                    {formatMessage(t.capacityDerivedHint, { count: derivedSeatCount })}
                  </p>
                ) : null}
              </div>
              {kindValue === "vehicle_seat" || kindValue === "flight_seat" ? null : (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="resource-template-occupancy-min">{t.occupancyMinLabel}</Label>
                    <Input
                      id="resource-template-occupancy-min"
                      type="number"
                      min={1}
                      max={capacityValue}
                      value={occupancyMinValue}
                      onChange={(event) => setOccupancyMinValue(event.target.value)}
                    />
                    <p className="text-muted-foreground text-xs">{t.occupancyMinHint}</p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="resource-template-bed-configuration">
                      {t.bedConfigurationLabel}
                    </Label>
                    <Input
                      id="resource-template-bed-configuration"
                      value={bedConfigurationValue}
                      onChange={(event) => setBedConfigurationValue(event.target.value)}
                      placeholder={t.bedConfigurationPlaceholder}
                    />
                    <p className="text-muted-foreground text-xs">{t.bedConfigurationHint}</p>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>{t.ageBandLabel}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        aria-label={t.minAgeLabel}
                        type="number"
                        min={0}
                        max={120}
                        value={minAgeValue}
                        placeholder={t.minAgeLabel}
                        onChange={(event) => setMinAgeValue(event.target.value)}
                      />
                      <Input
                        aria-label={t.maxAgeLabel}
                        type="number"
                        min={0}
                        max={120}
                        value={maxAgeValue}
                        placeholder={t.maxAgeLabel}
                        onChange={(event) => setMaxAgeValue(event.target.value)}
                      />
                    </div>
                    <p className="text-muted-foreground text-xs">{t.ageBandHint}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <input
                      id="resource-template-accessible"
                      type="checkbox"
                      className="mt-1"
                      checked={accessibleValue}
                      onChange={(event) => setAccessibleValue(event.target.checked)}
                    />
                    <div className="grid gap-0.5">
                      <Label htmlFor="resource-template-accessible">{t.accessibleLabel}</Label>
                      <p className="text-muted-foreground text-xs">{t.accessibleHint}</p>
                    </div>
                  </div>
                </>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="resource-template-count">{t.defaultCountLabel}</Label>
                <Input
                  id="resource-template-count"
                  type="number"
                  min={0}
                  value={defaultCountValue}
                  onChange={(event) => setDefaultCountValue(Number(event.target.value) || 0)}
                />
                <p className="text-muted-foreground text-xs">{t.defaultCountHint}</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="resource-template-pattern">{t.namePatternLabel}</Label>
                <Input
                  id="resource-template-pattern"
                  value={namePatternValue}
                  onChange={(event) => setNamePatternValue(event.target.value)}
                  placeholder={t.namePatternPlaceholder}
                />
                <p className="text-muted-foreground text-xs">
                  {(() => {
                    const [before, after] = t.namePatternHint.split("{placeholder}")
                    return (
                      <>
                        {before}
                        <code>{"{sequence}"}</code>
                        {after}
                      </>
                    )
                  })()}
                </p>
              </div>
              {error ? <p className="text-destructive text-xs">{error}</p> : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                {t.cancel}
              </Button>
              <Button type="submit" disabled={upsert.isPending}>
                {upsert.isPending ? (
                  <Loader2 className="mr-1 size-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                {editingKind ? t.save : t.createButton}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={seatMapOpen} onOpenChange={setSeatMapOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t.seatMapDialogTitle}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <SeatMapBuilder value={layoutSpec} onChange={setLayoutSpec} />
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => setSeatMapOpen(false)}>
              {t.seatMapDialogDone}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Collapsible>
  )
}
