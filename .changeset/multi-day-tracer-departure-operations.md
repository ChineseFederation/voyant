---
"@voyant-travel/products-contracts": minor
"@voyant-travel/inventory": minor
"@voyant-travel/inventory-react": minor
"@voyant-travel/operations": minor
"@voyant-travel/schema-kit": patch
---

feat: materialize Product Day Services into Departure operations (spine)

The spine of the multi-day tracer (voyant#4035). A Product's day services were a
costing list with no operational shape, `product_versions.snapshot` had zero
readers, and a departure had no per-day structure. This wires the first path
from a frozen Product Version to immutable per-departure service lines.

- **A typed snapshot reader** (`@voyant-travel/products-contracts`):
  `parseProductVersionSnapshot` validates the frozen `product_versions.snapshot`
  shape and fails loudly on anything it does not recognise rather than returning
  an empty itinerary. Pure zod, reusable by inventory and operations (and
  voyant#4189).
- **Operational fields on `product_day_services`**: local start/end time and
  duration, a Place/facility reference, an `inclusion_role`
  (`included` | `optional`), traveller applicability, and a supplier reference
  alongside the existing loose `supplier_service_id`. Propagated through
  validation, service, admin routes, and the inventory-react authoring form.
- **A `departure_service_operations` table** (`@voyant-travel/operations`) with
  its own `departure_service_operation_status` enum
  (`planned` → … → `completed`, plus `cancelled` / `exception`) and a transition
  guard — deliberately not overloading the capacity-shaped
  `availability_slot_status`.
- **Idempotent materialization** from the frozen snapshot, mapping day N to the
  departure date + (N-1) in the slot timezone, keyed on
  `(slot_id, source_day_service_id)`. Wired into both slot-creation paths. A
  later Product edit does not mutate an already-materialized departure — proven
  by an integration test.

Spine only: no run-sheet UI and no supplier-operations changes, which are
follow-ups.
