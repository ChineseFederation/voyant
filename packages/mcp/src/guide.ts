/**
 * The guide layer (voyant#3931): server `instructions` plus a small set of guide
 * Tools that give a connecting agent the product judgment the raw schemas cannot.
 *
 * A client connecting to `/v1/admin/mcp` receives typed tool schemas and no
 * operating context: what this deployment is, which call sequence does a real
 * job, or the traps (a room quantity is a count of rooms; an accepted Proposal
 * Version is not a confirmed booking). The decided design (voyant#3921 resolved
 * decision 2) puts that context in the two places every MCP client supports
 * today — the `instructions` string returned on `initialize` and read-only guide
 * Tools, NOT MCP prompts or resources, whose client support is uneven.
 *
 * Every domain claim is sourced, never invented: `UBIQUITOUS_LANGUAGE.md`
 * (vocabulary + commitment chain), `docs/architecture/booking-journey-architecture.md`
 * (quote/hold/commit split), `catalog-supply-models.md` (dynamic vs scheduled),
 * `accepted-proposal-version-reservation-golden-flow.md` (accept → reserve → book),
 * and `packages/inventory` product status/visibility + `publish_product`
 * (authoring vs publication).
 *
 * The guide is scope-aware: a read-only caller is told plainly that the write
 * journeys are unreachable, so the text never describes an unavailable workflow.
 */

import { z } from "@hono/zod-openapi"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

export interface GuideScope {
  /** Whether the caller can reach any state-mutating Tool with its granted key. */
  writeEnabled: boolean
  /**
   * Whether the caller can reach ANY Tool at all. A key with no granted
   * permissions authorizes nothing — not even reads — and must be told so.
   * Without this the read-only branch below claims the key "can list and read"
   * when every `search_tools` query will come back empty, which is worse than
   * silence: the agent trusts the orientation and blames its own queries.
   */
  anyToolReachable: boolean
}

/** Names of the guide Tools registered on every MCP server, for instrumentation. */
export const GUIDE_TOOL_NAMES = ["voyant_guide", "voyant_glossary"] as const

const GUIDE_TOPICS = [
  "overview",
  "discovery",
  "booking-journey",
  "proposals",
  "products",
  "vocabulary",
  "confirmation",
] as const

type GuideTopic = (typeof GUIDE_TOPICS)[number]

/**
 * The `instructions` advertised on `initialize`. Short by design — it orients the
 * agent and points at the guide Tools for depth, rather than reproducing them.
 */
export function buildServerInstructions(scope: GuideScope): string {
  const access = !scope.anyToolReachable
    ? "This key currently authorizes NO Tools — not reads either. `search_tools` will return nothing and the guide below describes capabilities you cannot reach. This is a permissions problem, not a query problem: ask the operator to grant scopes on the API key before retrying."
    : scope.writeEnabled
      ? "This key can read catalog and booking data and invoke state-changing Tools (subject to per-Tool scopes and the confirmation protocol below)."
      : "This key is READ-ONLY: it can list and read, but the create/update/publish/book Tools below are not reachable with it. Ignore write instructions."
  return [
    // The CRM was missing from this list, and that omission was load-bearing:
    // asked to find a client, the agent read this sentence, saw no mention of
    // people, and went looking in `bookings_query` instead — reproducibly, 3/3
    // runs. An overview an agent uses to decide where things live has to name
    // every domain it can reach, or the ones it omits effectively do not exist.
    "This MCP server is the admin surface of a Voyant deployment — an online travel agency, tour-operator, and destination-management platform. Through it you can discover and operate the operator's CRM (People — also called clients or customers — and Organizations), the catalog (Products, Options, and dated departures/Slots), the sales pipeline (Proposals and Proposal Versions), Bookings and their Travelers, and downstream Invoices and Payments.",
    "",
    access,
    "",
    "HOW TO DISCOVER CAPABILITIES",
    "The surface is discovered on demand: `search_tools` finds a tool by keyword,",
    "`describe_tool` returns its full input schema, and `GET /v1/admin/mcp/manifest` is",
    "the authorization-filtered capability index; the eager `tools/list` carries only",
    "these meta-tools and the guide. READS are grouped by product area into one",
    "`<domain>_query` tool (a discriminated union on `resource`): read products with",
    '`inventory_query` (`resource: "products"`/`"product"`), dated departures with',
    '`operations_query` (`resource: "departures"`), and CRM people with',
    '`relationships_query` (`resource: "people"` to search by name, `"person"` to read',
    "one by id) — search the record noun (`products`, `bookings`, `departures`,",
    "`people`) to find its query tool. Travelers are read through their",
    "booking record, not a standalone tool. WRITES stay one Tool each (verb-first, e.g.",
    "`create_booking`, `publish_product`) so their per-action policy stays explicit.",
    "",
    "START WITH THE GUIDE TOOLS",
    `Call \`voyant_guide\` (topics: ${GUIDE_TOPICS.join(", ")}) for the booking`,
    "journey, proposal lifecycle, product publication, and the confirmation/approval",
    "protocol. Call `voyant_glossary` for the canonical meaning of a domain term",
    "before you rely on it — several are easy to get subtly wrong (a room quantity is",
    "a number of ROOMS, not travelers; accepting a Proposal Version is not a confirmed",
    "booking).",
  ].join("\n")
}

