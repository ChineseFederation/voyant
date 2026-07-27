---
"@voyant-travel/operations": patch
---

Declare the expired-hold job's runtime port as a requirement, not only as something provided. Composition accepted the provide-only declaration and then rejected the port when the job actually fired, so the reaper failed on every run with `composeVoyantGraphRuntime: module "@voyant-travel/operations" requested undeclared port "operations.expired-holds-job"`.
