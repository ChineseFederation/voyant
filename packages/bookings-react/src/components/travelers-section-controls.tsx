"use client"

import {
  type PersonRecord,
  type PersonRelationshipRecord,
  usePeople,
  usePerson,
} from "@voyant-travel/relationships-react"
import { PersonForm } from "@voyant-travel/relationships-react/ui"
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
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
import { Pencil, UserPlus } from "lucide-react"
import * as React from "react"
import { useBookingsUiMessagesOrDefault } from "../i18n/provider.js"
import {
  getDynamicTravelerCategoryButtonState,
  getSelectableTravelerCategoryUnits,
  getStaticTravelerCategoryButtonState,
  shouldUseStaticTravelerCategoryFallback,
} from "./traveler-category-buttons.js"
import type {
  RoomGroup,
  TravelerEntry,
  TravelerPricingCategoryOption,
  TravelerRole,
  TravelersSectionProps,
} from "./travelers-section.js"
import { deriveTravelerRoleFromDob } from "./travelers-section.js"

function createClientTravelerKey(): string {
  const random =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID().replace(/-/g, "")
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return `trav:${random}`
}

export function TravelerPersonPicker({
  personId,
  labels,
  pinnedPeople = [],
  onSelect,
  onClear,
}: {
  personId: string | null
  labels: NonNullable<TravelersSectionProps["labels"]>
  pinnedPeople?: PersonRecord[]
  onSelect: (person: PersonRecord) => void
  onClear: () => void
}) {
  const [search, setSearch] = React.useState("")
  const [inputValue, setInputValue] = React.useState("")
  // One Sheet serves both flows: create when there's no selected person,
  // edit when the operator clicks the Edit button on a selected one.
  const [sheetMode, setSheetMode] = React.useState<"create" | "edit">("create")
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const peopleQuery = usePeople({ search: search || undefined, limit: 20 })
  const selectedPersonQuery = usePerson(personId ?? undefined, { enabled: Boolean(personId) })
  const people = React.useMemo(() => {
    const map = new Map<string, PersonRecord>()
    for (const person of peopleQuery.data?.data ?? []) map.set(person.id, person)
    for (const person of pinnedPeople) map.set(person.id, person)
    if (selectedPersonQuery.data) map.set(selectedPersonQuery.data.id, selectedPersonQuery.data)
    return Array.from(map.values())
  }, [peopleQuery.data?.data, pinnedPeople, selectedPersonQuery.data])
  const peopleMap = React.useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people],
  )
  const selectedLabel = personId ? formatPerson(peopleMap.get(personId)) : ""

  React.useEffect(() => {
    if (selectedLabel) setInputValue(selectedLabel)
  }, [selectedLabel])

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{labels.person}</Label>
        <div className="flex items-center gap-1">
          {personId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7"
              disabled={!selectedPersonQuery.data}
              onClick={() => {
                setSheetMode("edit")
                setSheetOpen(true)
              }}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" />
              {labels.editPerson}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => {
              setSheetMode("create")
              setSheetOpen(true)
            }}
          >
            <UserPlus className="mr-1 h-3.5 w-3.5" />
            {labels.createNewPerson}
          </Button>
        </div>
      </div>
      <Combobox
        items={people.map((person) => person.id)}
        value={personId}
        inputValue={inputValue}
        autoHighlight
        // `itemToStringLabel` drives BOTH the filter pass and the
        // input display. Without it, base-ui falls back to the raw
        // value (a `pers_…` typeid), so typing "eliza" matches
        // nothing and the trigger shows the id instead of the name.
        itemToStringLabel={(id) => formatPerson(peopleMap.get(id as string)) || (id as string)}
        itemToStringValue={(id) => id as string}
        onInputValueChange={(next) => {
          setInputValue(next)
          setSearch(next)
          if (!next) onClear()
        }}
        onValueChange={(next) => {
          const nextPerson = peopleMap.get((next as string | null) ?? "")
          if (nextPerson) onSelect(nextPerson)
          setInputValue(nextPerson ? formatPerson(nextPerson) : "")
        }}
      >
        <ComboboxInput placeholder={labels.personSearchPlaceholder} showClear={!!personId} />
        <ComboboxContent>
          <ComboboxEmpty>{labels.personEmpty}</ComboboxEmpty>
          <ComboboxList>
            <ComboboxCollection>
              {(id) => {
                const person = peopleMap.get(id as string)
                if (!person) return null
                return (
                  <ComboboxItem key={person.id} value={person.id}>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{formatPersonName(person)}</span>
                      {person.email ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {person.email}
                        </span>
                      ) : null}
                    </div>
                  </ComboboxItem>
                )
              }}
            </ComboboxCollection>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" size="lg">
          <SheetHeader>
            <SheetTitle>
              {sheetMode === "edit" ? labels.editPersonSheetTitle : labels.createPersonSheetTitle}
            </SheetTitle>
          </SheetHeader>
          <SheetBody>
            <PersonForm
              mode={
                sheetMode === "edit" && selectedPersonQuery.data
                  ? { kind: "edit", person: selectedPersonQuery.data }
                  : { kind: "create" }
              }
              onCancel={() => setSheetOpen(false)}
              onSuccess={(saved) => {
                onSelect(saved)
                setInputValue(formatPerson(saved))
                setSheetOpen(false)
              }}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  )
}

