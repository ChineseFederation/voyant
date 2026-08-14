# Payment link address contract

`invoicePayUrlTemplate` is the stable stored and API key for the customer URL
used by generated payment links. Its operator-facing name is “Payment link URL
template”. A usable value is an absolute HTTP(S) URL containing exactly one
`{sessionId}` placeholder.

The effective template is resolved in this order:

1. the organization’s valid stored `invoicePayUrlTemplate`;
2. the host-provided `PUBLIC_PAYMENT_LINK_URL_TEMPLATE`;
3. unavailable.

There is no admin-browser-origin fallback. `PUBLIC_CHECKOUT_BASE_URL` remains a
rolling-compatibility input for older hosts and produces the established OSS
`/pay/:sessionId` address, but new managed hosts should provide a complete
template. Voyant Cloud’s canonical default is
`https://<active-booking-engine-host>/pay?session={sessionId}`.

`GET /v1/public/payment-link-config`, checkout initiation responses, Generate
payment link, Copy payment link, and payment-session notifications must all use
the same effective template. Self-hosted deployments may continue serving
`/pay/:sessionId`; managed booking engines retain a bounded compatibility route
that replace-canonicalizes that path to `/pay?session=...`.
