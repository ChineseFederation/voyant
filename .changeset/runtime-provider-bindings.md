---
"@voyant-travel/framework": minor
"@voyant-travel/runtime": minor
---

Allow one built Operator artifact to select deployment provider bindings at boot through `VOYANT_DEPLOYMENT_BINDINGS_JSON` while keeping its compiled application graph fixed.

Model Redis keyspace isolation and network trust as explicit, independent binding constraints. Runtime-selected Redis bindings now require those properties, shared bindings require `REDIS_NAMESPACE`, and untrusted-network bindings require secure transport. Existing generated artifacts keep their previous provider selection and Redis safety behavior when no boot override is supplied.
