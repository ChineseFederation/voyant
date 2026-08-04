"use client"

import type {
  AllocationConflict,
  AllocationManifestTraveler,
  AllocationResource,
} from "@voyant-travel/operations-react/availability"

import type { AllocationUiMessages } from "../i18n/index.js"
import type { AllocationOccupants } from "./slot-allocation-model.js"
import { isSeatShapedKind, kindLabel } from "./slot-allocation-model.js"

/**
 * The printed departure manifest — the sheet a driver, guide or hotel front
 * desk carries.
 *
 * This is the repository's first print surface, so it establishes the pattern:
 *
 *   - The view is always in the DOM but `voyant-print-only` hides it on screen
 *     and reveals it in print; `voyant-print-hidden` on the workspace does the
 *     inverse. Both rules live in `availability/styles.css`, next to the
 *     `@source` directives that already declare this package to Tailwind.
 *   - It renders plain semantic HTML, not the interactive workspace. A printed
 *     page has no popovers, no drag targets and no colour, so re-styling the
 *     live tree for print would fight every component in it.
 *   - It reads the same server projection the screen does, so the paper and the
 *     screen cannot disagree about what is wrong with the plan.
 *
 * #4036 made the room case a genuine **rooming list**: one row per occupant,
 * with the room type, bed configuration and accessibility a hotel needs to make
 * the rooms up, and the booking, sharing group and bed preference it needs to
 * put the right people in them. Seat-shaped kinds keep the compact
 * per-resource sheet — a coach manifest wants one line per seat, not one line
 * per passenger fact.
 */
export interface AllocationPrintViewProps {
  kind: string
  /** Human departure label — product + date, resolved by the host. */
  departureLabel: string | null
  resources: readonly AllocationResource[]
  occupants: AllocationOccupants
  travelers: readonly AllocationManifestTraveler[]
  conflicts: readonly AllocationConflict[]
  /** Pre-formatted by the caller's locale formatter; never `toLocaleString()`. */
  printedAt: string
  /** Resolves a sharing group id to the label the operator gave it. */
  sharingGroupLabels?: Record<string, string>
  messages: AllocationUiMessages
}