/**
 * Register the read-only guide Tools on a per-request server. Returns the names
 * registered so the caller can mark them known for dispatch-boundary telemetry.
 */
export function registerGuideTools(server: McpServer, scope: GuideScope): readonly string[] {
  server.registerTool(
    "voyant_guide",
    {
      title: "Voyant operating guide",
      description:
        "Product judgment for operating this travel platform over MCP: the booking " +
        "journey and supply models, proposal versioning (acceptance is not confirmation), " +
        "product authoring vs publication, room/traveler vocabulary, and the " +
        "confirmation/approval protocol. Pass a `topic`, or omit it for the index.",
      inputSchema: z.object({
        topic: z
          .enum(GUIDE_TOPICS)
          .optional()
          .describe("Guide section to read; omit for the overview and topic index."),
      }),
      annotations: {
        title: "Voyant operating guide",
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    ({ topic }) => textResult(guideSection(topic ?? "overview", scope)),
  )

  server.registerTool(
    "voyant_glossary",
    {
      title: "Voyant domain glossary",
      description:
        "Canonical definitions of Voyant domain terms (Product, Option Unit, Room " +
        "Option, Traveler, Proposal, Proposal Version, Booking, Hold, Allocation, Slot, and " +
        "more), sourced from UBIQUITOUS_LANGUAGE.md. Pass a `term` to filter, or omit " +
        "for the full glossary.",
      inputSchema: z.object({
        term: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("Case-insensitive substring to filter glossary entries by."),
      }),
      annotations: {
        title: "Voyant domain glossary",
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    ({ term }) => textResult(glossary(term)),
  )

  return GUIDE_TOOL_NAMES
}

function textResult(text: string): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text }] }
}

function guideSection(topic: GuideTopic, scope: GuideScope): string {
  switch (topic) {
    case "overview":
      return overviewSection(scope)
    case "discovery":
      return discoverySection()
    case "booking-journey":
      return bookingJourneySection(scope)
    case "proposals":
      return proposalsSection(scope)
    case "products":
      return productsSection(scope)
    case "vocabulary":
      return vocabularySection()
    case "confirmation":
      return confirmationSection(scope)
  }
}

const readOnlyBanner =
  "NOTE: your key is READ-ONLY. The write steps below describe how the platform " +
  "works; you can read the resulting records but cannot perform the mutations with " +
  "this key.\n\n"

function writeGate(scope: GuideScope): string {
  return scope.writeEnabled ? "" : readOnlyBanner
}

