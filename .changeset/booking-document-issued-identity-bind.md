---
"@voyant-travel/bookings": patch
"@voyant-travel/finance": patch
"@voyant-travel/inventory": patch
---

Record a Booking Document that carries the issuer's identity.

Every `POST /v1/admin/bookings/{id}/documents` request carrying the `issued*`
group answered 500, so `contract` and `invoice` — the types whose validation
*requires* that group — could not be created at all: without the fields the
request was refused 400, with them it crashed.

The insert was never the problem. The replay lookup that runs before it
interpolated the issue date straight into a `sql` fragment, and an interpolated
value goes to the driver unencoded — unlike `eq(column, value)`, which encodes
it through the column first. postgres-js cannot bind a `Date`, so the query
threw before it was ever sent, which is why writing the same values to the same
columns by hand always worked. The lookup now binds through the column, so it
and the insert agree by construction.

The same interpolation sat in `buildCreatedAtCondition` in all three
action-ledger drift checkers, where it crashed
`check_booking_action_ledger_drift`, `check_finance_action_ledger_drift` and
`check_product_action_ledger_drift` for any caller that narrowed by
`createdAtFrom`. Each is bound as an encoded timestamp now, and each package's
unit test pins the parameter's type rather than just the SQL it builds.
