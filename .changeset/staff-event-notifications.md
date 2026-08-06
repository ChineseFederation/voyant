---
"@voyant-travel/notifications": minor
"@voyant-travel/schema-kit": patch
---

Add staff event notifications: pre-baked React Email alerts on existing domain events

Notifications has only ever mailed customers. Staff found out that a booking was
confirmed, a payment landed, or an enquiry arrived by opening the admin and
looking. This adds the staff side.

Two preference layers land as `staff_alert_settings` (admin-owned, one row per
alert, carrying routing) and `staff_alert_preferences` (per staff user).
Absence of a preference row means *inherit*, never *off*, so a staff member who
has never opened the preferences page still receives what the deployment
enables.

Six alerts ship, all subscribing to events the graph already declares:
`booking.confirmed`, `booking.cancelled`, `payment.completed`,
`invoice.settled`, `contract.signed`, and `customer.signal.created`. All default
to off — upgrading does not start mailing an operator who never asked for it.

Templates are code, not content: a new `@voyant-travel/notifications/emails`
entry point renders React Email components against the operator's brand colour,
corner radius and logo. Customer-facing templates stay operator-editable Liquid
in `notification_templates`; staff alerts are product surface and are not
editable. The subpath keeps React out of the package's main entry.

Because every domain event payload is id-shaped, the data an email needs is
supplied by deployment-registered resolvers rather than fetched here — reading
another module's tables would open table-privacy pairs that do not exist.

`@voyant-travel/schema-kit` gains the `staff_alert_settings` and
`staff_alert_preferences` TypeID prefixes.