function overviewSection(scope: GuideScope): string {
  return (
    "# Voyant — operating guide\n\n" +
    (scope.writeEnabled
      ? "This key can read and, where scoped, mutate.\n\n"
      : "This key is READ-ONLY (list/read only).\n\n") +
    "This deployment is a Voyant operator platform: an online travel agency, " +
    "tour-operator, and DMC surface. The nouns you will work with:\n" +
    "- Product — a sellable travel offering (tour, transfer, stay, cruise). Has a " +
    "booking mode and a publication status.\n" +
    "- Option / Option Unit — a variant of a Product and its pricing/age band " +
    "(Adult, Child 3–11). Option Unit is NOT a room and NOT a traveler.\n" +
    "- Availability Slot — a concrete dated departure with remaining Capacity.\n" +
    "- Proposal / Proposal Version — a sales pursuit and its immutable proposal revisions.\n" +
    "- Booking — the durable first-party commitment: Travelers, Booking Items, " +
    "Allocations, Fulfillments, state.\n" +
    "- Invoice / Payment — the money records downstream of a Booking.\n\n" +
    "Read these topics with `voyant_guide { topic }`:\n" +
    "- discovery — how to find the Tool you need.\n" +
    "- booking-journey — Product → Booking Session → Quote → Hold/Commit/Booking; Proposal → accepted Version → Booking Session → Quote → Hold/Commit/Booking.\n" +
    "- proposals — Proposal Version lifecycle; why acceptance is not confirmation.\n" +
    "- products — authoring a Product vs publishing it (a separate operation).\n" +
    "- vocabulary — room vs unit vs traveler; the trap that mis-books rooms.\n" +
    "- confirmation — the `_voyant` confirmation and approval protocol for writes.\n\n" +
    "Use `voyant_glossary` for any single term's canonical definition."
  )
}

function discoverySection(): string {
  return (
    "# Discovering capabilities\n\n" +
    "The surface is discovered on demand. `tools/list` carries only the meta-tools " +
    "(`search_tools`, `describe_tool`, `call_tool`) and this guide; every domain " +
    "capability is found through them or the `GET /v1/admin/mcp/manifest` capability " +
    "index. To find one:\n\n" +
    "1. `search_tools { query }` returns matching tool names and one-line descriptions; " +
    "`describe_tool { name }` returns a tool's full input schema. The manifest carries " +
    "each capability's `requiredScopes` and risk, so you can see what a key can do " +
    "before calling.\n" +
    "2. READS are collapsed by product area into one `<domain>_query` tool whose input " +
    "is a discriminated union on `resource`. Set `resource` to the record you want and " +
    "pass that resource's own arguments. Resources use the domain nouns — `product`, " +
    "`option_unit`, `departure`, `proposal`, `proposal_version`, `booking`, `invoice` (the " +
    "domain term Slot surfaces as the `departures` resource).\n" +
    "3. WRITES stay one Tool each, named `verb_noun` (`create`/`update`/`publish` …), " +
    "so their action policy stays explicit.\n\n" +
    'Example lookups: catalog → `inventory_query` (`resource: "products"`/`"product"`); ' +
    'dated departures → `operations_query` (`resource: "departures"`); sales pursuit → ' +
    "`proposals_query` (`proposal`/`proposal_version`); a commitment → `bookings_query` " +
    '(`resource: "booking"` — its Travelers and Items are part of the booking record, ' +
    "not separate traveler reads).\n\n" +
    "Only tools your key is authorized for are discoverable or callable; an " +
    "unauthorized resource is pruned from its query tool and a call to it fails as if " +
    "it did not exist. Each read validates its own input and returns typed pure data, " +
    "so read the query tool's `inputSchema` before calling."
  )
}

