# Operator Image Distribution Contract

The graph-composed Node operator is distributed as
`ghcr.io/voyant-travel/operator`. The image is a deployment artifact in its own
right, not an incidental example build and not a substitute for independently
versioned client or extension protocols.

## Publication and tag policy

`.github/workflows/operator-image.yml` is the only image publication authority:

- GHCR is the sole public OCI distribution point for the OSS operator. The
  workflow publishes `ghcr.io/voyant-travel/operator` and no registry mirror;
- every push to `main` publishes an immutable `sha-<git-sha>` tag;
- an explicit workflow dispatch from `main` publishes an immutable bare-semver
  release tag such as `0.225.0`;
- a separate explicit dispatch promotes an already-published, verified semver
  release digest to the mutable convenience tag `latest`;
- pull requests never invoke the workflow and never receive registry write
  permission;
- a fresh publication dispatch fails closed if its release tag already exists.
  If an earlier attempt created the tag and then failed during final
  verification, rerunning that same workflow adopts the existing immutable
  digest only after both runnable platform images prove that their OCI revision
  and version labels exactly match the workflow commit and requested release.
  It then re-verifies the digest and re-attaches canonical provenance without
  overwriting it. Automatic SHA reruns use the same recovery path;
- all `promote-latest` dispatches share one version-independent concurrency
  group, so two release promotions can never move `latest` concurrently.

### Releases and main snapshots

Both publication paths produce equally accepted, equally attested digests, and
neither is a draft. They differ in what they claim:

- a **release** is dispatched deliberately and carries a bare semver in both its
  tag and `org.opencontainers.image.version`. It is the only artifact with
  release lineage, because the version label is what ties a pinned digest back
  to a published version;
- a **main snapshot** is published automatically for every image-impacting
  commit and carries `sha-<git-sha>` in both its tag and version label. It
  records which commit was built, not which version was released. A commit that
  releases npm packages is still an ordinary commit here; it produces a snapshot
  like any other.

A downstream that admits the base by digest and asserts a released version must
resolve a semver tag to its digest, not a `sha-` tag. A snapshot failing that
assertion is the contract working: the snapshot never claimed to be a release.
When main carries a fix that a deployment needs, the unblocking step is
dispatching **publish-release** for it, not admitting the snapshot.

The `linux/amd64` and `linux/arm64` variants build concurrently on matching
native GitHub runners. The workflow deliberately does not use QEMU: the
production deploy tree includes architecture-specific native modules, so each
variant must be assembled and exercised on its target architecture. A build
pushes only an untagged, content-addressed platform image and emits an immutable
digest receipt. That exact digest must run the embedded migration plan, boot,
answer `/healthz`, and dispatch the OpenAPI route on its native runner before
the receipt can reach finalization.

After both native variants pass, the finalization job creates the canonical
multi-platform tag from their digest receipts. It refuses to overwrite a tag
that appeared after publication planning on a fresh workflow attempt. A failed
job rerun may adopt that tag without rewriting it, but only after the same exact
revision/version identity check used by a full-workflow recovery. Finalization
verifies that the resulting index has exactly one `linux/amd64` and one
`linux/arm64` image, and repeats migration, boot, and API acceptance against the
exact canonical index digest. Other
runnable platform descriptors are rejected; only BuildKit's explicit
`unknown/unknown` attestation descriptors may accompany the two images. Every
native build emits an SBOM and maximum BuildKit provenance; finalization also
attaches GitHub build provenance to the canonical registry artifact, including
during recovery reruns. Promoting `latest` performs the same acceptance against
the release digest before moving the tag and then proves that `latest` resolves
to that digest. Publication succeeds only if the canonical digest remains
resolvable after the workflow logs out of GHCR, proving anonymous access to the
public base.

### Acceptance runs against an existing database, not only an empty one

`scripts/smoke-operator-image.sh` migrates a database the Postgres service
container created moments earlier. That is the install case. A fresh database
has nothing to adopt, so ledger-identity, baseline-adoption, and re-entrancy
defects are invisible to it **by construction**.

`scripts/upgrade-operator-image.sh` is upgrade-path acceptance, and it is the
deploy case: the image is documented above as an artifact that self-hosters and
the downstream Platform derivative both run against **existing** databases. It
resolves the previous
released semver from the registry tag list (readable anonymously, so no
`read:packages` credential is involved), migrates a database it owns with *that*
image, then migrates the same database with the candidate, boots the candidate
against it, and migrates a third time requiring a no-op. The baseline run must
apply at least one migration and the final run must apply none; both are asserted
against the emitted `voyant.migration-result.v1` report, because an exit code
cannot distinguish "nothing was wrong" from "nothing happened".

