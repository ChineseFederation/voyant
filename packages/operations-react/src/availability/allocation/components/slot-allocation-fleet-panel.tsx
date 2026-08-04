"use client"

import type { AllocationResource } from "@voyant-travel/operations-react/availability"
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components"
import { Bus, Unlink } from "lucide-react"

import type { AllocationUiMessages } from "../i18n/index.js"
import { kindLabel } from "./slot-allocation-model.js"

/**
 * The fleet records this departure operates — `allocation_resources` rows whose
 * `refType` is `"resource"`. Detaching removes the departure container (and,
 * with `cascade`, its seats), clears the travelers who sat in them and releases
 * the cross-departure commitment so the coach is bookable elsewhere again.
 */
export interface AllocationFleetPanelProps {
  /** Attached rows, already filtered to `refType === "resource"` by the server. */
  attached: readonly AllocationResource[]
  messages: AllocationUiMessages
  /** Called with the **fleet** `resources.id` (`refId`), not the container id. */
  onDetach: (input: { resourceId: string; cascade: boolean }) => void
  /** Container ids that currently hold child rows (a laid-out coach). */
  parentIdsWithChildren: ReadonlySet<string>
  detachPending: boolean
}

export function AllocationFleetPanel({
  attached,
  messages,
  onDetach,
  parentIdsWithChildren,
  detachPending,
}: AllocationFleetPanelProps) {
  const copy = messages.fleet

  return (
    <section data-slot="allocation-fleet" className="flex flex-col gap-2">
      <header className="flex min-w-0 items-center gap-2">
        <Bus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="font-semibold text-sm">{copy.attachedTitle}</h2>
          <p className="text-muted-foreground text-xs">{copy.attachedDescription}</p>
        </div>
      </header>

      {attached.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-6 text-muted-foreground text-sm">
          {copy.attachedEmpty}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>{messages.resourceLabel}</TableHead>
                <TableHead className="w-32">{messages.resources}</TableHead>
                <TableHead className="w-24 text-center">{messages.capacity}</TableHead>
                <TableHead className="w-28 text-right">&nbsp;</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attached.map((resource) => {
                const hasChildren = parentIdsWithChildren.has(resource.id)
                return (
                  <TableRow key={resource.id} data-slot="allocation-fleet-row">
                    <TableCell className="font-medium">
                      {resource.label ?? kindLabel(resource.kind, messages)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{kindLabel(resource.kind, messages)}</Badge>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{resource.capacity}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={detachPending || !resource.refId}
                        title={hasChildren ? copy.detachHasChildren : copy.detachConfirm}
                        onClick={() => {
                          if (!resource.refId) return
                          onDetach({ resourceId: resource.refId, cascade: hasChildren })
                        }}
                      >
                        <Unlink data-icon="inline-start" aria-hidden="true" />
                        {copy.detach}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
