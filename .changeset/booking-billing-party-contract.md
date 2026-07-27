---
"@voyant-travel/finance": patch
---

Make `create_booking`'s billing-party requirement visible in the Tool contract. `personId` and `organizationId` are both structurally optional because either satisfies the rule, and the requirement lived only in a `superRefine` — which does not serialize into the JSON Schema a Tool caller reads. An agent therefore saw two optional fields, omitted both, and hit `Select a billing person or organization` it had no way to predict, then retried the same call until the loop guard stopped it. Both fields now describe the constraint and name the lookup that returns their id (`list_people` for a person, `list_organizations` for an organization), the Tool description states the requirement, and the validation message names the field to set instead of reading as dialog copy. The rule is "at least one" rather than "exactly one": both may be set for a traveller billed through their company, which the create path already stores.
