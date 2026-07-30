---
"@voyant-travel/catalog": minor
"@voyant-travel/bookings": minor
"@voyant-travel/finance": minor
"@voyant-travel/commerce": patch
---

Close price, identity, and double-spend holes in self-service booking creation.

**Price.** `catalog_quotes` records what a quote cost but not what it was priced
for, and the only other binding was `draft.current_quote_id` — a value the
caller writes on the public draft PUT. A caller could quote one traveller for
one night, rewrite the draft to a larger party keeping the cheap quote id, and
every check still passed. Resolution now re-prices the current draft through
the owning vertical, in the quote's own scope, and rejects any difference.

**Identity.** The guest contact check passed if *either* email or phone
matched, while `upsertPersonFromContact` resolves by email then phone — so an
SMS-verified caller could put a victim's email in the draft and have the
booking attached to the victim's CRM person, with confirmations delivered to an
address they never proved control of. The unverified channel is now dropped
rather than merely unchecked.

**Double spend.** Draft and quote consumption are now conditional UPDATEs that
throw when they claim no row, so two concurrent creates cannot both commit from
one draft, one quote, and one hold.

**Attribution.** `verificationChallengeId` is refused when the caller is already
authenticated — it reached both the ledger principal and the durable
idempotency scope, letting an authenticated caller choose either. An
authenticated customer now audits under their own account instead of as
`verified_guest`.

Also: checkout capability issuance reads the merged runtime env (it previously
threw after the booking had committed on Node deployments); an idempotent
replay reports the original booking's number and real status rather than a
speculatively allocated one; `checkout/start` accepts the `guest-booking`
capability that also grants `payment:start`, matching the Finance collection
routes.