function bookingJourneySection(scope: GuideScope): string {
  return (
    "# The booking journey\n\n" +
    writeGate(scope) +
    "There are two commitment paths: Product → Booking Session → pricing Quote → " +
    "optional Hold → Commit/Booking, and Proposal → accepted Proposal Version → " +
    "Booking Session/reserve workflow → pricing Quote → optional Hold → " +
    "Commit/Booking. Each step hardens the commitment.\n\n" +
    "## Two supply models decide the booking path\n\n" +
    "A Product's supply model is derived from its booking mode and drives which " +
    "journey applies (docs/architecture/catalog-supply-models.md):\n\n" +
    "- DYNAMIC (booking mode `open`/`stay`; e.g. dynamically-packaged flight+hotel, " +
    "bedbank stays). The unit is composed live for the customer's dates — any date, " +
    "duration, occupancy; price comes from a live upstream search. Search-first: you " +
    "search offers, then lock and confirm a specific live offer.\n" +
    "- SCHEDULED (booking mode `date`/`date_time`/`transfer`/`itinerary`/`other`; e.g. " +
    "escorted groups, cruises, owned series). The unit is a seat in a fixed dated " +
    "departure drawn from a finite allotment. Departures-first: you browse the dated " +
    "Availability Slots (date · seats left · price) and hold/allocate seats.\n\n" +
    "## Canonical customer booking flow\n\n" +
    "Whatever the supply model, the direct booking path has the same shape " +
    "(docs/architecture/booking-journey-architecture.md):\n\n" +
    "1. Pricing Quote — price the current selection (pax counts and bands, dates, Extras, " +
    "accommodation, billing country for tax). A Quote carries an `expiresAt` (~10 " +
    "min default) and is a live-pricing snapshot, not a commitment.\n" +
    "2. Hold (where supported) — place a time-limited claim on inventory while details " +
    "are gathered. A Hold expires; it is not a Booking.\n" +
    "3. Commit — creating the Booking is a SEPARATE, admitted operation, not a side effect of " +
    "quoting or holding. The intent-level entry point is `book_product` (product, option, billing " +
    "party — a `personId` or `organizationId` — travelers, rooms — in one call): it resolves the " +
    "booking reference and idempotency key server-side (you carry neither), validates before writing, and takes `_voyant.confirmed: true`.\n\n" +
    "Because commit is its own confirmed step, quoting or holding leaves no durable " +
    "reservation. Do not treat a successful pricing Quote as a booked seat.\n\n" +
    "## Bespoke Proposal flow\n\n" +
    "Staff-managed bespoke sales use a separate sequence: Proposal → accepted " +
    "Proposal Version → Booking Session / reserve workflow → pricing Quote for " +
    "live catalog-backed lines → optional Hold → Commit/Booking. A Proposal Version " +
    "freezes the bespoke Trip Envelope revision; a pricing Quote answers current price/terms for a " +
    "specific selection." +
    (scope.writeEnabled
      ? ""
      : "\n\nWith this read-only key you can inspect Proposals, Slots, and existing " +
        "Bookings, but you cannot quote, hold, accept, or commit.")
  )
}

function proposalsSection(scope: GuideScope): string {
  return (
    "# Proposals and Proposal Versions — acceptance is NOT confirmation\n\n" +
    writeGate(scope) +
    "A Proposal is a tracked sales pursuit with a Person/Organization; it owns one or " +
    "more Proposal Versions. A Proposal Version is an IMMUTABLE proposal revision that " +
    "freezes a Trip Envelope snapshot, pricing, and validity. Editing a sent Version " +
    "creates a new Version — you never mutate one in place.\n\n" +
    "The load-bearing rule (UBIQUITOUS_LANGUAGE.md; " +
    "accepted-proposal-version-reservation-golden-flow.md):\n\n" +
    "ACCEPTING a Proposal Version marks that Version accepted, closes the Proposal as won, " +
    "and SEEDS the reserve workflow. It does NOT mean any supplier component is " +
    "confirmed, and it does not by itself create a Booking. Acceptance is a customer " +
    "decision; confirmation is a downstream supplier/inventory outcome.\n\n" +
    "After acceptance the reserve workflow prepares a reservation plan from the frozen " +
    "Trip snapshot, re-evaluates priced lines, and only then submits the Booking; live " +
    "lines recheck sellability and cost, and manual lines move into supplier " +
    "confirmation. So the sequence is: accept (won) → reserve → Booking created → " +
    "components confirmed. Treat 'accepted' and 'confirmed' as different states and " +
    "never report an accepted Version to a customer as a confirmed trip." +
    (scope.writeEnabled
      ? ""
      : "\n\nRead-only keys can read Proposals and Versions but cannot accept them.")
  )
}

