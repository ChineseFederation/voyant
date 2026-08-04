# RFC: Retire Voyant Workflows As A Product Capability

- **Status:** Accepted
- **Audience:** framework, Operator, managed Cloud, package, and integration maintainers
- **Decision type:** public runtime, deployment, and product-surface contract

## Decision

Voyant will retire its general-purpose workflow product. It will no longer
provide a customer-authored workflow SDK, a self-hosted orchestration engine,
a hosted workflow runner, workflow release management, or a workflow-runs
admin product.

This is not a decision to stop running background work required by Voyant.
Subscribers and jobs are ordinary parts of the product runtime, independent of
the workflow product. A selected module may contribute package-owned jobs that
are required for that module to function. Managed Cloud and the standard
self-hosted Operator run the jobs selected by the resolved product by default.

Customer-specific automation belongs outside Voyant. Developers may use Trigger,
Cloudflare Workflows, Vercel, or another runtime of their choice; non-technical
operators may use Zapier or n8n. Voyant supports those systems through stable
events, webhooks, authenticated commands, and documented operational APIs—not
by attempting to provide a portable orchestration abstraction above them.

The governing rule is:

> If work is required for a selected Voyant product capability, its subscribers
> and jobs are part of that capability's runtime. If it is bespoke business
> automation, Voyant emits events and exposes commands for another system to
> run.

## Context

The current workflow surface is a complete product: public authoring and React
packages, a self-hosted Postgres orchestrator, a workflow-run observability
module, deployment graph/provider selection, workflow conventions, and a
managed Cloud control plane with workflow releases and hosted Node runners.

That investment is disproportionate to its customer value. Managed-runtime
clients do not use the product, and self-hosted users who need bespoke durable
automation already have strong framework and SaaS choices. Maintaining a
generic workflow layer means maintaining a competing execution model, release
format, run state machine, scheduling system, control API, dashboard, and
security surface without a clear product advantage.

At the same time, several first-party capabilities currently use workflows:

- draining the event outbox and expiring stale write intents;
- dispatching and reconciling channel pushes;
- delivering due notification reminders;
- processing promotion-boundary changes;
- reaping expired booking drafts and releasing holds;
- selected package refresh and reconciliation sweeps.

Those are not customer-authored business automations. They are part of the
standard product's operational correctness. Removing them would make managed
Cloud and self-hosted installations unreliable by default.

## Scope

### Goals

1. Remove Voyant's customer workflow authoring, execution, and observability
   product.
2. Keep required product jobs default-on in managed Cloud and the standard
   self-hosted Operator.
3. Preserve domain-specific durability, idempotency, retry, and concurrency
   guarantees without rebuilding a generic workflow engine under another name.
4. Give external automation systems a clear, secure integration contract.
5. Reduce release, runtime, security, and operational ownership in both
   repositories.

### Non-goals

- Removing the domain services that current workflows call.
- Making a managed customer depend on a separately configured scheduler for
  core product behavior.
- Building a new customer-authored job, workflow, or orchestration platform.
- Standardizing one workflow API across Trigger, Cloudflare, Vercel, n8n,
  Zapier, or other third parties.
- Removing native platform workflows that are wholly internal to an unrelated
  Cloud service, such as a data-ingestion worker. Those are evaluated by their
  owning service and are not part of the Voyant Workflows product surface.
- Promising exactly-once execution or ordered event delivery where the existing
  domain contract does not already promise it.

## Terminology

| Term | Meaning |
| --- | --- |
| **Subscriber** | Package-owned code that reacts to a domain event. A subscriber performs bounded inline work or records durable intent for a job. |
| **Job** | Package-owned background work required by a selected product capability. A job may be scheduled, wakeable, or both. |
| **Scheduled job** | A job invoked on a package-owned cadence, typically for expiry, reconciliation, or time-boundary processing. |
| **Wakeable job** | A job prompted after durable work is recorded. It also polls when necessary so a missed wakeup cannot lose work. |
| **External automation** | Customer-specific work running outside Voyant and reacting to Voyant events or issuing Voyant commands. |
| **Domain command** | An authenticated, versioned, idempotent API operation that changes or initiates Voyant domain state. |
| **Delivery intent** | Durable state owned by a domain package—for example an outbox event, channel push intent, or queued reminder—from which retries and reconciliation derive. |
| **Script** | A development, migration, or operational utility outside the product runtime. Scripts are not selected graph behavior. |

