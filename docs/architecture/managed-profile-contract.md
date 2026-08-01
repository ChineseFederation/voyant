# Managed Profile Contract (Retired)

> Historical document. The serialized managed profile contract and
> `@voyant-travel/framework/profile` export were removed. Applications now use
> `defineConfig` and graph project types from `@voyant-travel/framework/project`.
> See [Profile Compatibility Retirement](./profile-compatibility-retirement.md).
> Cloud-to-self-host portability uses the admitted resolved-graph bundle in
> [Exporting From Voyant Cloud](../exporting-from-voyant-cloud.md), not this
> retired contract.

Status: accepted

Voyant Cloud provisions managed operator deployments from a framework-owned
profile contract. Cloud should not import `apps/operator`, clone a customer
repository, or rediscover the standard runtime graph.

The public contract lives at `@voyant-travel/framework/profile`.

## Authoring a Snapshot

```ts
import { defineVoyantProject } from "@voyant-travel/framework/profile"

export default defineVoyantProject({
  profile: "operator",
  frameworkVersion: "0.12.22",
  mode: "managed-cloud",
  region: "eu",
  modules: ["catalog", "bookings", "finance", "relationships"],
  plugins: [
    "@voyant-travel/plugin-stripe",
    "@third-party/plugin-regional-accounting",
  ],
  settings: {
    finance: { fiscalRegion: "RO" },
    "@third-party/plugin-regional-accounting": { enabled: true },
  },
  admin: {
    enabled: true,
    path: "/app",
  },
})
```

Snapshots are serializable JSON. `defineVoyantProject(...)` normalizes module
references to stable ids such as `catalog`, `bookings`, and `flights`; it also
accepts framework specifiers such as `@voyant-travel/bookings` for compatibility
with framework internals.

`profile` is the durable product/workspace shape. `operator` is the first
and only supported profile in this contract. Future profile candidates such as
PMS are design notes, not part of the current enum. `modules` are capabilities
and framework surfaces. `plugins` are open-ended vendor or business extensions,
including payment processors, fiscalization/accounting systems, channel
connectors, and source adapters. `settings` are JSON-owned by modules and
plugins; avoid global project taxonomies until a module or plugin owns that
behavior.

The managed operator profile bundles no customer-facing web app. Public API
routes may still be exposed for separate storefront, site, shop, and blog apps
that consume the Voyant backend; custom hostnames belong to those app artifacts,
not to the managed profile snapshot that boots the operator runtime.

## Validation

Cloud should validate persisted or user-edited JSON with:

```ts
import { validateVoyantProject } from "@voyant-travel/framework/profile"

const result = validateVoyantProject(snapshot)
if (!result.ok) {
  return result.issues
}
```

Validation checks:

- schema version, profile id, framework/BOM version, and admin path;
- module references against the framework standard manifest;
- exclusion of customer-facing website modules from the operator profile;
- plugin references as open-ended non-empty package ids;
- settings as JSON-serializable module/plugin-owned configuration;
- module subset validity through the same graph used by `createVoyantApp`;
- managed Cloud substrate requirements.

For `mode: "managed-cloud"`, database/cache/storage/auth/email/search are
framework-owned substrate, not user-selected project config. The standard
operator profile emits Postgres, S3/R2-compatible storage, Voyant Cloud auth and
delivery, Redis for `cache` and `rateLimit`, and Postgres for authoritative
`sharedState`. Local or self-hosted profiles can include explicit provider
selections, including `postgres`, `kv`, or `memory` where the provider contract
allows them.
Payment, accounting, fiscalization, and channel systems are plugins, not
provider roles; Managed Cloud must not imply a specific payment processor.

## Resource Requirements

Cloud can ask the framework what to provision before booting the runtime:

```ts
import { getVoyantProjectRequirements } from "@voyant-travel/framework/profile"

const requirements = getVoyantProjectRequirements(snapshot)
```

The returned requirements include selected modules, plugins, settings, provider
roles, provider ids, resource keys, required variables/secrets/bindings, the
`createVoyantApp` module exclusion list, and framework migration metadata.
Managed operator profiles emit one `redis` resource requirement with
`REDIS_URL` for cache and rate limiting plus a deployment-static
`REDIS_NAMESPACE` used to prefix those Redis keys. Managed Cloud requires
`rediss://` for Redis TCP and still accepts HTTPS Redis REST URLs for
compatibility; plaintext `redis://` is rejected. Managed profiles keep
authoritative `sharedState` on Postgres by default. Self-hosted deployments
that explicitly select Redis for `sharedState` may use `redis://`,
`rediss://`, HTTP, or HTTPS and may reuse `REDIS_NAMESPACE`; the runtime writes
that store under `voyant:v1:<namespace>:state:`.

## Runtime Bridge

The profile-to-app bridge is intentionally small:

```ts
import { toCreateVoyantAppProfileConfig } from "@voyant-travel/framework/profile"

const profileConfig = toCreateVoyantAppProfileConfig(snapshot)

createVoyantApp({
  providers,
  ...profileConfig,
  modules: customModules,
  extensions: customExtensions,
  db,
})
```

`profileConfig.exclude` is the framework-owned standard subset input for
`createVoyantApp`. The bridge excludes standard extensions through explicit
standard extension ownership metadata, including `operator/*` extensions whose
owning module cannot be inferred from a package prefix. #2104 should move that
metadata closer to module/extension declarations and align the schema cascade.
Source-backed custom modules and extensions still enter through the existing
`modules` and `extensions` inputs; the snapshot carries `customSource` metadata
so Cloud can persist that source-backed extension intent without copying starter
glue.

## Migration Metadata

`getVoyantProjectRequirements(...)` includes the framework migration bundle
identity:

- package: `@voyant-travel/framework-migrations`
- bundle: `operator-standard-profile`
- cutline export: `loadCutline`
- doctor command:
  `voyant db doctor --snapshot .voyant/managed-profile.json --fail-on-drift`

Cloud should apply the framework bundle/cutline before deployment-owned
migrations and should use the doctor command as the profile/database parity
check.
