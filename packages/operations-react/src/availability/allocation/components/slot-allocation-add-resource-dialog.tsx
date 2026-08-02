"use client"

import {
  Button,
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
import { AlertTriangle } from "lucide-react"
import type { FormEvent } from "react"

import type { useAllocationUiMessagesOrDefault } from "../i18n/index.js"
import {
  kindLabel,
  type ResourceCapacitySummary,
  ROOM_KIND,
  VEHICLE_SEAT_KIND,
} from "./slot-allocation-model.js"

type ResourceTemplateOption = {
  id: string
  name: string
  templates: ReadonlyArray<{ kind: string; capacity: number }>
}

export function AddResourceDialog({
  open,
  onOpenChange,
  onSubmit,
  activeKind,
  resourceLabel,
  onResourceLabelChange,
  resourceCapacity,
  onResourceCapacityChange,
  resourceOptionId,
  onResourceOptionIdChange,
  resourceParentId,
  onResourceParentIdChange,
  parentResources,
  resourceOptions,
  projectedSummary,
  createPending,
  messages,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  activeKind: string
  resourceLabel: string
  onResourceLabelChange: (value: string) => void
  resourceCapacity: number
  onResourceCapacityChange: (value: number) => void
  resourceOptionId: string | null
  onResourceOptionIdChange: (value: string | null) => void
  resourceParentId: string | null
  onResourceParentIdChange: (value: string | null) => void
  parentResources: ReadonlyArray<{ id: string; label: string | null }>
  resourceOptions: ReadonlyArray<ResourceTemplateOption>
  projectedSummary: ResourceCapacitySummary | null
  createPending: boolean
  messages: ReturnType<typeof useAllocationUiMessagesOrDefault>
}) {
  const parentRequired = activeKind === VEHICLE_SEAT_KIND

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{messages.addResource}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DialogBody className="grid gap-4">
            {resourceOptions.length > 0 ? (
              <div className="grid gap-1.5">
                <Label htmlFor="allocation-resource-option">{messages.resourceOption}</Label>
                <Select
                  value={resourceOptionId ?? "__none__"}
                  onValueChange={(value) => {
                    const next = value === "__none__" ? null : value
                    onResourceOptionIdChange(next)
                    if (next) {
                      const option = resourceOptions.find((entry) => entry.id === next)
                      const template = option?.templates.find((entry) => entry.kind === activeKind)
                      if (template?.capacity) onResourceCapacityChange(template.capacity)
                    }
                  }}
                >
                  <SelectTrigger id="allocation-resource-option" className="w-full">
                    <SelectValue placeholder={messages.resourceOptionPlaceholder}>
                      {(value) =>
                        value === "__none__"
                          ? messages.resourceOptionNone
                          : (resourceOptions.find((option) => option.id === value)?.name ?? value)
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{messages.resourceOptionNone}</SelectItem>
                    {resourceOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {parentRequired ? (
              <div className="grid gap-1.5">
                <Label htmlFor="allocation-resource-parent">{messages.resourceParent}</Label>
                {parentResources.length > 0 ? (
                  <Select
                    value={resourceParentId ?? ""}
                    onValueChange={(value) => onResourceParentIdChange(value || null)}
                  >
                    <SelectTrigger id="allocation-resource-parent" className="w-full">
                      <SelectValue placeholder={messages.resourceParentPlaceholder}>
                        {(value) =>
                          parentResources.find((resource) => resource.id === value)?.label ?? value
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {parentResources.map((resource) => (
                        <SelectItem key={resource.id} value={resource.id}>
                          {resource.label ?? messages.vehicle}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm text-muted-foreground">{messages.resourceParentRequired}</p>
                )}
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="allocation-resource-label">{messages.resourceLabel}</Label>
              <Input
                id="allocation-resource-label"
                value={resourceLabel}
                onChange={(event) => onResourceLabelChange(event.target.value)}
                placeholder={activeKind === ROOM_KIND ? "102" : kindLabel(activeKind, messages)}
                required={parentRequired}
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="allocation-resource-capacity">{messages.resourceCapacity}</Label>
              <Input
                id="allocation-resource-capacity"
                type="number"
                min={1}
                max={activeKind === VEHICLE_SEAT_KIND ? 1 : undefined}
                value={resourceCapacity}
                disabled={activeKind === VEHICLE_SEAT_KIND}
                onChange={(event) => onResourceCapacityChange(Number(event.target.value) || 1)}
              />
            </div>
            {projectedSummary?.status === "over" && projectedSummary.delta != null ? (
              <div
                className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
                role="status"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {/* i18n-literal-ok numeric interpolation only */}
                <span>
                  {messages.overCapacityWarning} {projectedSummary.resourceCapacity}/
                  {projectedSummary.slotPax ?? "—"} ({messages.resourceCapacityOver}:{" "}
                  {projectedSummary.delta})
                </span>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {messages.cancel}
            </Button>
            <Button
              type="submit"
              disabled={
                createPending ||
                (parentRequired && (!resourceParentId || resourceLabel.trim().length === 0))
              }
            >
              {messages.createResource}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
