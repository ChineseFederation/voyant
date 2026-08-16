# @voyant-travel/cruises-react

The cruises client tier: headless data hooks/clients plus the styled UI
components (formerly `@voyant-travel/cruises-ui`).

Headless consumers (public surfaces, portals) import from the root, `./hooks`,
`./client`, or `./query-keys` — these pull no styling peers. Styled surfaces
live under `./ui`, `./components/*`, `./i18n`, and `./styles.css`, whose
heavier peers (`@voyant-travel/ui`, `@voyant-travel/catalog-react`) are optional and
only needed when you import those subpaths.

React Query hooks + Zod-validated fetch client for the Voyant cruises module.

Mirrors the convention used by `@voyant-travel/relationships-react` and `@voyant-travel/inventory-react`.

## Quickstart

```tsx
import { VoyantCruisesProvider } from "@voyant-travel/cruises-react/provider"
import { usePublicApiCruises } from "@voyant-travel/cruises-react"

function App() {
  return (
    <VoyantCruisesProvider baseUrl="/api">
      <CruiseGrid />
    </VoyantCruisesProvider>
  )
}

function CruiseGrid() {
  const { data, isLoading } = usePublicApiCruises({ cruiseType: "expedition" })
  if (isLoading) return <p>Loading…</p>
  return (
    <ul>
      {data?.data.map((c) => <li key={c.id}>{c.name}</li>)}
    </ul>
  )
}
```

See `docs/architecture/cruises-module.md` in the monorepo root for the full module design.

## UI components

Importable React UI components for Voyant cruises. Bundler-consumed (Vite, Next.js, webpack, etc.).

### Install

```bash
pnpm add @voyant-travel/cruises-react @voyant-travel/ui @tanstack/react-query react react-dom
```

`@voyant-travel/ui` provides the design-system primitives and is required when you
import the styled subpaths (`./ui`, `./components/*`).

All components accept a `className` prop and merge it with `cn()`. Wrap or compose to extend; use the registry copy-paste path (`npx shadcn add @voyant/...`) for components you want to fork outright.

### I18n

Components render English by default. To localize them, wrap your UI in
`CruisesUiMessagesProvider` and import only the locales your app supports.

```tsx
import { CruisesUiMessagesProvider } from "@voyant-travel/cruises-react/ui"
import { cruisesUiEn } from "@voyant-travel/cruises-react/i18n/en"
import { cruisesUiRo } from "@voyant-travel/cruises-react/i18n/ro"
```

English-only apps should import only `./i18n/en`. Bilingual apps can import
`./i18n/en` and `./i18n/ro`.
