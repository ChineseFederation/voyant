---
"operator": patch
---

Reduce production admin-shell startup work by deferring lazy-route dependency preloads, keeping storefront presentation imports off the broad barrel, lazily loading public auth and proposal page implementations, loading Reporting admin routes on demand, and tightening the initial preload budget to 480 KiB gzip.
