---
"@voyant-travel/distribution": minor
"@voyant-travel/distribution-react": minor
"@voyant-travel/catalog": minor
"@voyant-travel/catalog-contracts": minor
"@voyant-travel/schema-kit": patch
---

Gate sourced catalog entries on channel publication, and let operators choose
which supply sources each channel sells.

Sourced entries never passed a listability gate: `syncSources` emitted every
discovered projection into every slice the deployment materialized, so
attaching a supply connection published that supplier's whole catalogue to the
operator's live storefront with no publish step. Channel publication could not
reach them either — its subjects are a product id and a canonical Supplier, and
a sourced entry has neither.

`channel_source_publications` adds the missing subject: an include/exclude
decision on a `(source_kind, source_connection_id)` pair, resolved
default-deny with connection beating source kind, mirroring the existing
product-beats-supplier ordering. The discovery sync and the catalog document
builder both consult it, so revoking publication removes the inventory on the
next index pass; staff slices stay ungated so operators can still browse a
connected supplier to decide what to sell. Admin gets a Supply sources tab
alongside Products and Suppliers, with the same preview-and-confirm step that
supplier rules use.

Index documents now carry `isSourced`, `sourceKind`, and `sourceConnectionId`
in every vertical, so storefronts can scope on ownership directly instead of
inferring it from `supplyModel` or an id prefix.

Deployments with inventory already indexed are backfilled with an explicit
`include` rule per connection per active channel, so nothing disappears from a
live storefront on upgrade — the status quo becomes something the operator can
see and revoke rather than something implied by having connected at all.
Connections attached after this ships are unpublished until chosen.
