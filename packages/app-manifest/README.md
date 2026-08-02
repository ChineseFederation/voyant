# @voyant-travel/app-manifest

Everything a Voyant app publisher needs to declare a release: the manifest
schema, and the compiler that normalizes a manifest, canonicalizes it, and
produces the release digest.

This package exists so a publisher can validate a release **offline, before
submitting it**, and get the same answer the host will. `compileAppManifest`
does not merely check a manifest — it produces the `sha256:` digest that
identifies the release, so anything reproducing that digest has to use the same
canonicalization. A JSON Schema alone cannot do that.

Its dependencies are the extension slot vocabulary, the custom-field contract,
and the webhook contract. It does not pull in the operator runtime.

## Install

```bash
pnpm add -D @voyant-travel/app-manifest
```

A build-time/test dependency is the normal shape: nothing here runs in your
app's request path.

## Compile a release

```ts
import { compileAppManifest } from "@voyant-travel/app-manifest/compiler"

const { manifest, digest, canonicalJson, normalizedRelease } =
  compileAppManifest(JSON.parse(await readFile("voyant-app.json", "utf8")))

console.log(digest) // sha256:…  — stable across key order and array order
```

Compilation fails loudly, as a `ZodError`, on anything the host would reject:
an unknown top-level key, a non-HTTPS entry URL, a webhook endpoint pointing at
a private host, declared webhooks without the `app-webhooks:configure` scope, a
default locale missing from `supported`, or pages in one navigation group
disagreeing about `insertAfter`.

Pin this package in CI and assert the digest to catch a manifest change that
would otherwise surface only at admission.

## Validate webhook subscriptions against a deployment

Pass the deployment's event catalog to additionally check that every subscribed
event actually exists as an external contract:

```ts
compileAppManifest(input, { eventCatalog })
```

Without a catalog, subscriptions are checked for scope but not for existence —
which is the right default for an offline publisher build.

## Related

- `@voyant-travel/admin-extension-sdk` — the slot vocabulary and the UI
  extension protocol your framed pages speak
- `@voyant-travel/webhook-delivery-contracts` — verify the webhooks you receive
- `@voyant-travel/custom-fields-contracts` — the custom field definition shape
  an app-owned field extends
