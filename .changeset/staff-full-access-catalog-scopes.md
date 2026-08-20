---
"@voyant-travel/auth": patch
---

Expand local staff full access through the access catalog, as managed
deployments already do. A resource declared `wildcard: "explicit-resource"` is
deliberately not satisfied by `*`, so returning the bare sentinel locked a
full-access self-hosted admin out of every one of them — team management among
them. An assigned permission set is still returned verbatim, so a deliberately
restricted member must still have the resource named.
