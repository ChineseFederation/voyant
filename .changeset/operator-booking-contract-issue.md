---
"@voyant-travel/legal-contracts": minor
"@voyant-travel/legal": minor
"@voyant-travel/legal-react": minor
"@voyant-travel/admin-contracts": minor
"@voyant-travel/admin-react": minor
---

Let an operator issue and send a booking contract without an agent.

A booking-linked contract could only complete its reviewed lifecycle through `executeLegalContractLifecycleCommand`, which has no admin route and is invoked only from the MCP runtime. `POST /v1/admin/legal/contracts/{id}/issue` refused with a 400 while the admin UI rendered its `Issue` button anyway, so on a deployment where the agent is not wired for contracts every generated contract accumulated in `draft` with no operator path out of it.

What the reviewed lifecycle actually enforces is three facts about the contract row — the revision has not been superseded, its content is still the reviewed content, and the caller approved the revision that is current. Those are checkable without the agent-approval machinery wrapped around them, so the admin routes now check them directly:

- `GET /v1/admin/legal/contracts/{id}/booking-review` serves the un-redacted revision, including the `revision` and `contentFingerprint` a caller approves against. Managed booking revisions only; requires `bookings-pii:read` and records the access on the booking's PII log.
- `POST /{id}/issue` and `POST /{id}/send` accept `{ revision, contentFingerprint }`. A managed booking revision without them is refused and told where to read them; a mismatched fingerprint, a stale revision, or an existing successor revision is refused for the same reason an agent would be.
- Issuing a managed booking revision now promotes the reviewed content verbatim — no template re-render, no contract-number allocation — matching the reviewed lifecycle command's own issue leg instead of rewriting the document the approval covered.
- The contract detail page opens a review dialog for booking contracts instead of firing an `Issue` that was guaranteed to fail, and disables the action with a reason when the review cannot be read.

- `legal.contracts.issue` on the standard admin client took `z.object({})`, so it stripped the approval and would have hit `approval_required` on every booking contract. It now derives its input from the route schema, and `legal.contracts.send` and `legal.contracts.bookingReview` join it.
- `packages/legal/openapi/admin/legal.json` says "Do not edit by hand" but nothing regenerated it. `pnpm --filter @voyant-travel/legal generate:openapi` now produces the contracts slice from the live routes through the operator app's own composition, and `verify:openapi-drift` holds it. Regenerating also corrected a `DELETE /{id}` conflict description that had already drifted from the route.

Document regeneration for a draft whose content is wrong is not part of this change: it needs the durable document-operation engine and an artifact provider on the admin route surface, neither of which the contracts admin routes carry today.