It runs in branch CI, where the break is a source change and cheapest to catch,
then once in finalization against the canonical digest, and again before a
release is promoted to `latest`. It is deliberately **not** in the per-arch build
matrix: this defect class is architecture-independent, and duplicating it would
double the most expensive stage for nothing.

Baseline selection walks the release order, so the stage covers the previous
release only. Migrating from the oldest supported release would catch more and
cost proportionally; `VOYANT_UPGRADE_BASELINE_VERSION` pins an older baseline for
a one-off investigation without changing what CI does every run. When no usable
predecessor exists — a first release, or an empty registry — the stage prints a
`SKIPPED:` line naming the reason and exits zero. It never fails closed on a
missing predecessor and never passes silently.

#### What it does not cover

This stage exercises the image's own `run-generated-migrations.mjs`, which
resolves migration sources through the generated plan. That is **not** the path
that broke `0.6.0`, and the difference was measured rather than assumed:

- `0.5.0` (revision `4a715184`) is the last release before `availability` was
  absorbed into `operations`; a database it migrates carries
  `availability | 0000_availability_baseline` in `drizzle._voyant_migrations`;
- migrating that database with `0.6.0` (revision `bdbe032d`, the release the
  failure was reported against) **succeeds** — 2 applied, 31 skipped — boots,
  answers `/healthz`, and re-runs as a no-op. `0.6.0` records the absorbed
  migrations under `operations` without executing their SQL, so
  `relation "allocation_audit_log" already exists` does not arise.