export function createTravelerFromPerson(person: PersonRecord, role: TravelerRole): TravelerEntry {
  // DOB drives age-banded pricing — hydrate from the person record so
  // the operator doesn't have to re-enter it on every booking. The
  // caller's `role` still wins (e.g. "lead" on the first traveler) so
  // the booking-lead flag isn't clobbered by the age-derived category.
  const dateOfBirth = person.dateOfBirth ?? null
  const effectiveRole: TravelerRole =
    role === "lead" ? "lead" : deriveTravelerRoleFromDob(dateOfBirth)
  return {
    clientTravelerKey: createClientTravelerKey(),
    personId: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email ?? "",
    phone: person.phone ?? "",
    preferredLanguage: person.preferredLanguage ?? "",
    role: effectiveRole,
    dateOfBirth,
    pricingUnitId: null,
    pricingCategoryId: null,
    pricingCategorySource: "auto",
    inventoryUnitId: null,
    pricingUnitSource: "auto",
    inventoryUnitSource: "auto",
  }
}

function formatPersonName(person: PersonRecord | undefined): string {
  if (!person) return ""
  return [person.firstName, person.lastName].filter(Boolean).join(" ").trim()
}

function formatPerson(person: PersonRecord | undefined): string {
  if (!person) return ""
  const name = formatPersonName(person)
  return person.email ? `${name} · ${person.email}` : name
}

/**
 * Dynamic category-button group. Reads the product's actual
 * person-typed option_units (Adult/Child/Senior, Adult/Child/Infant,
 * Adult/Senior, etc) from `roomGroups` and renders one button per
 * unit in the traveler's currently-assigned option.
 *
 * Falls back to the old static Adult/Child/Infant buttons when the
 * parent hasn't wired `roomGroups` (during the brief window before a
 * product is selected, or in legacy callers that don't pass the prop).
 */
