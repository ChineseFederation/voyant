# Schema discipline

This document captures the rules that govern Voyant's per-module schemas.

Modules are **components of one resident deployable**
([ADR-0016](../adr/0016-modules-as-components-of-one-deployable.md)), not
independently installable units. The rules below follow from that; an earlier
revision of this document assumed the opposite and is corrected here.

## The FK rule

> **A foreign key across a package boundary is allowed exactly when the source
> package declares the target in `voyant.requiresSchemas`.**

Concretely:

- Same package: use `.references(() => other.id, { onDelete: ... })`. Nothing
  else to do.
- Different package, requirement declared: use `.references()` and **document
  why in a comment at the column**.
- Different package, requirement not declared: either declare it, or keep a
  loose `typeIdRef("foo_id")` column with an index and no constraint.

Enforced by `pnpm verify:cross-package-fk`.

### Why this, and not "no cross-package FKs"

This document previously read *"cross-domain FKs MUST go through a link table"*,
justified as:

> a consumer who installs a vertical source package but not the target module
> that owns the referenced table cannot create that foreign-key constraint.

**That consumer no longer exists.** ADR-0016 removed module subsetting —
`exclude` is not a member of `CreateVoyantAppConfig`, the graph is resolved once
at build time, and every deployment gets the whole graph. There is no
configuration in which `operations` is installed without `identity`.

What a cross-package FK genuinely needs is that the referenced table exists by
the time the referencing migration runs. That is precisely what
`voyant.requiresSchemas` declares: `framework-migrations/src/discover.ts`
topologically sorts migration sources deps-first over those edges, with a cycle
guard. A declared requirement *is* the ordering guarantee, so an FK backed by
one is safe and an FK without one is not.

Dropping a constraint is not free, either. `identity_addresses` has no
`deletedAt` and is hard-deleted by `deleteAddress`
(`packages/identity/src/service.ts`), so the `onDelete: "set null"` on the
ground transfer columns is what stops those columns holding a dangling id.
Converting that FK to a loose column would trade a real integrity guarantee for
a boundary that ADR-0016 says is not load-bearing.

### When you're adding a column

1. Is the target table in the same package? → `.references()`. Done.
2. Is it in another package your package already declares in
   `voyant.requiresSchemas`? → `.references()` is allowed. Add a comment at the
   column saying why the constraint is wanted (integrity, cascade, ordering).
3. Is it in another package you do *not* declare? → either add the
   `requiresSchemas` entry deliberately — it changes migration ordering — or use
   a loose `typeIdRef("foo_id")` column with an index.
4. Is the association many-to-many, or owned by the deployment rather than by
   either module? → use a link (below).

## Associations: three mechanisms, and which is actually used

Cross-module association is carried by three mechanisms of very different
weight. Measured across `packages/*`:

| Mechanism | Count | Integrity |
|---|---|---|
| Loose `typeIdRef()` id column | ~513 | none |
| Cross-package FK (rule above) | 6 | real constraint + cascade |
| `defineLink` pivot | 21 | pivot table, optional `deleteCascade` |

**The loose id column is the norm, not the exception.** That is a deliberate
consequence of ADR-0016 — one deployable, one schema — and this document does
not ask for it to change. It is recorded here because a reader who follows only
the FK section will otherwise assume constraints are the default, and they are
not. What you give up is referential integrity, cascade, and any database-level
signal when the target row disappears; if a dangling id would be a correctness
bug rather than a blank field, reach for a constraint or handle the deletion
explicitly.

### Links are package-owned, not deployment-owned

A link materialises a pivot table for an association neither side owns —
typically many-to-many.

- Each side exports a `LinkableDefinition` (e.g. `personLinkable`,
  `productLinkable`) from its `linkables.ts`.
- The **owning module** declares the link in its own `src/standard-links.ts`
  and admits it through its `voyant.ts` graph manifest as a
  `source: "@voyant-travel/<pkg>/standard-links"` contribution.
- `voyant migrate` loads the graph-selected registry after schema migrations
  and materialises every writable pivot.

All 21 links live this way, in `legal` (7), `mice` (8), `accommodations` (3),
`inventory` (2) and `auth` (1). `packages/legal/src/standard-links.ts` is the
worked example.

A deployment *may* also declare its own links in `apps/<name>/src/links/`, and
the compiler emits `.voyant/runtime/project-links.generated.ts` for them. **No
first-party module uses that path** — `apps/operator/src/links/` contains only a
README. Treat it as the escape hatch for a deployment-specific association, not
as the normal way to add a link, and follow `standard-links.ts` instead.

`voyant db sync-links` is an explicit inspection and emission tool, not a
required deployment step.

## Cross-package FK audit (2026-08-05)

Produced by `pnpm verify:cross-package-fk`, which resolves each
`.references(() => X.id)` through the file's **value** imports (`import type` is
erased and creates no constraint) and checks the owning package's
`voyant.requiresSchemas`.

