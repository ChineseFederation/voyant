# ADR: Unify custom fields — database definitions and values on the entity

[`remote-app-platform-rfc.md`](./remote-app-platform-rfc.md) extends this
decision with database-only authority, operator/app ownership, and
collision-proof namespaces.

- **Status:** Accepted and implemented
- **Date:** 2026-06-17
- **Supersedes:** the split between `@voyant-travel/core/custom-fields` (registry + `custom_fields` jsonb column, adopted on `booking`) and the relationships EAV custom-fields system (`custom_field_definitions` + `custom_field_values`).
- **Context:** consolidated-deployments RFC — "custom fields without forking" (the 20%).

## Context — two systems collided

Voyant grew **two** custom-field mechanisms with the same name and overlapping purpose:

1. **Registry + jsonb column** (`@voyant-travel/core/custom-fields`, on `booking`).
   - Definitions were historically declared in code (`src/custom-fields/*`,
     build-time discovery); that source is now retired from runtime authority.
   - Values in a **`custom_fields` jsonb column on the entity row**.
   - Typed validation, per-channel **visibility** (export/invoice/search), PII flags.
   - ✅ Reader-visible (export/invoice/search read the row), typed, upgrade-safe.
   - ❌ Adding a field needs a code change + deploy. 5 scalar types only.

2. **EAV side tables** (relationships: `custom_field_definitions` + `custom_field_values`).
   - Definitions **created at runtime** by an admin (CRUD API + UI), keyed by
     `entityType ∈ {organization, person, proposal, activity}`.
   - Values in a **`custom_field_values` side table** (one row per field/entity,
     typed value columns).
   - Rich type system: `varchar, text, double, monetary, date, boolean, enum,
     set, json, address, phone, …`; `isRequired`, `isSearchable`, `options`.
   - ✅ Runtime field creation (no deploy), mature type set + admin UI.
   - ❌ Values live in a **side table that export / invoicing / search don't
     see** — the exact failure mode the RFC set out to kill.

Each picked the wrong trade-off on one of **two independent axes**:

| Axis | Registry | EAV | **Unified choice** |
| --- | --- | --- | --- |
| **Value storage** | jsonb on entity ✅ | side table ❌ | **jsonb on entity** |
| **Definition source** | code only ❌ | runtime DB ✅ | **runtime DB only** |

## Decision

**One custom-field system. Definitions come exclusively from the runtime
`custom_field_definitions` table; values live in a `custom_fields` jsonb column
on the entity. `custom_field_values` is retired.**

1. **Single value store — `custom_fields jsonb` on the entity** (`{}` default),
   exactly as `booking` already has. Readers (export/invoice/search) consult the
   registry + read the column — no joins, nothing invisible.
2. **One definition source behind `CustomFieldRegistry`.**
   - Runtime DB: `custom_field_definitions` rows (operator-created at runtime via
     the generic `@voyant-travel/custom-fields` Settings CRUD + UI).
   - `loadCustomFieldRegistry(db)` reads and maps persisted definitions on each
     request. Project-local declarations, discovery globs, and code/database
     merge helpers do not exist.
3. **The registry is resolved per request** through the typed
   `custom-fields.runtime` graph port. The provider reads persisted definitions;
   Bookings, Relationships, and Finance consume the same runtime without host
   configuration or project-local declarations.
4. **Canonical type model = the EAV superset.** `core`'s `CustomFieldType` grows
   to cover the runtime types: `text` (`varchar`/`text`), `number` (`double`),
   `monetary` (`{ amountCents, currency }`), `date`, `boolean`, `select`
   (`enum`), `multiselect` (`set`), `json`, with `address`/`phone` validated as
   structured `json` for now (dedicated validators are a follow-up).
   `validateCustomFields` gains the new cases. EAV → registry type map is fixed
   in the loader.
5. **Visibility.** `is_searchable`, `is_exportable`, and `is_invoiceable` map
   directly onto registry visibility (admin-editable; defaults
   `export=true`, `invoice=false`, `search=false`).
6. **Definition ownership and namespaces.** Definitions now persist a physical
   namespace, owner kind/id, lifecycle, and provenance. Uniqueness is
   `(entity_type, namespace, key)`. Because definitions had no production
   adoption, the migration discards pre-cutline rows instead of assigning
   unverifiable ownership. Settings shows app-owned rows but can mutate only
   operator rows.
7. **Namespaced entity values.** Every supported entity stores values as
   `custom_fields[namespace][key]`. Active definitions from every owner enter
   the runtime registry. Ordinary operator routes accept only `custom`, while
   trusted owner-scoped value operations derive app/platform namespaces from
   server context. Definition rename/delete side effects are delegated to the
   package that owns the target table.
