---
"@voyant-travel/accommodations": patch
---

Quarantine `action.pickup-room-block` and remove it from the legacy
execute+tools allowlist. Dedup only applies when the optional
`stayBookingItemId` is supplied; a retry without it (or after a crash before
the caller learns the id) inserts a second pickup row against the same
inventory, so this is not yet crash-safe for an agent to retry blindly.
Declares `availability: { status: "unavailable", reasonCode:
"unsafe-unclaimed-create-target" }`. No runtime changes.
