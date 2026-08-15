---
"@voyant-travel/finance": patch
---

Send the buyer's fiscal code on `invoice.issued`

`buildInvoiceIssuedPayload` hardcoded `clientVatCode: null`, so a tax id an
operator had recorded on the booking never reached the event. An accounting
integration consuming `invoice.issued` therefore issued every invoice without
the buyer's fiscal code, and — where the integration derives taxpayer status
from that field's presence — classified every business buyer as a non-taxpayer.

The value is read from `bookings.contact_tax_id`, which is on the row the
payload is already built from. `clientRegCom` stays null: no column feeds it.
