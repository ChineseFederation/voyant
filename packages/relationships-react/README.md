# @voyant-travel/relationships-react

React hooks, query keys, providers, admin routes, and reusable UI for the
Relationships module: people, organizations, activities, profile context,
person documents, relationships, and customer signals.

Proposal panels are exposed as extension slots on person and organization detail
pages. Proposal lifecycle hooks and components live in `@voyant-travel/proposals-react`.

## Install

```bash
pnpm add @voyant-travel/relationships-react @voyant-travel/relationships @tanstack/react-query react react-dom zod
```

## Usage

```tsx
import { VoyantProvider, usePeople } from "@voyant-travel/relationships-react"

function PeopleList() {
  const { data } = usePeople()
  return <>{data?.data.map((person) => <div key={person.id}>{person.firstName}</div>)}</>
}
```

## UI

```tsx
import { PersonCard, PersonDialog, PersonList } from "@voyant-travel/relationships-react/ui"
import { VoyantProvider } from "@voyant-travel/relationships-react"
```

Components that render styled UI require the optional `@voyant-travel/ui` peer.
Admin route contributions are exported from `@voyant-travel/relationships-react/admin`.

## License

Apache-2.0