function productsSection(scope: GuideScope): string {
  return (
    "# Product authoring vs publication\n\n" +
    writeGate(scope) +
    "Authoring a Product and publishing it are DIFFERENT operations. A Product is " +
    "created in status `draft` with visibility `private` (packages/inventory product " +
    "schema). Creating and updating a Product — its Options, Option Units, days, " +
    "media, pricing — does not make it sellable to customers.\n\n" +
    "Publication is a separate, explicit, confirmed operation: the `publish_product` " +
    "Tool promotes the Product to status `active` and visibility `public`, and " +
    "Inventory enforces readiness first (for scheduled products, departure readiness) " +
    "before committing. It is a high-risk write. `unpublish_product` removes it from " +
    "the public catalog without deleting the authored history; `archive_product` " +
    "retires it.\n\n" +
    "So a well-authored draft Product is still invisible and unbookable until it is " +
    "explicitly published. Do not assume creating a Product lists it; check its " +
    "`status`/`visibility`, and publish as a deliberate step.\n\n" +
    // voyant#3921: this recipe exists because the surface offers four plausible
    // ways to price a unit — create_option_unit, apply_product_unit_configuration,
    // compose_product, update_product_option — and nothing said which one. Asked
    // to make a product sellable, the agent tried three of them in turn and gave
    // up: 21-27 calls, 200k+ tokens, no unit written. The one run that went
    // straight to create_option_unit finished in five calls. The tools were all
    // there and all correct; the missing thing was the order.
    "## Making a new Product sellable\n\n" +
    "In order, and these are the exact Tools:\n\n" +
    "1. `create_product` — creates the Product AND a default Option named " +
    "'Standard'. You do not need to create an Option; reuse that one unless you " +
    "genuinely want a second.\n" +
    "2. `create_option_unit` — add a bookable unit to that Option. This Tool does not " +
    "set a price; an Option with no unit reserves nothing, and a booking against it " +
    "is refused. Use this Tool, not `compose_product` (whole-graph authoring).\n" +
    "3. `update_product` — set `sellAmountCents` and `sellCurrency` for a simple flat " +
    "package sell price. Do not search for a price field on `create_option_unit`; it " +
    "does not have one.\n" +
    "4. `create_departure` — for date-based products, add the dated departure(s) " +
    "customers will book.\n" +
    "5. `publish_product` — only after the future departure exists, promote it to the " +
    "public catalog.\n\n" +
    'Check with `inventory_query` (`resource: "product_options"`, then ' +
    '`"option_units"`) that the unit you created sits on the Option being booked. ' +
    "A unit on a different Option reads exactly like no unit at all." +
    (scope.writeEnabled
      ? ""
      : "\n\nWith this read-only key you can inspect a Product's status and visibility " +
        "but cannot author or publish.")
  )
}

function vocabularySection(): string {
  return (
    "# Room / unit / traveler vocabulary — read this before booking rooms\n\n" +
    "These terms are routinely conflated, and conflating them mis-books trips:\n\n" +
    // voyant#3921: the "not a CRM record" sentence is the load-bearing one.
    // Measured against the real graph, booking failed on 2 of 3 attempts because
    // the agent read "a person who travels", went looking for the companion in the
    // CRM, did not find them, and refused to book — "Andrei needs to be added to
    // the system" — when their name and age band were all the booking required.
    "- TRAVELER — someone who actually travels on a Booking; carries a category " +
    "(adult/child/infant/senior) and PII. Travelers are supplied INLINE on the " +
    "booking as names and details; they do NOT have to exist as CRM People first, " +
    "and you should not create a Person for a companion just to book them. Only " +
    "the BILLING PARTY is an existing record (a personId or organizationId). Pax " +
    "bands count Travelers. (Avoid 'guest'/'pax'/'passenger'.)\n" +
    "- OPTION UNIT — a pricing/age dimension within a Product Option (e.g. 'Adult', " +
    "'Child 3–11'). It is a price band, not a room and not a person.\n" +
    "- ROOM OPTION — a bookable accommodation option (occupancy, board/rate choices).\n" +
    "- ROOM QUANTITY — the NUMBER OF ROOMS of a given room unit, NOT the number of " +
    "travelers. In the booking draft, accommodation rooms are " +
    "`{ optionUnitId, quantity }`, where `quantity` is how many physical rooms of " +
    "that type to book. Travelers are counted separately by pax band and then " +
    "ASSIGNED to rooms. Booking `quantity: 3` means three rooms — that is enough for " +
    "up to six people in doubles, not three people. Setting room quantity to the " +
    "traveler count is the classic wrong booking.\n" +
    "- ALLOCATION — the inventory-line entity a Booking holds against a Slot " +
    "(`held` → `confirmed` → `fulfilled`).\n" +
    "- HOLD — a temporary, time-limited claim on inventory before confirmation; it " +
    "expires. Distinct from Allocation and from Booking. Avoid the word " +
    "'reservation' — use Hold or Booking.\n\n" +
    "When in doubt about any term, call `voyant_glossary { term }`."
  )
}

