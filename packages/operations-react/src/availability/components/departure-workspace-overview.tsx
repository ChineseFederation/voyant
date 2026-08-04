"use client"

import { Badge, Button } from "@voyant-travel/ui/components"
import { Pencil } from "lucide-react"
import type { AvailabilityUiMessages } from "../i18n/index.js"
import type { AvailabilitySlotDetail, DepartureIssue, DepartureSummary } from "../index.js"
import { MetaTab } from "./availability-slot-detail-meta.js"
import { type DepartureIssueAction, DepartureIssueList } from "./departure-issues.js"
import { DepartureSection, StatCard, StatGrid } from "./departure-stat.js"

/**
 * Overview: what this departure IS, and whether its own numbers agree.
 *
 * The stored counter and the derived one sit next to each other on purpose —
 * the reason this workspace exists is that four screens each held a slice of a
 * departure and nothing noticed when they disagreed. The typed attention
 * issues lead the section because clearing them is what the operator came for.
 *
 * Meta (identifiers + lifecycle) lands here rather than keeping a tab of its
 * own: the slot id, its rule, its start time and its Product Version are the
 * departure's identity, which is the question this section already answers.
 */
export function DepartureOverviewSection({
  summary,
  slot,
  productName,
  statusLabel,
  messages,
  formatDateTime,
  onEdit,
  onClearIssues,
  resolveIssueAction,
  onOpenProduct,
  onOpenStartTime,
}: {
  /** `null` while the summary is still loading or its read failed. */
  summary: DepartureSummary | null
  slot: AvailabilitySlotDetail
  productName: string | null
  statusLabel: string
  messages: AvailabilityUiMessages
  formatDateTime: (value: string | Date) => string
  onEdit?: () => void
  onClearIssues?: () => void
  resolveIssueAction?: (issue: DepartureIssue) => DepartureIssueAction | null
  onOpenProduct?: (productId: string) => void
  onOpenStartTime?: (startTimeId: string) => void
}) {
  const details = messages.details
  const copy = details.departure
  const overview = copy.overview
  const noValue = details.noValue
  const capacity = summary?.capacity ?? null
  const bookings = summary?.bookings ?? null
  const extras = summary?.extras ?? null

  const paxDrift =
    capacity !== null &&
    !capacity.unlimited &&
    capacity.remainingPax !== null &&
    capacity.derivedRemainingPax !== null &&
    capacity.remainingPax !== capacity.derivedRemainingPax

  const figure = (value: number | null | undefined) =>
    value === null || value === undefined ? noValue : String(value)

  return (
    <div className="flex flex-col gap-8">
      <DepartureSection
        slot="departure-attention"
        title={copy.issues.title}
        actions={
          onEdit ? (
            <Button variant="outline" onClick={onEdit}>
              <Pencil data-icon="inline-start" aria-hidden="true" />
              {overview.editAction}
            </Button>
          ) : null
        }
      >
        <DepartureIssueList
          issues={summary?.operations.issues ?? []}
          messages={copy.issues}
          resolveAction={resolveIssueAction}
          onClearAction={onClearIssues}
        />
      </DepartureSection>

      <DepartureSection slot="departure-capacity" title={overview.capacityTitle}>
        <StatGrid className="sm:grid-cols-5">
          <StatCard label={overview.authoredPaxLabel}>
            {capacity?.unlimited ? overview.unlimitedLabel : figure(capacity?.initialPax)}
          </StatCard>
          <StatCard label={overview.effectivePaxLabel}>
            {capacity?.unlimited ? overview.unlimitedLabel : figure(capacity?.effectivePax)}
          </StatCard>
          <StatCard label={overview.consumedPaxLabel}>
            {figure(capacity?.derivedConsumedPax)}
          </StatCard>
          <StatCard label={overview.storedRemainingLabel} tone={paxDrift ? "attention" : "default"}>
            {figure(capacity?.remainingPax)}
          </StatCard>
          <StatCard
            label={overview.derivedRemainingLabel}
            tone={paxDrift ? "attention" : "default"}
            hint={paxDrift ? overview.driftHint : undefined}
          >
            {figure(capacity?.derivedRemainingPax)}
          </StatCard>
        </StatGrid>
      </DepartureSection>

      <DepartureSection slot="departure-bookings" title={overview.bookingsTitle}>
        <StatGrid className="sm:grid-cols-3">
          <StatCard label={overview.activeBookingsLabel}>{figure(bookings?.count)}</StatCard>
          <StatCard label={overview.soldPaxLabel}>{figure(bookings?.expectedPax)}</StatCard>
          <StatCard
            label={overview.cancelledWithAllocationLabel}
            tone={
              capacity && capacity.bookings.cancelledWithLiveAllocation > 0
                ? "attention"
                : "default"
            }
          >
            {figure(capacity?.bookings.cancelledWithLiveAllocation)}
          </StatCard>
        </StatGrid>
        {bookings && Object.keys(bookings.byStatus).length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(bookings.byStatus).map(([status, count]) => (
              <Badge key={status} variant="outline">
                {`${getBookingStatusLabel(status)} · ${count}`}
              </Badge>
            ))}
          </div>
        ) : null}
      </DepartureSection>

      <DepartureSection slot="departure-holds" title={overview.holdsTitle}>
        <StatGrid className="sm:grid-cols-3">
          <StatCard label={overview.holdsActiveLabel}>{figure(capacity?.holds.active)}</StatCard>
          <StatCard
            label={overview.holdsExpiredLabel}
            tone={capacity && capacity.holds.expired > 0 ? "attention" : "default"}
          >
            {figure(capacity?.holds.expired)}
          </StatCard>
          <StatCard label={overview.holdsPaxLabel}>{figure(capacity?.holds.activePax)}</StatCard>
        </StatGrid>
      </DepartureSection>

      <DepartureSection slot="departure-extras-rollup" title={overview.extrasTitle}>
        {extras ? (
          <StatGrid className="sm:grid-cols-3">
            <StatCard label={overview.extrasOfferedLabel}>{String(extras.offered)}</StatCard>
            <StatCard label={overview.extrasSelectedLabel}>
              {String(extras.selectedTravelerCount)}
            </StatCard>
            <StatCard
              label={overview.extrasOutstandingLabel}
              tone={extras.outstandingCollectionCount > 0 ? "attention" : "default"}
            >
              {String(extras.outstandingCollectionCount)}
            </StatCard>
          </StatGrid>
        ) : (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {overview.extrasUnavailable}
          </p>
        )}
      </DepartureSection>

      <MetaTab
        slot={slot}
        productName={productName}
        statusLabel={statusLabel}
        productVersionId={summary ? summary.departure.productVersionId : undefined}
        onOpenProduct={onOpenProduct}
        onOpenStartTime={onOpenStartTime}
        i18n={{
          title: details.tabs.metaTitle,
          slotIdLabel: details.tabs.metaSlotId,
          ruleLabel: details.slot.ruleLabel,
          startTimeLabel: details.slot.startTimeIdLabel,
          endsAtLabel: details.slot.endsAtLabel,
          createdLabel: details.createdLabel,
          updatedLabel: details.updatedLabel,
          productLabel: messages.productLabel,
          productVersionLabel: overview.productVersionLabel,
          notVersionBoundLabel: overview.notVersionBound,
          statusLabel: messages.statusLabel,
          timezoneLabel: messages.timezoneLabel,
          noValue,
          format: formatDateTime,
        }}
      />
    </div>
  )
}

/**
 * Booking statuses are Bookings' vocabulary, not Availability's, and the
 * departure summary reports whatever `bookings.status` values it found. This
 * package deliberately does NOT keep a copy of that enum — a stale copy would
 * silently mislabel a status Bookings added — so the raw key is humanized the
 * same way the activity timeline humanizes an unmapped audit action.
 */
function getBookingStatusLabel(status: string): string {
  return status.replace(/[._-]/g, " ")
}