The terms *workflow*, *workflow run*, and *workflow release* are retired from
the public Voyant product vocabulary after migration.

## Architecture

### Jobs are package-owned product behavior

Selected module and plugin manifests may contribute jobs alongside their
routes, subscribers, schemas, and UI. Selecting the package through
`voyant.config.ts` brings its declared jobs with it; the application config does
not define job handlers, schedules, or arbitrary job identifiers.

Project-local `src/jobs` and `src/workflows` conventions are removed. An
application cannot add inline callbacks, source-file jobs, step graphs, child
jobs, waits, or detached runtime bundles. Customer-specific scheduled work is
external automation, not a Voyant product job.

Each job has a stable identifier, a package owner, a documented cadence or
wakeup condition, and a narrow callable implementation. The job host may
provide only:

- authenticated invocation;
- schedule registration and missed-tick recovery;
- bounded retry with backoff;
- a lease or lock preventing conflicting concurrent runs;
- structured logs, metrics, and alerts;
- a minimal operator-facing health view.

### Bounded host-resolved scheduling policy

Job ownership and cadence policy are separate concerns. A package keeps the
stable job identifier and runtime handler, and supplies a safe default schedule.
It may additionally publish named cadence profiles (for example `eager` or
`economical`) with their complete, validated schedules. A deployment may select
one published profile globally or for a specific selected job. The resolved
graph serializes the declared default, bounded profiles, required flag, and
effective schedule so Node, managed, and other hosts make the same deterministic
choice.

Deployment configuration never authors cron expressions, intervals, handlers,
payloads, or job identifiers. Unknown job IDs and profile names are graph
errors. A configuration can disable an explicitly optional job, but attempting
to disable a required job is a graph error; no scheduler choice can remove a
required production capability. When no preference is supplied, the standard
self-hosted host runs the package default unchanged.

The job host must not acquire workflow features such as arbitrary execution
payload persistence, generic user-triggered run control, step replay, pauses,
sleeps, compensation graphs, child invocation, user-defined schedules, or
detached code bundles. A request for any such feature is evidence that the work
belongs in an external automation system or needs a narrowly owned domain
design.

### Durability belongs to the domain

The job host is a delivery mechanism, not the source of truth for product work.
Domain packages retain the durable records that make a job safe to retry:

| Work | Durable source of truth | Execution policy |
| --- | --- | --- |
| Event delivery | event outbox rows and webhook delivery rows | Wake after a write and poll as a safety net; claim with a visibility lease; expose failed delivery state. |
| Channel push | channel push intent and link state | Per-channel or per-booking claiming; retry from the intent state; periodic reconciliation. |
| Notification reminders | reminder and delivery records | Sweep due records; make delivery idempotent at the record level. |
| Promotion boundaries | promotion state and product index state | Idempotent time-based sweep; reindex affected products. |
| Booking draft expiry | booking draft and hold state | Idempotent expiry sweep; release a hold before deleting the draft. |
| Availability hold expiry | `availability_holds.expires_at` | Wake at the earliest outstanding expiry and re-arm from the same column after every run; the declared cadence recovers a wake lost to a restart. |

The event outbox is particularly important: an immediate wakeup improves
latency, but a scheduled drain remains mandatory so a missed wakeup cannot lose
product work.

### Current workflow disposition

The current first-party workflow definitions move as follows:

| Current workflow | Disposition | Durable authority / note |
| --- | --- | --- |
| `infrastructure.event-outbox-drain` | Wakeable job with scheduled recovery | Event outbox, webhook delivery, and write-intent rows. |
| `channel.booking.push` | Wakeable job with scheduled recovery | Pending booking-link state; claim per booking or channel. |
| `channel.availability.push` | Wakeable job with scheduled recovery | Availability push intents. |
| `channel.content.push` | Wakeable job with scheduled recovery | Content push intents and acknowledged hashes. |
| `distribution.channel-push-reconcile-booking-links` | Scheduled job | Booking-link and channel state. |
| `distribution.channel-push-reconcile-availability` | Scheduled job | Availability and channel state. |
| `distribution.channel-push-reconcile-content` | Scheduled job | Product content and channel state. |
| `notifications.send-due-reminders` | Scheduled job | Reminder rules and reminder-run records. |
| `notifications.deliver-reminder` | Wakeable job with scheduled recovery | Reminder delivery records. |
| `commerce.process-promotion-boundaries` | Scheduled job | Promotion and product-index state. |
| `promotions.reindex-all-products` | Wakeable job with scheduled recovery | A domain-owned reindex intent or checkpoint, added before cutover. |
| `catalog.reap-expired-booking-drafts` | Scheduled job | Booking draft and hold state; reconcile ownership with stale-hold expiry before migration. |
| `bookings.expire-stale-holds` | Scheduled job | Booking hold and payment-session state; reconcile ownership with draft reaping before migration. |
| `operations.release-expired-availability-holds` | Wakeable job with scheduled recovery | `availability_holds.expires_at` is the dispatcher: it records when the work becomes due, so nothing has to poll to find it (#4067). |
| `cruises.external-catalog-refresh` | Scheduled job | Selected cruises capability state and refresh checkpoint. |
| `products.generate-pdf` | Domain command, not a job | Generate synchronously or persist a document-generation intent consumed by a package job. |

The BNR exchange-rate heartbeat currently implemented by
`@voyant-travel/module-ro-fiscal` is deleted. It monitors an external dependency
and is infrastructure observability rather than Voyant product behavior; it is
not migrated into the job host.

### Managed Cloud

Managed Cloud owns job scheduling and wakeup delivery for every managed
deployment. It invokes fixed, versioned internal job endpoints in the deployed
runtime with deployment-scoped authentication. Those endpoints compose
existing package-owned services through the normal runtime; no customer
workflow bundle, workflow manifest, or hosted Node workflow runner is involved.

Cloud must provide operational visibility for job health, last successful run,
pending work, failed delivery intents, and retry exhaustion. It does not expose
customer workflow definitions, arbitrary job payloads, or generic run
controls.

### Self-hosted Operator

The standard Operator enables the same selected job inventory by default. Its
host may run resident workers or invoke a one-shot internal job command from the
platform scheduler. The job contract and domain semantics are the same as
managed Cloud; only deployment mechanics differ.

The resident Node host performs one idempotent recovery sweep for every
scheduled job when the process starts, then follows the declared cron or
`every` cadence. This makes missed scheduler delivery recoverable without
persisting generic run state in the host. It serializes each job in-process,
uses bounded retries with backoff, and exposes only minimal health state. Fixed
HTTP wakeup and schedule invocation is origin-trust authenticated and accepts
neither request bodies nor query input.

First-party maintenance jobs declare the package-owned default cadence together
with the bounded `eager` and `economical` profiles. `eager` reduces recovery
latency at the cost of more database work; `economical` increases the maximum
time until scheduled reconciliation runs. Self-hosted installations retain the
safe default unless an operator explicitly selects one of those declared
profiles. A wakeable job must be paired with an owned durable-state dispatcher;
a wakeup is only a prompt, and the package's durable state and scheduled
recovery remain authoritative across process restarts and missed delivery.

Custom deployments can disable a specific optional product capability only when
the owning package documents the consequences. Disabling a capability removes
its jobs together with its other runtime surfaces. Required jobs cannot be
removed independently by choosing a scheduler or `workflows: "none"`, because
workflow provider selection no longer exists.

### External automation contract

Voyant's integration contract is intentionally vendor-neutral and limited to:

1. Versioned domain events, including signed outbound webhooks and replayable
   delivery records where the event family supports them.
2. Authenticated, documented, idempotent domain commands and resource APIs.
3. Clear correlation, causation, and idempotency identifiers on both sides.
4. Examples and setup guides for common external automation runtimes.

An external automation is responsible for its own scheduling, waits, retries,
dead-letter policy, secrets, execution history, and user interface. Voyant does
not proxy, host, inspect, or resume that automation.

## Product Surface To Remove

The migration removes the general workflow surface, including:

- `@voyant-travel/workflows` and its authoring, client, handler, driver,
  bindings, config, events, and protocol subpaths;
- `@voyant-travel/workflows-orchestrator`, including the in-memory and
  self-hosted Postgres implementations;
- `@voyant-travel/workflows-react` and the workflow-runs UI;
- `@voyant-travel/workflow-runs` and generic workflow-run routes, schemas,
  recorder, rerun, resume, and schedule clients;
- deployment graph workflow providers, manifests, conventional `src/workflows`
  and `src/jobs` discovery, generated workflow/job wrappers, and workflow
  migration plans;
- managed Cloud workflow releases, workflow APIs, workflow runner dispatch,
  hosted Node runner, and workflow dashboard pages.

The removal is a major-version breaking change for public packages. It must
include migration guidance for any external package consumers.

For self-hosted deployments, the framework cutover migration drops the retired
`workflow_runs` and `workflow_run_steps` history tables and their status enum
types. Operators that need that historical data must export it before applying
the cutover; product-job execution health does not migrate or preserve generic
workflow-run history. Managed Cloud retention remains a separate control-plane
migration concern.

## Migration Plan

### Phase 0: Establish the job contract

1. Publish the job inventory, ownership, cadence or wakeup, durability source,
   concurrency key, and failure signal for each job.
2. Define the package-manifest job facet and prohibit config-authored or
   project-local executable jobs.
3. Define the internal job invocation and health contracts for managed Cloud
   and the Operator.
4. Add job-specific observability and alerting requirements.
5. Document the external automation event and command contract.

### Phase 1: Extract callable domain operations

1. Ensure every existing workflow body delegates to a narrowly callable,
   directly tested domain operation.
2. Move retryable state from generic workflow runs into the owning domain's
   delivery intent where it is not already present.
3. Replace workflow-specific `step`, `sleep`, child invocation, and run context
   use with domain-level state transitions or explicit job logic.
4. Keep existing behavior and guarantees under focused package tests.

### Phase 2: Ship product jobs

1. Add package-owned job declarations to the resolved product graph.
2. Add managed Cloud scheduling, wakeups, and authenticated internal job
   invocation.
3. Add the equivalent self-hosted worker or scheduled command path.
4. Prove missed-tick recovery, retry bounds, leases, and job health for the
   outbox and channel push before disabling their workflow paths.
5. Migrate each first-party job and command and remove its workflow
   registration.

### Phase 3: Remove the workflow product

1. Delete the public workflow packages and all first-party imports.
2. Remove framework, Hono, CLI, starter, and deployment-graph workflow
   composition.
3. Delete managed Cloud workflow release/control-plane/runner code and data
   migrations only after all managed product jobs use the job host.
4. Remove workflow UI, docs, examples, tests, package-surface checks, and
   compatibility aliases.
5. Replace workflow documentation with job, subscriber, command, and external
   automation documentation.

### Phase 4: Compatibility and release

1. Publish a major-version migration guide mapping old workflow use cases to
   external automation patterns.
2. Announce the removed package names and the date they disappear from supported
   distributions.
3. Verify a managed deployment and a standard self-hosted deployment complete
   every required job without any workflow dependency.
4. Remove stale managed Cloud data only under a separately reviewed retention
   and migration plan.

## Acceptance Criteria

This RFC is complete only when:

- managed users receive all required product jobs without configuring an
  external scheduler or workflow provider;
- standard self-hosted Operator deployments receive the same behavior by
  default;
- outbox delivery and channel push remain recoverable after a worker crash or
  missed wakeup;
- a customer can implement a representative automation using only documented
  events and commands, without importing a Voyant workflow package;
- no public `@voyant-travel/workflow*` package remains supported;
- no managed Cloud customer code runs in a Voyant-operated workflow runner;
- selected package jobs are present in the resolved graph, while
  `voyant.config.ts`, project source conventions, and generic APIs cannot author
  or control executable jobs.

## Alternatives Considered

### Keep Voyant Workflows and improve adoption

Rejected. It preserves the large product and operational surface without a
specific adoption problem that a first-party engine solves better than mature
external tools.

### Keep the engine only for self-hosted deployments

Rejected. It would leave public package, security, release, and compatibility
cost while creating a capability mismatch with managed Cloud. Self-hosted users
can choose an execution framework directly.

### Expose customer-authored jobs as the replacement product

Rejected. Jobs remain ordinary package-owned product behavior, but exposing an
application-authored job extension point would recreate the workflow product's
maintenance burden and invite customer-authored code, schedules, state
machines, and run control back into Voyant.

### Require every deployment to schedule all product jobs externally

Rejected. It makes core product correctness optional and gives managed users a
poor default experience.

### Keep all current workflow infrastructure but hide it from customers

Rejected. Hiding a general engine does not remove its operational, security, or
maintenance cost. The job host must be materially simpler and must execute only
jobs selected with product packages.

## Consequences

Voyant becomes easier to position: it is the system of record and integration
endpoint, not another automation platform. The product loses a broad extension
point, but gains a clearer default experience and substantially less runtime
surface to operate.

This RFC supersedes the general-workflow assumptions in the workflow runtime,
workflow package-surface, and execution architecture documents once accepted.
Those documents must be updated or removed as part of Phase 3 rather than left
as competing architecture.