function confirmationSection(scope: GuideScope): string {
  return (
    "# Confirmation and approval protocol\n\n" +
    (scope.writeEnabled
      ? ""
      : "NOTE: your key is READ-ONLY and cannot invoke the guarded write Tools this " +
        "section describes. It is here so you understand the protocol.\n\n") +
    "State-changing Tools carry a declared action policy. Read each Tool's advertised " +
    "policy — in `tools/list` a guarded Tool's input schema gains a `_voyant` control " +
    'object, and its `_meta["voyant.travel/tool"].actionPolicy.invocation` lists ' +
    "exactly which control fields are `requiredFields` vs `optionalFields`. Supply " +
    "them under the reserved `_voyant` key alongside the domain arguments:\n\n" +
    "- confirmed — a boolean you must set to `true` to authorize a destructive or " +
    "confirmation-required Tool. Without it the call is refused (CONFIRMATION_REQUIRED " +
    "/ ACTION_POLICY_REQUIRED). This is the guard against accidental irreversible " +
    "writes.\n" +
    "- requestId — a UUID identifying the request, required by generic guarded " +
    "actions.\n" +
    "- approvalId — an approval identifier some ledgered actions require before they " +
    "will dispatch. Call the domain Tool first with its other required controls. " +
    "Handler-owned Tools create a server-issued approval bound to that exact command; " +
    "approve the returned id and retry exactly as instructed. Do NOT call " +
    "request_action_approval first unless the domain Tool explicitly tells you to — " +
    "an independently requested approval will not authorize a handler-owned command.\n" +
    "- reasonCode — an optional human-meaningful reason recorded on the ledger.\n" +
    "- idempotencyKey — for handler-owned/created-target actions, the key that makes " +
    "a retry safe (the same key returns the same result rather than acting twice).\n\n" +
    "Do NOT invent server-owned fields such as `targetId` when the Tool resolves its " +
    "own target — the server rejects caller-supplied target identity as tampering. " +
    "The rule of thumb: send exactly the `_voyant` fields the Tool's advertised " +
    "policy asks for, and a domain payload that validates against its `inputSchema`."
  )
}

