"use client"

import {
  Button,
  Input,
  Label,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
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
import { Link2, Plus, X } from "lucide-react"
import * as React from "react"
import { useBookingsUiMessagesOrDefault } from "../i18n/provider.js"
import { type BookingGroupRecord, useBookingGroups } from "../index.js"

export type SharedRoomMode = "create" | "join"

export interface SharedRoomValue {
  enabled: boolean
  mode: SharedRoomMode
  /** Only meaningful in "join" mode. */
  groupId: string
  /** Optional label used when creating a new shared-room group. */
  groupLabel?: string
}

export const emptySharedRoomValue: SharedRoomValue = {
  enabled: false,
  mode: "create",
  groupId: "",
  groupLabel: "",
}

export function clearSharedRoomValue(): SharedRoomValue {
  return { ...emptySharedRoomValue }
}

export interface SharedRoomSectionProps {
  value: SharedRoomValue
  onChange: (value: SharedRoomValue) => void
  /**
   * The product context for fetching joinable groups. When unset, the join
   * combobox is disabled even if the user toggles into join mode.
   */
  productId?: string
  enabled?: boolean
  labels?: {
    toggle?: string
    createMode?: string
    joinMode?: string
    selectPlaceholder?: string
    noGroups?: string
    createHint?: string
    createSheetTitle?: string
    groupLabel?: string
    groupLabelPlaceholder?: string
    createAction?: string
    remove?: string
  }
}

/**
 * Shared-room (partaj) attachment section. Operators can create a new group in
 * a sheet or join an existing product-scoped group with an async combobox.
 */
export function SharedRoomSection({
  value,
  onChange,
  productId,
  enabled = true,
  labels,
}: SharedRoomSectionProps) {
  const [groupSearch, setGroupSearch] = React.useState("")
  const [groupInputValue, setGroupInputValue] = React.useState("")
  const [createSheetOpen, setCreateSheetOpen] = React.useState(false)
  const [draftGroupLabel, setDraftGroupLabel] = React.useState(value.groupLabel ?? "")
  const messages = useBookingsUiMessagesOrDefault()
  const merged = { ...messages.sharedRoomSection.labels, ...labels }

  const { data: groupsData } = useBookingGroups({
    kind: "shared_room",
    productId: productId || undefined,
    limit: 50,
    enabled: enabled && value.enabled && value.mode === "join" && Boolean(productId),
  })
  const existingGroups = React.useMemo(() => {
    const normalizedSearch = groupSearch.trim().toLowerCase()
    const groups = groupsData?.data ?? []
    if (!normalizedSearch) return groups
    return groups.filter((group) => group.label.toLowerCase().includes(normalizedSearch))
  }, [groupsData?.data, groupSearch])
  const groupsMap = React.useMemo(
    () => new Map((groupsData?.data ?? []).map((group) => [group.id, group])),
    [groupsData?.data],
  )
  const selectedGroupLabel = value.groupId ? (groupsMap.get(value.groupId)?.label ?? "") : ""

  React.useEffect(() => {
    if (selectedGroupLabel) setGroupInputValue(selectedGroupLabel)
  }, [selectedGroupLabel])

  React.useEffect(() => {
    if (createSheetOpen) setDraftGroupLabel(value.groupLabel ?? "")
  }, [createSheetOpen, value.groupLabel])

  const set = (patch: Partial<SharedRoomValue>) => onChange({ ...value, ...patch })
  const clear = () => {
    if (!enabled) return
    setCreateSheetOpen(false)
    setDraftGroupLabel("")
    setGroupInputValue("")
    setGroupSearch("")
    onChange(clearSharedRoomValue())
  }
  const selectCreateMode = () => {
    if (!enabled) return
    setCreateSheetOpen(true)
  }
  const selectJoinMode = () => {
    if (!enabled) return
    set({ enabled: true, mode: "join", groupLabel: "" })
  }
  const saveCreateLabel = () => {
    set({
      enabled: true,
      mode: "create",
      groupId: "",
      groupLabel: draftGroupLabel.trim(),
    })
    setCreateSheetOpen(false)
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-md border p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <Label>{merged.toggle}</Label>
            {value.enabled && value.mode === "create" && value.groupLabel ? (
              <p className="truncate text-xs text-muted-foreground">{value.groupLabel}</p>
            ) : value.enabled && value.mode === "create" ? (
              <p className="text-xs text-muted-foreground">{merged.createHint}</p>
            ) : null}
          </div>
          {value.enabled ? (
            <Button type="button" size="sm" variant="ghost" onClick={clear} disabled={!enabled}>
              <X className="mr-2 h-4 w-4" />
              {merged.remove}
            </Button>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            size="sm"
            variant={value.enabled && value.mode === "create" ? "default" : "outline"}
            onClick={selectCreateMode}
            disabled={!enabled}
          >
            <Plus className="mr-2 h-4 w-4" />
            {merged.createMode}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={value.enabled && value.mode === "join" ? "default" : "outline"}
            onClick={selectJoinMode}
            disabled={!enabled || !productId}
          >
            <Link2 className="mr-2 h-4 w-4" />
            {merged.joinMode}
          </Button>
        </div>

        {value.enabled && value.mode === "join" ? (
          <Combobox
            items={existingGroups.map((group) => group.id)}
            value={value.groupId || null}
            inputValue={groupInputValue}
            autoHighlight
            disabled={!enabled || !productId}
            itemToStringLabel={(id) => groupsMap.get(id as string)?.label ?? ""}
            itemToStringValue={(id) => groupsMap.get(id as string)?.label ?? ""}
            onInputValueChange={(next) => {
              setGroupInputValue(next)
              setGroupSearch(next)
              if (!next) set({ groupId: "" })
            }}
            onValueChange={(next) => {
              const groupId = (next as string | null) ?? ""
              set({ groupId })
              setGroupInputValue(groupId ? (groupsMap.get(groupId)?.label ?? "") : "")
            }}
          >
            <ComboboxInput placeholder={merged.selectPlaceholder} showClear={!!value.groupId} />
            <ComboboxContent>
              <ComboboxEmpty>{merged.noGroups}</ComboboxEmpty>
              <ComboboxList>
                <ComboboxCollection>
                  {(id) => {
                    const group = groupsMap.get(id as string)
                    if (!group) return null
                    return <SharedRoomGroupItem key={group.id} group={group} />
                  }}
                </ComboboxCollection>
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        ) : null}
      </div>

      <Sheet open={createSheetOpen} onOpenChange={setCreateSheetOpen}>
        <SheetContent side="right" size="default">
          <SheetHeader>
            <SheetTitle>{merged.createSheetTitle}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <div className="flex flex-col gap-2">
              <Label htmlFor="shared-room-group-label">{merged.groupLabel}</Label>
              <Input
                id="shared-room-group-label"
                value={draftGroupLabel}
                onChange={(event) => setDraftGroupLabel(event.target.value)}
                placeholder={merged.groupLabelPlaceholder}
              />
              <p className="text-xs text-muted-foreground">{merged.createHint}</p>
            </div>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => setCreateSheetOpen(false)}>
              {messages.common.cancel}
            </Button>
            <Button type="button" onClick={saveCreateLabel}>
              {merged.createAction}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}

function SharedRoomGroupItem({ group }: { group: BookingGroupRecord }) {
  return (
    <ComboboxItem value={group.id}>
      <span className="truncate font-medium">{group.label}</span>
    </ComboboxItem>
  )
}
