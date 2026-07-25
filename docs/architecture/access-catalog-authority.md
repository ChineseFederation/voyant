# Selected Access Catalog Authority

The resolved deployment graph is authoritative for access resources contributed by selected
modules, extensions, and plugins. Each resource has one selected owner, display metadata, declared
actions, and a wildcard policy. Duplicate owners and undeclared scope references are graph errors,
including when the selected resource set is empty.

The framework emits the deterministic catalog in the resolved graph, graph runtime, deployment
artifact manifest, and `.voyant/access/selected-access-catalog.generated.ts`. Runtime enforcement,
API-token creation, and staff/API-token permission editors consume that generated artifact.

## Compatibility Overlay

The effective compatibility catalog contains selected resources plus legacy central resources that
were not selected. A selected resource replaces the legacy descriptor with the same resource name;
legacy data cannot shadow selected policy. Stored unknown scopes remain opaque authentication data
and do not fail authentication, but new token grants must name a catalog resource/action pair.

`*`, `*:*`, `*:action`, and `resource:*` retain their existing behavior. A resource with
`wildcard: "explicit-resource"` is never granted by a wildcard on another resource. Bookings is the
first package-owned authority: it advertises `bookings:read`, `bookings:write`, and explicit
`bookings-pii:read`. `bookings:cancel` was a hidden compatibility action retained from the legacy
central catalog; it has been removed and is no longer a mintable or recognized permission. Cancelling
a booking has always been enforced under `bookings:write` (see `cancel_booking` in
`packages/bookings/src/voyant.ts`), so this removal only affects permission-editor/API-key minting
surfaces, not runtime enforcement.

## Route Enforcement

Graph API bundles may declare `resource`. Runtime composition lowers mount-to-resource overrides to
the Hono actor guard. Routes without an override keep method-and-path resource derivation. API-key
enforcement remains always on; staff enforcement remains default-on with `VOYANT_RBAC_ENFORCE=0`
as the operational kill switch. Full-access and current booking PII behavior remain unchanged.

Project-owned access presets contribute deployment-specific fragments to legacy API-token, grant,
and staff presets. Package manifests own resources; projects own what named roles and presets grant.

Run `pnpm verify:access-catalog-authority` after changing the Operator access catalog or its runtime
consumers. The check is included in `verify:architecture`.
