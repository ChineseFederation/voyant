# Customer Accounts And Explicit Booking Access

- **Status:** Proposed — implementation-ready
- **Decision type:** customer identity, Booking authorization, and public API
- **Owners:** auth + public-api + identity + catalog + bookings + finance + relationships
- **Baseline:** `origin/main@842ee980e5` (fetched 2026-08-20)
- **Tracks:** [#4813](https://github.com/voyant-travel/voyant/issues/4813)
- **Related:**
  [ADR-0014](../adr/0014-admin-and-customer-auth-realms.md),
  [ADR-0019](../adr/0019-booking-v1-commitment-point-policies.md),
  [auth identity architecture](./auth-identity-architecture.md),
  [booking journey architecture](./booking-journey-architecture.md), and
  [Public API key capability line](./public-api-key-capability-line.md)

## Decision

Voyant authorizes customer access to a Booking through an explicit, durable
**Booking Access Grant** issued to a stable **Buyer Account**. It never derives
that authorization from an email address, phone number, CRM Person link,
Booking billing-party link, traveler contact, or payment-provider Customer.

The customer-facing authority chain is:

```text
authenticated customer session
        |
        v
active Buyer Account  --active membership, for business buyers--+
        |                                                   |
        +---------------------+-----------------------------+
                              |
                              v
                    Booking Access Grant
                              |
                              v
                           Booking
```

The commercial and communication chain remains separate:

```text
Booking -> billing Person or Organization -> CRM/contact history
Booking -> captured contact snapshot       -> notices and documents
```

An email or phone number is a destination. A successful challenge proves
control of that destination for one bounded purpose and time. It does not prove
that the caller is a particular Person and does not authorize every record on
which the value appears.

`bookings.personId` and `bookings.organizationId` continue to name the billing
party. They stop being customer-portal authorization keys.

## Why this RFC exists

The current Booking Session Commit resolves the billing contact through
`upsertPersonFromContact`. That helper searches normalized email first, then
phone, and returns an existing Person when it finds one. An anonymous shopper
can therefore name somebody else's email and cause the Booking to use that
Person id without proving control of the contact.

The customer portal then treats that Person id as authority and additionally
matches traveler email addresses. This turns a contact-matching decision into a
data-access decision: a Booking created by one caller can appear in another
customer's account.

This is not only a missing OTP. It is a boundary error:

1. Contact matching is useful CRM reconciliation.
2. Authentication establishes a stable customer principal.
3. Authorization grants that principal access to a resource.
4. Those three operations currently collapse into one email lookup.

The fix must preserve guest checkout, personal customer accounts, business
accounts, CRM reconciliation, and payment-provider integration without making
any of them an implicit authorization source.

## Remote-main baseline and vocabulary

This RFC is based on `origin/main@842ee980e5`, fetched before the final design
pass. It follows the Storefront-entity retirement in #4649:

- a **Public API key** is the credential a frontend, mobile application, or BFF
  presents;
- a **Channel** is the server-derived sales and distribution context;
- customer-account policy and credentials belong to the deployment; and
- there is no Storefront entity, Storefront id, or customer-account-to-key
  ownership relation.

Buyer Account authorization is deployment-scoped. A Booking Session separately
retains `publicApiOrigin.channelId` as immutable commercial provenance. The
Public API key is neither a customer identity nor a Booking owner.

Some source comments and identifiers on this baseline still use the retired
word, including `BookingSessionAccessContext.storefront`. Implementing this RFC
must rename touched runtime symbols to `publicApiOrigin`; it must not reproduce
the retired entity or add a compatibility alias. Historical migration ledger
identities and third-party API names remain unchanged where renaming would alter
data or an external contract.

## Goals

1. Make a stable personal or business Buyer Account the customer-facing
   authorization subject.
2. Make access to every Booking explicit, durable, auditable, revocable, and
   independent of mutable contact data.
3. Support passwordless customer accounts, account adoption during checkout,
   and true guest checkout.
4. Preserve CRM Person and Organization links as commercial relationships, not
   security principals.
5. Create the Booking and its initial customer access grant in the same root
   transaction.
6. Give existing customers a secure path to claim historical guest or
   staff-created Bookings.
7. Support a business Buyer Account shared by several currently authorized
   members without copying grants to each user.
8. Give payment adapters a stable account reference without keying provider
   customers on email or a shared anonymous sentinel.
9. Migrate existing deployments without granting access from ambiguous legacy
   evidence.
10. Make the rules machine-checkable through integration and architecture
    tests.
11. Preserve separate identity axes for future partner/agent booking: Channel,
    partner account, acting agent, client Buyer Account, billing party, and
    Travelers must not collapse into one owner field.

## Non-goals

- Building a customer portal application, page, component, theme, or other
  customer-facing frontend.
- Building a customer-facing booking-engine application or replacing the
  existing Booking Session engine. This RFC makes only the narrow identity and
  access changes required in the existing Commit path.
- Shipping a reference site, mobile application, browser flow, or packaged
  customer-account UI.
- Shipping staff UI. The administration scope ends at audited backend commands
  and API contracts.
- Building reseller/agent authentication, agency membership, delegation,
  servicing policy, commission, or portal features.
- Replacing Better Auth or the separate admin/customer realm decision.
- Making a CRM Person an authentication account.
- Automatically merging duplicate People.
- Treating possession of a Booking reference as sufficient authorization.
- Giving every traveler a customer account automatically.
- Designing field-level traveler/delegate permissions in this version. V1
  grants the existing full customer Booking view through the `owner` role only.
- Replacing Booking Session capabilities or narrow guest checkout/payment
  capabilities.
- Rebuilding payment adapters or moving every operator-managed payment-method
  record in the first implementation slice.
- Restoring legacy portal access through an opt-out feature flag. Ambiguous
  contact-derived access fails closed.

## Scope boundary

The executable deliverable is backend-only:

- database schemas and migrations;
- domain services and runtime ports;
- trusted request-context propagation through the existing Booking Session;
- authenticated Public API and administration endpoints;
- generated OpenAPI/client contracts;
- migration/reporting commands; and
- unit, integration, authorization, and architecture tests.

In this RFC, **customer portal** names the existing backend API capability under
`/v1/public/customer-portal/*`; it does not name a UI product. The protocol
sequences below describe what a future or external consumer may call. They are
not frontend requirements or acceptance tests.

Implementation does not add frontend routes, pages, React components, themes,
or reference applications under `apps/*`, `examples/*`, or
`packages/public-api-react`. No acceptance criterion depends on a rendered
screen or browser journey.

## Canonical language

| Term | Definition | Not the same as |
| --- | --- | --- |
| **Customer Identity** | A user in the isolated `customer_auth` realm, identified by stable `customer_auth.user.id`. | CRM Person, Buyer Account |
| **Buyer Account** | The active commercial context selected by a Customer Identity: `personal:<userId>` or `business:<authOrganizationId>`. | Login, Person, Organization |
| **Personal Buyer Account** | The durable entitlement allowing one Customer Identity to buy personally. | The linked CRM Person |
| **Business Buyer Account** | A customer-auth Organization mapped to a CRM Organization and used through live membership. | Staff organization, CRM Organization alone |
| **Corporate Account** | A product label for a multi-member Business Buyer Account. It is not a second account entity or identifier. | Customer Identity, CRM Organization alone |
| **Partner actor** | The existing `partner` Actor type used by a distribution counterparty acting through a Channel. | Customer, staff member, Channel itself |
| **Booking Origin** | Bookings-owned provenance, including the server-derived Channel through which the Booking was created. | Booking access or client ownership |
| **Person Link** | The explicit stable link from a Customer Identity to one CRM Person. | Booking authorization |
| **Booking Access Grant** | The durable authorization for one Buyer Account to access one Booking. | Billing-party or traveler association |
| **Contact Snapshot** | The current operator-controlled name/address/email/phone captured for a Booking. | Verified identity |
| **Contact Verification** | A bounded proof that a caller controlled one destination for one purpose, subject, and time window. | Person proof, account-wide ownership |
| **Booking Claim** | A workflow that verifies authority for a specific Booking and issues a Booking Access Grant. | Email search or Person merge |
| **Guest** | A shopper with a Booking Session capability but no active Buyer Account. | Shared anonymous customer |

Use **link** for Identity-to-Person association, **grant** for account-to-Booking
authorization, and **match** only for non-authoritative discovery. Do not say a
Booking is “owned by an email” or that matching contact data “logs a customer
in.”

## Security invariants

These are normative.

1. Equality of email or phone values never grants Booking access.
2. A verified email or phone never grants access beyond the challenge's exact
   purpose and subject.
3. A customer route derives its Buyer Account from trusted session context,
   never request JSON, query parameters, headers supplied by the browser, or
   Booking state.
4. A customer can access a Booking only through an active Booking Access Grant
   for the currently selected Buyer Account.
5. A business grant is usable only while the current Customer Identity has a
   live membership in that Business Buyer Account.
6. An authenticated Commit creates the Booking and initial grant atomically.
   Neither may survive without the other.
7. A guest Commit never reuses an existing Person merely because contact data
   matches.
8. Changing an account email, phone, Person link, or profile does not transfer
   Booking access.
9. Merging, archiving, or restoring CRM People does not create or transfer a
   Booking Access Grant.
10. Changing `bookings.personId`, `bookings.organizationId`, contact snapshots,
    or traveler rows does not create or transfer access.
11. Revoking a grant takes effect on the next request. It is not cached in a
    long-lived customer session.
12. Removing a business membership takes effect on the next request even when
    the business grant remains active.
13. A guest or unidentified shopper supplies no reusable payment-provider
    customer reference and cannot store an instrument for later account use.
14. Idempotent Commit replay returns the original Booking and grant and never
    creates a second one.
15. Business ownership is account-scoped while audit is member-scoped: the
    Buyer Account owns the Session/grant and the acting Customer Identity is
    recorded on every command.
16. A business grant is stored once for the Business Buyer Account. It is never
    copied into per-member grants as members join or leave.
17. Channel attribution never grants Booking access. A Channel describes how a
    sale arrived; it is not an authenticated agency account or an acting agent.
18. A partner actor never becomes a customer merely by submitting the client's
    email, Person id, Organization id, or Buyer Account id.
19. Partner servicing access and customer self-service access are separate
    grants. Creating, revoking, or transferring one must not implicitly mutate
    the other.

## Industry precedent

Shopify's current customer accounts use passwordless verification and expose
customer-scoped APIs through an access token. A headless commerce application associates
the authenticated buyer with a cart by supplying that customer access token as
buyer identity; the email field itself is not the cart's authorization token.
See [Shopify customer accounts](https://help.shopify.com/en/manual/customers/customer-accounts/new-customer-accounts),
the [Customer Account API](https://shopify.dev/docs/api/customer/latest), and
[`CartBuyerIdentity`](https://shopify.dev/docs/api/storefront/latest/objects/cartbuyeridentity).

Stripe's Customer is a billing/profile object, not an application login.
Stripe recommends a two-way mapping between its Customer id and the
application's stable internal customer id. Stripe also requires the application
to authenticate the customer before creating a short-lived Billing Portal
session for a specific `cus_...` id. See [Stripe Customers](https://docs.stripe.com/billing/customer)
and [customer portal integration](https://docs.stripe.com/customer-management/integrate-customer-portal).

Voyant follows the shared principle: contact data describes and reaches a
buyer; a stable authenticated token/account identifies the buyer; an explicit
resource grant authorizes access.

## Existing building blocks

The implementation extends existing authorities:

- `customer_auth.user.id` is the stable Customer Identity.
- `personalBuyerAccountId(userId)` and
  `businessBuyerAccountId(authOrganizationId)` produce stable Buyer Account ids.
- customer auth middleware already resolves `buyerAccountId`,
  `buyerAccountKind`, `relationshipPersonId`, `authOrganizationId`,
  `relationshipOrganizationId`, and membership facts.
- `customer_auth.user.relationship_person_id` is the explicit one-to-one Person
  link authority.
- `customer_auth.personal_buyer_account` is the durable personal entitlement.
- customer-auth Organization membership is revalidated when resolving an
  active Business Buyer Account.
- Booking Session `/adopt` already converts an anonymous Session into an
  authenticated customer Session.
- Identity verification challenges already bind a challenge to purpose,
  subject, normalized destination, expiry, and one-time consumption.
- Identity already exposes transaction-compatible verified-challenge
  consumption by exact challenge id, purpose, subject, destination, and
  consumption reference.
- Booking Session Commit already owns the root transaction that creates the
  Booking and consumes Session, Quote, and Hold.

The missing links are deliberate propagation and persistence, not another auth
system.

## Current gaps

### Booking Session loses Buyer Account context

`BookingSessionAccessContext` carries actor, principal, organization, and
capability but not the already-resolved Buyer Account or relationship buyer.
The public route adapter therefore drops the strongest customer authorization
context before the Session service sees it.

`booking_sessions` persists `ownerPrincipalId` and `ownerOrganizationId`, but
not `ownerBuyerAccountId` or its kind. A business account consequently cannot be
the durable Session owner independently of the member who happened to create
the Session.

### Commit re-infers the billing party

`resolveBilling` calls `upsertPersonFromContact` for every non-staff Commit.
That helper is intentionally CRM-oriented and returns the first Person matched
by email or phone. The Commit path supplies no ownership proof.

The existing self-service create runtime accepts `guestChallengeId` and
`userId`, but Booking Session Commit supplies neither a guest challenge nor the
authenticated customer identity correctly. It records a generic fallback
principal and has no Buyer Account grant to write.

### Portal infers authorization

Personal portal listing and detail access currently include:

- `bookings.personId === linkedPersonId`;
- `booking_travelers.personId === linkedPersonId`; and
- case-insensitive traveler-email equality with the auth email.

Business access similarly infers access from `bookings.organizationId`.

All four are useful relationship or search facts. None is a grant.

### Processor customer identity is not account identity

Checkout currently prefers the resolved CRM Person id as its reusable payment
customer reference and falls back to the customer Session principal. A Person
may exist without an account, and a business Buyer Account is not a Person.
The payment reference should instead be the stable Buyer Account id. A true
guest supplies no reference.

## Public data model

Bookings owns the access decision because the protected resource is a Booking.
Add `booking_customer_access_grants` to `@voyant-travel/bookings`:

Within this RFC, **Booking Access Grant** is shorthand for the customer-plane
grant in this table. It does not represent future partner/agent servicing
authority.

| Column | Shape | Purpose |
| --- | --- | --- |
| `id` | TypeID, prefix `bkag` | Grant identity. |
| `bookingId` | Booking TypeID, FK to `bookings.id` | Protected Booking. |
| `buyerAccountId` | non-empty text | Stable `personal:...` or `business:...` subject. |
| `buyerAccountKind` | `personal \| business` | Closed validation and query discriminator. |
| `role` | `owner` in V1 | Permission profile. Additional roles require a later matrix. |
| `source` | closed enum | Why the grant exists. |
| `proofRef` | nullable text | Session, challenge, staff command, or migration evidence. |
| `grantedByPrincipalId` | nullable text | Audit actor; not the authorization subject. |
| `createdAt` / `updatedAt` | timestamptz | Lifecycle timestamps. |
| `revokedAt` | nullable timestamptz | Immediate inactive marker. |
| `revokedByPrincipalId` | nullable text | Revocation actor. |
| `revocationReason` | nullable bounded text | Human/audit reason. |

Allowed V1 sources are:

- `authenticated_commit`;
- `verified_booking_claim`;
- `staff_grant`;
- `legacy_session_backfill`.

Constraints and indexes:

- unique `(booking_id, buyer_account_id, role)`;
- check that `buyer_account_id` has the prefix matching `buyer_account_kind`;
- check that revocation actor/reason are absent until `revoked_at` is present;
- index active grants by `(buyer_account_id, booking_id)`;
- index all grants by `booking_id` for staff audit and erasure planning.

The row may be reactivated only through the same grant command, which clears
revocation fields and records the new command in the Action Ledger. A second
row for the same subject/role is never created.

There is deliberately no foreign key from the grant to customer-auth tables.
Bookings owns no auth schema and Buyer Account ids are provider-neutral runtime
identities. The customer-auth runtime validates that the selected account is
currently usable before a route queries grants.

### Booking claim attempts

Bookings owns the durable claim attempt because it is part of the Booking
access lifecycle. Public API owns the customer-facing orchestration and calls
the Bookings claim service. Add `customer_booking_access_claims` to
`@voyant-travel/bookings`:

| Column | Purpose |
| --- | --- |
| `id` | Opaque claim identity returned to the authenticated client. |
| `bookingId` | Server-resolved Booking; no cross-package FK. |
| `buyerAccountId` / `buyerAccountKind` | Buyer context fixed at claim start. |
| `challengeId` | Identity verification challenge created by the server. |
| `status` | `pending \| granted \| expired \| failed`. |
| `idempotencyKey` / `requestFingerprint` | Retry and drift boundary. |
| `createdAt` / `expiresAt` / `grantedAt` | Lifecycle. |

The claim route derives Booking id and destination server-side. Generic
verification request metadata is never trusted as claim authority.

## Trusted customer context

Extend `BookingSessionAccessContext` with the resolved customer context already
present in Hono variables:

```ts
type CustomerBookingSessionAccess = {
  actorKind: "customer"
  principalId: string
  buyerAccountId: string
  buyerAccountKind: "personal" | "business"
  relationshipPersonId?: string
  authOrganizationId?: string
  relationshipOrganizationId?: string
  membershipId?: string
  membershipRole?: string
  publicApiOrigin: { channelId: string }
  capability?: string
}
```

The public route resolver copies these values only from trusted middleware.
They are never accepted in Booking Session request schemas.

Add `ownerBuyerAccountId` and `ownerBuyerAccountKind` to `booking_sessions`.
Keep `ownerPrincipalId` as the acting identity/audit subject. For a business
Session, authorization compares the active Buyer Account id, allowing another
current member of the same business account to resume it while membership
remains valid. It does not compare a mutable email or relationship Organization
alone.

Creating an authenticated Session and adopting an anonymous Session both fix
the Buyer Account fields. Adoption still requires the anonymous Session
capability and expected revision, then removes the capability exactly as it does
today.

## Billing-party resolution

Commit resolves the commercial billing party by actor and Buyer Account, never
by a generic contact lookup.

### Personal account

1. Use the trusted `relationshipPersonId` when present.
2. If absent, call a composition-owned `ensurePersonalBuyerPerson` runtime port
   inside the Commit transaction.
3. That port creates a fresh Person from the verified customer-auth profile and
   atomically claims it for the Customer Identity.
4. It must not search for or select a Person by submitted Booking contact data.
   Existing-Person discovery remains the explicit customer-portal bootstrap
   flow.
5. Persist the Session contact as the Booking contact snapshot even when it
   differs from the account profile. It is delivery/commercial data, not an
   identity switch.

### Business account

1. Require the trusted `relationshipOrganizationId` resolved from the active
   customer-auth Organization and live membership.
2. Use that CRM Organization as the Booking billing party.
3. Persist the entered contact person as the Booking contact snapshot.
4. Grant the Booking to the Business Buyer Account, not the acting member.

### Corporate-account forward compatibility

The existing Business Buyer Account is the future Corporate Account boundary;
this RFC must not introduce another `corporateAccountId`. The backend foundation
for multi-member purchasing is in scope now even though corporate product UI,
administration, and advanced policy are not.

The following are normative:

1. Session ownership, Booking Access Grants, payment-provider customer mapping,
   and list queries use `business:<authOrganizationId>` as the durable subject.
2. Every state-changing command separately records the acting
   `customer_auth.user.id`, membership id, and membership role as audit context.
   Those fields explain who acted; they do not replace account ownership.
3. Customer route and service boundaries accept the full discriminated
   `CustomerBuyerContext`, not only `buyerAccountId`. This preserves the member
   and role facts needed by a later corporate action policy.
4. Membership is revalidated at request time and again at Commit or another
   security-sensitive transaction boundary. A Session cookie or old audit row
   cannot preserve access after removal.
5. Another active member of the same Business Buyer Account may resume an
   account-owned Session and use an account-owned Booking under V1's existing
   shared-member policy. A member of another account cannot.
6. Session/account identity scopes idempotency and ownership; the initiating
   member remains audit provenance. An exact retry or handoff by another
   admitted member converges on the same result, while payload drift fails.
7. `membershipRole` must not be discarded or snapshotted as permanent
   authority. V1 admits any currently active member, matching existing behavior;
   a later policy may narrow actions by the member's current role without a
   Booking or grant migration.

The following corporate features remain outside this RFC:

- corporate invitations, member administration, SSO, SCIM, and domain claims;
- role/permission design beyond preserving current membership context;
- approval chains, travel policies, spend limits, budgets, cost centers, and
  departments;
- private-versus-shared corporate Bookings or per-member visibility;
- corporate credit, negotiated payment terms, statements, and consolidated
  invoicing; and
- corporate portal or booking-engine UI.

Those features can build on the same Business Buyer Account and Booking Access
Grant. They must not infer ownership from CRM Organization or email matches.

### Guest

1. Create a fresh provisional Person inside the Commit transaction with
   `source = "booking-session-v1-guest"` and `sourceRef = session.id`.
2. Never call the email/phone matching branch of `upsertPersonFromContact`.
3. Persist the submitted contact snapshot.
4. Create no Buyer Account grant.
5. Continue to return only the existing narrowly scoped guest/checkout
   capability needed for the active journey.

A verified guest challenge may authorize the specific Commit and provide a
challenge-derived audit principal. It still does not produce an account grant
unless the customer has authenticated and adopted the Session into an active
Buyer Account before Commit.

### Staff

Staff continues to select an explicit Person or Organization through the
staff-only selection. Staff creation creates no customer grant by default.
“Bill this Person” does not mean “give any account linked to this Person portal
access.” Staff may issue a separate grant through the explicit administration
command.

## Reseller and agent forward compatibility

The future scenario is a **Channel/reseller partner** selling the Operator's
inventory to its own client. It is distinct from the Operator acting as a
Reseller of sourced inventory. The existing canonical `partner` Actor type,
Channel, and Booking Origin are the starting points, but they are not yet an
agency-account authorization model.

A reseller booking has at least six independent facts:

| Fact | Meaning | Authorization effect |
| --- | --- | --- |
| `channelId` | Sales/distribution context and commercial attribution. | None by itself. |
| Partner/agency account | Counterparty on whose behalf the agent acts. | Future partner-policy subject. |
| Acting partner principal | Human or service that performed the command. | Audit actor, not durable owner. |
| Client Buyer Account | Authenticated end-client account, when one participated. | May receive a customer grant only through explicit proof. |
| Billing Person/Organization and payer | Commercial debtor/contact and source of funds. | Not access authority. |
| Travelers | People receiving the service. | Not access authority. |

This RFC preserves those seams now:

1. `BookingSessionAccessContext` remains discriminated by `actorKind`.
   Customer-only Buyer Account requirements execute only for
   `actorKind: "customer"`; a `partner` must not be forced into or accepted as a
   personal/business Buyer Account.
2. The durable create command carries actor/audit context separately from the
   optional customer access subject. It must support a Booking with a partner
   actor and no client Buyer Account without manufacturing one from contact
   data.
3. Booking Origin continues to persist the immutable, server-derived Channel.
   No code may use `booking_origins.channel_id` as a portal or servicing-access
   predicate.
4. `booking_customer_access_grants` remains deliberately customer-plane and
   accepts only personal/business Buyer Accounts. A future partner portal adds
   an explicit partner/agency account plus a separately named Partner Booking
   Access or Servicing Grant; it does not add `partner` to
   `buyerAccountKind`.
5. A partner-created Booking receives a customer grant only when an already
   authenticated client Buyer Account explicitly participates in the journey,
   or later completes the bounded Booking Claim. The agent cannot nominate an
   arbitrary Buyer Account id.
6. Partner access, when introduced, is derived from a live agency membership
   and an explicit Booking servicing assignment or policy. Channel membership,
   Organization equality, creator identity, and contact equality are not
   substitutes.
7. Customer claim/revocation does not remove partner servicing rights, and
   partner assignment/revocation does not remove customer rights. Each plane is
   evaluated independently on every request.
8. Payment initiation keeps the payer/payment-customer subject separate from
   both access planes. A future agency may pay for its client, but that must not
   make the agency the customer owner or key the client's saved instruments to
   the agency.
9. Audit and events must be able to state: Channel, partner account, acting
   partner principal, client Buyer Account if any, and grant/assignment source.
   Missing dimensions stay null; they are never inferred from email.
10. The same CRM Organization may participate as a direct Business Buyer in one
    journey and as a Channel partner in another. Those account contexts and
    grants remain distinct; sharing the Organization record creates no access
    between them.

The following remain outside this RFC and require a dedicated partner-access
design:

- partner/agency account identity and membership;
- agent invitations, SSO, API credentials, roles, and manager visibility;
- the exact Partner Booking Access/Servicing Grant schema and permission matrix;
- on-behalf-of mandates, client consent, ownership transfer, and disputes;
- net/gross pricing, commission, markup, credit limits, settlement, and
  agency-funded versus client-funded payment policy;
- PII/document visibility for agents and sub-agents;
- booking queues, amendments, cancellations, support handoff, and SLA policy;
  and
- reseller or agent portal UI.

## Customer-account protocol flows

### Passwordless sign-in and checkout adoption

The backend supports this UI-agnostic protocol sequence:

1. Shopper opens an anonymous Booking Session.
2. A consumer may initiate customer sign-in before Commit.
3. Customer auth verifies email/SMS/social identity and creates a customer
   session. Merely typing the address does nothing.
4. Customer selects a personal or business Buyer Account.
5. The public client calls Session `/adopt` with the existing Session capability.
6. Adoption binds the Session to the Buyer Account.
7. Commit resolves the billing party from that account and creates the Booking
   plus grant atomically.

The account session or bearer token is the proof carried through checkout. The
email remains a sign-in destination and contact value.

### Account created before a Person exists

A Customer Identity and personal entitlement may exist before a CRM Person.
Browsing and account selection remain allowed. The first operation requiring a
Person uses `ensurePersonalBuyerPerson`; it creates and links a new Person
without selecting an existing email match.

The existing bootstrap API may continue to return unclaimed Person candidates
only after the account has a verified matching contact and must require an
explicit customer selection in its command input. Rendering or redesigning that
choice is outside this RFC. Claiming the Person does not grant any Booking.

### True guest checkout

Guest checkout remains a supported product choice. It creates a commercial
Booking and provisional CRM Person but no account. Contact verification may be
required by commercial policy, fraud policy, or the payment path; it is not
silently converted into a general customer account.

After guest checkout, a consumer may authenticate the customer, establish a
Buyer Account, and run the booking-specific claim command. Prompting for or
rendering that flow is outside this RFC. The backend does not query all
Bookings with the same email.

### Claiming an existing Booking

The public claim API requires an authenticated customer and active Buyer
Account.

```text
POST /v1/public/customer-portal/booking-claims
POST /v1/public/customer-portal/booking-claims/{claimId}/confirm
```

Start input:

```ts
{
  bookingReference: string
  channel?: "email" | "sms"
  idempotencyKey: string
}
```

The server:

1. normalizes and resolves the Booking reference;
2. selects an eligible contact from the current operator-controlled Booking
   contact snapshot according to
   requested/supported channel;
3. creates a challenge with purpose `booking_access_claim` and subject equal to
   the resolved Booking id;
4. binds the pending claim to the active Buyer Account and challenge id; and
5. returns an opaque claim id and a generic delivery status.

It does not return whether the Booking exists, the unmasked destination, a
Person name, or current grant state. Rate limits apply per IP, Customer
Identity, Buyer Account, normalized Booking reference, and destination.

An unresolved or ineligible reference returns the same `202` envelope with a
fresh random claim id that is not persisted and sends nothing. Confirmation of
that id returns the same generic invalid/expired result as any unusable claim.
Response padding/timing is best effort; rate limiting and non-disclosure remain
the primary enumeration controls.

A personal Buyer Account may start a claim for a personal/guest Booking. A
Business Buyer Account may start one only when its live CRM Organization
mapping equals the Booking billing Organization; the contact challenge remains
required and the Organization equality is eligibility, not authorization.

Confirm input contains only the code and idempotency key. Confirmation locks
the claim, verifies and consumes its exact challenge, inserts/reactivates the
Booking Access Grant, and marks the claim granted in one transaction. Reusing a
code, changing Buyer Account, or replaying with a different fingerprint fails
closed.

The verification service gains an internal
`confirmAndConsumeChallengeById(...)` operation for this workflow. It verifies
the code against the exact challenge row under the claim transaction and
requires the expected purpose, subject, destination, and consumption target.
The generic public confirmation route, which looks up a challenge from a
caller-supplied destination, is not the claim authority.

Claim start must likewise be subject-bound. Identity's current generic start
path coalesces a pending challenge by `(channel, destination, purpose)` and can
replace its `subjectRef`; the claim workflow instead creates a new challenge or
coalesces only on `(channel, destination, purpose, subjectRef)`. Two simultaneous
claims for different Bookings must never share mutable challenge state.

Both claim routes are callable with a publishable Public API key but require a
customer-realm session and active Buyer Account. In manifest terms they are
`publishable`, not `anonymous`; the OpenAPI document must publish that key-kind
posture without implying that the key authorizes the claim.

The claim authorizes only that Booking. It never imports all Bookings sharing
the destination.

### Staff grant and revoke

Add staff commands and thin admin routes:

```text
POST   /v1/admin/bookings/{bookingId}/customer-access
DELETE /v1/admin/bookings/{bookingId}/customer-access/{grantId}
GET    /v1/admin/bookings/{bookingId}/customer-access
```

Grant input selects an existing Buyer Account id and kind, not an email. Auth
runtime validation confirms the account exists and is usable. Add a dedicated
`booking-customer-access` access-catalog resource so listing requires
`booking-customer-access:read` and grant/revoke require
`booking-customer-access:write`; ordinary `bookings:write` does not imply either.
Mutations also require an idempotency key, an Action Ledger command, and a
bounded reason for staff actions.

The admin API returns the account name, kind, source, proof, grant time,
revocation state, and acting staff member. It never returns auth tokens or
verification codes. Rendering this information is outside this RFC.

## Portal authorization

All customer-portal Booking operations first resolve the active Buyer Account,
then check an active grant:

```sql
SELECT 1
FROM booking_customer_access_grants
WHERE booking_id = $booking_id
  AND buyer_account_id = $active_buyer_account_id
  AND role = 'owner'
  AND revoked_at IS NULL
```

List operations join or `EXISTS` against the same predicate. Detail,
documents, financials, payments, companions, billing-contact views, and Booking
mutations share one helper owned by Public API/Bookings rather than reimplement
the predicate.

Delete these authorization branches:

- direct `bookings.personId` comparison;
- direct `bookings.organizationId` comparison;
- `bookingTravelers.personId` comparison; and
- traveler email comparison.

Person and Organization links remain available for profile, CRM, reporting,
and operator workflows. They simply stop granting access.

V1's `owner` role preserves the current full Booking portal surface. Future
`traveler`, `payer`, `delegate`, or `viewer` roles require an explicit
endpoint/field permission matrix and must not be added as aliases for `owner`.

## Payment-provider customer mapping

When checkout has an active Buyer Account, pass a qualified stable account
reference to payment initiation:

```text
voyant-buyer-account:<buyerAccountId>
```

The adapter may map that reference to a Stripe Customer or equivalent provider
record. It must not search by email to choose a provider customer. Provider
metadata should carry the qualified Voyant reference for audit/support.

For a guest, omit the customer reference. A guest may make a one-off payment,
but cannot store an instrument for future account use. No shared anonymous
reference is permitted.

Existing provider customers keyed by Person id are compatibility data, not
authorization. An adapter-specific migration may attach the new qualified
reference after an authenticated Buyer Account is explicitly linked. It must
not bulk-link provider customers by email.

Creating a hosted billing-portal session or offering a saved instrument
requires:

1. an authenticated Customer Identity;
2. an active Buyer Account;
3. an explicit provider-customer mapping for that Buyer Account; and
4. any required instrument mandate/authorization.

Operator-managed `person_payment_methods` can remain a CRM projection in the
first slice. Customer-facing saved-instrument use must additionally prove the
active Buyer Account mapping; a Person link alone is insufficient.

## Module ownership and runtime ports

### Auth

- Owns Customer Identity, personal entitlement, business membership, and Buyer
  Account resolution.
- Exposes provider-neutral active Buyer Account context.
- Does not read Bookings or issue Booking grants.

### Public API

- Owns customer portal transport and Booking Claim workflow.
- Resolves only trusted customer context from auth middleware.
- Asks Identity to start/consume bounded verification challenges and Bookings
  to transition the durable claim.
- Does not infer access from contact data.

### Catalog

- Owns Booking Session ownership/adoption and Commit orchestration.
- Persists Buyer Account ownership on the Session.
- Passes the trusted buyer context through the root Commit transaction.

### Relationships

- Owns Person/Organization and contact discovery/reconciliation.
- Adds a create-without-contact-match operation for provisional guest People.
- Generic `upsertPersonFromContact` remains available for trusted CRM workflows
  but is not used as customer authorization.

### Bookings

- Owns `booking_customer_access_grants`,
  `customer_booking_access_claims`, and their state transitions.
- Exposes claim/start-confirm and grant/revoke/check service boundaries to the
  Public API composition layer.
- Validates grant invariants and emits access lifecycle events.
- Treats billing party and customer access as separate facts.

### Finance

- Carries the server-derived customer access subject through the durable
  Booking create command.
- Invokes the Bookings grant service after Booking creation and before the root
  transaction commits.
- Uses Buyer Account reference for reusable provider-customer mapping.

The Bookings grant service is a real owner gate: Finance and Public API call it
rather than inserting grant rows directly. This is not an indirection added for
package purity; it centralizes the authorization invariant, reactivation rules,
events, and audit behavior.

## Transaction and idempotency rules

### Authenticated Commit

Inside the existing root Commit transaction:

1. lock/validate Session, Quote, Hold, and Commit idempotency;
2. for a customer actor, revalidate active Buyer Account context; for another
   actor kind, validate only that actor's own admitted authority;
3. resolve/create the billing Person or Organization without contact matching;
4. derive and validate the Booking command;
5. create the Booking graph;
6. create/reactivate the `owner` grant with source
   `authenticated_commit` and `proofRef = bookingSessionId`;
7. consume Session, Quote, Hold, and any challenge;
8. write Booking/Finance/access outbox events; and
9. commit.

Any failure rolls all nine steps back. An exact replay reads the existing
Booking and grant. Payload drift under the same idempotency key is rejected.

### Grant command

Grant identity is `(bookingId, buyerAccountId, role)`. The command fingerprint
also includes kind, source, proof, and acting principal. Concurrent exact
grants converge on one active row. A changed target or source under the same
idempotency key is command drift.

### Revocation

Revocation conditionally updates an active grant. Exact replay returns the
existing revoked outcome. Revoking an already revoked grant with different
reason or actor is drift, not a second successful mutation.

## Events and audit

Bookings emits:

- `booking.customer_access.granted`;
- `booking.customer_access.revoked`.

Payloads contain Booking id, grant id, Buyer Account kind, source, role,
occurred time, and audit actor id where applicable. They do not contain email,
phone, verification code, provider customer id, or full Buyer Account display
data.

The Action Ledger records staff grant/revoke and public claim completion.
Booking Session audit records adoption and the selected Buyer Account id/kind.
Verification storage records the challenge and one-time consumer. Together
they answer who acted, what account received access, what proof authorized it,
and which Booking was affected.

## Privacy and threat model

The design covers:

- a caller typing a victim's email into anonymous checkout;
- shared family or corporate inboxes;
- recycled email addresses and phone numbers;
- two CRM People carrying the same contact;
- a Person merge after Bookings exist;
- an account changing its primary email;
- a leaked or guessed Booking reference;
- replayed verification codes;
- a business member removed after a grant was issued;
- concurrent claim or Commit retries;
- a malicious client submitting another Buyer Account id;
- a payment adapter returning or searching by an unrelated provider Customer;
- legacy rows whose provenance cannot prove who created them.

An email compromise still compromises a passwordless account that uses that
email. That is an authentication risk addressed by the customer auth realm,
MFA/step-up policy, session revocation, and provider security. It does not
justify making every occurrence of the email an authorization grant.

## Migration and rollout

The security cutover is fail-closed and does not ship a legacy-email-access
switch.

### Schema migration

1. Add `booking_customer_access_grants` in the Bookings migration source.
2. Add Booking Session Buyer Account owner fields in the Catalog migration
   source.
3. Add Booking claim storage to the Bookings migration source when the claim
   slice ships.
4. Ensure package manifests include the migration identities so source-free
   managed images load them through their real package paths.

### Safe legacy backfill

Backfill only evidence that identifies the authenticated account independently
of contact data:

1. Join `booking_session_commits.booking_id` to its Booking Session.
2. For a legacy customer Session with a real `ownerPrincipalId`, an active
   personal Buyer Account for that exact user, and no anonymous sentinel,
   create `personal:<ownerPrincipalId>` with source
   `legacy_session_backfill`.
3. For a legacy business Session, require an exact customer-auth Organization,
   active CRM Organization mapping, and equality between that mapping and the
   Booking billing Organization before creating the business grant.
4. Never backfill from Person id, Organization id alone, billing/traveler
   email, phone, provider customer email, or `booking_origins.metadata` alone.

Produce a migration report with:

- safely granted personal Bookings;
- safely granted business Bookings;
- already granted Bookings;
- ambiguous Bookings requiring claim/staff review; and
- rejected inconsistent evidence.

The baseline is not a target to suppress. Every ambiguous row remains
ungranted until a specific claim or staff decision.

### Read cutover

The release is executed in this order while the previous application version
continues serving traffic:

```sh
DATABASE_URL=postgres://... pnpm db:migrate
DATABASE_URL=postgres://... pnpm backfill:booking-customer-access
DATABASE_URL=postgres://... pnpm backfill:booking-customer-access -- --apply
```

The first backfill command is the mandatory dry-run report. Review and retain
that report before using `--apply`; the command is registered in the Operator
workspace and its source is part of the Operator typecheck. Only after the apply
report is retained may the new application version, which cuts reads over to
grants, be deployed. The backfill remains safely rerunnable after deployment.

In that same release:

1. run the safe backfill;
2. switch every customer-portal Booking read/mutation to grants;
3. remove Person, Organization, traveler-Person, and traveler-email
   authorization fallbacks; and
4. expose the claim/staff remediation path for ungranted history.

There is no dual-read period in which contact inference can still authorize a
request. Shadow metrics may compare what the old predicate would have returned,
but the old result cannot influence the response.

### Active Booking Sessions

For active legacy customer Sessions:

- derive a personal Buyer Account only from a real customer-realm
  `ownerPrincipalId` with an active personal entitlement;
- derive a business Buyer Account only from an exact auth Organization mapping;
- leave any ambiguous Session unowned by a Buyer Account and require the
  customer to re-adopt it while presenting the Session capability;
- never infer the owner from Session contact selection.

Terminal Sessions need no owner migration beyond retained audit evidence.

## Execution plan

Each slice must leave the tree deployable and has a narrow verification target.

### Primary implementation map

| Responsibility | Existing touchpoints | Expected change |
| --- | --- | --- |
| Resolve Buyer Accounts | `packages/auth/src/customer-buyer-accounts.ts`, `packages/auth/src/auth-realms.ts`, `packages/auth/src/node-runtime.ts` | Preserve the already-resolved account context at the public transport boundary. |
| Persist Session ownership | `packages/catalog/src/booking-engine/sessions-schema.ts`, `sessions-service.ts`, `sessions-drizzle.ts`, `sessions-routes.ts` | Add Buyer Account owner fields and use them for customer create/adopt/access. |
| Resolve Commit billing | `packages/catalog/src/booking-engine/sessions-production.ts` | Replace non-staff contact upsert with personal/business/guest-specific resolution. |
| Identify processor customer | `packages/catalog/src/booking-engine/sessions-payment-production.ts`, `packages/finance/src/card-payment.ts` | Pass the qualified Buyer Account reference or nothing for a guest. |
| Execute atomic create | `packages/finance/src/self-service-create-runtime.ts`, `packages/finance/src/booking-create-command.ts`, `packages/finance/src/service-booking-create.ts` | Carry the trusted access subject and call the Bookings grant owner before commit. |
| Own grant schema/service | `packages/bookings/src/schema-core.ts`, a focused new access service/schema file, `packages/bookings/migrations/` | Store, check, grant, reactivate, revoke, and emit lifecycle events. |
| Authorize portal reads | `packages/public-api/src/customer-portal/service-public-impl.ts` | Replace Person/Organization/traveler/email predicates with one grant helper. |
| Claim a Booking | `packages/public-api/src/customer-portal/`, `packages/bookings/src/`, `packages/bookings/migrations/`, `packages/identity/src/verification/` | Public API orchestrates; Bookings owns claim state; Identity owns bounded challenge confirmation/consumption. |
| Explicit Person linkage | `packages/public-api/src/customer-portal/service-public-impl.ts`, `packages/relationships/src/service/accounts-resolve.ts` | Reuse/refactor explicit account bootstrap and add guest create-without-match. |
| Public/admin contracts | Public API and Bookings route schemas plus generated OpenAPI documents | Publish claim and grant/revoke contracts with correct key-kind and auth posture. |

### Slice 1 — contracts and red tests

- Add Buyer Account fields to `BookingSessionAccessContext` and internal Session
  records.
- Add Bookings grant schemas/types and service contract.
- Add failing integration tests for #4813, shared email, Person merge, changed
  account email, business membership removal, and a two-member business-account
  Session handoff.
- Add a partner negative-control proving Channel and submitted client identity
  cannot create a customer grant.
- Add a portal negative-control test proving Person/traveler matches alone do
  not authorize.

Verification:

```sh
pnpm --filter @voyant-travel/catalog test
pnpm --filter @voyant-travel/public-api test
pnpm --filter @voyant-travel/bookings test
```

### Slice 2 — grant persistence and owner service

- Add Bookings schema, migration, indexes, grant/check/revoke service, and
  events.
- Add command idempotency and concurrent-grant tests.
- Export only the narrow supported runtime/service surface.

Verification:

```sh
pnpm --filter @voyant-travel/bookings typecheck
pnpm --filter @voyant-travel/bookings test
```

### Slice 3 — trusted Buyer Account propagation

- Copy customer middleware Buyer Account context into the public Booking
  Session route resolver.
- Persist owner Buyer Account on create/adopt.
- Authorize customer Session operations by Buyer Account; retain principal for
  audit.
- Migrate or require re-adoption of active legacy Sessions as specified above.

Verification:

```sh
pnpm --filter @voyant-travel/auth test
pnpm --filter @voyant-travel/catalog test
```

### Slice 4 — safe billing resolution and atomic grant

- Add `ensurePersonalBuyerPerson` and create-without-match guest resolution.
- Resolve business billing from trusted relationship Organization context.
- Stop using `upsertPersonFromContact` in customer/guest Commit.
- Carry the access subject through Finance's durable create command.
- Insert the initial grant inside the Booking create transaction.
- Supply authenticated `userId` or verified-guest challenge attribution
  correctly.

Verification includes a database-backed rollback test where grant creation
fails after Booking insert and leaves no Booking, grant, allocation, Finance
row, or consumed Session source.

### Slice 5 — portal authorization cutover and safe backfill

- Add the evidence-only backfill and report.
- Replace every personal/business Booking authorization predicate with the
  shared grant check.
- Remove traveler-email and relationship fallbacks.
- Add query-plan/index coverage for Booking lists at realistic cardinality.

Verification:

```sh
pnpm --filter @voyant-travel/public-api typecheck
pnpm --filter @voyant-travel/public-api test
pnpm verify:architecture
```

### Slice 6 — claim and staff remediation workflows

- Add durable claim attempts and dedicated start/confirm APIs.
- Derive destinations server-side and return enumeration-safe responses.
- Add rate limits, challenge consumption, Action Ledger coverage, admin
  grant/revoke routes, and generated contracts.
- Do not add customer or staff UI; consumers integrate these contracts
  separately.

### Slice 7 — payment customer references

- Use qualified Buyer Account references for authenticated payment initiation.
- Omit references and instrument storage for guests.
- Add explicit compatibility mapping for legacy Person-keyed provider
  customers; no email backfill.
- Require active account mapping before creating hosted billing-portal sessions
  or exposing saved instruments.

### Slice 8 — documentation and conformance ratchets

- Update Booking journey and auth architecture documents from this accepted
  RFC.
- Add declarative `verify:symbol-policy` rules where the prohibition is
  expressible, including preventing customer Commit from calling
  `upsertPersonFromContact`. Keep the portal no-contact-authorization rule in
  the shared negative integration suite where an AST symbol rule cannot
  distinguish authorization use from legitimate response projection; do not
  add a source-substring checker.
- Regenerate OpenAPI and verify key-kind declarations for claim routes.
- Run `pnpm verify:fast`; use `pnpm verify:full` for the final cross-package
  release candidate.

## Required test matrix

### Personal accounts

- Authenticated personal Commit creates one Booking and one active grant.
- Exact Commit replay creates neither a second Booking nor grant.
- Submitted contact email may differ from account email without changing the
  grant subject.
- Changing verified account email preserves existing access.
- Relinking, archiving, or merging the Person neither creates nor transfers
  access.
- Another account linked to a Person with the same contact receives no access.

### Business accounts

- Commit grants the Business Buyer Account, not the acting member.
- A second active member of the same business can resume the Session and access
  the Booking without creating a second grant.
- A removed member loses access on the next request.
- A member of another Business Buyer Account cannot resume or read it.
- Create, handoff, Commit, payment, and amendment audit records preserve the
  actual acting member while ownership remains account-scoped.
- Current membership id and role reach the authorization boundary and are not
  persisted as permanent authority on the Booking or grant.
- Another CRM Organization with the same billing email receives no access.
- Switching active Buyer Account cannot read a Booking granted to the prior
  selection.

### Guests and verification

- Anonymous Commit naming an existing Person's email creates a different
  provisional Person and no account grant.
- Email-verified and SMS-verified guest challenges are subject-, purpose-,
  destination-, expiry-, and consumption-bound.
- A verified phone cannot smuggle an unverified victim email into Person
  resolution or payment-customer mapping.
- Guest payments carry no reusable customer reference and store no instrument.

### Partner isolation

- A `partner` actor with a valid Channel but no future servicing grant receives
  no customer access.
- Supplying a client email, Person, Organization, or Buyer Account id cannot
  create a customer grant for a partner-created Booking.
- Partner Commit preserves Channel and acting-principal audit provenance while
  leaving the customer access subject absent.
- A later bounded client claim can grant the client Buyer Account without
  changing Channel provenance or inventing partner access.
- A customer grant never satisfies a partner authorization check, and a
  partner assignment never satisfies the customer grant predicate.

### Claims

- Unknown and known Booking references have indistinguishable start responses.
- A challenge for Booking A cannot claim Booking B.
- A challenge started under Buyer Account A cannot grant Buyer Account B.
- Expired, failed, consumed, or drifted challenges grant nothing.
- Concurrent confirmation produces one grant and one access event.
- Claiming one Booking does not import another Booking with the same contact.

### Portal

- Person-id, Organization-id, traveler-Person, and traveler-email matches are
  insufficient without a grant.
- Every Booking detail subresource and mutation applies the same grant helper.
- A revoked grant disappears from lists and returns the standard not-found
  posture on direct access.
- Portal responses do not disclose whether a different Buyer Account has a
  grant.

### Migration

- Authenticated Session evidence backfills the exact personal account.
- Verified business Session evidence backfills the exact business account.
- Anonymous sentinel, Person match, email match, ambiguous organization, and
  missing auth account remain ungranted.
- The source-free managed bundle loads the Bookings/Catalog migration
  identities and produces the same plan as repository development.

## Observability

Metrics contain no contact values:

- grants created/revoked by source and Buyer Account kind;
- customer Commit attempts rejected for missing/invalid Buyer Account context;
- guest provisional People created;
- claims started, delivered, verified, expired, failed, and rate-limited;
- portal denials by reason category (`no_grant`, `revoked`,
  `inactive_business_membership`, `invalid_buyer_context`);
- migration safe-grant and ambiguous counts; and
- provider payment starts with account reference versus guest/no reference.

Alert on any attempted customer Commit carrying an account-shaped value from
request payload, any partner path attempting to write a customer grant from
submitted client identity, any guest payment with a reusable customer
reference, and any portal path executing without the shared grant guard.

## Acceptance criteria

1. No anonymous or authenticated customer Commit selects an existing Person by
   matching submitted email or phone.
2. Every customer-visible Booking operation is authorized only through an
   active Booking Access Grant for the active Buyer Account.
3. Authenticated Commit creates the Booking and initial grant atomically and
   idempotently.
4. Personal and business Buyer Accounts both survive Session create/adopt,
   payment, Commit, and portal reads without being reconstructed from contact
   data.
5. Guest checkout remains available and creates no reusable account/provider
   customer identity.
6. A customer can claim one historical Booking through a bounded,
   enumeration-safe verification flow.
7. Staff can list, grant, and revoke Booking access through audited,
   permission-gated commands.
8. Person/Organization/traveler links and contact snapshots remain useful but
   have no authorization effect.
9. Safe legacy evidence is backfilled; ambiguous legacy rows remain ungranted
   and are reported.
10. Payment adapters use a qualified Buyer Account reference for authenticated
    customers and no reference for guests.
11. Tests cover shared/recycled contact values, identity changes, CRM merges,
    business membership changes, replay, concurrency, rollback, and migration.
12. OpenAPI, route posture, migration identity, architecture, package tests,
    and affected typechecks pass.
13. The implementation contains no customer or staff frontend, customer-facing
    booking-engine application, reference application, or changes to
    `packages/public-api-react`; UI work requires a separate RFC or product
    scope.
14. Business Session and grant ownership is account-scoped, command audit is
    member-scoped, an admitted second member can take over the same journey,
    and membership removal denies the next operation without rewriting grants.
15. Partner actors, Channels, client Buyer Accounts, billing parties, payers,
    and Travelers remain distinct; the current implementation neither grants
    partner servicing access nor turns partner-supplied client data into a
    customer grant.

## Rejected alternatives

### Verify contact, then keep using Person id as portal authority

Rejected. Verification would contain the anonymous exploit but leave Person
merge, shared-contact, account relink, business-membership, and mutable CRM
operations able to change authorization implicitly.

### Automatically grant every Booking matching the account email

Rejected. It recreates the vulnerability during signup, mishandles shared and
recycled addresses, and cannot explain which proof authorized which Booking.

### Put account ownership columns directly on `bookings`

Rejected. One column cannot represent later claims, revocation, business
access, audit provenance, or future explicit delegates. A grant is a lifecycle,
not a denormalized label.

### Make `customer_auth.user.relationshipPersonId` the grant

Rejected. It is a canonical identity-to-CRM link, not a resource entitlement.
Changing or repairing CRM linkage must not move access to commercial records.

### Create a customer account for every guest automatically

Rejected. Entering contact data is not informed account creation and some
deployments deliberately support guest-only checkout. Account creation remains
an explicit authentication operation.

### Key payment-provider customers by email

Rejected. Provider Customer objects are billing projections, email is mutable,
and guests may share or mistype it. The stable Buyer Account mapping is the
correct reference.

### Treat a reseller agency as a Business Buyer Account

Rejected. A direct corporate buyer purchases for itself; a Channel partner
acts as an intermediary for a client. Reusing the customer account would make
the agency appear to own the client's Booking and would collapse partner,
client, payer, and traveler permissions.

### Grant every agent access to every Booking from its Channel

Rejected. Channel is commercial attribution, not an authenticated account or
servicing mandate. Channel-wide access would expose unrelated clients to every
agent or integration operating through the same distribution relationship.

## Resolved decisions

- Buyer Account, not Person or email, is the customer authorization subject.
- Booking Access Grant is the only customer-portal Booking authority.
- Bookings owns grants and durable claim state; Public API orchestrates the
  public claim flow; Identity owns generic verification challenges; Auth owns
  Buyer Account validity.
- V1 ships only the `owner` role.
- Authenticated Commit writes the initial grant atomically.
- Staff creation grants nobody by default.
- Guest Commit creates a fresh provisional Person without contact matching.
- Historical access is claimed per Booking, never bulk-imported by email.
- Legacy backfill accepts only authenticated Session/account evidence.
- Business grants target the business account and rely on live membership.
- Customer grants do not authorize partner actors; Channel provenance and
  future partner servicing authority remain separate.
- Payment customer references use qualified Buyer Account ids; guests have no
  reusable reference.
- There is no compatibility flag that restores contact-derived authorization.

## Deferred follow-ups

These require separate permission/product decisions and do not block V1:

- role-specific `traveler`, `payer`, `delegate`, and `viewer` access;
- customer invitations to a personal Booking;
- guardian/dependent account policy;
- account-to-account Booking transfer;
- customer-facing saved-instrument migration from CRM Person projections;
- configurable step-up/MFA policy for high-sensitivity Booking operations;
- cross-Booking household/group views built from explicit grants; and
- partner/agency identity, on-behalf-of mandates, and Booking servicing grants,
  designed in a dedicated reseller/agent access RFC.
