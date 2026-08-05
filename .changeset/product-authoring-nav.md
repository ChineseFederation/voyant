---
"@voyant-travel/inventory-react": minor
---

feat(inventory-react): organize Product authoring around seven deep-linkable groups

Product authoring is reorganized around seven ordered groups — Overview &
readiness, Content, Plan, Options & pricing, Availability, Distribution and
History. `ProductAuthoringNav` renders them as a sticky, contextual deep-link
navigation, and each group on the detail page anchors to a stable id
(`/products/:id#authoring-plan`) so a link can land the operator directly on a
concern. The grouping is presentation only — the section components are
unchanged, just gathered under a stable, ordered set of headings, with en + ro
labels.