function glossary(term?: string): string {
  const entries: Array<[string, string]> = [
    [
      "Product",
      "A sellable travel offering with a booking mode, capacity mode, and visibility. Canonical local truth. Avoid tour/trip/experience/package.",
    ],
    [
      "Catalog Item",
      "A normalized sellable discovery/booking record that may resolve to a local Product or to Sourced Inventory. Not the same as Product.",
    ],
    [
      "Product Option",
      "A configurable variant of a Product (e.g. 'English Guided'); composed of Option Units.",
    ],
    [
      "Option Unit",
      "A pricing/age dimension within an Option (e.g. 'Adult', 'Child 3–11', 'Group 1–4'). A price band — not a room, not a traveler.",
    ],
    [
      "Room Option",
      "A bookable accommodation option, usually with occupancy and board/rate choices. Room quantity is a count of rooms, never of travelers.",
    ],
    [
      "Board Basis",
      "The included-meals tier for accommodation (breakfast, half-board, full-board, all-inclusive).",
    ],
    [
      "Traveler",
      "A person who actually travels on a Booking; carries category (adult/child/infant/senior) and PII. Avoid guest/pax/passenger.",
    ],
    [
      "Participant",
      "A role-bearer on a Proposal/Booking/Program (traveler, booker, decision-maker, finance) — broader than Traveler.",
    ],
    [
      "Quote",
      "An immutable, expiring, server-produced price and terms result for an exact Booking Session revision or equivalent provider pricing request. It may be followed by an optional Hold and then Commit/Booking. It is not a Proposal or Proposal Version.",
    ],
    [
      "Proposal",
      "A tracked sales pursuit with a Person/Organization; moves through Stages and owns one or more Proposal Versions; may close won/lost.",
    ],
    [
      "Proposal Version",
      "An immutable proposal revision/alternative that freezes a Trip Envelope snapshot, pricing, and validity. Editing a sent Version creates a new Version.",
    ],
    [
      "Booking",
      "The durable first-party commitment and operational record: Travelers, Booking Items, Allocations, Fulfillments, origin/provenance, state. Avoid reservation/Order.",
    ],
    [
      "Booking Item",
      "A line item on a Booking (unit, service, extra, fee, tax, discount, accommodation, transport).",
    ],
    [
      "Booking Origin",
      "Bookings-owned provenance of how a Booking was created (accepted Proposal Version, Trip snapshot, catalog response, provider ref, legacy id).",
    ],
    [
      "Hold",
      "A temporary, time-limited claim on inventory before Booking confirmation; expires. Also the pre-confirmation status of a Booking. Avoid 'reservation'.",
    ],
    [
      "Allocation",
      "A capacity hold against a Slot, Pickup, or Resource: held → confirmed → fulfilled. Belongs to exactly one Booking Item.",
    ],
    [
      "Slot",
      "A concrete dated inventory unit (date or date-time) with remaining Capacity — a departure. Avoid departure/instance/occurrence as the type name.",
    ],
    [
      "Capacity",
      "The numeric upper bound on a Slot, Allotment, or Vehicle. Always a quantity, never a status.",
    ],
    [
      "Extra",
      "A child line that modifies/extends a Component Booking and shares its lifecycle (cancelled, taxed, fulfilled with it). Avoid add-on/addon.",
    ],
    [
      "Fulfillment",
      "Issuance of a deliverable artifact (Service Voucher, ticket, PDF, QR) for a Booking Item.",
    ],
    [
      "Invoice",
      "A billing document to a payer; lifecycle draft → sent → partially_paid/paid/overdue/void.",
    ],
    ["Payment", "A recorded inbound transfer of money. Distinct from an Invoice."],
    [
      "Supplier",
      "An operational vendor contracted for delivery. Not 'provider' (tech integrations) and not 'channel'.",
    ],
    [
      "Channel",
      "A distribution counterparty selling our inventory (OTA, affiliate, marketplace, API partner).",
    ],
    [
      "Inventory Source",
      "A technical upstream source of inventory/booking capability (Connect, GDS, direct API, CSV). Not a Supplier.",
    ],
    [
      "Sourced Inventory",
      "Inventory the Operator sells but does not operate, reached through an Inventory Source.",
    ],
    [
      "Accept",
      "Records that the client chose a Proposal Version (or accepted terms). Does NOT by itself mean every supplier component is confirmed.",
    ],
    [
      "Confirm",
      "Promote from draft/held to a binding state (Booking, Allocation, supplier status). Distinct from Accept.",
    ],
    [
      "Cancel",
      "Operationally reverse a commitment (Booking, Allocation). Distinct from Void (financial reversal) and Close (end a Proposal).",
    ],
  ]
  const needle = term?.toLowerCase().trim()
  const selected = needle
    ? entries.filter(
        ([name, def]) => name.toLowerCase().includes(needle) || def.toLowerCase().includes(needle),
      )
    : entries
  if (selected.length === 0) {
    return `No glossary entry matches "${term}". Call voyant_glossary with no term for the full list.`
  }
  const header = needle
    ? `# Voyant glossary — entries matching "${term}"\n\n`
    : "# Voyant glossary\n\nCanonical terms (from UBIQUITOUS_LANGUAGE.md):\n\n"
  return header + selected.map(([name, def]) => `- ${name}: ${def}`).join("\n")
}
