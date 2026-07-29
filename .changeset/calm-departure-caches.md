---
"@voyant-travel/storefront": patch
---

Keep anonymous departure browsing in the configured cache store for 15 minutes and invalidate every cached query variant when `availability.slot.changed` is delivered. Managed runtimes use Redis through the provider-neutral cache interface. Checkout continues to verify availability against the transactional database, and deployments without a cache provider continue to use the live query path.
