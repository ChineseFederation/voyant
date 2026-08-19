---
"@voyant-travel/public-api-client": minor
---

Add a Fetch-compatible managed transport seam that routes generated Public API
client requests through a Site's canonical same-origin `/v1/public` proxy while
preserving the client's operation types. Add an explicit publishable-only
`managed: true` authority mode for platform transports so they never need a
fake API key and cannot forward a caller-supplied key. Also export
stable operation IDs, HTTP methods, paths, and graph-derived credential posture
from the composed OpenAPI generation pipeline so Theme manifests can declare
requirements without maintaining a parallel capability registry.