export function TravelerCategoryButtons({
  traveler,
  roomGroups,
  fallbackLabels,
  onPickUnit,
}: {
  traveler: TravelerEntry
  roomGroups?: RoomGroup[]
  fallbackLabels: { category: string; adult: string; child: string; infant: string }
  /**
   * Called when the operator clicks a category button. `source`
   * signals whether the click selected a real unit (`"manual"` —
   * dynamic per-product button) or merely chose a role with no
   * actual unit pick (`"auto"` — static fallback before units load).
   * The wrapping handler uses `source` to decide whether to freeze
   * the current `pricingUnitId` as a manual choice.
   */
  onPickUnit: (unitId: string | null, nextRole: TravelerRole, source: "manual" | "auto") => void
}) {
  const group = React.useMemo<RoomGroup | undefined>(() => {
    if (!roomGroups) return undefined
    const assignedUnitId = traveler.inventoryUnitId ?? traveler.pricingUnitId
    if (!assignedUnitId) return undefined
    return roomGroups.find(
      (g) => g.primaryUnitId === assignedUnitId || g.units.some((u) => u.unitId === assignedUnitId),
    )
  }, [roomGroups, traveler.inventoryUnitId, traveler.pricingUnitId])

  // Surface only person-typed units (Adult, Child, Senior, Infant,
  // …). Vehicles / rooms / services aren't categories the operator
  // toggles on a per-traveler basis.
  const categoryUnits = React.useMemo(() => {
    if (!group) return []
    return getSelectableTravelerCategoryUnits(group.units)
  }, [group])

  if (group && categoryUnits.length === 1) {
    // Single person-typed unit — no category choice to make.
    return null
  }

  if (shouldUseStaticTravelerCategoryFallback(Boolean(group), categoryUnits.length)) {
    // Fallback to traveler roles before a product/option is selected
    // or when the selected option is room-only. Room inventory remains
    // a separate dropdown; these buttons only set the traveler's role.
    return (
      <div className="flex flex-col gap-1">
        <Label className="text-xs">{fallbackLabels.category}</Label>
        <div className="grid grid-cols-3 gap-1">
          {(
            [
              ["adult", fallbackLabels.adult],
              ["child", fallbackLabels.child],
              ["infant", fallbackLabels.infant],
            ] as const
          ).map(([category, label]) => {
            const { active, nextRole, shouldUpdate } = getStaticTravelerCategoryButtonState(
              traveler,
              category,
            )
            return (
              <Button
                key={category}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => {
                  // Static fallback: operator chose a role, not a
                  // concrete unit. Pass `source: "auto"` so the
                  // resolver re-derives the unit instead of freezing
                  // a stale auto-assignment as manual.
                  if (shouldUpdate) onPickUnit(traveler.pricingUnitId, nextRole, "auto")
                }}
              >
                {label}
              </Button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{fallbackLabels.category}</Label>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${categoryUnits.length}, minmax(0, 1fr))` }}
      >
        {categoryUnits.map((unit) => {
          const { active, nextRole, shouldUpdate } = getDynamicTravelerCategoryButtonState(
            traveler,
            unit,
          )
          return (
            <Button
              key={unit.unitId}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => {
                // Dynamic button: real unit pick, freeze as manual.
                if (shouldUpdate) onPickUnit(unit.unitId, nextRole, "manual")
              }}
              title={
                unit.minAge != null || unit.maxAge != null
                  ? `${unit.minAge ?? "0"}–${unit.maxAge ?? "∞"}`
                  : undefined
              }
            >
              {unit.unitName}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

export function TravelerPricingCategorySelect({
  traveler,
  categories,
  label,
  onPickCategory,
}: {
  traveler: TravelerEntry
  categories: TravelerPricingCategoryOption[]
  label: string
  onPickCategory: (category: TravelerPricingCategoryOption) => void
}) {
  const selectableCategories = React.useMemo(() => {
    if (!traveler.inventoryUnitId) return categories
    const filtered = categories.filter((category) =>
      category.unitIds.includes(traveler.inventoryUnitId ?? ""),
    )
    return filtered.length > 0 ? filtered : categories
  }, [categories, traveler.inventoryUnitId])
  const selectedCategory =
    selectableCategories.find((category) => category.categoryId === traveler.pricingCategoryId) ??
    selectableCategories[0] ??
    null
  const selectItems = React.useMemo(
    () =>
      selectableCategories.map((category) => ({
        label: category.name,
        value: category.categoryId,
      })),
    [selectableCategories],
  )

  if (!selectedCategory) return null

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <Select
        items={selectItems}
        value={selectedCategory.categoryId}
        onValueChange={(value) => {
          const category = selectableCategories.find((candidate) => candidate.categoryId === value)
          if (category) onPickCategory(category)
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {selectableCategories.map((category) => (
            <SelectItem key={category.categoryId} value={category.categoryId}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function RelatedPersonChip({
  personId,
  kind,
  addLabel,
  onAdd,
}: {
  personId: string
  kind: PersonRelationshipRecord["kind"]
  addLabel: string
  onAdd: (person: PersonRecord) => void
}) {
  const messages = useBookingsUiMessagesOrDefault()
  const kindLabels = messages.travelersSection.relationshipKindLabels
  const query = usePerson(personId)
  const person = query.data
  if (!person) return null
  const name = formatPersonName(person) || personId
  const kindLabel = kindLabels[kind as keyof typeof kindLabels] ?? kind
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 gap-1.5"
      onClick={() => onAdd(person)}
      aria-label={addLabel}
    >
      <UserPlus className="h-3.5 w-3.5" />
      <span className="text-xs">{name}</span>
      <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
        {kindLabel}
      </span>
    </Button>
  )
}
