---
"@voyant-travel/mcp": minor
---

`describe_tool` accepts an optional `resource`, narrowing a `<domain>_query`
descriptor to one branch instead of the union of every resource's input schema.

Collapsing the 133 reads into 24 query tools (#3984) moved the discovery bill
rather than removing it: a query descriptor advertises every member's schema, so
an agent that wants one resource still pays for all of them. On the selected
operator graph `bookings_query` cost 20,573 bytes across 22 branches. Narrowed it
costs 1,811 — a 91% cut, 74% across all 24 query tools, and 52% over the six
real-surface discovery journeys the eval harness drives.

It needs no extra round trip: `search_tools` already returns the query tool's
description, which names every resource, so the agent can name its branch before
it describes anything. `resource` is optional and omitting it still returns the
full union, so an existing client is unaffected.

An unknown `resource` now fails with `NOT_FOUND` and the valid resource names as
`candidates`, rather than falling through to a branchless `{ resource: string }`
schema that reads as a valid answer.

Also fixes the meta-tool error envelope, which was a near-copy of the dispatch
one and dropped `candidates`, `didYouMean`, `meta` and `contractVersion` — so
every `search_tools` / `describe_tool` / `call_tool` failure lost the actionable
fields #3947 added, on exactly the calls an agent makes while still finding its
way around. Both paths now build the envelope from one function.
