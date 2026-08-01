# Deployment links

Declare deployment-owned cross-module associations in `src/links/**/*.ts`.
Use package-exported linkables rather than cross-package database foreign keys.

```ts
// src/links/booking-people.ts
import { bookingLinkable } from "@voyant-travel/bookings/linkables"
import { defineLink } from "@voyant-travel/core"
import { personLinkable } from "@voyant-travel/relationships/linkables"

export default defineLink(
  { linkable: bookingLinkable, isList: true },
  { linkable: personLinkable, isList: true },
)
```

Each runtime `.ts` file must default-export one `defineLink(...)` result;
type-only exports are allowed, but named runtime exports are rejected. Import
`defineLink` from `@voyant-travel/core` or `@voyant-travel/core/links`.

The compiler emits `.voyant/runtime/project-links.generated.ts`. `voyant
migrate` loads that exact graph-selected registry after schema migrations and
materializes every writable pivot table. Read-only links remain externally
owned. `voyant db sync-links` is an explicit inspection/emission tool, not a
required deployment step. Do not copy package schemas or migrations into the
starter.
