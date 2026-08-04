---
"@voyant-travel/operations-react": minor
---

feat(operations-react): plan a departure from the workspace — fleet resources, conflicts, atomic moves, previewed auto-allocation, exports and print

The departure-planning legs shipped server-side with no UI. This wires them up.

- **Attach the actual coach.** The add-resource dialog now offers a source: create
  a container for this departure, or attach a global `resources` record and open
  its cross-departure commitment. Attached fleet records list in their own panel
  with a detach that cascades a laid-out coach's seats. A resource already
  committed to an overlapping departure comes back as copy that says how to fix
  it, read off `detail.reason = "resource_double_booked"`, not as the raw server
  sentence.
- **Conflicts come from the server.** `AllocationConflictsPanel` renders
  `GET /slots/{id}/allocation/conflicts` grouped by severity, with a localized
  entry for each of the seven stable codes and the server's English `message` as
  the fallback for a code a newer server invented. Nothing re-derives a conflict
  client-side.
- **Bulk assignment.** Travelers can be multi-selected wherever they currently
  sit and moved through the atomic batch leg, so a sharing group lands together
  or not at all. Each assignment carries `expectedResourceId`, so a move planned
  against a stale manifest is rejected whole.
- **Auto-allocation is previewed.** The button now runs the dry run and shows
  who would move where; nothing is written until the operator confirms, and a
  plan the server says would exceed capacity cannot be confirmed at all.
- **Exports and print.** An export menu downloads the passenger CSV and the
  resource CSV, passing the active `kind` so a coach exports its seating
  manifest. `AllocationPrintView` plus the `voyant-print-only` /
  `voyant-print-hidden` rules in `availability/styles.css` establish the
  repository's print pattern.
- **Sharing-group editing.** `useTravelerSharingGroupMutation` and
  `useSharingGroupLabelMutation` had no consumers; the selection bar now pairs,
  ungroups, renames and clears the label of a sharing group.

**Breaking:** `AllocationUiMessages` drops `validationTitle`, `validationClear`,
`validationUnallocated`, `validationOverCapacity` and `validationSplitGroup`.
They were the copy for the client-side `ValidationSummary` the server slice
deleted, and lost their only consumer with it. The two whole-sentence strings
carry over verbatim as `conflicts.title` and `conflicts.clearTitle`; the three
fragments are gone, because each server conflict code needs a complete sentence
rather than a phrase spliced into a count. A deployment that overrode any of the
five should move its override onto the new `conflicts` group.
