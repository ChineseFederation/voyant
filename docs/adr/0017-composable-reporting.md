# ADR-0017: Reporting is composed from semantic datasets and grid widgets

- **Status:** Accepted (2026-07-18)
- **Relates to:** [ADR-0002](./0002-contract-packages.md),
  [ADR-0007](./0007-module-subsetting-and-capability-ports.md),
  [schema discipline](../architecture/schema-discipline.md), and
  [unified deployment graph](../architecture/unified-deployment-graph.md)

## Context

Voyant modules expose useful operational lists and aggregates, but operators
cannot compose those facts into saved cross-module reports. Project-specific
report routes fill the gap today, which duplicates domain semantics and makes a
country- or customer-shaped implementation look like a platform abstraction.

Reporting tools also need two different kinds of extension. Package authors need
to publish stable datasets and useful preset widgets, while operators need to
arrange those widgets, create bounded custom queries, and preserve their work
across sessions. Treating either use case as arbitrary SQL or arbitrary React
code would bypass package ownership, access policy, and deployment composition.

## Decision

1. A package may declare a Reporting facet in its Voyant module manifest. The
   facet contributes versioned semantic datasets, preset widget definitions, and
   full-page report templates. A template may require datasets contributed by
   several selected modules.
2. Dataset owners define dimensions, measures, permissions, sensitivity, time
   and currency semantics, and a bounded runtime executor. Reporting never
   imports another module's database schema and never invents domain measures.
3. Custom widget queries target one named dataset and compile to a validated,
   versioned query AST. V1 supports selection, filters, parameters, grouping,
   time buckets, ordering, and limits. It does
   not support raw SQL, arbitrary code, mutations, free-form joins, or network
   access.
4. A report is a persisted customer-owned composition. Starting from a template
   creates a local snapshot; later package or gallery updates do not overwrite
   operator changes. Mutable drafts autosave with optimistic concurrency, while
   published versions and execution runs are immutable. Publishing materializes
   every preset into an embedded widget definition and pins its dataset version;
   packages must retain any published dataset runtime version while saved report
   versions still depend on it.
5. Report layouts use library-neutral grid coordinates, not pixels. The
   canonical editor is a compacting, non-overlapping 12-column grid with widget
   minimum sizes. Narrow layouts are derived deterministically unless a future
   decision adds separately editable breakpoints.
6. View mode renders available widgets without editing affordances. Edit mode
   permits adding, configuring, moving, resizing, and removing widgets. A widget
   whose contributed definition is unavailable is omitted in view mode and is
   represented by a removable placeholder in edit mode so a temporarily missing
   module does not make the saved report unusable.
7. A report draft contains at most 50 widgets. Dataset definitions impose row
   limits, database clients impose statement timeouts, request cancellation is
   propagated, and an interactive report run has a 60-second cooperative
   deadline. Moving execution to a durable background workflow is a future
   extension, not part of the initial synchronous API.
8. Exact statutory layouts, jurisdiction-specific filing workflows, and bespoke
   validation remain custom application or plugin concerns. Those consumers may
   reuse the same datasets and query contracts.

## Consequences

- Selecting a module can add reporting capabilities without adding a dependency
  from Reporting to that module.
- A page can combine widgets from several datasets even though each custom
  widget query remains single-dataset in V1. A genuinely cross-domain metric is
  published as an explicitly owned composed dataset instead of an ad hoc join.
- Preset widgets and templates remain declarative and portable. Specialized
  React renderers are application extensions, not portable report templates.
- Saved report drafts need revision-aware persistence and must retain unresolved
  widget references without rendering them to viewers.
- The grid implementation is hidden behind a Voyant-owned layout contract so
  replacing its React library does not require migrating stored reports.
- Reporting access and export audit policy are distinct from source-module read
  access; dataset executors must enforce both layers.

## Alternatives considered

### Arbitrary SQL and code-backed widgets

Rejected. They expose storage internals, make templates deployment-specific,
and create an unsafe execution and authorization surface.

### A free-form pixel canvas

Rejected. Pixel coordinates produce fragile layouts, poor responsive behavior,
and inconsistent exports. Grid coordinates preserve alignment and predictable
reflow.

### A universal fixed-form document designer

Rejected. Reproducing every statutory or customer-specific artifact would force
jurisdictional workflow and layout concepts into the generic module. The shared
query and composition primitives intentionally provide an escape hatch for
custom applications instead.
