# @voyant-travel/legal-react

The legal client tier: headless data hooks/clients plus the styled UI
components and page-level compositions (formerly `@voyant-travel/legal-ui`).

Headless consumers (public surfaces, portals) import from the root, `./hooks`,
`./client`, or `./query-keys` — these pull no styling peers. Styled surfaces
live under `./ui`, `./components/*`, `./admin`, `./i18n`, and `./styles.css`,
whose heavier peers (`@voyant-travel/ui`, `@voyant-travel/admin`, `react-hook-form`, and
the other modules' `*-react`/`*-ui` packages) are optional and only needed
when you import those subpaths.

## Install

```bash
pnpm add @voyant-travel/legal-react @voyant-travel/ui @tanstack/react-query react react-dom
```

`@voyant-travel/ui` provides the design-system primitives for the styled subpaths.
The data-layer hooks ship from this package's root.

All components accept a `className` prop and merge it with `cn()`. Wrap or compose to extend; use the registry copy-paste path (`npx shadcn add @voyant/...`) for components you want to fork outright.

## Detail Tab Replacement Slots

`ContractDetailPage` exposes `slots` for replacing built-in tab content while
keeping the default tab navigation. Use `detailsContent`, `partiesContent`,
`signaturesContent`, or `documentsContent` when an app needs custom inline
management controls instead of the shipped read-only table.

## Contract Dialog

`ContractDialog` provides the default create/edit form for `ContractsPage` and
`ContractDetailPage`. It owns contract setup, template and version selection,
number series, expiry, template variables, additional variables, metadata, and
submit wiring. Linked record pickers stay optional render props so apps can
wire CRM, supplier, or distribution selectors without the styled tier taking
those runtime dependencies.

```tsx
import { ContractDialog, ContractsPage } from "@voyant-travel/legal-react/ui"

<ContractsPage
  renderContractDialog={(props) => (
    <ContractDialog
      {...props}
      renderPersonPicker={(pickerProps) => <PersonPicker {...pickerProps} />}
      renderOrganizationPicker={(pickerProps) => <OrganizationPicker {...pickerProps} />}
    />
  )}
/>
```

## I18n

Components render English by default. To localize them, wrap your UI in
`LegalUiMessagesProvider` and import only the locales your app supports.

```tsx
import { LegalUiMessagesProvider } from "@voyant-travel/legal-react/ui"
import { legalUiEn } from "@voyant-travel/legal-react/i18n/en"
import { legalUiRo } from "@voyant-travel/legal-react/i18n/ro"
```

English-only apps should import only `./i18n/en`. Bilingual apps can import
`./i18n/en` and `./i18n/ro`.
