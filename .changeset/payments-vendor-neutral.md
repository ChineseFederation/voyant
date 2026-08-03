---
"@voyant-travel/framework": minor
---

Stop encoding a specific payment processor in the deployment contract.

`deployment-requirements` hardcoded Netopia's credential schema, so supporting a
new processor meant a framework release per country. It was also stale: it
demanded `NETOPIA_MERCHANT_ID`, which the provider catalog documents as not
existing ("the POS signature is the identifier"), plus private/public keys that
are not the credential model either.

Managed deployments bind one generic remote adapter and the control plane
resolves the connected processor and its credentials, so the deployment needs no
processor environment at all. Self-hosted deployments use `custom` and bind
their own adapter, which declares its own requirements.

`providers.payments: "netopia"` is deprecated but still accepted, and the
invalid-selection hint no longer names a vendor.