export function AllocationPrintView({
  kind,
  departureLabel,
  resources,
  occupants,
  travelers,
  conflicts,
  printedAt,
  sharingGroupLabels = {},
  messages,
}: AllocationPrintViewProps) {
  const copy = messages.print

  return (
    <section data-slot="allocation-print-view" className="voyant-print-only" aria-hidden="true">
      <header>
        <h1>{copy.heading}</h1>
        <p>
          {copy.departureLabel}: {departureLabel ?? kindLabel(kind, messages)}
        </p>
        <p>
          {copy.generatedAt}: {printedAt}
        </p>
      </header>

      {isSeatShapedKind(kind) ? (
        <SeatingTable
          resources={resources}
          occupants={occupants}
          travelers={travelers}
          messages={messages}
        />
      ) : (
        <RoomingTable
          resources={resources}
          occupants={occupants}
          travelers={travelers}
          sharingGroupLabels={sharingGroupLabels}
          messages={messages}
        />
      )}

      {conflicts.length > 0 ? (
        <section>
          <h2>{copy.conflictsHeading}</h2>
          <ul>
            {conflicts.map((conflict) => (
              <li key={`${conflict.code}:${conflict.subjectType}:${conflict.subjectId}`}>
                {messages.conflicts.codes[conflict.code]?.title ?? conflict.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  )
}

interface TableProps {
  resources: readonly AllocationResource[]
  occupants: AllocationOccupants
  travelers: readonly AllocationManifestTraveler[]
  messages: AllocationUiMessages
}

/**
 * Five blank cells. Both halves of the rooming table happen to be five columns
 * wide: the room block (room, type, beds, occupancy, accessible) and the
 * traveler block (name, booking, sharing group, bed preference, notes).
 */
const FIVE_BLANK_CELLS = (
  <>
    <td />
    <td />
    <td />
    <td />
    <td />
  </>
)

/**
 * One row per occupant, grouped by room. A room nobody holds still gets a row,
 * so an empty bed the operator is paying for is something you read rather than
 * an absence you have to notice.
 */
function RoomingTable({
  resources,
  occupants,
  travelers,
  sharingGroupLabels,
  messages,
}: TableProps & { sharingGroupLabels: Record<string, string> }) {
  const copy = messages.print
  const yesNo = (value: boolean) => (value ? copy.yes : copy.no)
  const groupLabel = (traveler: AllocationManifestTraveler) =>
    traveler.sharingGroupId
      ? (sharingGroupLabels[traveler.sharingGroupId] ?? traveler.sharingGroupId)
      : ""
  const bedPreferenceLabel = (traveler: AllocationManifestTraveler) => {
    if (!traveler.bedPreference) return ""
    const catalogue = messages.roomingPreferences.bedPreferences as Record<string, string>
    return catalogue[traveler.bedPreference] ?? traveler.bedPreference
  }

  return (
    <table>
      <thead>
        <tr>
          <th>{copy.resourceColumn}</th>
          <th>{copy.roomTypeColumn}</th>
          <th>{copy.bedConfigurationColumn}</th>
          <th>{copy.capacityColumn}</th>
          <th>{copy.accessibleColumn}</th>
          <th>{copy.occupantsColumn}</th>
          <th>{copy.bookingColumn}</th>
          <th>{copy.sharingGroupColumn}</th>
          <th>{copy.bedPreferenceColumn}</th>
          <th>{copy.notesColumn}</th>
        </tr>
      </thead>
      <tbody>
        {resources.flatMap((resource) => {
          const seated = occupants.byResource.get(resource.id) ?? []
          const roomCells = (
            <>
              <td>{resource.label ?? kindLabel(resource.kind, messages)}</td>
              <td>{resource.roomTypeId ?? ""}</td>
              <td>{resource.bedConfiguration ?? ""}</td>
              <td>
                {seated.length}/{resource.capacity}
              </td>
              <td>{yesNo(resource.accessible)}</td>
            </>
          )
          if (seated.length === 0) {
            return [
              <tr key={resource.id}>
                {roomCells}
                {FIVE_BLANK_CELLS}
              </tr>,
            ]
          }
          // The room facts sit on the first occupant's row and the rest of the
          // party hangs beneath it, which is how a rooming list reads on paper.
          return seated.map((traveler, index) => (
            <tr key={`${resource.id}:${traveler.id}`}>
              {index === 0 ? roomCells : FIVE_BLANK_CELLS}
              <td>{traveler.fullName}</td>
              <td>{traveler.bookingNumber}</td>
              <td>{groupLabel(traveler)}</td>
              <td>{bedPreferenceLabel(traveler)}</td>
              <td>{traveler.hasAccessibilityNeeds ? copy.accessibilityNote : ""}</td>
            </tr>
          ))
        })}
        {occupants.unallocated.map((traveler) => (
          <tr key={`unallocated:${traveler.id}`}>
            <td>{copy.unallocatedRow}</td>
            <td />
            <td />
            <td />
            <td />
            <td>{traveler.fullName}</td>
            <td>{traveler.bookingNumber}</td>
            <td>{groupLabel(traveler)}</td>
            <td>{bedPreferenceLabel(traveler)}</td>
            <td>{traveler.hasAccessibilityNeeds ? copy.accessibilityNote : ""}</td>
          </tr>
        ))}
        <tr>
          <td>{copy.totalRow}</td>
          <td />
          <td />
          <td>{travelers.length}</td>
          <td />
          {FIVE_BLANK_CELLS}
        </tr>
      </tbody>
    </table>
  )
}

/** The compact per-resource sheet a coach or aircraft manifest wants. */
function SeatingTable({ resources, occupants, travelers, messages }: TableProps) {
  const copy = messages.print
  return (
    <table>
      <thead>
        <tr>
          <th>{copy.resourceColumn}</th>
          <th>{copy.capacityColumn}</th>
          <th>{copy.occupantsColumn}</th>
        </tr>
      </thead>
      <tbody>
        {resources.map((resource) => {
          const seated = occupants.byResource.get(resource.id) ?? []
          return (
            <tr key={resource.id}>
              <td>{resource.label ?? kindLabel(resource.kind, messages)}</td>
              <td>
                {seated.length}/{resource.capacity}
              </td>
              <td>{seated.map((traveler) => traveler.fullName).join(", ")}</td>
            </tr>
          )
        })}
        {occupants.unallocated.length > 0 ? (
          <tr>
            <td>{copy.unallocatedRow}</td>
            <td>{occupants.unallocated.length}</td>
            <td>{occupants.unallocated.map((traveler) => traveler.fullName).join(", ")}</td>
          </tr>
        ) : null}
        <tr>
          <td>{copy.totalRow}</td>
          <td>{travelers.length}</td>
          <td />
        </tr>
      </tbody>
    </table>
  )
}
