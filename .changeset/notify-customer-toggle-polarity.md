---
"@voyant-travel/bookings-react": patch
---

Ask staff whether to notify the customer, rather than whether to suppress the notification.

The status-change dialog carried a switch labelled "Don't notify the customer", off by default — a box you tick to make less happen. The booking journey's equivalent already asks the question positively ("Notify traveler", on by default) and maps it to the wire flag itself, so the same decision had two opposite presentations depending on where an operator made it. The status dialog now matches: `notifyCustomer` is on by default and sends `suppressNotifications: true` only when switched off.

The domain flag stays negative. `suppressNotifications` is the safe default at the boundary — a call site that forgets it sends a redundant email, where an opt-in flag that is forgotten leaves the customer never told, and every downstream consumer in `notifications` is a skip-guard that would have to read a missing field as "stay silent".

Both toggles now also disclose what switching notifications off actually does. Turning it off latches `bookings.notifications_suppressed`, which `updateBookingSchema` types as `z.literal(true)` — nothing can clear it, so the booking is silent for good, future reminders included. The old helper text described it as confirming "silently", which reads as a one-time choice about this action.
