"use client"

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
import { ExternalLink } from "lucide-react"
import type { AvailabilityUiMessages } from "../i18n/index.js"
import type { DepartureResourceRow, DepartureSummary } from "../index.js"
import {
  type DepartureLinkTarget,
  resolveAllocationResourceTarget,
} from "./departure-deep-links.js"
import { DepartureSection } from "./departure-stat.js"

/**
 * The whole-departure resource census, with every row's persisted reference
 * resolved into somewhere the operator can go (AC8).
 *
 * The allocation manager below it is per-kind and interactive; this is the
 * flat, complete list the summary computes, which is also the only place the
 * `ref_type` / `ref_id` a template or the materializer wrote has ever been
 * shown. Rows whose reference resolves to nothing render as plain labels — a
 * dead link is worse than no link.
 */
export function DepartureResourcesSection({
  summary,
  messages,
  productId,
  onOpenLink,
}: {
  summary: DepartureSummary | null
  messages: AvailabilityUiMessages
  productId: string | null
  onOpenLink?: (target: DepartureLinkTarget) => void
}) {
  const copy = messages.details.departure.resources
  const links = messages.details.departure.links
  const rows = summary?.capacity.resourceBreakdown ?? []

  if (rows.length === 0) return null

  return (
    <DepartureSection slot="departure-resources" title={copy.title} description={copy.description}>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{copy.columnResource}</TableHead>
              <TableHead>{copy.columnCapacity}</TableHead>
              <TableHead>{copy.columnAssigned}</TableHead>
              <TableHead>{copy.columnAvailable}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((resource) => (
              <TableRow key={resource.id}>
                <TableCell>
                  <span className="flex flex-wrap items-center gap-2">
                    <ResourceLabel
                      resource={resource}
                      productId={productId}
                      linkLabels={links}
                      onOpenLink={onOpenLink}
                    />
                    {resource.assigned > resource.capacity ? (
                      <Badge
                        variant="outline"
                        className="border-transparent bg-red-500/10 text-red-600 dark:text-red-400"
                      >
                        {copy.overCapacityBadge}
                      </Badge>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="tabular-nums">{resource.capacity}</TableCell>
                <TableCell className="tabular-nums">{resource.assigned}</TableCell>
                <TableCell className="tabular-nums">{resource.available}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </DepartureSection>
  )
}

/**
 * A resource's operator-facing name. `allocation_resources.label` is what the
 * materializer rendered from the template's name pattern ("Room 12"); the kind
 * is the fallback so a row never shows its typeid as its name.
 */
export function departureResourceLabel(resource: { label: string | null; kind: string }): string {
  return resource.label ?? resource.kind.replace(/[._-]/g, " ")
}

function ResourceLabel({
  resource,
  productId,
  linkLabels,
  onOpenLink,
}: {
  resource: DepartureResourceRow
  productId: string | null
  linkLabels: AvailabilityUiMessages["details"]["departure"]["links"]
  onOpenLink?: (target: DepartureLinkTarget) => void
}) {
  const label = departureResourceLabel(resource)
  const target = resolveAllocationResourceTarget(resource, { productId })

  if (!target || !onOpenLink) return <span className="font-medium">{label}</span>

  return (
    <Button
      variant="link"
      className="h-auto p-0 font-medium"
      onClick={() => onOpenLink(target)}
      aria-label={linkTargetLabel(target, linkLabels)}
    >
      {label}
      <ExternalLink className="ml-1 size-3" aria-hidden="true" />
    </Button>
  )
}

export function linkTargetLabel(
  target: DepartureLinkTarget,
  labels: AvailabilityUiMessages["details"]["departure"]["links"],
): string {
  switch (target.kind) {
    case "resource":
      return labels.openResource
    case "supplier":
      return labels.openSupplier
    case "product":
      return labels.openProduct
    case "booking":
      return labels.openBooking
  }
}
