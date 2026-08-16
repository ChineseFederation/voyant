# Voyant Extensibility Gap Analysis

This document originally tracked the active cleanup backlog needed to make the
codebase match the extensibility rubric. That cleanup is now complete on
`main`.

For the umbrella principles, see
[Voyant Extensibility Rubric](./extensibility-rubric.md).

## Current State

Voyant is aligned with the intended architecture:

- package docs and exports use the module/provider/extension/plugin vocabulary
  consistently enough to describe real runtime roles
- major runtime seams are explicit and routed through shared bootstrap,
  auth, validation, and error boundaries
- admin composition flows through the shared admin runtime and typed extension
  helpers instead of ad hoc shell patching
- public/storefront capabilities sit under the shared `/v1/public/*` HTTP
  boundary instead of drifting into starter-local namespaces
- document and attachment delivery resolve from storage keys and explicit
  download resolvers instead of broad persisted signed-URL compatibility
  assumptions
- notification delivery still converges on the shared notification send
  surface, with attachments resolved at send time
- workflow, schedule, and daemon responsibilities follow the documented
  execution split

## Resolved Alignment Areas

### 1. Package Taxonomy Adoption

The remaining plugin/provider vocabulary drift has been cleaned up in package
READMEs and exports. Packages that ship installable bundles still describe
their adapter, subscriber, or extension role first, with plugin bundles framed
as optional distribution helpers.

### 2. Runtime Seam Hardening

Shared auth, validation, and route helpers now cover the production route
surfaces. Runtime options that need bootstrap-time assembly are resolved
through the documented package bootstraps instead of lazy route-local
construction where a shared seam already exists.

### 3. Admin Surface Adoption

The operator starter now composes admin contributions through the shared admin
runtime helpers rather than treating the extension registry as a template-only
concept. Templates still own the final shell, but the extension seam is now
explicitly framework-level.

### 4. Storefront/Public Contract Adoption

Customer-facing contract and preflight routes now sit under `/v1/public/*`,
including the remaining customer-portal and checkout surfaces that previously
used legacy non-public paths. Shared client packages consume those public
routes directly, reducing starter-local compatibility glue.

### 5. Storage And Document Access Adoption

Document delivery now prefers durable `storageKey` resolution with a narrow
explicit fallback (`metadata.url`) instead of broad compatibility scans across
legacy signed/public/download URL variants. Public routes and notification
flows resolve document access through typed runtime hooks instead of assuming
persisted signed URLs are the source of truth.

### 6. Notification Surface Adoption

Notification wrappers still sit on top of one canonical send surface, and
booking document attachments resolve at send time through the shared
notification runtime. Sensitive file access is no longer modeled as a stored
URL compatibility problem.

### 7. Execution Model Adoption

The codebase now follows the documented split:

- workflows coordinate business processes
- schedules trigger work
- daemons own long-running technical processing

This cleanup did not need additional execution-model refactors beyond the
existing documented/runtime alignment.

## Recommended Follow-on Work

The extensibility cleanup backlog is closed. New work should be tracked as
feature roadmap or expansion work, not as rubric-alignment debt.

Use these docs for future changes:

- [Voyant Admin Architecture](./admin-architecture.md)
- [Voyant Storefront And Public Contract Architecture](./public-api-architecture.md)
- [Voyant Storage Architecture](./storage-architecture.md)
- [Voyant Notifications Architecture](./notifications-architecture.md)
- [Voyant Execution Architecture](./execution-architecture.md)
- [Voyant Platform Surface Roadmap](./platform-surface-roadmap.md)

## Definition Of Success

The original cleanup is complete when:

- the codebase and package docs use the same vocabulary as the rubric
- major runtime seams are explicit and consistent
- admin and storefront/public surfaces feel like deliberate framework layers
- storage, notifications, auth, and execution concerns follow their documented
  contracts in code
- downstream apps need less compatibility glue to consume Voyant cleanly

Voyant now meets that bar on `main`.
