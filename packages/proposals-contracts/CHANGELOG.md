# @voyant-travel/proposals-contracts

## 0.108.3

### Patch Changes

- 73ab096: Standardize first-party packages on package-owned deployment manifests, provider selection,
  access metadata, concrete event contracts, selected admin navigation, and published runtime
  references. Add Bookings Extras as an independently selected graph unit and remove the central
  admin navigation catalog.
  Link facets now distinguish entity `linkable` metadata from executable `definition` exports, and
  generated Node registries reject malformed definitions before service registration.
  Provider-owned required config and secrets now apply only when that provider is selected, so
  local and in-memory deployments do not require credentials for inactive remote providers.

## 0.108.2

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.

## 0.108.1

### Patch Changes

- 790a18d: Keep quote version PATCH payloads sparse so omitted status does not trigger lifecycle-only status guards.

## 0.108.0

### Minor Changes

- a74471e: Quotes admin surface. A pipeline board (`/quotes`) plus a full quote workspace (`/quotes/$id`): editable deal fields, client (person and/or organization — B2C/B2B), travelers with an explicit PAX count, line items, tags, owner, the activity timeline, and the quote's versions nested inline. The quote value is derived from its line items and recomputed server-side on every change. Saving snapshots the current line items into a new proposal version that supersedes the prior one (one current version at a time); versions show a sequential number, Active/Expired status, and an editable valid-until on the active version. Adds `quotes.paxCount` plus `createdBy`/`updatedBy` audit fields (stamped from the acting user), an owner picker sourced from team members (falling back to the current user), and the `nav.quotes` operator label. The detail is a staged editor (edit freely; Save commits everything + snapshots a proposal version), with a quote description and images shown on the client proposal, and a "Send to client" action that surfaces the shareable proposal link (re-copying resolves the deployment's public proposal URL, not the admin origin). Products-based versions can be sent for review without a Trip snapshot; since acceptance reserves a frozen Trip, the public proposal exposes an `acceptable` flag and hides Accept (keeping Decline) for product-only proposals so clients never hit a guaranteed 409. All new copy is in en + ro.

## 0.107.0

### Minor Changes

- c8189fc: Split the legacy `@voyant-travel/crm-contracts` package into
  `@voyant-travel/relationships-contracts` and
  `@voyant-travel/quotes-contracts`. Runtime packages and public validation
  imports now depend on the domain-specific contract packages.
