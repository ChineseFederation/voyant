# Voyant Extensibility Rubric

This document defines how Voyant should scale its architecture and
extensibility without collapsing into a generic plugin platform.

The goal is not to make every part of the framework swappable. The goal is to
ship a coherent shared language for travel software that gets most teams most
of the way there, while making the real variance points explicit and safe to
customize.

For the current implementation backlog relative to this rubric, see
[Voyant Extensibility Gap Analysis](./extensibility-gap-analysis.md).

## Product Position

Voyant should ship:

- domain primitives
- reusable modules
- orchestration layers for cross-module flows
- shared runtime packages
- source-installable UI blocks
- starters
- explicit extension seams

Voyant should not try to ship:

- a generic runtime where every concern is dynamically pluggable
- abstractions for variance that does not happen often in real travel products
- a lowest-common-denominator platform that is technically flexible but hard to
  understand or build with

The promise to developers should be:

- strong defaults
- a common domain language
- clear override points
- local ownership of the last 20%

## Core Principle

Build a framework with strong defaults and narrow escape hatches.

Do not optimize for “everything is replaceable”.

Optimize for:

- composability
- clarity
- explicit contracts
- package-level reuse
- local customization where businesses actually differ

## Simplicity Bias

Voyant should prefer the simplest architecture that preserves clarity,
composability, and long-term maintainability.

In practice, that means:

- use the fewest framework primitives necessary
- prefer explicit module, provider, workflow, route, and UI-block patterns over
  meta-abstractions
- keep app-owned code local when a concern is not yet stable enough to
  standardize
- introduce a new framework primitive only when the same pattern is clearly
  repeating and the abstraction reduces total complexity

Rule:

If a problem can be solved cleanly with an existing module, provider,
extension, workflow, route, or block, do that first.

## Layer Model

Voyant should be understood as a small set of layers with different
responsibilities.

### Core

Core defines the framework language and composition model.

Core owns:

- module and extension contracts
- event bus contracts
- link/query primitives
- app/workflow-time container and runtime composition primitives
- transport-agnostic types and conventions

Core should not own travel-specific business workflows or app-level UX
decisions.

### Modules

Modules are first-class bounded capabilities.

Voyant should distinguish between:

- travel/domain modules
- infrastructure modules

Modules own:

- canonical data model for their domain
- domain services and state transitions
- typed route/service surfaces
- events emitted by that domain

Travel modules define Voyant’s travel language.
Infrastructure modules provide reusable technical capabilities used by travel
modules, workflows, and apps.

### Workflows And Orchestration

Workflows coordinate business operations that span multiple modules or require
step-by-step execution, retries, approvals, or asynchronous side effects.

This layer sits above modules rather than inside them.

Workflows own:

- cross-module coordination
- retries, compensation, and failure handling
- approvals and human-in-the-loop steps
- scheduling and automation that orchestrate module services

### Providers And Adapters

Providers are the main swap point.

Providers and adapters connect Voyant to external systems through narrow,
explicit seams.

They own:

- provider-specific API calls
- request/response mapping
- provider auth/config
- provider capability declarations

They should not redefine the core domain.

### Extensions

Extensions attach custom logic to an existing Voyant module without forcing the
framework to absorb that logic as a first-class module.

They own:

- extra hooks on existing lifecycle events
- route additions scoped to an existing module
- synchronization logic for external systems
- extra policy or orchestration layered on top of a module

### Plugins

Plugins are a packaging concept, not the default extensibility primitive.

Use a plugin when the problem is package distribution of multiple framework
contributions together. Do not use a plugin when a typed adapter contract is
sufficient.

## Supported Surface Guides

The focused guides below define the concrete rules for each major framework
surface:

- [Voyant Data Model And Schema Authoring](./data-model-schema-authoring.md)
- [Voyant API Route Authoring](./api-route-authoring.md)
- [Voyant Module, Provider, Extension, And Plugin Taxonomy](./module-provider-plugin-taxonomy.md)
- [Voyant Execution Architecture](./execution-architecture.md)
- [Voyant Caching Architecture](./caching-architecture.md)
- [Voyant Storage Architecture](./storage-architecture.md)
- [Voyant Notifications Architecture](./notifications-architecture.md)
- [Voyant Auth And Identity Architecture](./auth-identity-architecture.md)
- [Voyant Admin Architecture](./admin-architecture.md)
- [Voyant Storefront And Public Contract Architecture](./public-api-architecture.md)
- [Voyant Future Architecture Considerations](./future-architecture-considerations.md)

## Summary Rules

Voyant should bias toward:

- modules over meta-frameworks
- providers over generic plugins
- workflows over hidden cross-module coupling
- source-installed UI blocks over opaque theming systems
- app composition over premature standardization

The framework should feel coherent first, extensible second.
