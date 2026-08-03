# @voyant-travel/admin-react

React Query bindings for the Voyant Admin API SDK. A thin, **generic** adapter
over [`@voyant-travel/admin-client`](../admin-client): the hooks are driven by
operation descriptors from [`@voyant-travel/admin-contracts`](../admin-contracts), so
they work for any operation — current or future — instead of bespoke
per-screen hooks.

## Install

```sh
pnpm add @voyant-travel/admin-react @voyant-travel/admin-client @tanstack/react-query react
```

`@tanstack/react-query` and `react` are peer dependencies.

## Usage

Compose `AdminClientProvider` under a `QueryClientProvider`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AdminClientProvider } from "@voyant-travel/admin-react"

const queryClient = new QueryClient()

export function Root({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminClientProvider
        config={{ baseUrl: "https://acme.voyant.app", auth: { type: "apiKey", apiKey: "voy_..." } }}
      >
        {children}
      </AdminClientProvider>
    </QueryClientProvider>
  )
}
```

Then read and mutate with the descriptor-driven hooks (descriptors are
re-exported from this package):

```tsx
import { bookingsOperations, useAdminMutation, useAdminQuery } from "@voyant-travel/admin-react"

function Bookings() {
  const { data, isLoading } = useAdminQuery(bookingsOperations.list, { input: { status: "confirmed" } })
  const cancel = useAdminMutation(bookingsOperations.cancel)

  // cancel.mutate({ params: { id: "book_123" }, input: { note: "Customer request" } })
}
```

Discover what a deployment supports at runtime:

```tsx
import { useCapabilities } from "@voyant-travel/admin-react"

const { data } = useCapabilities() // { contractVersion, modules, operations }
```

## API

- `AdminClientProvider` / `useAdminClient()` — supply and read the
  `AdminClient` from context (pass a ready `client` or a `config`).
- `useAdminQuery(descriptor, vars?, options?)` — read a `read` operation.
- `useAdminMutation(descriptor, options?)` — invoke a write/action operation;
  `mutate`/`mutateAsync` take `{ params, input }`.
- `useCapabilities(options?)` — fetch the deployment capability descriptor.
- `adminQueryKey(descriptor, vars?)` / `ADMIN_QUERY_ROOT` — the query-key
  scheme, for targeted cache invalidation.

Errors surface as `AdminApiError` (non-2xx) or `AdminApprovalRequiredError`
(HTTP 202 on a gated action); both extend `Error`.
