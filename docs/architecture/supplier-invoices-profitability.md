# Supplier invoices & departure profitability — design

Status: proposed (2026-06-06) · **rev 3** — added accountant persona (§13); see Revision log §18
Audience: anyone designing or implementing accounts-payable (supplier cost capture) and profitability reporting in Voyant — recording the invoices an operator *receives* from suppliers (transport, flights, guides, accommodation, …), attributing those costs to the departures / products / travellers they were incurred for, and surfacing expenses / revenue / profit per departure and per product.

Related:
- [catalog-supply-models.md](./catalog-supply-models.md) — `departure` = a scheduled `availability_slot`; the unit a P&L is built around
- [invoice-number-allocation.md](./invoice-number-allocation.md) — existing (customer-facing) invoice number series
- [notifications-architecture.md](./notifications-architecture.md) — the provider-abstraction pattern reused for AI extraction
- [storage-architecture.md](./storage-architecture.md) — R2 media/storage reused for invoice PDFs

> This document resolves the request: *"register invoices from suppliers (transportation, flights, guides, other), link them to specific departures / products / travellers, and show expenses / revenue / profit charts per departure and overall per product."*

---

## 1. Why this exists

Voyant today models **money owed *to* the operator** in full — but **nothing owed *by* the operator**.

Concretely, after exploring the current schema:

1. **Every `invoices` row is customer-facing (AR).** `packages/finance/src/schema.ts` defines `invoices` with `invoiceType ∈ {invoice, proforma, credit_note}` — a *document-kind* enum, **not a direction**. There is no `direction`/`kind` distinguishing receivable (AR) from payable (AP). Invoices reference `bookingId` + `personId`/`organizationId` (the customer). There is **no `supplierId`** on an invoice and **no `supplier_invoices` table**.
2. **`supplier_payments` exists but pays against nothing.** `packages/finance/src/schema.ts` has a `supplier_payments` table (TypeID `spay`) with `bookingId`, optional `supplierId`, optional `bookingSupplierStatusId`, `amountCents`, `paymentMethod`, `status`, `paymentDate`. It records cash leaving the company — but there is **no invoice document it settles**, no due date, no balance, no aging. It's an orphaned outflow.
3. **Planned cost is everywhere; actual cost is nowhere.** `costAmountCents` (the operator's cost) already exists on Product records, Commerce price-rule tables (`option_price_rules`, `option_unit_price_rules`, `option_unit_tiers`, `departure_price_overrides` in `packages/commerce/src/pricing/schema-departure-overrides.ts`), `booking_items`, `booking_extras`, and `bookings`. **All of these are *estimates* captured at quote/booking time.** Nothing records what the operator was *actually invoiced* by a supplier after the trip ran — and therefore nothing can compute **cost variance** (planned vs actual), which is the single most useful number for a tour operator.
4. **`booking_supplier_statuses` is the proto-ledger, but loose.** `packages/bookings/src/schema-operations.ts:11` tracks supplier services per booking: `bookingId`, **`supplierServiceId`** (text, nullable), `serviceName`, `status` (`supplierConfirmationStatusEnum`), `supplierReference`, `costCurrency`, `costAmountCents`, `notes`. This is effectively a purchase-commitment ("we asked for a coach, confirmed, cost ≈ €5k"). It has **no invoice number, no document, no due date, no payable balance** — and crucially **no `supplierId` column**: the supplier identity is only reachable indirectly via `supplier_services.supplierId` (`packages/distribution/src/suppliers/schema.ts`, a real FK within Distribution), and `supplierServiceId` itself is a nullable plain-text ref with no integrity.
5. **No AP or profitability reporting.** `getFinanceAggregates` (`packages/finance/src/service-aggregates.ts`) computes customer-side revenue / outstanding / overdue only. A `profitabilityQuerySchema` exists in `packages/finance-contracts/src/validation-billing.ts` but is **a validator with no implementation behind it**. There is no per-departure or per-product P&L.

So an operator today **cannot**:

- Record the €4,800 coach invoice from "Balkan Transfers" and attach the PDF.
- Say "this invoice covers the 28 May 2026 departure of *Transylvania 7-Day*."
- Split a €3,200 flight invoice across the 4 travellers it was booked for.
- See, for one departure: revenue €18,400 − costs €11,900 = **profit €6,500 (35% margin)**.
- See the same rolled up across every departure of a product.
- Compare the cost they *estimated* (`booking_items.totalCostAmountCents`) against what they were *actually billed* — and catch the departures that bled margin.
- Know what they owe suppliers and when (AP aging), mirroring the AR aging they already have.

The gap is coherent and self-contained: it is **Accounts Payable + actual-cost attribution + a profitability read model.** The request makes sense, and the existing cost fields, FX plumbing, tax-regime infrastructure, media/storage, and the `availability_slot` departure model mean most of the foundations are already in place — what is missing is the *payable document* and the *attribution + reporting* on top of it.

---

## 2. The conceptual model

Three layers, kept distinct, are what make the charts meaningful:

```
                       per departure          per product (Σ departures)
                       ─────────────          ──────────────────────────
 REVENUE (AR)          customer invoices  ──►  invoices.totalCents
   actual                                       (already exists)

 COST (AP)             ┌ PLANNED  ──► booking_items.totalCostAmountCents   (exists, estimate)
   planned vs actual   └ ACTUAL   ──► supplier_invoice allocations          (NEW)

 PROFIT                = revenue − actual cost            (NEW read model)
 VARIANCE              = planned cost − actual cost       (NEW read model)
```

- **Revenue** already exists (customer invoices, AR). We reuse it.
- **Planned cost** already exists (the `costAmountCents` snapshots on `booking_items` / `bookings`). We reuse it as the *budget* baseline.
- **Actual cost** is new: it comes from **supplier invoices** the operator records, whose lines are **allocated** to departures / products / (optionally) travellers.
- **Profit** = revenue − actual cost. **Variance** = planned − actual. Both are computed by a read model, not stored as truth.

**The unit of profitability is the departure** (`availability_slot`). A product's P&L is the sum of its departures' P&Ls. Per-traveller is *derived* by splitting a departure-level allocation (per-pax or equal), not stored as a separate first-class allocation in v1 (see §6).

This is **gross margin**, not net profit: costs not attributable to a single departure (overheads, marketing, salaries) are explicitly out of scope (§3, §15).

---

## 3. Goals and non-goals

### Goals

- **Record a received supplier invoice** as a first-class payable document: supplier, invoice number, issue/due dates, currency, line items, tax, totals, status (`draft → received → approved → partially_paid → paid → disputed → void`), and an attached PDF (R2).
- **Attribute invoice cost to where it was incurred** — a whole invoice or any individual line allocates to one or more of: a **departure** (`availability_slot`), a **product**, a **booking**, and (derived) **travellers**. Splitting is supported (one flight invoice across 4 pax; one coach across a whole departure).
- **Capture actual vs planned cost** so variance is reportable per departure and per product.
- **AP aging** — what's owed to suppliers and when, mirroring existing AR aging.
- **Reconcile** supplier invoice ↔ `supplier_payments` ↔ `booking_supplier_statuses` so the orphaned outflow finally settles a document, and the proto-commitment can roll up into an actual invoice.
- **Profitability read model + charts** — per-departure P&L (revenue / cost / profit / margin / variance), per-product roll-up, cost breakdown by supplier service type, and time-series of margin.
- **AI-assisted capture (optional)** — upload a PDF, an `InvoiceExtractionProvider` (Voyant Cloud AI gateway *or* bring-your-own LLM/key) drafts the header + lines, operator confirms. Manual entry always works without it.
- **Multi-currency** — supplier invoices arrive in their own currency (flights EUR, local guide RON); reuse the existing `baseCurrency` / `fxRateSetId` plumbing so the P&L reports in a single base currency.

### Non-goals (v1)

- **Overhead / non-departure costs.** Marketing spend, salaries, office rent, fixed costs not attributable to a departure. The model is designed so an `allocation target = "overhead"` *could* be added later, but v1 reports **gross margin** only. (See §15.)
- **Self-billing / generating invoices *to* suppliers.** This is *inbound* AP — recording documents suppliers send the operator. Outbound supplier-facing invoicing (commission self-bills, RCTI) is out of scope.
- **Full double-entry / GL.** No chart-of-accounts, no journals, no trial balance. This is operational AP + a profitability read model, not an accounting ledger. (Export to an external accounting system is a future hook.)
- **Approval *routing* / multi-step sign-off chains.** v1 has a single `approved` state + who/when. A future design may coordinate this with a domain-specific saga or an external automation.
- **Bank-feed import / auto-matching payments.** Manual payment recording reused from `supplier_payments`.
- **Per-traveller as a stored first-class allocation.** v1 derives per-traveller by splitting departure-level allocations (§6).

---

## 4. Where it lives (architecture decisions)

### 4.1 Actual-cost capture belongs in `packages/finance`

Finance already owns money, currency/FX (`baseCurrency`/`fxRateSetId`), tax regimes (incl. `reverse_charge`), invoice number series, payments, and AR aggregates. Supplier invoices are *invoices* — they want the same number-series, tax-regime, FX, payment, and aging machinery. Putting AP in a different package would duplicate all of it.

**Decision:** Add a **supplier-invoice (AP) model to `packages/finance`** as a sibling of the customer-facing `invoices` model — *not* by overloading `invoices` with a `direction` column. Rationale: customer invoices and supplier invoices share *machinery* but differ in *shape* (a supplier invoice has a `supplierId`, no `personId` billing target, different number-series semantics — often the *supplier's* number, not ours — and reverse-charge tax). A separate table keeps both clean and avoids a forest of `WHERE direction = …` across every existing AR query. (Considered and rejected: a `direction` enum on `invoices`. It would silently change the meaning of every existing aggregate and index.)

### 4.2 Distribution suppliers and Operations departures must expose linkables

Distribution exposes `supplierLinkable` from its Suppliers owner path. To attribute cost to a supplier and query the graph (`supplier → invoices`, `departure → costs`), use:

```ts
// packages/distribution/src/suppliers/index.ts
export const supplierLinkable: LinkableDefinition = {
  module: "suppliers", entity: "supplier", table: "suppliers", idPrefix: "supp",
}
```

Operations availability exposes a `departureLinkable` for `availability_slots`
(idPrefix **`avsl`** — the existing prefix,
`packages/schema-kit/src/typeid/typeid-prefixes.ts:92`) so a departure can be
referenced as an allocation target.

> **Correction (link semantics).** A `linkable` + a plain text id column does **not** by itself make `queryGraph` traverse anything. `queryGraph` only walks **defined links** (`packages/core/src/query.ts:186`) materialised from `defineLink` (`packages/core/src/links.ts:97`). So for profitability reporting we will **not** rely on graph traversal over loose ids. Reporting is **explicit service SQL** joining `supplier_cost_allocations` to `availability_slots` / `products` / `bookings` by id (§8). The `linkable`s are exposed for the *commitment/attachment* relationships where a real pivot is wanted (e.g. a starter-level `defineLink(supplier, supplierInvoice)`), or as **maintained/read-only `defineLink`** relationships if we later want them in the graph — but the P&L read model does not depend on them.

### 4.3 Reference rules: real FKs inside finance, loose ids across modules

Two distinct rules, per `docs/architecture/schema-discipline.md`:

- **Intra-package (finance-local) → real FKs.** `supplier_invoice_lines.supplierInvoiceId → supplier_invoices.id`, `supplier_cost_allocations.{supplierInvoiceId, supplierInvoiceLineId}`, and `supplier_payments.supplierInvoiceId → supplier_invoices.id` are all within `packages/finance` and **must be real `references()` FKs** (use `typeIdRef(...).references(...)`), not plain text. This matches how `payments`/`invoice_attachments` already reference `invoices`.
- **Cross-module → indexed `text()` columns + service-layer validation** (and `defineLink` where a pivot is wanted): `supplierId`, `bookingId`, `departureId` (= `availabilitySlotId`), `productId`, `bookingItemId`, `travelerId`. These are *not* DB foreign keys, consistent with the deliberate cross-module FK removal in this repo.

### 4.4 The profitability read model is a finance service, surfaced via admin

Aggregation lives next to `getFinanceAggregates` (`packages/finance/src/service-aggregates.ts`) as new `getDepartureProfitability` / `getProductProfitability` services. Charts are an admin UI surface (a `profitability` dashboard), fed by these services. No new analytics package in v1.

---

## 5. Data model

All amounts in integer cents with an explicit currency, plus `baseCurrency` + `fxRateSetId` for reporting, following the existing finance convention.

> **TypeID prefixes must be registered first.** `typeId("supplier_invoices")` will **not compile** until the prefix is added to the central map at `packages/schema-kit/src/typeid/typeid-prefixes.ts` (the live source; the `packages/db/src/lib/typeid-prefixes.ts` doc path referenced earlier is stale). PR1 must add: `supplier_invoices: "sinv"`, `supplier_invoice_lines: "sinl"`, `supplier_cost_allocations: "sial"`, and (PR5) `invoice_extractions: "iext"` — all proposed, subject to collision-check against the existing map (`supplier_payments: "spay"`, `availability_slots: "avsl"` already exist).

Reference rule recap (§4.3): finance-local columns are **real FKs**; cross-module columns are **indexed `text()`**.

### 5.1 `supplier_invoices` (header) — TypeID `sinv`

```
id                  sinv_…
supplierId          text   (indexed)         -- which supplier billed us
supplierInvoiceNo   text                      -- the SUPPLIER's invoice number (their doc), not ours
internalRef         text   (nullable)         -- optional internal AP reference / our own series
status              enum   draft | received | approved | partially_paid | paid | disputed | void
currency            text
baseCurrency        text   (nullable)
fxRateSetId         text   (nullable)
subtotalCents       int    default 0
taxCents            int    default 0
totalCents          int    default 0
paidCents           int    default 0
balanceDueCents     int    default 0
taxRegimeId         text   (nullable)         -- reuses tax_regimes; supports reverse_charge
issueDate           date                      -- date on the supplier's invoice
dueDate             date   (nullable)         -- supplier payment terms (suppliers.paymentTermsDays default)
receivedAt          timestamp (nullable)
approvedAt          timestamp (nullable)
approvedBy          text   (nullable)
storageKey          text   (nullable)         -- attached PDF; matches invoice_attachments/invoices `storageKey` convention
extractionId        text   (nullable)         -- FK to invoice_extractions (§7), finance-local
notes               text   (nullable)
createdAt/updatedAt/deletedAt
```

Notes:
- **PDF attachment uses `storageKey`** (text), matching the existing `invoices.storageKey` (`packages/finance/src/schema.ts:1105`) and `invoice_attachments.storageKey` (`:1140`) pattern — **not** a `documentMediaId`. For multiple attachments, reuse the `invoice_attachments` shape rather than a single column; decide one-vs-many in PR3.
- `supplierInvoiceNo` is **the supplier's** number (AP convention) — uniqueness is per-supplier, not global. An *optional* internal series can reuse `invoice_number_series` with a new `scope: "supplier_invoice"` if an operator wants their own AP numbering.
- `dueDate` defaults from `suppliers.paymentTermsDays` (already on the suppliers table).
- `status` flow mirrors AR where it can; `disputed` and `approved` are AP-specific.

### 5.2 `supplier_invoice_lines` — TypeID `sinl`

```
id                  sinl_…
supplierInvoiceId   sinv_…  (FK → supplier_invoices.id, cascade)   -- finance-local, REAL FK
description         text
serviceType         enum    -- AP-local enum (see §5.6) — NOT the shared serviceTypeEnum in v1
supplierServiceId   text   (nullable)  -- cross-module: optional text ref to supplier_services (no FK)
quantity            int    default 1
unitAmountCents     int
taxRateBps          int    (nullable)
taxAmountCents      int    default 0
totalAmountCents    int
createdAt/updatedAt
```

### 5.3 `supplier_cost_allocations` — TypeID `sial`

The heart of the feature: how a line (or whole invoice) maps onto departures / products / bookings / travellers. **A line can split across multiple allocations** (Σ allocations of a line = line total, enforced in the service layer).

```
id                  sial_…
supplierInvoiceId   sinv_…  (FK → supplier_invoices.id, cascade)   -- finance-local, REAL FK
supplierInvoiceLineId sinl_… (nullable, FK → supplier_invoice_lines.id)  -- finance-local; null = whole-invoice alloc
targetType          enum   departure | product | booking | traveler | unattributed
departureId         text   (nullable, indexed)   -- = availability_slots.id
productId           text   (nullable, indexed)
bookingId           text   (nullable, indexed)
bookingItemId       text   (nullable)
travelerId          text   (nullable)
amountCents         int                            -- portion of the line/invoice allocated here
baseAmountCents     int    (nullable)              -- FX-converted for reporting
splitMethod         enum   manual | per_pax | equal | weighted   -- how a multi-target split was derived
createdAt/updatedAt
```

- `targetType = unattributed` is the escape hatch: cost recorded but not yet attributed (still appears in AP totals, excluded from per-departure P&L until attributed). This keeps data entry unblocked.
- **Per-traveller derivation (§6):** an operator allocates to a `departure`; the read model can *derive* per-traveller shares by splitting `amountCents` across that departure's travellers (`per_pax`/`equal`). v1 stores explicit `traveler` allocations only when the operator opts in (e.g. flight seats); otherwise traveller P&L is computed, not stored.

### 5.4 Link `supplier_payments` to the invoice it settles — and make `bookingId` optional

`supplier_payments` (`packages/finance/src/schema.ts:957`) gains a `supplierInvoiceId` (`sinv_…`, **real finance-local FK**) so a payment settles a document; `paidCents`/`balanceDueCents` on the header are maintained from payments (same pattern as AR `payments` → `invoices`).

> **Correction — `bookingId` is currently required, and an AP payment may have no booking.** A supplier invoice can cover several departures/bookings (or none yet), so an AP payment is **invoice-level, not booking-level**. But today `bookingId` is `.notNull()` in the schema (`:957`) **and** `z.string().min(1)` in `supplierPaymentCoreSchema` (`packages/finance-contracts/src/validation-payments.ts:317`), and the supplier-payment **action ledger targets `"booking"` via `payment.bookingId`**. Adding `supplierInvoiceId` alone is insufficient. PR2 must:
> 1. make `supplier_payments.bookingId` **nullable** (migration);
> 2. relax `supplierPaymentCoreSchema.bookingId` to optional/nullable;
> 3. require **at least one of** `bookingId` / `supplierInvoiceId` (refine);
> 4. update the unified payment queries that assume a booking; and
> 5. give the action ledger an **invoice-level target** when `bookingId` is null (target the supplier invoice, not a booking).

### 5.5 Bridge to `booking_supplier_statuses` (the proto-commitment)

`booking_supplier_statuses` (`packages/bookings/src/schema-operations.ts:11`) captures the *expected* cost of a supplier service on a booking. We add a nullable `supplierInvoiceLineId` so a confirmed commitment can be **matched** to the actual invoice line — giving commitment → invoice → payment traceability and a second variance signal (committed vs invoiced).

> **Correction — matching must resolve the supplier indirectly.** `booking_supplier_statuses` has **no `supplierId`**; it has `supplierServiceId` (nullable). To match a `supplier_invoices.supplierId` to a commitment, PR2 must either (a) **derive** the supplier by joining `supplier_services.supplierId` (`packages/distribution/src/suppliers/schema.ts`) from `booking_supplier_statuses.supplierServiceId` — which fails when `supplierServiceId` is null — or (b) **intentionally add a `supplierId` snapshot** column to `booking_supplier_statuses`. Recommendation: add the explicit `supplierId` snapshot (matching is otherwise unreliable for ad-hoc statuses with no `supplierServiceId`).

### 5.6 Service-type taxonomy — keep it AP-local in v1

The request names **flights**, and while `suppliers.type` has `airline`, the shared `serviceTypeEnum` (`accommodation|transfer|experience|guide|meal|other`) has no `flight`/`insurance`.

> **Correction — extending the shared enum is a broad, multi-package sweep.** `serviceTypeEnum` / `serviceType` spans Distribution supplier surfaces, Inventory Product surfaces, related contract packages, React packages, booking references, and i18n message catalogs. Changing it touches DB enums, contracts, React schemas, reusable UI, and translations.
>
> **Decision:** v1 defines an **AP-local `apServiceTypeEnum`** in finance (`transport, flight, accommodation, guide, meal, experience, insurance, other`) used only by `supplier_invoice_lines` — no cross-package churn. Unifying with the shared `serviceTypeEnum` (adding `flight`/`insurance` everywhere) is a **separate, explicitly-scoped enum-sweep PR**, not bundled into PR1.

### 5.7 Linkables (for pivots/attachment, not for the P&L read model)

```ts
// distribution suppliers — packages/distribution/src/suppliers/index.ts
export const supplierLinkable   = { module: "suppliers",    entity: "supplier",         table: "suppliers",          idPrefix: "supp" }
// finance — add to financeLinkable
export const supplierInvoiceLinkable = { module: "finance", entity: "supplierInvoice",  table: "supplier_invoices",  idPrefix: "sinv" }
// operations availability
export const departureLinkable  = { module: "availability", entity: "departure",        table: "availability_slots", idPrefix: "avsl" }
```

As noted in §4.2, these support **explicit `defineLink` pivots** (e.g. supplier↔invoice attachment) and are *available* for graph reads — but the departure/product P&L (§8) is computed by **explicit service SQL over the allocation ids**, not `queryGraph` traversal over loose text columns.

---

## 6. Cost allocation model (departure-level, traveller derived)

Decision (from scoping): **departure-level allocation is the primary model; per-traveller is derived.**

Three allocation patterns cover the named use cases:

| Cost example | `targetType` | How |
| --- | --- | --- |
| €4,800 coach for the whole 28-May departure | `departure` | one allocation, `amountCents = 480000`, `departureId = aslt_…` |
| €3,200 flights for 4 specific travellers | `traveler` ×4 (or `departure` + `per_pax` derive) | explicit per-traveller when seats are named; else split `per_pax` |
| €900 guide fee shared across a product's season | `product` | allocate to `productId`; read model spreads or reports at product level |
| Invoice received, not yet sorted | `unattributed` | recorded for AP, excluded from P&L until attributed |

Each allocation row carries **exactly one** target id matching its `targetType` (a `departure` allocation has `departureId` set and `productId`/`bookingId`/`travelerId` null, etc.) — enforced by a check constraint + service validation.

**Derivation rule for per-traveller P&L:** for a `departure`-level allocation of `amountCents` over a departure with `pax = N` travellers:
- `equal` → `amountCents / N` each (remainder to the lead traveller, deterministic).
- `per_pax` → weight by traveller category if priced per category, else equal.

This means an operator who only ever allocates at departure level still gets a *defensible* per-traveller cost column, and one who needs precision (flight manifests) can allocate explicitly. The same `splitMethod` enum records which path produced a number, so the UI can show "derived" vs "explicit."

### 6.1 Allocation invariants (specify before coding)

Pin these down in PR1's validation + tests:

1. **No mixing modes per invoice.** An invoice is allocated **either** whole-invoice (line-less rows, `supplierInvoiceLineId = null`) **or** per-line — never both. Reject the second mode once the first exists on an invoice.
2. **Exactly one target per allocation** (§6 table note): a check constraint requires the id column matching `targetType` to be non-null and the others null.
3. **No over-allocation.** Σ(allocations of a line) ≤ line `totalAmountCents`; for whole-invoice mode, Σ ≤ invoice `totalCents`. Over-allocation rejected.
4. **Under-allocation → explicit remainder.** The remainder is **not** silently dropped: the read model computes it on read (nothing is stored) and reports it per currency as `unallocated`, separately from `unattributed`. The two are different signals — `unattributed` is cost someone decided belongs to no departure, `unallocated` is cost nobody has touched yet — so merging them would hide a backlog behind a decision.
5. **Currency.** An allocation inherits the invoice currency; `baseAmountCents` is computed via the invoice's `fxRateSetId` at record time (§9). Allocations never mix currencies within one invoice.
6. **Supplier credit notes** (§5.6 / §15-Q5): a credit note (negative invoice in the lean v1) produces **negative** allocations against the same targets, so the read model nets them. Define the matching rule (credit references the original `supplier_invoices.id`) and forbid a credit's allocations from exceeding the original's per-target totals.

---

## 7. AI-assisted capture (optional, pluggable)

Per scoping: **not** Max AI — extraction runs through the **Voyant Cloud AI gateway** *or* a **bring-your-own LLM/key**. This mirrors the existing provider abstractions (`NotificationProvider`, `StorageProvider`).

```ts
// packages/finance (or a small packages/invoice-extraction)
interface InvoiceExtractionProvider {
  name: string
  extract(input: { pdf: Uint8Array | string /*mediaId*/, hints?: { supplierId?: string } })
    : Promise<ExtractedSupplierInvoice>   // header + lines + confidence, all OPTIONAL/best-effort
}
```

- Providers: `voyant-cloud-gateway` (calls the platform AI gateway with the tenant's entitlement) and `byo-llm` (operator supplies endpoint + key, e.g. their own OpenAI/Anthropic key). Default: none — manual entry.
- Flow: upload PDF → R2 (`documentMediaId`) → `extract()` drafts a `supplier_invoices` row in `status: draft` + `extractionId` → **operator reviews/edits/confirms** → `received`. Extraction never auto-posts; it pre-fills.
- The provider returns confidence per field so the UI can flag low-confidence values for review.
- Fully optional and async — the manual path is the source of truth; AI only reduces typing.

(An `invoice_extractions` audit table — `iext` — stores raw model output + confidence + which provider/model, for traceability and re-runs.)

---

## 8. Profitability read model & charts

Two new finance services beside `getFinanceAggregates`:

### `getDepartureProfitability({ from, to, productId?, departureId? })`
Per departure (`availability_slot`):
```
departureId, productId, label, startsAt, pax
revenueCents        -- Σ customer invoices attributable to this departure's bookings (via booking_items.availabilitySlotId)
plannedCostCents    -- Σ booking_items.totalCostAmountCents for the departure
actualCostCents     -- Σ supplier_cost_allocations (departure + derived) in base currency
profitCents         -- revenue − actual
marginPercent       -- profit / revenue
varianceCents       -- planned − actual   (negative = overspend)
costByServiceType   -- breakdown for the stacked-bar chart
unattributedCents   -- AP allocated to `unattributed` on purpose (excluded from P&L)
unallocatedCents    -- AP with no allocation row at all: the under-allocated
                    -- remainder, Σ(invoice total − Σ its allocations) (backlog signal)
```

### `getProductProfitability({ from, to })`
Rolls the above up by `productId` (Σ departures), plus per-product margin trend over time.

### Charts (admin `profitability` dashboard)
- **Per-departure P&L bar**: revenue vs actual cost vs profit, one group per departure.
- **Cost breakdown** (stacked): by service type (transport / flights / accommodation / guides / …) per departure or product.
- **Planned vs actual variance**: highlights margin-bleeding departures.
- **Product margin trend**: time-series of margin% across a product's departures.
- **AP aging**: what's owed to suppliers by bucket (mirrors AR aging).

Reuse the AR aggregate query patterns (group-by `yearMonth`/`currency`, exclude `void`) for consistency.

### 8.1 Revenue & cost currency/attribution rules (must be specified before PR4)

The naïve "Σ invoices for the departure" hides several real cases the read model must define explicitly:

1. **Revenue attribution is line-level, and lines can be detached.** AR `invoice_line_items` carry an optional `bookingItemId`, but it can be **null** (`packages/finance/src/schema.ts:740`; created via `createInvoiceFromBooking`, `service.ts:4007`). Rule: attribute a line to a departure via `bookingItemId → booking_items.availabilitySlotId`; for **`bookingItemId`-null lines** (fees, adjustments, payment-schedule lines), fall back to **proportional split across the invoice's attributable items** weighted by `totalSellAmountCents` (the override/fallback rule). State this in the service, don't leave it implicit.
2. **Multi-departure invoices.** An invoice spanning items across several departures contributes to each departure by its own attributable lines (rule 1) — never the whole invoice total to one departure.
3. **Document-status handling.** Revenue counts **issued/paid `invoice`** rows only. **Proformas** are excluded (not yet revenue). **Credit notes** subtract. **`void`** excluded (matching existing AR aggregate behaviour).
4. **Revenue base currency exists; planned-cost base currency does not.** AR invoices already track `baseSubtotalCents`/`baseTotalCents`/`basePaidCents`/`baseBalanceDueCents`, so revenue converts cleanly. But **`booking_items` has only item-currency cost** (`costCurrency`/`unitCostAmountCents`/`totalCostAmountCents`) — **no `baseCostAmountCents`** (`packages/bookings/src/schema-items.ts:43`). So **planned cost cannot be summed in base currency from booking items alone.** Options for PR4: (a) convert planned cost at read time using the booking's `fxRateSetId` (lossy if items mix currencies); (b) add `baseCostAmountCents` to `booking_items` (cleaner, but a bookings-package change). Decide explicitly — until then, `varianceCents` is only well-defined when item cost currency == base currency.
5. **Actual cost** uses `supplier_cost_allocations.baseAmountCents` (always populated at record time, §9), so the **actual** side of the P&L is base-currency-clean even when planned isn't.

---

## 9. Tax, FX, reverse charge

- **FX:** supplier invoice currency may differ from base. Reuse `baseCurrency` + `fxRateSetId`; allocations store `baseAmountCents` so all P&L math is in one currency. The rate is captured at invoice-record time (not trip time) and is auditable.
- **Reverse charge:** cross-border supplier invoices (EU intra-community) commonly carry no VAT and require *reverse charge* accounting. `tax_regimes` already has `code: "reverse_charge"` and `margin_scheme_art311` — reuse on `supplier_invoices.taxRegimeId`. The margin scheme (Art. 311) is already wired in the SmartBill plugin for AR; the *cost* side now has a place to live too.
- **No GL postings** in v1 — tax is recorded for reporting/compliance visibility, not posted to accounts.

---

## 10. Reconciliation triangle

```
   booking_supplier_statuses            supplier_invoices (+ lines, + allocations)         supplier_payments
   "we committed to a coach,    ──────► "Balkan Transfers billed us       ──────►          "we paid €4,800
    ~€5k, confirmed"                      €4,800 for the 28-May departure"                   on 2026-06-10"
        (commitment)                              (actual cost)                                 (settlement)
   variance: committed vs invoiced       variance: planned vs actual                  balance: invoiced vs paid
```

- `booking_supplier_statuses.supplierInvoiceLineId` (new) ties commitment → invoice line — but supplier matching needs an explicit `supplierId` snapshot on the status (§5.5), since the status has none today.
- `supplier_payments.supplierInvoiceId` (new, real FK) ties invoice → payment; header `paidCents`/`balanceDueCents` derived. Requires making `supplier_payments.bookingId` nullable + ledger/query changes (§5.4).
- Two variance signals fall out for free: **committed vs invoiced** and **planned vs actual** (the latter only base-currency-clean once planned cost has a base figure — §8.1 rule 4).

---

## 11. API surface

Admin-only (`/v1/admin/*`, `staff` actor), in the finance module:

```
POST   /v1/admin/finance/supplier-invoices                 create (manual or from extraction draft)
GET    /v1/admin/finance/supplier-invoices                 list (filters: supplierId, status, dueDate, departureId, productId, search)
GET    /v1/admin/finance/supplier-invoices/:id             detail (+ lines + allocations + payments)
PATCH  /v1/admin/finance/supplier-invoices/:id             update / status transition
POST   /v1/admin/finance/supplier-invoices/:id/lines       add/replace lines
POST   /v1/admin/finance/supplier-invoices/:id/allocations set allocations (validates Σ invariant)
POST   /v1/admin/finance/supplier-invoices/:id/extract     run AI extraction on attached PDF
POST   /v1/admin/finance/supplier-invoices/:id/payments    record a supplier payment (reuses supplier_payments)
GET    /v1/admin/finance/reports/departure-profitability   read model (§8)
GET    /v1/admin/finance/reports/product-profitability     read model (§8)
GET    /v1/admin/finance/reports/ap-aging                  AP aging
GET    /v1/admin/finance/reports/:report/export?format=csv|pdf   export a report (§13)
POST   /v1/admin/finance/reports/:report/share             mint a shareable signed link for an accountant (§13)
```

Report read/export routes carry the `finance`/`reports` resource tag so a **read-only scoped API key** (`finance:read`, `reports:read`) can reach them without a UI session — `require-actor.ts` already enforces per-resource API-key scopes (§13). Mutating AP routes (`approve`, `payments`, allocation edits) stay write-gated.

Follow the `createInvoiceFromBooking` service pattern: caller supplies cross-module data (e.g. departure label, pax, booking item costs) via a typed `…Data` interface; finance stays decoupled. Mutations go through the action-ledger like the rest of finance.

---

## 12. UI surface (admin)

- **Supplier invoices list** — status, supplier, amount, due date, attribution coverage (% allocated), payment status. Filter by departure/product/supplier.
- **Supplier invoice detail** — header + lines + the **allocation editor** (pick departure/product/booking, split across travellers, see remainder). PDF preview pane (R2). "Extract from PDF" button when a provider is configured.
- **Departure P&L view** — embedded on the departure (availability slot) detail: revenue / planned / actual / profit / margin / variance + cost breakdown.
- **Product profitability dashboard** — the charts in §8, with **Export (PDF/CSV)** and **Share with accountant** actions (§13).
- **Manage shares** — list active accountant share links (period, report set, access log, revoke) and issue read-only accountant API keys (§13.2).
- New operator-nav entry under finance: **Accounts payable** (supplier invoices + AP aging) and **Profitability** (the dashboard).

UI primitives that are reusable go in `packages/ui` / a `finance-ui` package (per the "new UI primitives live in packages/ui" convention), template wires them.

---

## 13. Access, sharing & the accountant persona

Operators routinely need to **hand financial data to their accountant** — sometimes a one-off ("email them this month's P&L"), sometimes ongoing ("let the accounting firm pull our invoices"). Today every authenticated session is `actor: "staff"` and sees *all* `/v1/admin/*` routes; there is no read-only or finance-only access. This resolves the old §15-Q6 (permissions).

Decision (from scoping): **build it in two phases — external/lightweight first (reuses existing infra), then a first-class internal accountant role once a per-capability guard layer exists.**

### 13.1 What already exists (reuse, don't reinvent)

- **Scoped API keys** — `require-actor.ts` already honours per-resource API-key scopes (`finance:read`, `invoices:read`, …) on `/v1/admin/*` paths (`packages/types/src/api-keys.ts` defines the resource/action taxonomy). A read-only key is the cheapest ongoing-access mechanism today.
- **Public document delivery** — `createPublicDocumentDeliveryGrant` (`packages/hono/src/public-document-delivery.ts`) mints TTL'd (default 24h, max 30d), **revocable, access-logged** signed URLs, and finance *already* uses it to share invoice-rendition PDFs (`packages/finance/src/routes-documents.ts`). This is the share-a-report mechanism — no account required.
- **Better Auth roles** (`owner/admin/member`, `packages/auth/src/permissions.ts`) — but these govern the **control plane** (operators, API keys, settings) and are **not** wired to module data routes. Reusing them for data-route authorization is net-new work (see 13.3).
- **Report routes** exist (`/reports/revenue|aging|profitability`, `/aggregates`) but have **no export** — Relationships has CSV export (`packages/relationships/.../accounts.ts`), finance does not.

### 13.2 Phase A — external sharing + export (reuses infra, ships first)

1. **Report export (PDF + CSV)** on every finance report (existing + new profitability/AP-aging). CSV for "import into my accounting software"; PDF for a formatted period pack (reuse the invoice-rendition/template machinery). Export routes are read-scoped (§11).
2. **Share an accountant link** — `POST /reports/:report/share` mints a `createPublicDocumentDeliveryGrant` over a generated export artifact (stored by `storageKey`), returning a TTL'd, revocable, audited URL. Operator picks period + report set; the accountant opens the link, no login. A **manage-shares** view lists active grants with access logs and a revoke button (the grant store already records IP / user-agent / count / time).
3. **Read-only scoped API key for the accounting firm** — surface a "Create accountant key" action that issues a key limited to `finance:read` + `reports:read` (+ `invoices:read`). Their software pulls invoices/reports directly; nothing else is reachable. This composes with the **accounting-export plugin hook** already noted in §16.

Phase A needs **no new RBAC** — it's export + the existing grant/API-key primitives.

> **Implemented (v1).** CSV export ships on the profitability reports —
> `GET /v1/admin/finance/reports/profitability/{departures,products}/export`.
>
> **Accountant share portal (built).** The operator mints a revocable, TTL'd,
> access-logged link scoped to a date range from the Profitability page
> (`POST /v1/admin/finance/accountant-shares`; list + revoke). It's backed by the
> generic `public_document_delivery_grants` token store (`sourceEntity =
> accountant-share`, period in `metadata`) — no new table. The accountant opens
> `/accountant/:token` (operator public route, no login): a read-only portal with
> per-departure/product revenue-vs-cost charts + tables, the period's invoices
> with their **uploaded PDF attachments** (downloaded via a token-scoped redirect
> to a presigned URL — invoices already carry attachments, so nothing is
> generated), and CSV export. Token routes live under
> `/v1/public/finance/accountant/:token/*` and self-authenticate (the token is
> the credential); the share's scope bounds every query.
>
> A `finance:read`-scoped API key also still works for programmatic pulls (see
> §11). Still open: PDF *generation* (not needed — attachments cover it), and the
> Phase B internal `accountant` login role (§13.3).

### 13.3 Phase B — first-class internal accountant role (follow-up)

For an **employee** who should see finance but not catalog/CRM/etc., introduce a real capability layer on `/v1/admin/*`:

- Define an **`accountant` role** = read all finance + reports + export; **may** record/approve AP and reconcile payments (configurable); **no** access to non-finance admin modules; **no** destructive ops (void, delete).
- Wire it by **extending the Better Auth access-control statements** (`packages/auth/src/permissions.ts`) with finance capabilities and applying the **`requirePermission`/capability middleware that exists but isn't mounted** to finance admin routes — a small per-module `requireCapability("finance:read"|"finance:write")` gate. This is **cross-cutting** (it establishes sub-`staff` authorization for the whole platform, not just finance), which is exactly why it's phased after A.
- External accountants can then *alternatively* be invited as scoped members (the `user_invitations` table + org plugin already exist) instead of using an API key, if an operator prefers a named login over a key.

### 13.4 Audit & safety

Financial-data access is sensitive: Phase A grants are access-logged by the delivery store; API-key reads should be captured in the existing `auditLog` (read capability already modelled). Any `share`/key-issue action is itself an action-ledger event. Shared links expose a **point-in-time export**, not live data — revisiting a stale link never leaks newer data.

---

## 14. Sequenced PRs

Each independently mergeable and useful.

0. **PR0 — TypeID prefixes.** Register `sinv`/`sinl`/`sial` (+ `iext` for PR5) in `packages/schema-kit/src/typeid/typeid-prefixes.ts` (collision-checked). Tiny but **blocks PR1 compilation** (§5).
1. **PR1 — AP schema + service.** `supplier_invoices`, `supplier_invoice_lines`, `supplier_cost_allocations` with **finance-local FKs** (lines→invoice, allocation→line/invoice) + cross-module text columns; **AP-local `apServiceTypeEnum`** (not the shared enum — §5.6); `storageKey` attach convention (§5.1); `supplierLinkable`/`supplierInvoiceLinkable`/`departureLinkable` for pivots; CRUD + validation + action-ledger; allocation invariants §6.1 (single-mode, one-target check constraint, no over-allocation, computed remainder). Tests.
2. **PR2 — Reconciliation + payment model fix.** `supplier_payments.supplierInvoiceId` (FK) **and** make `bookingId` nullable + require-one-of refine + invoice-level action-ledger target + update unified payment queries (§5.4); add `supplierId` snapshot to `booking_supplier_statuses` + `supplierInvoiceLineId`; commitment-matching service; payment → balance derivation.
3. **PR3 — Admin API + list/detail UI + allocation editor + PDF attach (R2 via `storageKey`).** Manual capture end-to-end.
4. **PR4 — Profitability read model + charts.** `getDepartureProfitability`/`getProductProfitability`/AP aging built on **explicit service SQL** (not `queryGraph`), implementing the §8.1 currency/attribution rules (incl. the planned-cost base-currency decision); departure P&L view; product dashboard.
5. **PR5 — Report export + accountant sharing (Phase A, §13.2).** PDF + CSV export on all finance reports; `POST /reports/:report/share` over `createPublicDocumentDeliveryGrant`; manage-shares view; read-only accountant API key issuance (`finance:read`/`reports:read`). No new RBAC — reuses existing grant/API-key infra.
6. **PR6 — AI extraction provider.** `InvoiceExtractionProvider` + `voyant-cloud-gateway` + `byo-llm`; `invoice_extractions` audit; "extract from PDF" flow. Optional, behind config.
- **PR-A (follow-up, cross-cutting) — internal accountant role (Phase B, §13.3).** Extend Better Auth access-control statements with finance capabilities; mount a `requireCapability` gate on `/v1/admin/*`; define the `accountant` role. Establishes sub-`staff` authorization platform-wide, so it's sequenced after the finance work lands.
- **PR-X (separate, optional) — shared `serviceTypeEnum` sweep.** Unify the AP-local enum with the shared `serviceTypeEnum` (add `flight`/`insurance` across Distribution supplier surfaces, Inventory Product surfaces, related contracts, React packages, and i18n). Explicitly *not* bundled into PR1.

PR0–PR5 deliver the full request **plus accountant sharing/export** with manual entry; PR6 is the typing-saver; PR-A (internal accountant RBAC) and PR-X (taxonomy unification) are follow-ups.

---

## 15. Open questions

1. **Internal AP numbering:** do operators want their *own* series for received invoices (audit/filing), or is the supplier's number enough? (Schema supports both; default is supplier's number only.)
2. **Revenue attribution to a departure:** confirmed via `booking_items.availabilitySlotId` → booking → customer invoice. Edge case: a customer invoice spanning items across *multiple* departures needs proportional split for per-departure revenue. Propose: split invoice revenue across its booking items by `totalSellAmountCents` weight. Confirm.
3. **Currency of report:** per-tenant base currency assumed. Multi-base-currency tenants — out of scope?
4. **Overhead (deferred):** the `unattributed`/future `overhead` target type leaves the door open; do we want even a simple "spread fixed monthly cost across departures" in a later phase, or keep strictly gross-margin?
5. **Credit notes from suppliers:** a supplier issuing a credit (refund/adjustment) — model as a negative `supplier_invoice` or a dedicated `supplier_credit_note`? (Lean: negative invoice / `void` + reissue in v1; dedicated table later if needed.)
6. **Permissions / accountant access:** ~~does this need a finer-grained role than the generic `staff` actor?~~ **Resolved → §13.** Two-phase: external sharing + export + read-only API key (reuses existing infra, PR5), then a first-class internal `accountant` role via a per-capability guard layer (follow-up PR-A).
7. **Accountant share TTL / scope policy:** default grant TTL for shared report links (24h default, 30d max), and whether shares are per-report or a bundled period pack — confirm operator-configurable defaults.

---

## 16. Related features uncovered (worth flagging)

The analysis surfaced adjacent gaps the same model naturally enables — not all in scope, but worth recording:

- **Purchase orders / commitments first-class.** `booking_supplier_statuses` is already a proto-PO. Promoting it to a real commitment with a PO number and a commit→invoice→pay lifecycle would give operators cash-flow *forecasting* (what we'll owe, when) in addition to AP (what we owe now).
- **Supplier statements / bulk reconciliation.** Suppliers often send a monthly statement covering many departures. A "statement" grouping over many `supplier_invoices` + bulk-match would save large operators real time.
- **Budget vs actual at product launch.** Since planned cost already exists per departure (`departure_price_overrides`, `booking_items`), a "set a cost budget per departure, alert on overspend" feature is a small step from the variance read model.
- **Margin guardrails in the booking flow.** With actual-cost history per product, the quote/offer path could warn when a discount pushes a booking below a target margin.
- **Accounting export hook.** A `Plugin` subscriber on `supplier.invoice.approved` / `…paid` (mirroring the SmartBill AR plugin) to push AP into Xero/QuickBooks/SmartBill — keeps Voyant out of being a GL while integrating with one.
- **Per-traveller profitability for B2B.** The derivation in §6 makes per-pax cost available; a B2B/agent-facing "cost per traveller" report is then trivial.

---

## 17. Summary

The request is coherent and fills a genuine, self-contained gap: Voyant models all money *in* and none *out*. The pieces to close it mostly exist — cost fields, FX, tax regimes (incl. reverse charge), media/storage, the `availability_slot` departure model, and the loose `booking_supplier_statuses` commitment ledger. What's missing is the **payable document** (`supplier_invoices` + lines), the **attribution** (`supplier_cost_allocations`, departure-level with derived per-traveller), the **reconciliation** wiring (payment → invoice, commitment → invoice), the **profitability read model + charts**, and **accountant access** (report export + shareable signed links now, an internal `accountant` role later — §13). Built in finance, reusing the established provider pattern for optional AI extraction and the existing public-document-delivery / scoped-API-key infra for accountant sharing. Sequenced PR0 (prefixes) → PR6 (extraction), with the internal accountant RBAC role (PR-A) and the enum-sweep (PR-X) as follow-ups; gross-margin scope (overhead deferred).

---

## 18. Revision log

**rev 3 (2026-06-06)** — added the **accountant persona** (new §13) after a planning request:
- Operators need to share financial reports with / give access to an accountant. Resolved old §15-Q6.
- **Two-phase (decided):** Phase A (PR5) — report **export (PDF + CSV)** + **shareable signed links** via the existing `createPublicDocumentDeliveryGrant` + **read-only scoped API keys** (`finance:read`/`reports:read`), reusing infra with no new RBAC. Phase B (follow-up PR-A) — a first-class internal **`accountant` role** by extending Better Auth access-control statements and mounting a `requireCapability` gate on `/v1/admin/*` (cross-cutting, hence later).
- §11 gained export/share routes; §12 gained export/share/manage-shares UI; §14 re-sequenced (PR5 = sharing/export, PR6 = extraction, PR-A = accountant RBAC). Sections 13–17 renumbered.

**rev 2 (2026-06-06)** — corrected against the repo after review; design direction unchanged:

- **`supplier_payments.bookingId` is required** (`schema.ts:957` + `validation-payments.ts:317`) and the action ledger targets `"booking"` via `payment.bookingId`. Adding `supplierInvoiceId` is insufficient — §5.4 now spells out making `bookingId` nullable, a require-one-of refine, query updates, and an invoice-level ledger target.
- **`booking_supplier_statuses` has no `supplierId`** (only `supplierServiceId`) — §1/§5.5/§10 corrected; matching now requires either deriving via `supplier_services.supplierId` or (recommended) an explicit `supplierId` snapshot.
- **`linkable` + text id ≠ graph traversal.** `queryGraph` only walks `defineLink`-defined links (`query.ts:186`, `links.ts:97`) — §4.2/§5.7/§8 now build the P&L from **explicit service SQL**, with linkables reserved for real pivots.
- **Currency/revenue rules** (§8.1): AR has base amounts but **`booking_items` has no `baseCostAmountCents`** (`schema-items.ts:43`); AR lines can have `bookingItemId: null` (`schema.ts:740`). Added proportional-split fallback, proforma/credit-note/void handling, and the planned-cost base-currency decision.
- **TypeID prefix is `avsl`, not `aslt`** (`typeid-prefixes.ts:92`); new prefixes (`sinv`/`sinl`/`sial`/`iext`) must be registered (new **PR0**) before code compiles.
- **`serviceTypeEnum` extension is a ~17-file cross-package sweep** — v1 uses an **AP-local `apServiceTypeEnum`**; the shared-enum unification is a separate optional PR.
- **Finance-local references are real FKs** (lines→invoice, allocation→line, `supplier_payments.supplierInvoiceId`); only cross-module refs stay text. PDF attachment uses **`storageKey`** (matching `invoice_attachments`), not `documentMediaId`.
- **Allocation invariants pinned** (§6.1): single allocation mode per invoice, exactly-one-target check constraint, no over-allocation, computed `unattributed` remainder, currency inheritance, and credit-note netting.

**rev 1 (2026-06-06)** — initial design.
