# Design note: extract `@voyant-travel/operator-settings` as a standard package

- **Status:** Superseded by package manifests, typed runtime ports, and generated graph composition
- **Date:** 2026-06-17
- **Feeds:** `consolidated-deployments-rfc.md` Workstream B step 4 · `operator-registry-classification.md` ("Recommendation: extract operator-settings")
- **Prereq met:** the registry relocation + `createVoyantApp` convergence (Workstream B steps 1–3) are merged. The deployment is now config + injected `providers` + two deployment-local module families (`invitations`, `operator-settings`). This note assesses turning the second one into a standard package.

## Summary

The classification doc marked `operator/operator-settings` **deployment-local** because "its schema lives in the deployment," but flagged it as a **strong extraction candidate** — so many standard modules already depend on injected *settings readers* that a canonical package owning the settings **schema + reader contract** would collapse a large amount of per-deployment injection.

Grounding that recommendation against the code: the extraction is **sound and lower-risk than the doc implied** (the `additionalSchemas` mechanism already folds package-owned schema into the deployment's migration history — no Workstream D needed), but the **collapse benefit is narrower than stated** (two of the four named readers are env-driven, not settings-table-driven). Recommendation: do it, in two stages, starting schema-only.

## Current surface (grounded)

### Schema — 5 tables, starter-local today
`starters/operator/src/db/schema.ts`:

| Table | TypeID | Notes |
| --- | --- | --- |
| `operator_settings` | `opst` | legacy catch-all, now read-only (retained for migration) |
| `operator_profile` | `oppf` | name, legal name, address, contact, licensing |
| `operator_payment_instructions` | `opin` | bank-transfer beneficiary, IBAN, bank, notes |
| `operator_payment_defaults` | `opdp` | `customerPaymentPolicy` JSONB, checkout/invoice URL templates |
| `booking_tax_settings` | `btxs` | tax pricing mode, tax policy profile id |

Wired via `voyant.config.ts` **`schemas: ["./src/db/schema.ts", …]`** (template-local), **not** `modules` or `additionalSchemas`. Migrations live in the combined starter folder (`0019_booking_tax_settings`, `0020_operator_settings_split`, `0034_operator_checkout_url_templates`).

### Readers/writers — `starters/operator/src/api/routes/settings.ts`
`get/upsertOperatorProfile`, `get/upsertOperatorPaymentInstructions`, `get/upsertOperatorPaymentDefaults`, `resolveOperatorDefaultPaymentPolicy`, `resolveBookingTaxSettings`, `updateBookingTaxSettings`, `toPublicOperatorProfile/Settings`, `mountOperatorSettingsRoutes` (admin `/v1/admin/settings/*` + public `/v1/public/operator-profile`, `/v1/public/settings/operator`).

### Who consumes the readers (the injection this would collapse)
Standard packages that today receive deployment-injected settings readers:

| Consumer (standard package) | Injected reader | Table |
| --- | --- | --- |
| `commerce` (checkout) + `finance` (booking-tax ext) | `resolveBookingTaxSettings` / `updateBookingTaxSettings` | `booking_tax_settings` |
| `legal` (contract variables) | `resolveOperatorProfile`, `resolveOperatorPaymentInstructions` | profile, payment-instructions |
| `proposals` | `resolveOperatorProfile` | profile |
| `finance` / `notifications` (checkout) | `resolveBankTransferDetails`, `resolvePublicCheckoutBaseUrl` | **env, not tables** (see correction) |

Deployment-internal consumers (stay in the deployment regardless): `contract-document-variables.ts`, `payment-link-runtime.ts`, `catalog-checkout-options.ts`, `booking-schedule.ts`, and the environment/database/storage adapter in `runtime/smartbill-subscriber-runtime.ts`. SmartBill event declarations and registration are package-owned.

## Correction to the classification doc

The doc lists "bank-transfer config" and (implicitly) the checkout base URL among the settings readers that would collapse. **They are env-driven, not settings-table-driven:**

- `resolveBankTransferDetails(bindings)` and `resolvePublicCheckoutBaseUrlFromBindings(bindings)` (`runtime/payment-config.ts`) read **environment bindings only**; the settings tables are a *fallback* composed by a separate helper (`bankTransferDetailsFromOperatorSettings`).

So these two values **stay deployment-injected** (they're env/config, correctly deployment-owned). The genuine collapse is the **profile / payment-instructions / payment-defaults / tax-settings** readers — still a meaningful set (legal, proposals, commerce, finance), but four env-shaped fields don't move.

## Migration impact — lower-risk than flagged

The RFC and my prior note worried that moving the schema deployment→package entangles with the unbuilt migration-ownership work (Workstream D). It does **not**, because the mechanism already exists:

- `voyant.config.ts` **`additionalSchemas`** already lists *package-owned, migrated-but-not-mounted* schemas (`accommodations`, `charters`, `cruises`). Their tables are folded into the deployment's **single combined migration history** exactly as today.
- A `@voyant-travel/operator-settings` package exporting its schema would simply move from `schemas: ["./src/db/schema.ts"]` to `additionalSchemas: […, "@voyant-travel/operator-settings"]`. Schema *definition* ownership moves to the package; **migration history ownership stays with the deployment's combined folder** (the #1608 single-history model is untouched).
- **Data stays per-deployment.** Only the schema + reader/writer *logic* is generalized — every operator deployment already has its own profile/payment/tax rows. This is no different from `bookings` (package owns the schema; each deployment owns its data).

The honest residual: the existing migrations (`0019/0020/0034`) were generated against the starter-local schema. Moving the schema must produce an **identical** generated DDL (same table/column/typeid shape) so no new migration is emitted — verified by the drift check (`voyant db schemas` parity) before merge. TypeID prefixes (`opst/oppf/opin/opdp/btxs`) are preserved verbatim.

## Proposed shape — two stages

### Stage 1 (recommended first) — schema + readers package, deployment still wires
`@voyant-travel/operator-settings` owns:
- the 5 table schemas (verbatim, same prefixes),
- the reader/writer functions (`getOperatorProfile`, `resolveBookingTaxSettings`, `updateBookingTaxSettings`, `resolveOperatorDefaultPaymentPolicy`, the upserts, the public DTO mappers),
- the Zod input schemas + `PublicOperatorProfile` type.

The deployment:
- lists it in `additionalSchemas` (schema-only; routes not yet a package module),
- imports the readers and **still injects them** into `buildOperatorProviders()` and the cross-module runtime wiring (legal/proposals/etc.) — but now from the package instead of `./routes/settings`.

**Win:** the reader *implementations* + schema are package-owned and versioned with the framework; the deployment's `./routes/settings.ts` shrinks to route handlers over package readers. **Low risk:** no composition/registry change, drift-checkable.

### Stage 2 (optional) — settings becomes a standard module, wired at the framework layer
Promote `mountOperatorSettingsRoutes` to a package `ApiModule` (`@voyant-travel/operator-settings` with `adminRoutes`/`publicRoutes`), move it from `additionalSchemas` to `modules`, and declare its runtime factory in the package manifest. Then:
- `operator/operator-settings` leaves `deploymentLocalModules` (only `invitations` remains there),
- the booking-tax extension + the legal/proposals/commerce settings readers **default to package-owned readers through typed runtime ports** — so the per-deployment injection of `resolveBookingTaxSettings` / `updateBookingTaxSettings` / `resolveOperatorProfile` / `resolveOperatorPaymentInstructions` goes away. The deployment overrides only values/policy, not the wiring.

**Crucially, no leaf module depends on another leaf module.** The consuming factories (`legal`, `proposals`, `commerce`, `finance`) keep their existing **structural** reader option types and import nothing from `operator-settings`. Package manifests declare the required typed ports, and the deployment graph supplies their host implementations. See open question 2 for why this beats a direct dependency or a shared `*-contracts` package.

**Win:** collapses the injection the classification doc targeted; the deployment's local-module set drops to one (`invitations`). **Risk:** the framework package gains a (legitimate, BOM-level) dependency on `operator-settings`, and it commits the settings *routes* to a fixed standard surface — a real API commitment. Worth its own slice once Stage 1 lands.

## Open questions

1. **Package vs. naming.** `@voyant-travel/operator-settings` keeps the `operator` name (it's the operator-profile/settings domain), or rename to `@voyant-travel/tenant-settings` / `@voyant-travel/organization-profile` to shed the deployment-name connotation? (The tables are operator-tenant identity + payment + tax config — generic to any deployment.)
2. **Stage-2 cross-module coupling — DECIDED: neither a direct dependency nor a shared `*-contracts` package; wire at the framework layer.** The framing assumed legal/proposals/commerce must *reference* `operator-settings` somehow. They shouldn't — and structural typing already makes that unnecessary:
   - Each consumer already declares the **shape** of the reader it needs as a ApiModule option (`resolveOperatorProfile?: (db) => …`, `resolveBookingTaxSettings?: (db) => …`). `operator-settings`' reader only has to be *assignable* to that shape. That structural seam is the decoupling — the same one the whole module-decoupling effort (≈85 cross-package `.references()` removed → plain `text()` columns) and all of Workstream B already rely on.
   - A `@voyant-travel/operator-settings-contracts` package would be over-engineering: a contract package earns its keep only when *multiple producers and consumers* must agree on a nominal type neither owns. Here each consumer owns its own minimal structural option type and there's effectively one producer. The contracts package adds a package + version + release-cadence entry to express a coupling that `(db) => Promise<Profile>` already expresses — and subtly re-couples the consumers to the contract's version.
   - **The wiring lives in typed ports selected by the graph, not in consumers.** The generated runtime connects package factories to deployment-owned implementations without a central package-id registry, so **no leaf module depends on another leaf module**.
   - If a dependency were ever unavoidable, contracts-type beats direct (depend on the type, dodge the runtime/schema pull-in + cycle risk) — but it's avoidable, so don't introduce one.
3. **Env-shaped values stay put** — confirm `resolveBankTransferDetails` + `resolvePublicCheckoutBaseUrl` remain deployment-injected runtime-port values (they read env, with settings tables only as fallback). This note assumes yes.
4. **`operator_settings` legacy table** (`opst`) — carry it into the package read-only (migration parity) or leave it behind as a deployment-local vestige? Leaving it behind risks a drift-check mismatch; carrying it keeps parity.

## Recommendation

Proceed with **Stage 1** (schema + readers package via `additionalSchemas`) as a self-contained, drift-checked slice — it captures most of the ownership win at low risk and is reversible. Open question 2 (the cross-module seam) is now **decided** — use package-declared typed ports, no inter-module dependency, no contracts package — so **Stage 2** (standard module + injection removal) is no longer gated on a coupling decision. Neither stage requires Workstream D; both keep the single combined migration history and per-deployment data.
