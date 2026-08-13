---
"@voyant-travel/tools": patch
"@voyant-travel/bookings": patch
"@voyant-travel/relationships": patch
"@voyant-travel/admin-contracts": patch
---

Specify the format of `ToolActionPolicyBinding.id` and normalize the six graph action ids that diverged from it.

`id` is an opaque key of the selected graph action, matched by exact equality against that action's own `id`. It is not an owner-scoped identity: a manifest consumer must not parse it, require a package prefix on it, or infer an owner from it. No field of the action policy is an ownership claim: the owning module names the Tool capabilities permitted to select an action in its `from.tools`, and the gate enforces that binding — nothing is string-matched against `owner`. It is not an audit identity either — the ledger records `capabilityId ?? id` as its `action_name`, so for any action declaring a capability the key never reaches a persisted row.

Six of 277 first-party graph actions were not qualified by their own package, which is what invited a client to read the prefix as meaningful and reject `cancel_booking`. They now are: bookings' `booking.status.{cancel,start,complete,override}` and `booking.pii.read` become `@voyant-travel/bookings#action.{cancel,start,complete}-booking`, `#action.override-booking-status` and `#action.read-booking-pii`; `relationships.person_document.reveal` becomes `@voyant-travel/relationships#action.reveal-person-document`. `cancel_booking`'s `actionPolicy.id` and the `bookings.cancel` admin operation's `capabilityKey` move in lockstep.

No persisted identity moves. Each renamed action either declares a `capabilityId` — which is what the gate records as `action_name` — or is recorded by a package-local route path under its own constant. The `booking.status.*` literals in bookings' admin routes and status service, and `PERSON_DOCUMENT_REVEAL_ACTION_NAME` in relationships, are ledger identity and are unchanged.
