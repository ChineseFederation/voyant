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
- publication fails closed if a release tag already exists. An automatic SHA
  rerun re-verifies the existing artifact instead of overwriting it.

Every build targets `linux/amd64` and `linux/arm64`, emits an SBOM and maximum
BuildKit provenance, and attaches GitHub build provenance to the registry
artifact. Publication is complete only after the exact pushed manifest digest
successfully runs the embedded migration plan, boots, answers `/healthz`, and
dispatches the OpenAPI route. Promoting `latest` performs the same acceptance
against the release digest before moving the tag and then proves that `latest`
resolves to that digest.

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