So the sequence would have **passed** `0.6.0`, not failed it. That failure
belongs to the source-free `loadModuleBundleSource(packageName)` resolution a
downstream derivative uses, which has no plan to carry the retired source's
identity and which nothing in this image's acceptance exercises. Closing that is
the job of the static guard added in
[#4331](https://github.com/voyant-travel/voyant/pull/4331), not of this stage.

What this stage does cover is everything a prior state makes visible along the
path it does take: an adoption that misfires, a plan that is not re-entrant, and
a candidate that cannot boot against an upgraded schema.

### Known-bad releases

A release tag is immutable and cannot be withdrawn, so a defective release stays
pullable forever. `scripts/checks/image/release-health.json` is where that is
recorded: the version, its digest, what is wrong with it, and the issue. Consumers
pinning a digest should read it before choosing a release.

Each entry also states `usableAsUpgradeBaseline`. That is a narrower question
than "is this release good": a release can be undeployable and still migrate a
fresh database into a faithful prior state, which is all the upgrade stage asks
of a baseline. `0.6.0` is exactly that case. Only an entry that cannot produce a
valid prior state is excluded from baseline selection, and the stage then walks
to the next release down.

`latest` is for discovery only. Self-hosted and other direct consumers **must
pin `ghcr.io/voyant-travel/operator@sha256:<digest>`** and use that same digest
for the pre-rollout `node run-generated-migrations.mjs` invocation and all
serving replicas. A downstream Platform build pins that public digest as its
base input, records the relationship in provenance, and deploys the resulting
private derivative by its own immutable digest.

GitHub creates a new container package as private by default unless the
organization has configured another default. The `voyant-travel` organization
owner must make `operator` public. The workflow deliberately does not mutate
package visibility; instead, its final anonymous digest check fails closed until
that one-time repository setting is correct.

## Public base and private derivatives

This supersedes #3976's original “Platform and self-hosters run the same final
image” premise. The shared artifact is the public OSS product and base:
self-hosters run it directly, while Platform builds a private downstream
derivative from its exact digest. Both retain the same graph-native runtime and
provider-binding contract, but the final public and private image digests are
intentionally distinct and carry separate provenance.

The published artifact is both a directly deployable OSS operator and the
canonical base for downstream private products. A downstream build must consume
the public base directly from GHCR by immutable digest:

```dockerfile
ARG VOYANT_OPERATOR_BASE
FROM ${VOYANT_OPERATOR_BASE}

# Add only downstream-owned private material and metadata.
```

For example, the downstream build supplies
`--build-arg VOYANT_OPERATOR_BASE=ghcr.io/voyant-travel/operator@sha256:<digest>`.

The downstream pipeline must reject tag-only base references, record the exact
base name and digest in its own provenance, and run migration, boot, and API
acceptance against the resulting derivative digest. The derivative has its own
identity, SBOM, provenance, visibility, and release policy; it does not replace,
retag, or mirror the public OSS artifact. Self-hosters deploy the public digest
directly, while a private Platform derivative preserves that digest as its
auditable source foundation.

## OCI identity

Each platform-specific runtime image configuration carries these OCI labels:

| Label | Contract |
| --- | --- |
| `org.opencontainers.image.source` | Canonical source repository URL |
| `org.opencontainers.image.revision` | Full Git commit SHA built by the workflow |
| `org.opencontainers.image.version` | `sha-<git-sha>` for main snapshots or the dispatched semver for releases |

The digest, rather than any label or tag, is the deployment identity. A semver
release and a SHA build from the same revision may have different digests
because the version label is part of the image configuration. The two version
shapes are the release/snapshot distinction above; the label never carries a
version the workflow was not asked to publish.

## Compatibility boundaries

The image version describes the assembled operator artifact. It does not
re-version these independently negotiated contracts:

- the iframe admin-extension protocol is owned by
  `@voyant-travel/admin-extension-sdk` and
  `ADMIN_UI_EXTENSION_API_VERSION` (currently `1.1.0`);
- the remote Apps HTTP contract is owned by `@voyant-travel/apps` and
  `APP_API_VERSION` (currently `2026-07-01`), with each release declaring its
  supported compatibility range;
- MCP protocol negotiation remains owned by `@voyant-travel/mcp` and its
  `LATEST_PROTOCOL_VERSION`/supported-version set.

Upgrade compatibility must be evaluated against those contracts and the
operator release notes. An image semver does not imply matching protocol
versions.

## Runtime provider-binding contract

The admitted deployment graph embedded in the image supplies default provider
selections through `deployment.providers`. At boot,
`VOYANT_DEPLOYMENT_BINDINGS_JSON` may overlay those provider selections without
changing the compiled modules, imports, routes, jobs, migrations, or graph hash.
Ordinary environment-variable presence only supplies credentials and endpoints;
it never selects a provider. The image therefore supports different self-hosted
and managed configurations without being rebuilt.

The binding document has this shape:

```json
{
  "providers": {
    "cache": "redis",
    "sharedState": "postgres",
    "rateLimit": "redis",
    "adminAuth": "voyant-cloud"
  },
  "redis": { "isolation": "shared", "network": "untrusted" }
}
```

`providers` is a partial overlay on the image defaults. Whenever the resolved
cache, shared-state, or rate-limit provider uses Redis, an explicit `redis`
object is mandatory: `isolation: "shared"` requires `REDIS_NAMESPACE`, while
`network: "untrusted"` requires secure Redis transport. This fails closed so a
managed binding cannot silently inherit dedicated/trusted defaults from the
image it happens to run.

The core Node bindings are:

- Postgres: `DATABASE_URL_DIRECT` (pooled Node default) or the compatible
  `DATABASE_URL` alias;
- Redis-backed cache, shared state, or rate limiting: `REDIS_URL`, plus
  deployment-static `REDIS_NAMESPACE` when the binding declares shared
  isolation;
- S3-compatible object storage: `S3_REGION`, `STORAGE_MEDIA_BUCKET`, and
  `STORAGE_DOCUMENTS_BUCKET`, with ordinary AWS SDK credential/endpoint
  bindings supplied by the deployment;
- storage gateway: `STORAGE_GATEWAY_ENDPOINT` and `STORAGE_GATEWAY_TOKEN`;
- graph-selected auth, search, delivery, payments, and integration providers:
  the requirements emitted into the admitted deployment graph.

Both the migration command and server startup validate graph-required bindings
before doing work. Platform must provision from that admitted requirement set,
not maintain a second hard-coded environment inventory.

## Operator procedure

1. Merge the intended revision to `main` and wait for its immutable SHA image to
   pass digest acceptance.
2. Dispatch **Operator image / publish-release** from `main` with a new semver.
3. Record the resulting digest and deploy Platform by digest.
4. After rollout acceptance, optionally dispatch **promote-latest** for the same
   semver. This step is explicit and is never required for a production rollout.

Existing npm package releases remain independent of this image workflow.