8. **Generic value API ownership.** The generic custom-fields module owns the
   canonical definition and value routes. Entity-owning packages contribute
   typed list/upsert/delete operations through the selected deployment graph;
   Relationships has no forwarding route or service adapter.

## Migration

1. Add `custom_fields jsonb default '{}'` to `people`, `organizations`, and the
   other EAV entities (`proposals`, `activities`). (Schema + framework bundle.)
2. **Repoint the generic value API** to read and write the entity's
   `custom_fields[namespace][key]` value.
3. **Retire `custom_field_values` directly.** Custom fields had no production
   adoption, so the cutline intentionally has no EAV backfill, compatibility
   reader, or transitional adapter. `custom_field_definitions` stays.
4. **Wrap pre-cutline entity JSON under `custom`.** The owning Bookings, Proposals,
   and Relationships packages each migrate only their own tables. Custom fields
   had no production adoption at this cutline, so this is a one-way migration
   with no flat compatibility reader or telemetry seam.

## Phases (each its own PR)

1. **Type model + registry projection (no storage change). ✅ landed.**
   - 1a — `core`'s `CustomFieldType` superset (`multiselect`/`monetary`/`json`) +
     `validateCustomFields`.
   - 1b — `loadCustomFieldDefinitions(db)` in relationships (DB→registry mapping);
     `customFields` injection becomes a per-request `CustomFieldRegistryResolver`
     backed exclusively by the database; `booking` moved onto it. Pure addition;
     nothing migrated yet.
2. **Columns + write/read on person/organization. ✅ landed.** `custom_fields`
   jsonb column on `people`/`organizations` (framework bundle `0002`); the
   accounts route validates person/org writes against the resolved registry
   (`validateRelationshipsCustomFields`); reads return the column. The
   relationships factory moved Tier 1 → 2 to receive `capabilities.customFields`.
3. **Repoint the generic value API. ✅ landed.**
   - 3a — `custom_fields` column on `proposals` + `activities` (bundle `0003`).
   - 3b — the generic custom-fields package owns list/upsert/delete orchestration
     and namespace-bearing synthetic ids; entity packages contribute only their
     own table operations.
4. **Retire `custom_field_values`** + export/invoice/search consume
   `customFieldsVisibleIn`.
   - 4a — the unused table is removed directly, with no backfill or compatibility
     fallback. ✅ landed.
   - 4b — readers consume `customFieldsVisibleIn`.
     - **Export ✅** — the people CSV export appends a column per export-visible
       custom field (`exportPeopleCsv` + `resolveVisibleCustomFields`).
     - **Search ✅** — the people search ORs a
       `custom_fields -> namespace ->> key ILIKE term` condition per
       search-visible field.
     - **Invoice ✅ (seam)** — `InvoiceDocumentRuntimeOptions.resolveCustomFields`
       populates a `customFields` template variable. Finance just exposes the
       hook (decoupled from `relationships`); the deployment wires the resolver
       where it builds the invoice-generation runtime (it holds the registry +
       reads the entity's `custom_fields`) and the template references
       `{{customFields.<namespace>.<key>}}`.
5. **Namespaced values + owner isolation. ✅ landed.**
   - Entity schemas, contracts, write validation, value APIs, search, export,
     and invoice resolution use the nested value shape only.
   - Synthetic value ids include namespace identity.
   - Same-key values in two namespaces round-trip independently.
   - Package-owned lifecycle providers perform namespace-scoped definition
     rename/delete cleanup.
6. **Retire local authoring and compatibility seams. ✅ landed.**
   - Removed project-local TypeScript declarations, discovery globs, executable
     validation callbacks, and code/database merge precedence.
   - Moved value routes and orchestration from Relationships to the generic
     custom-fields package.
   - Added architecture checks that reject restored authoring conventions,
     Relationships adapters, and flat-value paths.

## Consequences

- One mental model, one value store, one validation + visibility path; the
  "side table the readers can't see" bug is gone by construction.
- Runtime field creation is preserved (its only real advantage over the
  registry); standard fields ship in code, operator fields are added live.
- Cost: a data migration + retiring a table + a richer core type model, staged
  so each phase is independently shippable and oracle-verified.

## Alternatives rejected

- **Keep both.** Two value stores per entity, double the write/validate/read
  paths, EAV values stay invisible to readers — ships the bug.
- **Pure EAV (drop the registry).** Loses typed build-time validation,
  visibility, upgrade-safety, and reader-visible values; keeps the side table
  that is the actual problem.
