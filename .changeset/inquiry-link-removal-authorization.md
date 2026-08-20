---
"@voyant-travel/hono": patch
"@voyant-travel/relationships": patch
---

Authorize Inquiry link removals as CRM writes, and give a converted Proposal its
Product lines.

Detaching a Product target or an attachment removes a LINK — the Product and the
Media asset both survive — and the Inquiry action declarations classify both as
`crm:write`. The coarse guard maps DELETE to the `delete` action alone, so a
principal holding `crm:write` without `crm:delete` was refused before the handler
ran: the packaged UI's Detach and Remove controls returned 403 for every scoped
staff session and API key. Full-access members hold `*` and were unaffected,
which is why it was invisible in manual testing.

The exception is scoped to the Inquiry link paths, mirroring the existing
POST-search exception (voyant#2649) in the same guard. Finance and legal own
attachment routes of the same shape whose `delete` requirement is correct, and
loosening those is their owners' call — a test pins that they still refuse a
write-only principal, as does a real CRM record deletion.

Separately, Proposal conversion sent `productTargets: []` unconditionally, so a
converted Inquiry produced a Proposal with no lines and staff rebuilt the
customer's selection by hand. The Inquiry's own immutable Product snapshots are
now passed through, which also keeps the line correct after the Product is
renamed or withdrawn.
