---
"@voyant-travel/products-contracts": patch
---

Declare a day service's own `costCurrency` / `costAmountCents` on the product
version snapshot reader.

They were already written into `product_versions.snapshot` and reachable only
through `passthrough()`. Typing them lets a reader take the frozen commitment
figures without re-deriving the blob's shape, and keeps them explicitly distinct
from the driver-scaled `plannedCost` block, which answers a different question.
