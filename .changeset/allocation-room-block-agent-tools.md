---
"@voyant-travel/operations": minor
---

Cover the departure room-block and rooming-preference writes with agent Tools

Slot allocation is the one Operations family that agents can already act on:
attaching and detaching a departure's fleet resources and placing travelers are
Tools. The three allocation writes #4216 added were not, so an agent could plan a
departure's coach but not draw its rooms from a contracted block, hand them back,
or record what a traveler asked for — while every neighbouring write was reachable.

Adds `materialize_departure_room_block`, `release_departure_room_block` and
`set_departure_traveler_rooming_preferences`, each delegating to the service the
existing admin route already calls, so there is one write path and not two.
Releasing carries the destructive posture for the same reason detaching a coach
does: re-drawing the block returns the rooms but not the rooming plan.