| Source | Target | Sites | `requiresSchemas` | Status |
|---|---|---|---|---|
| `operations` | `identity` (`identity_addresses`) | 5 | declared | **Allowed** — `set null` against a hard-deleted table |
| `accommodations` | `bookings` (`booking_items`) | 1 | declared | **Allowed** — required vertical extension, `cascade` |

The rows resolved in #1790 — `ground`/`accommodations`/`suppliers` into
`places` — remain loose ids with indexes and no longer appear.

Foundation packages (`db`, `schema-kit`, `core`, `types`, `utils`) are exempt:
every module may reference them without declaring a requirement.

## Soft-delete discipline

Tables that declare `deletedAt` are filtered automatically by
`createCrudService(...)`'s `list` / `count` / `listAndCount` / `retrieve`
methods. The default is "active rows only"; pass `includeDeleted: true`
to opt back in (admin recycle bins, audit reports, reconciliation jobs).

For ad-hoc queries that don't go through `createCrudService`, compose
`whereActive(table)` from `@voyant-travel/db/lifecycle` into the WHERE clause:

```ts
import { and, eq } from "drizzle-orm"
import { whereActive } from "@voyant-travel/db/lifecycle"

await db
  .select()
  .from(bookings)
  .where(and(eq(bookings.organizationId, orgId), whereActive(bookings)))
```

`whereActive(table)` returns `undefined` for tables without `deletedAt`,
so `and(other, undefined)` collapses cleanly — the helper is safe to
apply unconditionally.

`hasSoftDelete(table)` is exported alongside for code paths that need to
branch on whether soft-delete applies (e.g. when generating dynamic
clauses).

## Migration generation & ordering

A deployment's schema migration plan is **derived from package manifests
selected by `voyant.config.ts`**, not hand-listed in starter config. Package
schema and migration facets plus transitive schema requirements are resolved
into disposable `.voyant/` graph artifacts.

Rules:

- **Never copy package schemas or migrations into a starter.** Select the owning
  module/plugin in `voyant.config.ts`; the graph migration plan consumes its
  published migration history.
- **Local modules own their migration history beside their schema.** Keep
  `src/modules/<name>/schema.ts`, its Drizzle config, and
  `src/modules/<name>/migrations/` together. Generate SQL with Drizzle Kit
  directly and declare that module-scoped folder as a deployment migration
  source. Do not collapse local module histories into a root aggregate folder.
- **Reusable modules and plugins ship migrations.** Their package manifest
  declares the package-owned migration facet, and the published tarball contains
  the SQL and journal. A consuming application neither regenerates nor copies it.
- **Generation and application are separate.** ORM tooling such as Drizzle Kit
  generates committed migrations. `voyant migrate` only applies the admitted,
  immutable graph plan; it never generates SQL during deployment.
- **New Drizzle migrations use timestamp prefixes.** Pass `--prefix timestamp`
  when invoking Drizzle Kit directly, so concurrently-authored migrations never
  collide on a sequential index. The pre-existing sequential migrations stay
  as-is.
- **Pre-existing duplicate prefixes are baselined**, not rewritten, in
  `migrations/duplicate-prefixes.baseline.json`. `voyant db doctor` fails only
  on *new* (un-baselined) collisions.
- **Cross-module link tables are owned by the package declaring the link.** Its
  append-only migration must safely adopt an object created by the retired
  deployment migration history.
- **`voyant db doctor --fail-on-drift` gates CI** — it cross-checks manifest
  resolvability, schema parity, generated-manifest freshness, duplicate prefixes
  (vs the baseline), and that every link table is in the latest snapshot.

### Source order between independent packages is not a contract

Migration sources apply deps-first over `voyant.requiresSchemas`. Sources with
**no declared edge between them** are ordered by an arbitrary tie-break, and that
tie-break is not stable — it changes when a package is added, renamed, or
absorbed into another.

So a migration that reads another package's table must not rely on that package
having run. Two rules follow:

- **Declare the dependency** in `requiresSchemas` when your schema genuinely
  needs another package's tables to exist first. That is what orders the plan.
- **Guard on the column, not the table**, when you cannot declare it — for
  example when the target sits outside your package's allowed dependency set.
  The frozen framework bundle materialises many tables *without* the columns
  later increments add, so `to_regclass('public.x') IS NOT NULL` is not evidence
  that `x.some_column` exists.

PL/pgSQL parses a statement only when its branch is reached, so an unreached arm
may safely reference a column that does not exist. That is what makes a
column-existence branch work where a single static statement would fail.

`verify:migration-replay-parity` replays the upgrade path a second time against a
**different valid topological order**, with the tie-break between independent
sources reversed. A migration that depends on an undeclared ordering fails there
immediately, rather than the next time someone moves a package. See
[#4279](https://github.com/voyant-travel/voyant/issues/4279), which was latent on
`main` for exactly as long as `availability` happened to sort before `catalog`.

Generated project artifacts live only under `.voyant/` and are disposable.
