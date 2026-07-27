---
"@voyant-travel/inventory": minor
---

Add Tools for product options and their bookable units (`list_product_options`,
`get_product_option`, `create_product_option`, `update_product_option`,
`list_option_units`, `get_option_unit`, `create_option_unit`,
`update_option_unit`). The admin API already exposed this CRUD; without the
Tools an agent could create a product but never make it sellable.
