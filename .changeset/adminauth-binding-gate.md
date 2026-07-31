---
"@voyant-travel/framework": patch
---

Gate the injected-auth-integration requirement on the `adminAuth` provider
binding rather than on `deployment.mode`.

A deployment binding `adminAuth: "voyant-cloud"` needs the integration injected
wherever it runs, not only under `mode: "managed-cloud"`. `better-auth` is
self-contained and requires nothing.

The two Redis rules are unchanged and remain context-gated — they encode
"shared, untrusted infrastructure", which no provider value expresses.
