"use client"

import type {
  AllocationManifestTraveler,
  AllocationResource,
} from "@voyant-travel/operations-react/availability"
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectionActionBar,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import { Link2, Unlink2 } from "lucide-react"
import { useState } from "react"

import type { AllocationUiMessages } from "../i18n/index.js"
import { kindLabel } from "./slot-allocation-model.js"

/** Sentinel for "take these travelers out of this kind entirely". */
export const BULK_UNASSIGN_VALUE = "__unassign__"

/**
 * The sharing group the whole selection belongs to, or `null` when the
 * selection spans several groups (or none). Renaming and ungrouping only make
 * sense against exactly one group — a rename that silently picked the first of
 * three would be a data-loss trap.
 */
export function commonSharingGroupId(
  travelers: readonly AllocationManifestTraveler[],
): string | null {
  if (travelers.length === 0) return null
  const first = travelers[0]?.sharingGroupId ?? null
  if (!first) return null
  return travelers.every((traveler) => traveler.sharingGroupId === first) ? first : null
}

export interface AllocationBulkBarProps {
  kind: string
  selected: readonly AllocationManifestTraveler[]
  /** Destinations of the active kind. Vehicles are excluded by the caller. */
  resources: readonly AllocationResource[]
  sharingGroupLabels: Record<string, string>
  messages: AllocationUiMessages
  onClear: () => void
  /** `null` unassigns the selection from this kind. One atomic batch. */
  onMove: (resourceId: string | null) => void
  onGroupTogether: () => void
  onUngroup: () => void
  onRenameGroup: (input: { groupId: string; label: string }) => void
  onClearGroupLabel: (groupId: string) => void
  movePending: boolean
  groupPending: boolean
}

export function AllocationBulkBar({
  kind,
  selected,
  resources,
  sharingGroupLabels,
  messages,
  onClear,
  onMove,
  onGroupTogether,
  onUngroup,
  onRenameGroup,
  onClearGroupLabel,
  movePending,
  groupPending,
}: AllocationBulkBarProps) {
  const copy = messages.bulk
  const [target, setTarget] = useState<string>("")
  const [renaming, setRenaming] = useState(false)
  const groupId = commonSharingGroupId(selected)
  const [groupLabel, setGroupLabel] = useState("")

  if (selected.length === 0) return null

  const resolveTargetLabel = (value: string) =>
    value === BULK_UNASSIGN_VALUE
      ? copy.unassignTarget
      : (resources.find((resource) => resource.id === value)?.label ?? kindLabel(kind, messages))

  return (
    <div data-slot="allocation-bulk-bar" className="flex flex-col gap-2">
      <SelectionActionBar
        selectedCount={selected.length}
        onClear={onClear}
        clearLabel={copy.clear}
        selectionSummary={copy.selectedSummary.replace("{count}", String(selected.length))}
      >
        <div data-slot="allocation-bulk-target">
          <Select value={target} onValueChange={(value) => setTarget(String(value ?? ""))}>
            <SelectTrigger aria-label={copy.moveTo} className="w-56">
              <SelectValue placeholder={copy.moveToPlaceholder}>
                {(value) => resolveTargetLabel(String(value))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={BULK_UNASSIGN_VALUE}>{copy.unassignTarget}</SelectItem>
              {resources.map((resource) => (
                <SelectItem key={resource.id} value={resource.id}>
                  {resource.label ?? kindLabel(kind, messages)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          size="sm"
          data-slot="allocation-bulk-move"
          disabled={movePending || target.length === 0}
          onClick={() => onMove(target === BULK_UNASSIGN_VALUE ? null : target)}
        >
          {movePending ? copy.moving : copy.move}
        </Button>
        {selected.length > 1 && !groupId ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={groupPending}
            onClick={onGroupTogether}
          >
            <Link2 data-icon="inline-start" aria-hidden="true" />
            {copy.groupTogether}
          </Button>
        ) : null}
        {groupId ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={groupPending}
              onClick={() => {
                setGroupLabel(sharingGroupLabels[groupId] ?? "")
                setRenaming((open) => !open)
              }}
            >
              {copy.renameGroup}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={groupPending}
              onClick={onUngroup}
            >
              <Unlink2 data-icon="inline-start" aria-hidden="true" />
              {copy.ungroup}
            </Button>
          </>
        ) : null}
      </SelectionActionBar>

      {groupId && renaming ? (
        <form
          data-slot="allocation-bulk-rename"
          className="flex flex-wrap items-end gap-2 rounded-md border px-3 py-2"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmed = groupLabel.trim()
            if (trimmed.length === 0) return
            onRenameGroup({ groupId, label: trimmed })
            setRenaming(false)
          }}
        >
          <div className="grid min-w-48 flex-1 gap-1">
            <Label className="text-xs" htmlFor="allocation-sharing-group-label">
              {copy.renameGroupLabel}
            </Label>
            <Input
              id="allocation-sharing-group-label"
              value={groupLabel}
              onChange={(event) => setGroupLabel(event.target.value)}
            />
          </div>
          <Button type="submit" size="sm" disabled={groupPending}>
            {copy.saveGroupLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={groupPending}
            onClick={() => {
              onClearGroupLabel(groupId)
              setRenaming(false)
            }}
          >
            {copy.clearGroupLabel}
          </Button>
        </form>
      ) : null}
    </div>
  )
}
