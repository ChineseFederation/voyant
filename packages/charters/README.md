# @voyant-travel/charters

Opt-in charters module for OTA, tour-operator, and DMC deployments. Models
small-scale or specialized charter inventory that does not fit the cruise
schema - per-suite flat pricing, whole-yacht charter under MYBA contract, and
APA (Advance Provisioning Allowance) as a first-class concern.

Charters may be sourced supplier inventory or operator/DMC-owned operations.
They are an inventory and operations capability inside the target scenarios,
not a separate "charter operator" implementation scenario.

See [docs/architecture/charters-module.md](../../docs/architecture/charters-module.md) for the full design.

## Status

Phase 1 — schema + core service + pricing math.

## Agent Tools

Selecting the module contributes provider-neutral Tools for charter browse and
detail, per-suite and whole-yacht quotes, and the core product, voyage, and
yacht lifecycle. These Tools use the same local services and selected
`CharterAdapter` implementations as the HTTP surfaces; adapter-specific
mechanics are not exposed.

Read and quote Tools require `charters:read` and are available to staff and
customer actors. Local lifecycle writes require `charters:write`, are staff
only, and are ledgered. Booking creation is intentionally absent until the
charter vertical owns a durable admitted command. Archive/delete and low-level
suite/schedule mutations remain outside the Tool surface.
