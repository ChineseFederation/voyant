---
"@voyant-travel/relationships-contracts": minor
"@voyant-travel/relationships": minor
"@voyant-travel/relationships-react": minor
"@voyant-travel/operations": minor
"@voyant-travel/admin-api-client": minor
"@voyant-travel/public-api-client": minor
---

Rename the materialized Inquiry target kind `option_unit` to `departure`, and stop
losing a storefront submission when a target cannot be resolved.

The kind named `option_unit` resolved an availability slot: its authority is the
Availability slot reader, its link is the departure linkable, and legacy Booking
Inquiries populate it from `departureId`. A caller passing a real option-unit id
was refused, and because the refusal escaped the intake transaction the guarded
public intake and the legacy Booking Inquiry adapter both answered 500 with the
customer's inquiry rolled back.

Target references are now resolved through their owning module before the write,
and any the owner cannot resolve are retained on the Inquiry as
`customFields.relationships.unresolvedTargets` instead of aborting the
submission. `addInquiryTarget` no longer pre-checks the id's prefix — existence
is the owning module's call through `validateTarget`, which the prefix guard
duplicated while refusing ids the owner would have resolved.
