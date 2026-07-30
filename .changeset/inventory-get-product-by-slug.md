---
"@voyant-travel/inventory": minor
---

`get_product` now accepts the product's catalog `slug` as a human-readable
alternative to the opaque product id, resolving the owning product through the
existing translation slug. Product read outputs already carried `name` and
`slug` alongside the typeid. Added `getProductBySlug` to the inventory Tool
service surface.
