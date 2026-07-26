---
"@voyant-travel/operations": patch
---

Schedule the abandoned-checkout hold reaper.

`availability_holds` decrement `availability_slots.remaining_pax` as soon as a checkout reserves seats, and only `releaseExpiredHolds` gives that capacity back. That reaper shipped with no caller, so every abandoned checkout ate into a departure permanently. `operations.release-expired-availability-holds` now runs it on the same cadence as the booking-hold expiry job.
