# Operator Image Distribution Contract

The graph-composed Node operator is distributed as
`ghcr.io/voyant-travel/operator`. The image is a deployment artifact in its own
right, not an incidental example build and not a substitute for independently
versioned client or extension protocols.

## Publication and tag policy

`.github/workflows/operator-image.yml` is the only image publication authority:

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
to that digest.

`latest` is for discovery only. Voyant Platform and other production control
planes **must pin `ghcr.io/voyant-travel/operator@sha256:<digest>`**. A rollout
records that digest and uses the same digest for its pre-rollout
`node run-generated-migrations.mjs` invocation and all serving replicas.

GitHub creates a new container package as private by default unless the
organization has configured another default. The `voyant-travel` organization
owner must make `operator` public if unauthenticated Platform pulls are a
requirement, or provision a read-only GHCR credential to Platform. The workflow
deliberately does not change package visibility. Visibility is an organization
policy decision, not a source-controlled build side effect.

## OCI identity

Each platform-specific runtime image configuration carries these OCI labels:

| Label | Contract |
| --- | --- |
| `org.opencontainers.image.source` | Canonical source repository URL |
| `org.opencontainers.image.revision` | Full Git commit SHA built by the workflow |
| `org.opencontainers.image.version` | `sha-<git-sha>` for main snapshots or the dispatched semver for releases |

The digest, rather than any label or tag, is the deployment identity. A semver
release and a SHA build from the same revision may have different digests
because the version label is part of the image configuration.

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
