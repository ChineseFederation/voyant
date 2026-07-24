---
"@voyant-travel/legal": major
"@voyant-travel/legal-react": major
"@voyant-travel/legal-contracts": major
"@voyant-travel/bookings-react": major
"@voyant-travel/catalog": major
"@voyant-travel/commerce": major
"@voyant-travel/notifications": major
"@voyant-travel/realtime": major
"@voyant-travel/operator-standard": major
"@voyant-travel/vite-config": major
"@voyant-travel/runtime": minor
"@voyant-travel/core": minor
"@voyant-travel/storage": minor
"@voyant-travel/schema-kit": minor
"@voyant-travel/utils": minor
"@voyant-travel/framework": patch
"@voyant-travel/trips": minor
---

Replace unsafe booking-contract document generation with the Legal-owned
durable operation/provider protocol. Legacy generation routes and direct
generator services and exports are removed. Standard Operator now selects and
constructs the shipped provider from its exact database, document-storage, and
renderer bindings; startup and action activation require behavioral provider
preflight, and pending recovery fails loudly if that provider disappears.
Local Standard document bytes now require probed, atomic filesystem durability,
and the bundled renderer embeds a Latin Extended Unicode font. Custom font
bytes are also supported by the basic PDF utility. Opaque renderer/S3
transports require explicit backend identity. Remove the
Notifications document-bundle lifecycle callbacks, fully-paid orchestration
subscriber, and its Realtime invalidation declaration; document generation is
available only through admitted Legal actions.

Recognize transaction-bound outbox appends as durable domain-event emissions
and publish the existing Trips requirement-sourcing event contracts.
