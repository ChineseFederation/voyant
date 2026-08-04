"use client"

import type {
  AllocationConflict,
  AllocationManifestTraveler,
  AllocationResource,
} from "@voyant-travel/operations-react/availability"

import type { AllocationUiMessages } from "../i18n/index.js"
import type { AllocationOccupants } from "./slot-allocation-model.js"
import { kindLabel } from "./slot-allocation-model.js"

/**
 * The printed departure manifest — the sheet a driver or guide carries.
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
