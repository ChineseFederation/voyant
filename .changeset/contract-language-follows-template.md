---
"@voyant-travel/legal": patch
---

Generate booking contracts from the template the deployment actually owns, instead of
requiring the booking to name its language.

Nothing writes `bookings.communication_language` or `contact_preferred_language`, so the
contract language resolved to `"en"` for essentially every booking. Template *selection*
already handled that — `getDefaultTemplate` prefers the requested language and falls back
to the operator's own active default — but the applicability re-check that followed
demanded `template.language === language` and discarded the fallback, reporting
`template.applicableCurrentVersion` as missing. On a single-language deployment that is
the only template there is, so contract generation never once succeeded through the
ordinary path: a Romanian operator with one active Romanian template had 311 confirmed
bookings and no contract from any of them.

A contract is now written, and labelled, in the language of the template it was rendered
from; the booking's language is a preference that orders selection and nothing more. The
same correction applies to the applicable-template listing, which filtered on that
preference and so hid the operator's own template from its own bookings, and to the
booking-contract draft tool, which rejected a template version the caller had named
explicitly. Unfulfilled-generation ledger entries now carry the comparison that failed —
the resolved preference, the selected template and its language, and both channels —
rather than only the `template.applicableCurrentVersion` category.
