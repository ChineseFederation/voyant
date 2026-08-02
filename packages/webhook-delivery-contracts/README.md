# @voyant-travel/webhook-delivery-contracts

The webhook wire contract: how a payload is signed, how a receiver verifies it,
and which endpoint URLs Voyant is willing to deliver to. Separated from the
webhook-delivery runtime so an app publisher can implement a receiver without
installing the queue, store, worker, and routes.

This package has no runtime dependencies beyond `node:crypto` and `node:net`.

Use `@voyant-travel/webhook-delivery` when you need the delivery queue,
Postgres store, admin service, or protected fetch.

## Install

```bash
pnpm add @voyant-travel/webhook-delivery-contracts
```

## Verifying a delivery

Every delivery carries a timestamp and a versioned SHA-256 HMAC signature.
Verify before trusting the body:

```ts
import { verifyWebhookPayloadSignature } from "@voyant-travel/webhook-delivery-contracts"

const result = verifyWebhookPayloadSignature({
  body: rawRequestBody,
  timestamp: request.headers.get("x-voyant-timestamp") ?? "",
  signature: request.headers.get("x-voyant-signature") ?? "",
  keys: [{ id: "current", secret: process.env.VOYANT_WEBHOOK_SECRET! }],
})

if (!result.ok) return new Response(result.reason, { status: 401 })
```

`keys` accepts more than one entry so a secret rotation can present both the old
and the new key until the old one is retired. The timestamp is checked against a
300-second tolerance by default; pass `toleranceSeconds` to change it.

## Declaring an endpoint

`assertOutboundWebhookEndpointUrl` is the same policy the host applies when it
admits a manifest, so a publisher can check a candidate endpoint before
shipping a release rather than discovering the rejection at admission:

```ts
import { assertOutboundWebhookEndpointUrl } from "@voyant-travel/webhook-delivery-contracts"

assertOutboundWebhookEndpointUrl("https://example.com/hooks/voyant") // ok
assertOutboundWebhookEndpointUrl("http://localhost:3000/hooks")     // throws
```

HTTPS is required; credentials, fragments, loopback and private hosts, private
IPv4/IPv6 ranges, and cloud metadata endpoints are all rejected.
