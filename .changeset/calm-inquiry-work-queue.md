---
"@voyant-travel/relationships": minor
"@voyant-travel/relationships-contracts": minor
"@voyant-travel/schema-kit": patch
"@voyant-travel/commerce": patch
"@voyant-travel/admin-api-client": minor
---

Add the first-class Inquiry aggregate, lifecycle contracts and admin API for
capturing, assigning, triaging, working, closing and reopening agency customer
requests. Reserve `inquiry.created` for the Relationships-owned aggregate by
removing Commerce's unused, conflicting event authority.
