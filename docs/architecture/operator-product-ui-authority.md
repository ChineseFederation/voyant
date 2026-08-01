# Operator product UI authority

The standard Operator starter is a deployment host and application composition
surface. Reusable domain UI belongs to package React surfaces; the starter owns
only route adapters, shell composition, deployment policy, and project-local
overrides.

## First extraction: customer booking journey

`@voyant-travel/bookings-react/storefront` owns the customer booking wrapper,
public booking and checkout dispatch, contract preview variables, payment-policy
resolution, and customer-safe error mapping. The Operator booking route adapts
TanStack Router params to that interface and supplies localized messages,
selected storefront scope, and navigation callbacks.

The package uses the shared `VoyantReactProvider` context for API base URL and
fetch behavior. It does not import the Operator router, aliases, environment
helpers, or starter message context. This keeps the same package surface usable
from the standard Node Operator and a dedicated storefront.

## Public proposal and payment pages

`@voyant-travel/proposals-react/storefront` owns the public proposal query,
lifecycle mutations, and presentation. The Operator proposal route supplies the
proposal-version path parameter, API base URL, and deployment-local customer
messages.

`@voyant-travel/finance-react/storefront` owns payment-reference resolution,
the universal payment-session page, and the booking/trip payment summaries.
The Operator payment routes adapt search/path parameters, localized messages,
and TanStack Router redirects. The accountant-token route remains a minimal
adapter over the package-owned `AccountantPortal` finance UI.

## Starter ratchet

`node scripts/check-operator-product-ui-authority.mjs` enforces:

- at most 16 files under `starters/operator/src`;
- deleted booking-journey, storefront browse/detail, and payment-summary copies
  cannot return;
- package storefront subpaths and thin route adapters remain connected;
- generated selected-graph admin loading remains authoritative; and
- `src/admin`, `src/extensions`, and `src/modules` remain available for project
  overrides. `src/custom-fields` must remain absent: operator definitions are
  authored only through persisted Settings records.

New generic product UI must deepen an existing package React/admin surface and
lower this ratchet when starter files are removed. Framework Node runtime, auth
invitations/team, and starter link definitions are outside this extraction.

## Second extraction: storefront product discovery

`@voyant-travel/catalog-react/storefront` owns public content resolution and
catalog-slot helpers. `@voyant-travel/storefront-react/storefront` owns the
host-neutral storefront context, catalog browse page, shared detail primitives,
and accommodation detail page. Product and cruise details are exposed from the
matching `@voyant-travel/inventory-react/storefront` and
`@voyant-travel/cruises-react/storefront` package surfaces.

The Operator browse and detail route files only validate or read TanStack Router
state, supply API URL, selected storefront scope, localized messages, and
navigation, then render package components. Package code does not import starter
aliases, environment helpers, message contexts, or TanStack Router.

## Selected customer presentation

The Storefront module declares
`@voyant-travel/storefront#presentation.customer` in its typed `presentations`
graph facet. Project resolution emits only selected presentation factories into
`.voyant/presentations/selected-graph-presentations.generated.js`.
`@voyant-travel/operator-standard` consumes that generated factory map and emits
the ten customer Storefront route hosts only when the presentation ID is in the
resolved product graph. The product shell must not directly import or select
`createStorefrontPresentationContribution`.

The route paths and host adapters remain in the standard product distribution
for this first cutover. A later presentation-route schema can move path
ownership package-side without reintroducing direct package selection.

## Remaining product UI clusters

- Operator application composition: providers, realtime presentation, admin
  destinations, and project admin-extension discovery. Generated selected-graph
  package loading must remain the default authority while these are reduced.
