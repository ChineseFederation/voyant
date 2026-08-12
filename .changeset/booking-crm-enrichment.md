---
"@voyant-travel/relationships": minor
"@voyant-travel/relationships-contracts": minor
"@voyant-travel/relationships-react": minor
"@voyant-travel/bookings": minor
"@voyant-travel/notifications": minor
---

Fold a confirmed booking into the customer's CRM record. Until now a customer booking created a person row carrying a name, an email and a phone number, and nothing else — Activities, Addresses, Relationships and Communications all stayed empty unless an operator filled them in by hand.

A `booking.confirmed` subscriber in relationships now writes a timeline activity linked to both the person and the booking, saves the billing address the checkout already collected (it was being parsed into the booking's contact columns and then dropped), and links co-travelers to the booker as travel companions. The pass is idempotent, so a redelivered event is a no-op, and it runs off the commit transaction so a CRM failure can never roll back a paid booking.

The Communications tab now also lists messages the deployment actually delivered to the person, read from the notification delivery record rather than copied into `communication_log`, and each entry reports whether it was logged by staff or sent automatically.

Bookings gains a `bookings.crm-snapshot.runtime` port so CRM can read a booking without importing its tables, and `entity_type` gains a `booking` member so an activity can name the booking it came from.
