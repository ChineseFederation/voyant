# RFC: First-class inquiry management and sales conversion

- **Status:** Draft (2026-08-18)
- **Tracking:** [voyant#4837](https://github.com/voyant-travel/voyant/issues/4837)
- **Owners:** relationships + proposals + bookings + storefront + admin
- **Related:**
  [ADR-0018](../adr/0018-proposals-as-travel-native-bespoke-sales-artifact.md),
  [ADR-0019](../adr/0019-booking-v1-commitment-point-policies.md),
  [storefront architecture](./storefront-architecture.md),
  [packaged admin RFC](./packaged-admin-rfc.md), and
  [agent tool library](./agent-tool-library.md)

This RFC gives travel agencies one durable place to receive, triage, work, and
resolve customer inquiries. It covers both inquiries about a known Product or
departure and open-ended requests for custom travel. A qualified inquiry may
become a Proposal, enter a customer-completed Booking Session, or become a
staff-created Booking through the existing owner command for that target.

---

## 1. Summary

Voyant currently has useful but disconnected inquiry primitives:

- Storefront lead intake creates a Person and a `customer_signal` with kind
  `inquiry` or `request_offer`.
- Product checkout can create a separate `booking_inquiry`.
- Customer signals carry assignment and follow-up state, but have no packaged
  Inquiry queue or qualification command.
- Proposals provide the correct sales pipeline after a request is qualified.
- A Proposals runtime can create an inquiry-shaped Proposal, but there is no
  tracked in-repository consumer and no durable source inquiry handoff.

The result is capture without a complete operating workflow. The same customer
request can land in different tables depending on which form they used, and
staff cannot reliably answer these questions:

- What is new, unassigned, overdue, or waiting for a customer?
- Is this request for a particular Product, a departure, or something custom?
- Who owns the next action and when is it due?
- What conversations and changes have happened?
- Was it declined, lost, duplicated, converted to a Proposal, or booked?
- Can we prove which inquiry produced the Proposal or Booking?

This RFC introduces a first-class **Inquiry** owned by Relationships, backed by
one lifecycle and one operator workspace. It retires inquiry use of
`customer_signals` and `booking_inquiries` after a data-preserving migration.

The canonical flow becomes:

```text
customer request
      |
      v
   Inquiry  --triage / assign / contact / gather requirements--+
      |                                                       |
      +--> closed: lost / spam / duplicate / not serviceable  |
      |                                                       |
      +--> Proposal --> accepted Proposal Version ------------+--> Booking
      |                                                       |
      +--> Booking Session --> Quote / optional Hold --> Commit+
      |                                                       |
      +--> staff-created Booking ------------------------------+
```

An Inquiry records demand and the agency's work on it. A Proposal records a
qualified sales pursuit and its customer-facing commercial versions. A Booking
records committed travel. Those are distinct artifacts and remain distinct.

---

## 2. Goals

- Give staff one work queue for every actionable customer inquiry, regardless of
  capture channel.
- Support both known-Product requests and custom/general travel requests
  without forcing one into the other's shape.
- Preserve original customer wording, contact data, source context, consent,
  and submitted Product/departure context.
- Support ownership, priority, due dates, SLA visibility, internal notes,
  communication history, attachments, and a clear next action.
- Resolve duplicate contact identities without creating a new Person for every
  form submission.
- Convert an Inquiry exactly once per requested target operation, with durable
  provenance and safe retries.
- Make Proposal the normal target for bespoke, negotiated, or multi-option
  sales work.
- Permit direct reusable-Product booking paths without inventing a Proposal
  when no proposal process is needed.
- Keep all Booking creation and commitment validation inside Bookings and the
  Booking Platform. Inquiry code must never insert Booking rows itself.
- Provide API, packaged admin UI, events, notifications, realtime
  invalidation, agent tools, permissions, and reporting as one capability.
- Migrate existing inquiry data without silently losing source or status.

## 3. Non-goals

- Building a general-purpose help desk or omnichannel email client.
- Replacing People, Organizations, Activities, communication logs, custom
  fields, Products, Trips, Proposals, Booking Sessions, or Bookings.
- Treating wishlists, availability notifications, referrals, and abandoned
  carts as full Inquiries. They remain Customer Signals until a staff or
  automated action promotes one.
- Automatically deciding that every submission is qualified.
- Automatically sending a quote or confirming travel on intake.
- Creating arbitrary per-deployment workflow graphs. Package-owned commands,
  events, and durable domain state remain the extension model.
- Defining supplier-side RFPs. An RFP is sourcing for a Program and is not a
  customer Inquiry.

---

## 4. Proposed ubiquitous language

The following terms become canonical if this RFC is accepted:

| Term | Definition | Not the same as |
| --- | --- | --- |
| **Inquiry** | A durable customer request the agency must triage or work, before or alongside a commitment artifact. It owns intake provenance, operational state, responsibility, requirements, and resolution provenance. | Customer Signal, Proposal, Quote, Booking |
| **Inquiry Target** | A Product, option/departure, Trip draft, Catalog Item, or other supported subject the customer asked about. An Inquiry may have zero or more targets. | Proposal line |
| **Travel Brief** | The partial, customer-supplied requirements known during inquiry: destinations, dates/flexibility, party, budget, origin, interests, and free text. It may be incomplete. | Trip Envelope, Booking requirements |
| **Qualification** | The staff decision that an Inquiry is worth advancing into a sales or booking path. | Proposal acceptance, Booking confirmation |
| **Conversion** | The idempotent command that creates or attaches the next durable artifact and records provenance. | Copying fields by hand |
| **Customer Signal** | A lightweight indication of interest or engagement that does not yet require a worked sales case. | Inquiry |

Avoid **Lead** as the persisted domain noun. “Lead” is acceptable storefront or
marketing copy, but it ambiguously refers to a Person, an Inquiry, or a pipeline
stage. APIs, tables, events, tools, and internal routes use **Inquiry**.

Reserve **Inbox** for the Conversations product surface that receives and sends
customer messages. Inquiry management uses **Inquiry queue**, **work queue**,
and **Inquiry workspace**. A conversation may be linked to an Inquiry, but the
two surfaces and their identifiers are not interchangeable.

An Inquiry does not become a Proposal by changing a status label. Conversion
creates a distinct Proposal and a durable relationship between the two.

---

## 5. Current state and gaps

### 5.1 Storefront lead intake

`POST /v1/public/storefront/leads` accepts contact data, an optional Product and
option-unit reference, notes, tags, source URL, locale, arbitrary bounded
payload, and consent. It deduplicates by a derived or supplied submission id,
creates a Person, creates a Customer Signal, and emits
`customer.signal.created`.

This is a sound intake boundary, including an injectable abuse guard, but it is
not an inquiry-management workflow:

- contact matching is submission-based rather than person-identity resolution;
- every new submission creates a Person before a human reviews it;
- the request has no subject, next action, resolution, or conversion record;
- Product context is an un-enriched id in downstream notifications;
- there is no packaged operator page for the generated signal.

### 5.2 Customer signals

`relationships.customer_signals` already has useful concepts: kind, source,
status, priority, assignee, follow-up time, Product/option references, notes,
tags, source submission id, metadata, and resolved Booking id.

Its own schema comment defines it as lighter than a Proposal. That is correct
for wishlist, notify, referral, and abandoned-cart recovery. It is too light
for a worked Inquiry because it lacks a conversation/work log, requirements,
multiple targets, close outcomes, and Proposal conversion. Its only resolution
command attaches an already-created Booking and marks the signal converted.

### 5.3 Booking inquiries

`bookings.booking_inquiries` separately persists storefront/channel, Product,
departure, contact snapshot, locale, message, and `open | closed`. It has good
idempotent intake semantics and emits `booking.inquiry.created`, but it has no
assignee, due date, Person/Organization relationship, sales lifecycle,
qualification, conversion, or detailed close outcome.

The admin API can list and read these rows, but the record is still an intake
receipt rather than an agency workspace.

### 5.4 Proposals

Proposals already own the correct post-qualification sales capability:

- configurable pipelines and stages;
- Person and Organization association;
- owner, expected close date, value, tags, custom fields, participants, and
  activities;
- Product/manual lines and a composable Trip snapshot;
- immutable customer-facing Proposal Versions;
- send, view, feedback, accept/decline, and booking handoff.

This RFC reuses that capability. It does not add inquiry stages to Proposals or
duplicate Proposal Versions under Inquiry.

### 5.5 Broken handoffs

The Customer Signal alert constructs `/crm/signals/:id`, but no packaged admin
route owns that path. The alert is disabled by default. The Proposals
`checkout-inquiry` runtime can resolve a pipeline and create an open Proposal,
but has no tracked consumer and records no link back to an Inquiry. These are
partial seams, not a supported lifecycle.

---

## 6. Decision: Inquiry is a first-class Relationships aggregate

Relationships owns Inquiry because the aggregate begins with a customer
request, identity resolution, contact history, responsibility, and follow-up.
It does not own Product details, Proposal behavior, or Booking creation.

The implementation lives in the existing package family:

- `@voyant-travel/relationships-contracts` — import-cheap schemas and ports;
- `@voyant-travel/relationships` — tables, service, routes, events, tools, and
  conversion coordinator;
- `@voyant-travel/relationships-react` — query/mutation hooks and packaged
  admin pages.

A new top-level package is not justified. Under ADR-0016, modules are
components of one deployable, and Relationships already owns customer identity,
activities, communications, and Customer Signals. Inquiry is a deeper
Relationships capability, not a separately deployable subsystem.

### 6.1 Why not keep using Customer Signal?

A Customer Signal is intentionally cheap and numerous. A wishlist entry should
not acquire an owner, SLA, conversation workspace, qualification audit, and
conversion state merely because Inquiry shares one enum today. Keeping the
concepts separate protects both:

- Signals remain lightweight engagement facts.
- Inquiries become the smaller set of requests staff are accountable for.
- A Signal may be promoted to an Inquiry without being rewritten or erased.

### 6.2 Why not make Inquiry a Proposal stage?

Many inquiries are spam, duplicates, unsupported requests, availability
questions, or exact-Product booking requests. Creating a Proposal for all of
them inflates the sales pipeline and falsely implies a qualified pursuit.
Proposal creation is the result of qualification, not intake.

### 6.3 Why not leave Product inquiries in Bookings?

Before commitment, a Product question is still customer demand that staff must
work. The fact that it originated in a booking journey is provenance, not
aggregate ownership. Bookings remains the owner of any Booking Session or
Booking created after conversion.

---

## 7. Domain model

### 7.1 Inquiry

The proposed `inquiries` table contains:

| Field | Purpose |
| --- | --- |
| `id` | TypeID with a dedicated Inquiry prefix |
| `subject` | Human-readable queue and workspace title |
| `kind` | `product`, `custom_trip`, or `general` |
| `status` | Current operational lifecycle state (§8) |
| `closeOutcome` | Terminal reason when closed without conversion |
| `priority` | `low`, `normal`, `high`, or `urgent` |
| `personId` | Resolved primary Person, nullable until identity triage |
| `organizationId` | Optional customer Organization |
| `contactSnapshot` | Submitted name/email/phone at the time of intake |
| `ownerId` | Staff member accountable for the next action |
| `teamId` | Optional owning team when team assignment exists |
| `nextActionAt` | Explicit follow-up deadline |
| `firstResponseDueAt` | Frozen SLA deadline calculated at intake |
| `firstRespondedAt` | First meaningful outbound response |
| `travelBrief` | Validated partial requirements (§7.3) |
| `customerMessage` | Original customer wording, preserved verbatim |
| `internalSummary` | Staff-maintained concise working summary |
| `source` | `storefront`, `phone`, `email`, `admin`, `import`, `api`, or adapter-defined source |
| `sourceRef` | Idempotency/provenance key within the source |
| `sourceUrl` / `locale` | Capture context |
| `consentSnapshot` | Consent facts submitted with the request |
| `customFields` | Namespaced deployment/module custom values |
| timestamps | Created, updated, last activity, qualified, converted, closed |

`contactSnapshot` is required for public intake even when `personId` resolves.
It is evidence of what the customer submitted and must not silently change when
the CRM Person changes later.

`personId` is nullable so an abuse submission or ambiguous identity does not
pollute the People directory. Identity resolution may attach an existing Person
or create one during triage. Deployments may still configure trusted sources to
create or resolve a Person immediately.

### 7.2 Inquiry targets

An Inquiry may refer to zero, one, or several things. Product-specific intake
usually has one Product and optionally one option/departure; custom requests
usually begin with none.

Targets use standard link definitions rather than cross-package foreign keys.
Supported initial target kinds are:

- `product`;
- `option_unit` or the canonical departure-like Product option target;
- `catalog_item`;
- `trip` for a draft Trip created while shaping a custom request.

Each link carries an immutable display snapshot sufficient to explain the
original request if the target is later renamed or removed: title, option label,
dates when known, public URL, and source channel. The owning package remains
authoritative for live details.

No `productId` convenience column is added to `inquiries`. Query projections
may index standard links for Inquiry queue filters according to the cross-module
indexing policy.

### 7.3 Travel brief

`travelBrief` is a validated, versioned JSON value for incomplete customer
requirements:

```ts
interface InquiryTravelBriefV1 {
  version: 1
  destinations?: Array<{ placeId?: string; label: string }>
  origin?: { placeId?: string; label: string }
  startDate?: string
  endDate?: string
  dateFlexibility?: "exact" | "few_days" | "few_weeks" | "open"
  durationNights?: number
  adults?: number
  children?: Array<{ age?: number }>
  rooms?: number
  budget?: {
    amountCents?: number
    currency: string
    basis?: "total" | "per_person"
    flexibility?: "firm" | "approximate" | "unknown"
  }
  interests?: string[]
  accessibilityOrDietaryNotes?: string
}
```

Every field is optional except the schema version. Intake must accept a request
that consists only of contact details and free text. The brief is not a Trip
Envelope and is not sufficient to quote or book by itself. When staff starts
composition, Trips owns the resulting draft and Inquiry links to it.

Sensitive free text follows the same access, retention, and export rules as CRM
notes. The UI warns staff not to place passport, payment-card, or special-
category personal data in the brief.

### 7.4 Resolution and conversion records

An `inquiry_conversions` table records every successful target attachment:

| Field | Purpose |
| --- | --- |
| `id` | Conversion attempt identity |
| `inquiryId` | Source Inquiry |
| `kind` | `proposal`, `booking_session`, or `booking` |
| `targetId` | Created or attached target id |
| `idempotencyKey` | Caller-supplied replay boundary |
| `mode` | `created` or `attached_existing` |
| `actorId` | Staff actor who approved conversion |
| `createdAt` | Audit time |

A unique constraint on `(inquiryId, kind, idempotencyKey)` makes retries safe.
An Inquiry may have more than one legitimate conversion over its lifetime—for
example, two alternative Proposals or a Proposal followed by the Booking it
eventually produced—but one command replay never creates duplicates.

The normal path stores both the Proposal conversion and, later, the Booking
provenance already provided through Booking Origin. Inquiry conversion does not
replace Proposal Version or Booking Origin evidence.

### 7.5 Activities, communications, notes, and attachments

Relationships extends its activity/link target vocabulary with `inquiry`.
Calls, emails, meetings, tasks, follow-ups, internal notes, and supported
communication logs appear in one chronological Inquiry timeline. They remain
their owning artifacts and are linked, not copied, during conversion.

Attachments use Storage/Media through a standard Inquiry target link. The v1 UI
supports upload, download, caption, and removal subject to audit and permission
rules. It does not implement a document approval workflow.

---

## 8. Lifecycle

Inquiry lifecycle is operational, deliberately smaller than a configurable
Proposal pipeline:

```text
new --> triaged --> in_progress <--> waiting_on_customer
 |         |             |                    |
 |         |             +------> qualified --+
 |         |                           |
 |         |                           v
 |         +----------------------> converted
 |                                     |
 +-------------------------------> closed

closed --reopen--> triaged
```

### 8.1 States

| Status | Meaning |
| --- | --- |
| `new` | Captured but not yet reviewed |
| `triaged` | Valid request; ownership and next action have been considered |
| `in_progress` | Agency is actively working the request |
| `waiting_on_customer` | Progress requires information or a decision from the customer |
| `qualified` | Staff approved advancement to Proposal or booking work |
| `converted` | At least one successful conversion is recorded and no inquiry action remains |
| `closed` | No conversion will be pursued now |

Close outcome is required for `closed`:

- `lost`;
- `not_serviceable`;
- `no_response`;
- `duplicate` with `duplicateOfInquiryId`;
- `spam`;
- `customer_withdrew`;
- `other` with a note.

Conversion is not inferred from the existence of a foreign id or a Proposal
whose `sourceRef` happens to match. Only the conversion command changes the
Inquiry to `converted`.

### 8.2 Transition rules

- Public intake may only create `new`.
- Triage requires either an owner or an explicit unassigned reason.
- Marking `in_progress` or `waiting_on_customer` requires `nextActionAt` unless
  the caller explicitly records that no follow-up is expected.
- Qualification requires a resolved Person or Organization and a staff actor.
- Conversion requires `qualified`, except a combined qualify-and-convert
  command may perform both atomically.
- Closing requires a close outcome.
- Reopening clears the close outcome and creates an audit Activity.
- Status changes, assignment changes, SLA breaches, and conversions emit domain
  events after the owning transaction commits.

---

## 9. Capture and identity resolution

### 9.1 Public endpoints

The canonical public endpoint is:

```text
POST /v1/public/relationships/inquiries
```

It is a `guardedIntake` route under the storefront-key capability line. It
requires the deployment's intake guard and accepts:

- source and idempotency key;
- contact snapshot;
- optional known Person/customer-session reference;
- kind, customer message, and partial travel brief;
- zero or more supported target references with display snapshots;
- locale, source URL, tags, bounded custom payload, and consent snapshot.

The response is deliberately receipt-shaped:

```ts
{
  data: {
    inquiryId: string
    status: "new"
    duplicate: boolean
    receivedAt: string
  }
}
```

It does not expose internal assignment, spam score, notes, or identity-match
details.

Existing Product pages and checkout inquiry forms call this endpoint with a
Product/option target. A generic “Plan a custom trip” form calls the same
endpoint with `kind: "custom_trip"` and no Product target.

### 9.2 Staff and integration capture

The admin API can create an Inquiry from a phone call, walk-in, imported request,
or existing Person/Organization. Authenticated adapters may capture email or
partner requests through the same service command with their own source and
sourceRef.

No channel writes Inquiry tables directly.

### 9.3 Idempotency and duplicates

Idempotency and identity are separate:

- `(source, sourceRef)` prevents replay of the same submission.
- Contact normalization and account resolution suggest matching People and
  Organizations.
- Similar open Inquiries produce a duplicate warning, not automatic merging.
- A staff merge/duplicate action closes the duplicate Inquiry with a durable
  `duplicateOfInquiryId`; it does not delete source evidence.

Public intake first persists the Inquiry and contact snapshot. Person creation
is not a prerequisite for accepting the request. This avoids filling CRM with
spam and duplicate people while still returning a durable receipt.

---

## 10. Working an Inquiry in the operator

Relationships contributes packaged routes and navigation through the admin
extension system.

### 10.1 Inquiry work queue

The primary route is `/inquiries`. It provides:

- saved views: New, Mine, Unassigned, Overdue, Waiting, Qualified, Converted,
  and Closed;
- filters for status, owner/team, priority, source, kind, Product/target,
  created range, next-action range, and SLA state;
- full-text search over subject, contact, customer message, and internal
  summary;
- sortable created, updated, last-activity, and next-action columns;
- bulk assignment, priority, close, and next-action operations;
- realtime invalidation on create/update/assignment/activity/conversion.

The default view is actionable open work, ordered by overdue first, then urgent
priority, then oldest unresponded. It must not be a newest-first archive that
hides aging requests.

### 10.2 Detail workspace

`/inquiries/:inquiryId` contains:

- customer/contact card with identity-match and attach/create Person actions;
- Product/departure or custom-request context;
- editable travel brief and internal summary;
- status, owner, priority, next action, SLA, tags, and custom fields;
- chronological customer communication and internal activity timeline;
- attachments;
- duplicate/close/reopen actions;
- conversion panel with Proposal, Booking Session, and Booking choices allowed
  by the current context and permissions;
- linked Proposal/Booking artifacts after conversion.

The notification CTA, realtime hints, and search results all use the semantic
`inquiry.detail` destination. Packages do not hard-code `/crm/signals/:id`.

### 10.3 Assignment and SLA

V1 supports manual owner assignment and an optional deployment default owner or
team. Automatic rules may be added later as a bounded package capability; they
are not a generic workflow engine.

The deployment may configure a first-response duration by source and priority.
`firstResponseDueAt` is calculated and frozen at intake so later settings
changes do not rewrite history. Recording the first outbound customer
communication stamps `firstRespondedAt`. Overdue state is derived, not stored.

`nextActionAt` is separate from first-response SLA: SLA measures service level;
next action tells the owner what to do now.

---

## 11. Conversion

Conversion is an explicit staff command. It validates the source Inquiry,
invokes the target domain through a typed runtime port, records the conversion,
and changes Inquiry state in one coordinated operation. It never writes another
module's tables directly.

### 11.1 Convert to Proposal

This is the default for custom, negotiated, multi-component, or alternative-
driven sales work.

The command:

1. locks the Inquiry and checks status, permission, and idempotency;
2. resolves or requires the primary Person/Organization;
3. asks Proposals to resolve the selected/default Pipeline and initial Stage;
4. creates an open Proposal with:
   - title and description from the Inquiry;
   - Person, Organization, owner, tags, and relevant custom fields;
   - `source: "inquiry"` and `sourceRef: inquiryId`;
   - expected value only when staff supplied one;
5. maps supported Product targets into Proposal Product lines using target
   snapshots, without inventing prices;
6. links a draft Trip when one exists; it does not freeze a Proposal Version;
7. records `inquiry_conversions(kind = "proposal")`;
8. marks the Inquiry converted, or leaves it qualified when the actor explicitly
   chooses to keep gathering requirements;
9. emits `inquiry.converted` after commit.

Activities and communications remain linked to the Inquiry and are visible from
the Proposal through the conversion relationship. They are not copied into a
second timeline.

Proposal creation does not send anything to the customer. Staff still composes,
snapshots, and sends a Proposal Version through Proposals.

### 11.2 Convert to Booking Session

Use this when the customer asked about a reusable Product and should complete
traveler details, receive a binding Quote, optionally obtain a Hold, and Commit
through the standard journey.

The command asks Catalog, which owns Booking Sessions in the current package
architecture, to create a Booking Session for the
selected target and seeds only data accepted by the target's published Booking
Requirements. Unknown or untrusted fields remain unanswered. The returned
session id is recorded as the conversion target.

The Inquiry becomes converted when the agency has no remaining action, or stays
in progress with a next action when staff must assist the customer. A later
Booking retains its normal Booking Origin; the Inquiry-to-session conversion
provides the earlier provenance.

### 11.3 Convert to Booking

Use this for a staff-assisted or offline reservation where the existing Booking
owner command supports direct creation and all required information is known.

Inquiry delegates to Catalog Commit's owner command. That command remains
responsible for requirements, availability, pricing/financial policy,
idempotency, origin, and audit. Inquiry cannot bypass a Quote, Hold, approval,
or provider reservation that the selected booking mode requires.

If the target cannot be booked directly, the command returns a typed refusal
with an allowed next step such as `booking_session_required` or
`proposal_required`; it does not fall back silently.

### 11.4 Attach an existing target

Staff may attach an already-created Proposal, Booking Session, or Booking when
the work began outside the Inquiry UI. The target owner validates existence and
compatibility before the Inquiry records `mode = attached_existing`.

### 11.5 Concurrency and failure

- Every conversion requires an idempotency key.
- The Inquiry is advisory-locked for prepare/finalize, following the accepted
  Proposal reservation pattern where an external target operation cannot occur
  inside one database transaction.
- If target creation succeeds but Inquiry finalization fails, replay discovers
  the target by source/idempotency provenance and finalizes rather than creating
  another target.
- Conversion responses distinguish `created`, `replayed`, `attached`,
  `conflict`, and typed refusal.
- A failed conversion leaves the Inquiry qualified and actionable; it never
  marks it converted optimistically.

---

## 12. APIs and contracts

Initial admin routes:

```text
GET    /v1/admin/relationships/inquiries
POST   /v1/admin/relationships/inquiries
GET    /v1/admin/relationships/inquiries/:id
PATCH  /v1/admin/relationships/inquiries/:id
POST   /v1/admin/relationships/inquiries/:id/transition
POST   /v1/admin/relationships/inquiries/:id/assign
POST   /v1/admin/relationships/inquiries/:id/close
POST   /v1/admin/relationships/inquiries/:id/reopen
POST   /v1/admin/relationships/inquiries/:id/targets
DELETE /v1/admin/relationships/inquiries/:id/targets/:linkId
POST   /v1/admin/relationships/inquiries/:id/convert
GET    /v1/admin/relationships/inquiries/:id/conversions
```

Commands use `parseJsonBody(...)`; list routes use `parseQuery(...)`. Public and
admin schemas live in `relationships-contracts`, and OpenAPI documents are
generated and drift-checked from the real mounted routes.

The conversion request is a discriminated union:

```ts
type ConvertInquiryInput =
  | {
      kind: "proposal"
      idempotencyKey: string
      pipelineId?: string
      stageId?: string
      keepInquiryOpen?: boolean
    }
  | {
      kind: "booking_session"
      idempotencyKey: string
      targetLinkId: string
      channelId?: string
      keepInquiryOpen?: boolean
    }
  | {
      kind: "booking"
      idempotencyKey: string
      bookingInput: unknown // validated by the selected Booking command
    }
  | {
      kind: "attach_existing"
      idempotencyKey: string
      targetKind: "proposal" | "booking_session" | "booking"
      targetId: string
    }
```

The production contract must replace `bookingInput: unknown` with the portable
Booking owner-command schema selected by the implementation. The placeholder
above expresses ownership; it is not permission to ship an unvalidated body.

List responses include lightweight target and contact projections needed by the
work queue. Detail responses may compose live target summaries through runtime ports,
but a missing optional target module must degrade to the stored snapshot rather
than make the Inquiry unreadable.

---

## 13. Events, notifications, and realtime

Relationships owns these versioned events:

- `inquiry.created`;
- `inquiry.updated` for material field changes;
- `inquiry.assigned`;
- `inquiry.status_changed`;
- `inquiry.first_response_overdue` from a package-owned scheduled scan;
- `inquiry.converted`;
- `inquiry.closed`;
- `inquiry.reopened`.

Events carry ids and small routing facts, not the full customer message or
contact PII. Consumers resolve current authorized context from Relationships.

Notifications supplies configurable staff alerts for new, assigned, overdue,
and converted Inquiries. New-inquiry alerts default to the configured sales
role/team rather than every member. Assignee routing is used once assigned.
Notification links resolve `inquiry.detail` semantically.

Realtime maps Inquiry events to the Inquiry list/detail query keys. It does not
invent a second event vocabulary.

---

## 14. Permissions and audit

The initial route mapping uses existing CRM permissions:

- `crm:read` — view the Inquiry queue and details;
- `crm:write` — create, edit, assign, transition, and close;
- conversion additionally requires the target action permission:
  - Proposal creation capability for Proposal conversion;
  - Booking Session/Booking creation capability for booking conversion.

If product requirements later justify finer grants, add declarative
`inquiries:read`, `inquiries:write`, and `inquiries:convert` permissions in one
catalog migration. Do not implement route-local permission strings first.

Every assignment, transition, merge, identity attachment, target change,
conversion, close, and reopen records actor and time in the Action Ledger or an
Inquiry Activity, according to the existing action-ledger classification. Raw
contact snapshots and customer messages must follow CRM PII redaction, export,
and deletion policy.

Deleting a Person does not delete the Inquiry's historical contact snapshot.
Privacy erasure redacts the snapshot through an explicit erasure operation;
database cascade is not a substitute for policy.

---

## 15. Agent tools

The first-party tool library exposes read and bounded write operations:

- `list_inquiries`;
- `get_inquiry`;
- `create_inquiry` for staff capture;
- `update_inquiry`;
- `assign_inquiry`;
- `record_inquiry_activity`;
- `qualify_inquiry`;
- `convert_inquiry_to_proposal`;
- `start_booking_from_inquiry`;
- `close_inquiry`;
- `reopen_inquiry`.

Create, conversion, close, reopen, and assignment changes use the standard
created-target/action policy and explicit confirmation/risk posture. Tools call
the same services and commands as HTTP routes; they do not duplicate conversion
logic.

Tool output schemas are portable and include the Inquiry id, current status,
next action, owner, and conversion target where relevant. PII visibility follows
the caller's existing CRM permissions.

---

## 16. Reporting

The reporting projection exposes, at minimum:

- inquiry volume by source, kind, Product target, locale, and period;
- unassigned and overdue counts;
- first-response time and SLA attainment;
- time in each operational state;
- qualification rate;
- Proposal, Booking Session, and Booking conversion rate;
- close outcomes;
- conversion value where the target domain can provide it;
- owner/team workload and aging.

Metrics derive from Inquiry events/timestamps and conversion records. They must
not infer conversion by fuzzy matching contact email or Product id.

---

## 17. Migration and retirement

The migration is data-preserving and staged. There is one write authority at
each stage; no indefinite dual-write compatibility layer is introduced.

### Phase 1 — foundation

- Add Inquiry schemas, services, routes, events, target links, conversions, and
  tests in Relationships.
- Add read/detail hooks and the operator Inquiry queue/workspace.
- Add optional Proposals and Bookings conversion ports.
- Keep existing capture routes unchanged.

### Phase 2 — backfill and cutover

- Backfill Customer Signals of kind `inquiry` and `request_offer` into
  Inquiries, preserving signal id as source provenance and mapping:
  - `new` -> `new`;
  - `contacted` -> `in_progress`;
  - `qualified` -> `qualified`;
  - `converted` with Booking -> converted plus attached Booking conversion;
  - `lost` / `expired` -> closed with the closest explicit migration outcome.
- Link the existing Person and Product/option targets; preserve metadata,
  consent, notes, assignment, follow-up, source, and timestamps.
- Backfill `booking_inquiries` as Product Inquiries, preserving contact snapshot,
  message, storefront/channel provenance, idempotency key, and Product/departure
  target.
- Record source-table/id pairs so the migration is replay-safe and auditable.
- Switch storefront Product inquiry and generic lead forms to the canonical
  public Inquiry route.
- Switch notifications and realtime subscribers to Inquiry events.

### Phase 3 — retire duplicate inquiry surfaces

- Stop allowing `inquiry` and `request_offer` as new Customer Signal kinds.
  Existing non-inquiry signal kinds remain.
- Remove Booking inquiry public/admin routes and service writes after all
  first-party callers move.
- Remove the unconsumed Proposals `checkout-inquiry` port in favor of the typed
  Inquiry conversion port.
- Remove `/leads` after a time-bounded SDK migration, or make it a documented
  HTTP compatibility route that calls the canonical Inquiry command without
  dual writing. No package API continues to call it.
- Delete retired tables/enum values only after tracked deployments complete the
  backfill and verification reports zero unmigrated rows.

Migration verification drives the real route/service and source-free deployment
artifact paths. Tests must not hand-construct a migrated Inquiry with fields the
collector is supposed to supply.

---

## 18. Package and ownership changes

| Package | Change |
| --- | --- |
| `relationships-contracts` | Inquiry schemas, event payloads, conversion port contracts |
| `relationships` | Aggregate, migrations, routes, services, target links, events, tools, conversion coordinator |
| `relationships-react` | Inquiry queue, detail workspace, hooks, admin extension, semantic destinations |
| `storefront` / `storefront-sdk` | Canonical guarded Inquiry intake and Product/custom form clients |
| `catalog` | Booking Session conversion provider and future direct Booking through Catalog Commit |
| `bookings` | Retire `booking_inquiries`; remain the owner of persisted Booking records after Commit |
| `proposals` | Proposal conversion provider; source provenance; remove old checkout-inquiry seam |
| `notifications` | Inquiry alerts and semantic links |
| `realtime` / `realtime-react` | Inquiry invalidation hints |
| `reporting` | Inquiry operational and conversion datasets |
| `custom-fields` | `inquiry` entity target |
| `storage` / media integration | Inquiry attachment target |
| `admin` / operator composition | Inquiry navigation, search, and dashboard work queues |

Cross-package schema associations use standard links or typed runtime ports.
No new direct cross-package foreign keys are introduced.

---

## 19. Acceptance criteria

The capability is complete only when all of the following are true:

1. A customer can submit either a known-Product inquiry or an open-ended custom
   request through a guarded public route and receive an idempotent receipt.
2. Both requests appear in the same operator Inquiry queue with correct source and
   target context.
3. A submission does not have to create a duplicate CRM Person before triage.
4. Staff can assign an owner, set priority and next action, record contact,
   update requirements, wait on the customer, close with an outcome, and reopen.
5. New, unassigned, overdue, and waiting inquiries are immediately visible and
   filterable.
6. Notifications link to a real packaged Inquiry detail route.
7. Staff can convert a qualified custom Inquiry into a Proposal without
   re-entering customer, context, or Product information.
8. Staff can start an eligible Product booking path or attach/create a Booking
   without Inquiry bypassing Booking-owned validation.
9. Replaying a conversion cannot create a duplicate Proposal, Booking Session,
   or Booking.
10. Inquiry, Proposal, and Booking retain navigable provenance in both
    directions.
11. Activities and communications remain one auditable timeline rather than
    being copied during conversion.
12. Existing Customer Signal and Booking Inquiry data is backfilled or reported
    as unmigrated; none is silently dropped.
13. Public/admin OpenAPI, SDK, tools, UI, notifications, realtime, permissions,
    and reporting agree on the same lifecycle vocabulary.
14. Architecture verification prevents retired inquiry write paths from being
    reintroduced.

---

## 20. Required verification

Implementation must include:

- service tests for every transition and invalid transition;
- integration tests for public intake, identity ambiguity, deduplication, and
  guarded-intake rejection;
- integration tests for each conversion kind, replay, conflict, partial
  failure, and attach-existing behavior;
- migration fixtures covering every legacy Customer Signal and Booking Inquiry
  status;
- OpenAPI drift and storefront-key-kind verification;
- permission tests for CRM read/write plus target creation permission;
- packaged-admin route/navigation tests and browser evidence for Inquiry queue and
  detail flows;
- notification resolution tests proving the CTA reaches a registered route;
- realtime invalidation tests;
- agent tool input/output and created-target policy tests;
- reporting projection tests from authoritative conversion records;
- tracked-tree and retired-surface rules for removed paths;
- package-scoped typecheck/test during iteration and `pnpm verify:fast` before
  merging each vertical slice.

The conversion golden tests must drive the real Inquiry command through the
resolved Proposals/Bookings port. Supplying a pre-created target id to the unit
under test does not prove the production handoff.

---

## 21. Delivery slices

Implementation should land as independently usable vertical slices:

1. **Canonical aggregate and admin capture** — data model, lifecycle, admin
   API, queue/detail UI, assignment, activities, permissions, and audit.
2. **Public intake** — guarded Product and custom inquiry forms, identity
   resolution, idempotency, notifications, and realtime.
3. **Proposal conversion** — typed port, atomic/replay-safe handoff, linked
   timelines, and bidirectional navigation.
4. **Booking conversion** — Booking Session and eligible direct-Booking paths
   with typed refusals and provenance.
5. **Migration** — backfill both legacy stores, switch callers, verify, then
   retire duplicate write paths.
6. **Operational completeness** — SLA scan, bulk actions, reporting, agent
   tools, attachments, and dashboard/search integration.

Each slice includes its API, package UI, event, permissions, tests, and
documentation. Backend-only capture without an operator work surface is not a
complete slice.

---

## 22. Rejected alternatives

### Keep Customer Signal and add more nullable columns

Rejected because every wishlist/notify/referral would inherit inquiry-only
operational semantics, while the schema would still struggle with multiple
targets and conversion history.

### Create a Proposal for every incoming request

Rejected because unqualified demand, spam, duplicates, exact-Product questions,
and unsupported requests do not belong in the sales pipeline.

### Keep Booking Inquiry for Product requests and add a custom Inquiry model

Rejected because the agency workflow—triage, ownership, response, next action,
qualification, close outcome—is the same regardless of whether a Product was
known at intake.

### Convert by copying data in the operator frontend

Rejected because it cannot provide atomicity, idempotency, durable provenance,
or enforcement across API, UI, and agent callers.

### Automatically convert every qualified Inquiry

Rejected because qualification is a sales judgment while the appropriate next
artifact depends on the request. Staff must choose Proposal, Booking Session,
direct Booking, or continued inquiry work.

### Make Inquiry states a configurable Pipeline

Rejected for v1. Inquiry states express cross-deployment operational invariants
used by SLA, notifications, and conversion gates. Agencies get configurable
views, priorities, tags, custom fields, and Proposal Pipelines without making
the pre-qualification state machine unknowable to the product.

---

## 23. Open questions

1. Should `teamId` ship in the first slice, or wait for a canonical staff-team
   model while v1 uses only `ownerId`?
2. Which existing Person matching service is authoritative for public Inquiry
   suggestions, and what confidence threshold permits automatic attachment?
3. Should Product conversion default to staff-assisted Booking Session or expose
   both Booking Session and direct Booking whenever the target advertises both?
4. Which communication adapters are in the first supported set: manual log only,
   outbound email, or inbound/outbound email threading?
5. What are the default retention and erasure periods for unqualified Inquiry
   contact snapshots by deployment jurisdiction?
6. Should one Inquiry support several Proposal conversions as alternatives, or
   should additional Proposals require an explicit “create another” permission
   and reason?

None of these questions changes the core decision: one first-class Inquiry is
the agency's operational intake record, and conversion creates or attaches the
next owner artifact through an idempotent domain command.
