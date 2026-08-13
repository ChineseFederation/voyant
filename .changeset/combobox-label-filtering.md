---
"@voyant-travel/bookings-react": patch
"@voyant-travel/commerce-react": patch
"@voyant-travel/finance-react": patch
"@voyant-travel/inventory-react": patch
"@voyant-travel/operations-react": patch
---

Fix record pickers reporting their empty state for records the API returned.

base-ui matches the typed query against an item's label string, resolved
through `itemToStringLabel`. These comboboxes passed only `itemToStringValue`,
so base-ui stringified the item itself — a record id — and typing a product,
market, facility or price-catalog name filtered every option out. Twenty-seven
call sites were affected across products, pricing, sellability, extras,
facilities and the finance async picker.
