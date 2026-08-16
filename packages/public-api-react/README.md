# @voyant-travel/public-api-react

The public surface client tier: headless data hooks/clients plus the styled UI
components (formerly `@voyant-travel/public-api-ui`).

Headless consumers import from the root, `./hooks`, `./client`, or
`./query-keys` — these pull no styling peers. Styled surfaces live under
`./ui`, `./components/*`, and `./styles.css`, whose heavier peers
(`@voyant-travel/ui`, `lucide-react`) are optional and only needed when you import
those subpaths.

## Styled components

- `PublicApiSettingsPage` (`./components/public surface-settings-page` or the
  `./ui` barrel) — the admin public surface settings page: branding, support
  links, legal, and payment configuration backed by
  `useAdminPublicApiSettings` / `useAdminPublicApiSettingsMutation`.

## Customer buyer accounts

`CustomerAccountProvider` composes the customer-auth, portal, and buyer-account
providers. Public surfaces can use `useBuyerAccounts`, `BuyerAccountSelector`, and
`BuyerAccountSelectionGate` from `@voyant-travel/public-api-react/public-api`
to support personal accounts, business accounts, or both.

The buyer-account context also exposes policy-aware business onboarding:
`businessAccountRequests`, `createBusinessAccount`, `requestBusinessAccount`,
`cancelBusinessAccountRequest`, and `acceptBusinessInvitation`, with separate
pending flags. Open creation explicitly activates the new buyer account;
request state is fetched only when the public surface policy is `request`.

See the
[customer auth framework integration guide](https://github.com/voyant-travel/voyant/blob/main/docs/customer-auth-frameworks.md)
for Next.js and Astro SSR/BFF examples. Authentication stays cookie-backed and
same-origin; browser bundles never receive managed-runtime or provider secrets.
