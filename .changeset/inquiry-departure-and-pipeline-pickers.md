---
"@voyant-travel/relationships-react": minor
---

Finish the Inquiry workspace's pickers: departures and Proposal pipelines.

A departure target could only be created by intake or the API. The workspace now
offers the departures of an attached Product — Availability's open, future slots
— so an operator can record the dated departure a customer asked about. It is
scoped to one Product because a departure belongs to one, and only appears once
a Product is attached.

The Proposal pipeline and stage overrides were free-text id fields. They are now
selects over the real pipelines and their open stages: closed stages are left
out rather than offered and then refused with `stage_closed`, choosing a
pipeline clears a stage that belonged to the previous one, and the whole
disclosure is hidden when no pipeline is reachable instead of showing an
override that can only be empty.

A target row no longer prints its date twice — a departure's title is its date,
and the snapshot's `startDate` was echoed underneath it.
