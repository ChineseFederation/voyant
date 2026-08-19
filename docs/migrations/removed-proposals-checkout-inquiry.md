# Removed Proposals checkout-inquiry runtime

The deprecated Proposals checkout-inquiry bridge has been removed. This withdraws the published
`@voyant-travel/proposals-contracts/checkout-inquiry` and
`@voyant-travel/proposals-contracts/runtime-port` exports and the corresponding Proposals runtime
provider.

Consumers must submit customer requests through the Relationships-owned canonical Inquiry intake:

- storefronts use `POST /v1/public/relationships/inquiries`;
- the retained Booking `POST /v1/public/bookings/inquiries` compatibility route delegates to the
  canonical Inquiry provider;
- internal integrations use the Relationships Inquiry service or its declared graph runtime ports.

The cutover keeps historical Booking Inquiry and Customer Signal data readable. It does not restore
the retired Proposals bridge or write new rows through either legacy inquiry store.
