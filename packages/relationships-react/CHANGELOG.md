# @voyant-travel/crm-react

## 0.291.0

### Patch Changes

- Updated dependencies [70752e1]
  - @voyant-travel/i18n@0.125.0
  - @voyant-travel/identity-react@0.291.0

## 0.290.0

### Patch Changes

- @voyant-travel/identity-react@0.290.0

## 0.289.0

### Patch Changes

- @voyant-travel/identity-react@0.289.0

## 0.288.0

### Patch Changes

- Updated dependencies [e99380d]
  - @voyant-travel/i18n@0.124.0
  - @voyant-travel/identity-react@0.288.0

## 0.287.0

### Patch Changes

- @voyant-travel/react@0.106.2
- @voyant-travel/identity-react@0.287.0

## 0.286.0

### Patch Changes

- @voyant-travel/identity-react@0.286.0

## 0.285.0

### Patch Changes

- @voyant-travel/identity-react@0.285.0

## 0.284.0

### Patch Changes

- @voyant-travel/identity-react@0.284.0

## 0.283.0

### Patch Changes

- @voyant-travel/identity-react@0.283.0

## 0.282.0

### Patch Changes

- @voyant-travel/identity-react@0.282.0

## 0.281.0

### Patch Changes

- Updated dependencies [1a3ba50]
- Updated dependencies [36f3085]
  - @voyant-travel/i18n@0.123.1
  - @voyant-travel/types@0.110.0
  - @voyant-travel/identity-react@0.281.0
  - @voyant-travel/react@0.106.1
  - @voyant-travel/utils@0.111.1

## 0.280.0

### Patch Changes

- @voyant-travel/identity-react@0.280.0

## 0.279.0

### Minor Changes

- f60a572: Fold a confirmed booking into the customer's CRM record. Until now a customer booking created a person row carrying a name, an email and a phone number, and nothing else — Activities, Addresses, Relationships and Communications all stayed empty unless an operator filled them in by hand.

  A `booking.confirmed` subscriber in relationships now writes a timeline activity linked to both the person and the booking, saves the billing address the checkout already collected (it was being parsed into the booking's contact columns and then dropped), and links co-travelers to the booker as travel companions. The pass is idempotent, so a redelivered event is a no-op, and it runs off the commit transaction so a CRM failure can never roll back a paid booking.

  The Communications tab now also lists messages the deployment actually delivered to the person, read from the notification delivery record rather than copied into `communication_log`, and each entry reports whether it was logged by staff or sent automatically.

  Bookings gains a `bookings.crm-snapshot.runtime` port so CRM can read a booking without importing its tables, and `entity_type` gains a `booking` member so an activity can name the booking it came from.

- c911139: Stop serving the processor token, and define what a person merge does to a
  stored instrument.

  `processor_token` is the one column on `person_payment_methods` that can charge
  a customer, and it was included in every list and read response, so any
  authenticated admin client received it to render a brand and four digits. It is
  now projected out server-side. Callers that mean to charge name the method by
  id and let the server resolve the token.

  The saved-method arm of the flights `PaymentIntent` follows: it carries a
  `methodId` instead of a token, which removes the synthesized `acct:` placeholder
  that existed only because no real token was available client-side. It is a
  distinct arm rather than a variant of `card` because the two are different
  facts, and collapsing them would put a chargeable credential back on every
  client that renders a saved card.

  Merging two people reparents their payment methods but does not merge the
  customer records those methods are bound to at the provider. A projected method
  from the losing person therefore rests on an agreement given by a record that no
  longer exists, so it is retired to `requires_new_agreement` rather than silently
  carried over. The row stays visible to the operator, which makes the state
  explainable instead of a card vanishing mid-merge. Manual rows carry no provider
  binding and no authorization to lose, so they move unchanged.

  The response now also carries `source`, `providerId`, `authorizedReuses` and
  `status`, which is what a future storefront read path checks before offering a
  stored method back to a shopper.

### Patch Changes

- Updated dependencies [f60a572]
- Updated dependencies [c911139]
- Updated dependencies [c911139]
- Updated dependencies [f9ff2da]
  - @voyant-travel/relationships@0.134.0
  - @voyant-travel/identity-react@0.279.0

## 0.278.0

### Patch Changes

- f4ac273: Make the operator admin usable on a phone. A measured audit at 390x844 found the
  desktop layout reflowing rather than adapting, with three defects that blocked real
  work: the booking detail header pushed `Cancel booking` and `Delete` entirely
  off-screen (252px of document overflow), four of its eight tabs were unreachable
  because the tab strip was not a scroll container, and hand-rolled tables inside
  `overflow-hidden` wrappers clipped columns with no way to scroll to them — `/suppliers`
  simply lost Country and Currency.

  Fixes stay in the composition layer; the shadcn-style primitives under
  `@voyant-travel/ui/components` are untouched. A new `@voyant-travel/ui/lib/responsive`
  exports the shared class strings.

  - Table wrappers that clipped or could not scroll now scroll horizontally (17 call
    sites across bookings, suppliers, catalog, finance, legal, notifications and
    inventory), and two tables that had no wrapper at all gained one.
  - List tables drop their low-value columns below `md` so the decision-relevant ones
    fit: bookings now shows number/status/total/dates instead of a created-at timestamp
    and an empty payer column, cutting hidden width from 706px to 111px. Products,
    invoices and suppliers get the same treatment, skeleton rows included.
  - The booking detail header wraps its actions and its tab strip scrolls, removing the
    document-level horizontal overflow.
  - The operator shell header is sticky, so the sidebar trigger — the only way to reach
    navigation on a phone — stays reachable on pages several screens tall.
  - Filter popovers cap their height, scroll internally and fit narrow viewports rather
    than running past the bottom of the screen.
  - Side sheets are full-width below `sm` instead of 75%, and touch targets on the
    sidebar trigger and row-selection checkboxes meet the 44px minimum.
  - The settings sub-nav scrolls its active section into view, so you can tell which of
    ~18 sections you are in.

- Updated dependencies [f4ac273]
  - @voyant-travel/ui@0.111.0
  - @voyant-travel/admin@0.137.0
  - @voyant-travel/identity-react@0.278.0

## 0.277.0

### Patch Changes

- @voyant-travel/identity-react@0.277.0

## 0.276.0

### Patch Changes

- @voyant-travel/identity-react@0.276.0

## 0.275.0

### Patch Changes

- @voyant-travel/identity-react@0.275.0

## 0.274.0

### Patch Changes

- @voyant-travel/identity-react@0.274.0

## 0.273.0

### Patch Changes

- @voyant-travel/identity-react@0.273.0

## 0.272.0

### Patch Changes

- @voyant-travel/identity-react@0.272.0

## 0.271.0

### Patch Changes

- @voyant-travel/identity-react@0.271.0

## 0.270.0

### Patch Changes

- @voyant-travel/identity-react@0.270.0

## 0.269.0

### Patch Changes

- Updated dependencies [bd8f49a]
- Updated dependencies [1e0506f]
  - @voyant-travel/admin@0.136.0
  - @voyant-travel/types@0.109.13
  - @voyant-travel/identity-react@0.269.0

## 0.268.0

### Patch Changes

- @voyant-travel/identity-react@0.268.0

## 0.267.0

### Patch Changes

- @voyant-travel/identity-react@0.267.0

## 0.266.0

### Patch Changes

- Updated dependencies [484b207]
  - @voyant-travel/i18n@0.123.0
  - @voyant-travel/identity-react@0.266.0

## 0.265.0

### Patch Changes

- Updated dependencies [7b8ef95]
- Updated dependencies [f56d552]
  - @voyant-travel/react@0.106.0
  - @voyant-travel/admin@0.135.0
  - @voyant-travel/i18n@0.122.1
  - @voyant-travel/identity-react@0.265.0

## 0.264.0

### Patch Changes

- Updated dependencies [1be6b76]
  - @voyant-travel/react@0.105.0
  - @voyant-travel/identity-react@0.264.0

## 0.263.0

### Patch Changes

- @voyant-travel/identity-react@0.263.0

## 0.262.0

### Patch Changes

- @voyant-travel/identity-react@0.262.0

## 0.261.0

### Patch Changes

- @voyant-travel/identity-react@0.261.0

## 0.260.0

### Patch Changes

- @voyant-travel/identity-react@0.260.0

## 0.259.0

### Patch Changes

- @voyant-travel/identity-react@0.259.0

## 0.258.0

### Patch Changes

- @voyant-travel/identity-react@0.258.0

## 0.257.0

### Patch Changes

- @voyant-travel/identity-react@0.257.0

## 0.256.0

### Patch Changes

- Updated dependencies [64df424]
  - @voyant-travel/i18n@0.122.0
  - @voyant-travel/identity-react@0.256.0

## 0.255.0

### Patch Changes

- @voyant-travel/identity-react@0.255.0

## 0.254.0

### Patch Changes

- @voyant-travel/identity-react@0.254.0

## 0.253.0

### Patch Changes

- @voyant-travel/identity-react@0.253.0

## 0.252.0

### Patch Changes

- @voyant-travel/identity-react@0.252.0

## 0.251.0

### Patch Changes

- @voyant-travel/identity-react@0.251.0

## 0.250.0

### Patch Changes

- @voyant-travel/identity-react@0.250.0

## 0.249.0

### Patch Changes

- @voyant-travel/identity-react@0.249.0

## 0.248.0

### Patch Changes

- @voyant-travel/identity-react@0.248.0

## 0.247.0

### Patch Changes

- @voyant-travel/identity-react@0.247.0

## 0.246.0

### Patch Changes

- @voyant-travel/identity-react@0.246.0

## 0.245.0

### Patch Changes

- Updated dependencies [ff0b8cc]
  - @voyant-travel/i18n@0.121.0
  - @voyant-travel/identity-react@0.245.0

## 0.244.0

### Patch Changes

- @voyant-travel/identity-react@0.244.0

## 0.243.0

### Patch Changes

- @voyant-travel/identity-react@0.243.0

## 0.242.0

### Patch Changes

- @voyant-travel/identity-react@0.242.0

## 0.241.0

### Patch Changes

- Updated dependencies [06a79a0]
  - @voyant-travel/i18n@0.120.0
  - @voyant-travel/identity-react@0.241.0

## 0.240.0

### Patch Changes

- @voyant-travel/identity-react@0.240.0

## 0.239.0

### Patch Changes

- @voyant-travel/identity-react@0.239.0

## 0.238.0

### Patch Changes

- Updated dependencies [2bc1570]
  - @voyant-travel/utils@0.111.0
  - @voyant-travel/types@0.109.12
  - @voyant-travel/identity-react@0.238.0

## 0.237.0

### Patch Changes

- Updated dependencies [f69e880]
  - @voyant-travel/i18n@0.119.4
  - @voyant-travel/identity-react@0.237.0

## 0.236.0

### Patch Changes

- @voyant-travel/identity-react@0.236.0

## 0.235.0

### Patch Changes

- @voyant-travel/identity-react@0.235.0

## 0.234.0

### Patch Changes

- @voyant-travel/identity-react@0.234.0

## 0.233.0

### Patch Changes

- @voyant-travel/identity-react@0.233.0

## 0.232.0

### Patch Changes

- @voyant-travel/identity-react@0.232.0

## 0.231.0

### Patch Changes

- Updated dependencies [f7adc5b]
  - @voyant-travel/i18n@0.119.3
  - @voyant-travel/identity-react@0.231.0

## 0.230.0

### Patch Changes

- @voyant-travel/identity-react@0.230.0

## 0.229.0

### Patch Changes

- @voyant-travel/identity-react@0.229.0

## 0.228.0

### Patch Changes

- Updated dependencies [bf71bca]
  - @voyant-travel/admin@0.134.0
  - @voyant-travel/identity-react@0.228.0

## 0.227.0

### Minor Changes

- e65bd25: Rename the bespoke sales Quote domain to Proposals across packages, routes, schemas, migrations, generated graph authorities, and operator surfaces.

  This beta-line release keeps no compatibility aliases, routes, package names, forwarding exports, views, or dual writes for the bespoke sales rename. Existing beta databases that contain the old bespoke quote schema must be dropped and recreated from the clean-slate migrations; there is no in-place migration path and no data-preservation guarantee for those beta databases.

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/relationships@0.133.0
  - @voyant-travel/i18n@0.119.2
  - @voyant-travel/identity-react@0.227.0

## 0.226.0

### Patch Changes

- @voyant-travel/identity-react@0.226.0

## 0.225.0

### Patch Changes

- Updated dependencies [5fa76aa]
  - @voyant-travel/admin@0.133.0
  - @voyant-travel/identity-react@0.225.0

## 0.224.0

### Patch Changes

- @voyant-travel/admin@0.132.0
- @voyant-travel/identity-react@0.224.0

## 0.223.0

### Patch Changes

- @voyant-travel/identity-react@0.223.0

## 0.222.0

### Patch Changes

- @voyant-travel/identity-react@0.222.0

## 0.221.0

### Patch Changes

- @voyant-travel/relationships@0.132.17
- @voyant-travel/identity-react@0.221.0

## 0.220.0

### Patch Changes

- Updated dependencies [7496159]
  - @voyant-travel/i18n@0.119.0
  - @voyant-travel/relationships@0.132.16
  - @voyant-travel/types@0.109.10
  - @voyant-travel/admin@0.131.1
  - @voyant-travel/identity-react@0.220.0

## 0.219.0

### Patch Changes

- @voyant-travel/identity-react@0.219.0
- @voyant-travel/relationships@0.132.15

## 0.218.0

### Patch Changes

- @voyant-travel/relationships@0.132.14
- @voyant-travel/identity-react@0.218.0

## 0.217.0

### Patch Changes

- @voyant-travel/identity-react@0.217.0
- @voyant-travel/relationships@0.132.13

## 0.216.0

### Patch Changes

- Updated dependencies [903c754]
  - @voyant-travel/i18n@0.118.3
  - @voyant-travel/relationships@0.132.12
  - @voyant-travel/identity-react@0.216.0

## 0.215.0

### Patch Changes

- Updated dependencies [6c76de3]
  - @voyant-travel/i18n@0.118.2
  - @voyant-travel/identity-react@0.215.0
  - @voyant-travel/relationships@0.132.11

## 0.214.0

### Patch Changes

- Updated dependencies [bf20d76]
  - @voyant-travel/ui@0.110.0
  - @voyant-travel/admin@0.131.0
  - @voyant-travel/identity-react@0.214.0
  - @voyant-travel/relationships@0.132.10

## 0.213.0

### Patch Changes

- @voyant-travel/identity-react@0.213.0
- @voyant-travel/relationships@0.132.9

## 0.212.0

### Patch Changes

- @voyant-travel/identity-react@0.212.0
- @voyant-travel/relationships@0.132.8

## 0.211.0

### Patch Changes

- @voyant-travel/identity-react@0.211.0
- @voyant-travel/relationships@0.132.7

## 0.210.0

### Patch Changes

- @voyant-travel/identity-react@0.210.0
- @voyant-travel/relationships@0.132.6

## 0.209.0

### Patch Changes

- @voyant-travel/identity-react@0.209.0
- @voyant-travel/relationships@0.132.5

## 0.208.0

### Patch Changes

- Updated dependencies [1873611]
  - @voyant-travel/admin@0.130.0
  - @voyant-travel/i18n@0.118.0
  - @voyant-travel/identity-react@0.208.0
  - @voyant-travel/relationships@0.132.4

## 0.207.0

### Patch Changes

- @voyant-travel/relationships@0.132.2
- @voyant-travel/identity-react@0.207.0

## 0.206.0

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/i18n@0.117.3
  - @voyant-travel/identity-react@0.206.0
  - @voyant-travel/relationships@0.132.1

## 0.205.0

### Patch Changes

- Updated dependencies [58baffe]
  - @voyant-travel/relationships@0.132.0
  - @voyant-travel/identity-react@0.205.0

## 0.204.0

### Patch Changes

- @voyant-travel/identity-react@0.204.0
- @voyant-travel/relationships@0.131.7

## 0.203.0

### Patch Changes

- @voyant-travel/relationships@0.131.6
- @voyant-travel/identity-react@0.203.0

## 0.202.0

### Patch Changes

- @voyant-travel/identity-react@0.202.0
- @voyant-travel/relationships@0.131.5

## 0.201.0

### Patch Changes

- @voyant-travel/identity-react@0.201.0
- @voyant-travel/relationships@0.131.3

## 0.200.0

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/utils@0.110.0
  - @voyant-travel/identity-react@0.200.0
  - @voyant-travel/relationships@0.131.2
  - @voyant-travel/ui@0.109.6

## 0.199.0

### Patch Changes

- @voyant-travel/relationships@0.131.1
- @voyant-travel/identity-react@0.199.0

## 0.198.1

### Patch Changes

- e2cb9f5: Clean up misused Card components. Cards that added their own vertical padding on
  top of the Card's built-in padding (double-padded content) now rely on the
  card's spacing, and the booking "Internal notes" card uses a proper card header
  and title instead of a label buried in the body. Empty-state, edge-to-edge, and
  image-tile cards are unchanged.
- e2cb9f5: Give every admin screen consistent page spacing. Previously each page invented
  its own padding (`p-6`, `px-6 py-6 lg:px-8`, `container mx-auto py-6` with no
  horizontal padding, or none at all), so screens like the booking engine had no
  spacing while others differed.

  The admin workspace layout now wraps the page outlet in a single padded content
  region (`px-4 py-6 md:px-6`), and the per-page root padding was removed so it no
  longer double-pads (max-width caps are kept). The full-height settings two-pane
  bleeds back out of that padding and re-applies its own so it stays edge-to-edge.

- e2cb9f5: Fix the person and organization detail tab bars wrapping awkwardly. With many
  tabs, the wrapped row previously stretched its few tabs across the full width
  (because tabs default to equal-width). The detail tab bars now keep tabs at
  their natural width and left-align the wrapped row.
- e2cb9f5: Fix double page padding. The admin shell already applies consistent page
  padding around the content area, but a number of page and loading-skeleton
  components still added their own `p-6` on top, pushing their content ~24px
  further in than the page header and leaving pages inconsistently indented.
  Those redundant root paddings are removed so every page's content lines up with
  the header and with each other. Dialog, portal, and card paddings are
  unchanged.
- e2cb9f5: Move heavy multi-field forms from centered dialogs to side sheets. Create/edit
  forms with more than a handful of fields (invoices, bookings, travelers,
  markets, pricing rules, policies, suppliers, resources, legal templates,
  notification templates, and similar) were rendered as centered modals; per the
  dialog-vs-sheet guidance, complex multi-field editing belongs in a side sheet
  that keeps the parent screen visible. Confirmations, media viewers, and short
  one-to-three-field dialogs are unchanged.
- e2cb9f5: Make form-field grids responsive on mobile. Two-column (and three/four-column) field grids that previously rendered multiple columns at every width now stack to a single column on small screens and expand at the `sm`/`lg` breakpoints, so forms and dialogs are no longer cramped on phones.
- e2cb9f5: Plain-language copy pass across the admin UI. Rewrites microcopy on the
  non-developer screens so it reads for travel professionals rather than
  engineers: removes developer jargon (entity, tenant, adapter/connector,
  payload, sync/reconcile internals, raw database column names and code
  fragments), strips internal/roadmap notes that leaked into user copy, cuts
  verbose and redundant helper text, and aligns terminology to the canonical
  Ubiquitous Language (Traveler over pax/guest, Supplier, Quote/Quote Version,
  "record" instead of "entity") with consistent sentence case. English catalog
  copy only; ICU placeholders and en/ro key parity preserved.
- e2cb9f5: Polish pass on flagged UI issues. The product activity feed no longer shows raw
  principal IDs or camelCase field names (it now shows a readable actor type and
  plain field names). The product "Extras" section header now matches the sibling
  "Rooms & prices" header style. Empty dashboard metrics render a lighter,
  less-prominent placeholder instead of a full-weight dash. And the person and
  organization create/edit forms now open as right-side sheets with a sticky
  footer (matching the convention for larger forms) instead of tall centered
  dialogs.
- e2cb9f5: Bring the Romanian (ro) admin translations in line with the plain-language
  English copy pass — re-translating the updated strings so the Romanian UI drops
  the same jargon and reads as clearly as the English. Values only; en/ro key
  parity and ICU placeholders preserved.
- e2cb9f5: Make form and dialog select triggers full-width. The shared `SelectTrigger`
  defaults to `w-fit`, so selects that sit in a form or dialog next to full-width
  inputs rendered noticeably narrower. Add `w-full` at those call sites (filter
  popovers, dialogs, and stacked form fields). Toolbar and inline selects that
  carry an intentional fixed width are left unchanged.
- e2cb9f5: Visual polish pass. Remove duplicated empty-state text in the media library and
  the product media section (the same message no longer appears twice), and clean
  up remaining "CRM" jargon the plain-language pass missed in the person/company
  create dialogs, flight contact picker, and booking traveler picker (now
  "contacts"/"contact" instead of "CRM").
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
  - @voyant-travel/i18n@0.117.2
  - @voyant-travel/admin@0.129.1
  - @voyant-travel/identity-react@0.198.1
  - @voyant-travel/ui@0.109.5

## 0.198.0

### Patch Changes

- Updated dependencies [c7459a2]
  - @voyant-travel/relationships@0.131.0
  - @voyant-travel/identity-react@0.198.0

## 0.197.0

### Patch Changes

- Updated dependencies [fa1cc2c]
  - @voyant-travel/relationships@0.130.0
  - @voyant-travel/identity-react@0.197.0

## 0.196.0

### Patch Changes

- Updated dependencies [bba4fec]
- Updated dependencies [58020ec]
  - @voyant-travel/relationships@0.129.0
  - @voyant-travel/identity-react@0.196.0

## 0.195.0

### Patch Changes

- @voyant-travel/relationships@0.128.36
- @voyant-travel/identity-react@0.195.0

## 0.194.0

### Patch Changes

- @voyant-travel/identity-react@0.194.0
- @voyant-travel/relationships@0.128.35

## 0.193.0

### Patch Changes

- Updated dependencies [90d44c0]
  - @voyant-travel/admin@0.129.0
  - @voyant-travel/i18n@0.117.0
  - @voyant-travel/identity-react@0.193.0
  - @voyant-travel/relationships@0.128.34

## 0.192.0

### Patch Changes

- @voyant-travel/identity-react@0.192.0
- @voyant-travel/relationships@0.128.32

## 0.191.0

### Patch Changes

- @voyant-travel/identity-react@0.191.0
- @voyant-travel/relationships@0.128.31

## 0.190.0

### Patch Changes

- @voyant-travel/relationships@0.128.30
- @voyant-travel/types@0.109.9
- @voyant-travel/identity-react@0.190.0

## 0.189.0

### Patch Changes

- @voyant-travel/identity-react@0.189.0
- @voyant-travel/relationships@0.128.29

## 0.188.0

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/utils@0.109.0
  - @voyant-travel/relationships@0.128.28
  - @voyant-travel/ui@0.109.4
  - @voyant-travel/identity-react@0.188.0

## 0.187.0

### Patch Changes

- @voyant-travel/identity-react@0.187.0
- @voyant-travel/relationships@0.128.27

## 0.186.0

### Patch Changes

- @voyant-travel/identity-react@0.186.0
- @voyant-travel/relationships@0.128.26

## 0.185.0

### Patch Changes

- @voyant-travel/identity-react@0.185.0
- @voyant-travel/relationships@0.128.25

## 0.184.0

### Patch Changes

- @voyant-travel/identity-react@0.184.0
- @voyant-travel/relationships@0.128.24

## 0.183.0

### Patch Changes

- @voyant-travel/identity-react@0.183.0
- @voyant-travel/relationships@0.128.23

## 0.182.1

### Patch Changes

- Updated dependencies [f0f51b4]
  - @voyant-travel/i18n@0.116.0
  - @voyant-travel/admin@0.128.3
  - @voyant-travel/identity-react@0.182.2

## 0.182.0

### Patch Changes

- @voyant-travel/identity-react@0.182.0
- @voyant-travel/relationships@0.128.21

## 0.181.0

### Patch Changes

- Updated dependencies [464815c]
  - @voyant-travel/i18n@0.115.1
  - @voyant-travel/identity-react@0.181.0
  - @voyant-travel/relationships@0.128.20

## 0.180.1

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/i18n@0.115.0
  - @voyant-travel/admin@0.128.2
  - @voyant-travel/identity-react@0.180.1

## 0.180.0

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/i18n@0.114.0
  - @voyant-travel/admin@0.128.1
  - @voyant-travel/identity-react@0.180.0
  - @voyant-travel/relationships@0.128.19

## 0.179.0

### Patch Changes

- @voyant-travel/identity-react@0.179.0
- @voyant-travel/relationships@0.128.18

## 0.178.0

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0
  - @voyant-travel/i18n@0.113.0
  - @voyant-travel/identity-react@0.178.0
  - @voyant-travel/relationships@0.128.17

## 0.177.0

### Patch Changes

- @voyant-travel/relationships@0.128.16
- @voyant-travel/types@0.109.8
- @voyant-travel/identity-react@0.177.0

## 0.176.0

### Patch Changes

- @voyant-travel/relationships@0.128.15
- @voyant-travel/types@0.109.7
- @voyant-travel/identity-react@0.176.0

## 0.175.0

### Patch Changes

- @voyant-travel/relationships@0.128.14
- @voyant-travel/types@0.109.6
- @voyant-travel/identity-react@0.175.0

## 0.174.0

### Patch Changes

- @voyant-travel/relationships@0.128.13
- @voyant-travel/identity-react@0.174.0

## 0.173.0

### Patch Changes

- @voyant-travel/identity-react@0.173.0
- @voyant-travel/relationships@0.128.12

## 0.172.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/utils@0.108.0
  - @voyant-travel/relationships@0.128.11
  - @voyant-travel/ui@0.109.3
  - @voyant-travel/identity-react@0.172.0

## 0.171.0

### Patch Changes

- @voyant-travel/identity-react@0.171.0
- @voyant-travel/relationships@0.128.9

## 0.170.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/i18n@0.112.1
  - @voyant-travel/relationships@0.128.8
  - @voyant-travel/identity-react@0.170.0

## 0.169.0

### Patch Changes

- Updated dependencies [a461920]
- Updated dependencies [a461920]
  - @voyant-travel/admin@0.127.0
  - @voyant-travel/identity-react@0.169.0
  - @voyant-travel/relationships@0.128.6

## 0.168.0

### Patch Changes

- @voyant-travel/identity-react@0.168.0
- @voyant-travel/relationships@0.128.5

## 0.167.0

### Patch Changes

- @voyant-travel/identity-react@0.167.0
- @voyant-travel/relationships@0.128.4

## 0.166.0

### Patch Changes

- Updated dependencies [0868f18]
- Updated dependencies [3062a73]
  - @voyant-travel/admin@0.126.2
  - @voyant-travel/i18n@0.112.0
  - @voyant-travel/identity-react@0.166.0
  - @voyant-travel/relationships@0.128.3

## 0.165.0

### Patch Changes

- @voyant-travel/identity-react@0.165.0
- @voyant-travel/relationships@0.128.2

## 0.164.0

### Patch Changes

- @voyant-travel/identity-react@0.164.0
- @voyant-travel/relationships@0.128.1

## 0.163.0

### Minor Changes

- 52352c4: Move custom-field definition Settings ownership to the generic custom-fields
  package. Selected entity manifests now declare the targets and field types that
  the canonical API may accept. The unused Relationships definition API and
  Settings surfaces are removed without compatibility adapters.

  Target capability declarations now constrain searchable, exportable, and
  invoiceable settings end to end, and unsupported flags are stored as false.

### Patch Changes

- 52352c4: Resolve custom-field definitions exclusively from persisted Settings records.
  Bookings and Relationships now share the package-owned database resolver.
  Project-local TypeScript authoring is removed by the completed custom-fields
  cutline.
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/relationships@0.128.0
  - @voyant-travel/identity-react@0.163.0

## 0.162.1

### Patch Changes

- 7a7fd97: Strengthen the internationalization platform across the operator and package UI.

  Add ICU message formatting, explicit locale and time-zone formatters, hierarchical
  locale fallback, validated runtime overrides, account-authoritative preferences,
  localized setup and navigation surfaces, and fail-closed catalog and UI-literal
  checks. Package message providers now accept an optional time zone and expose the
  shared formatting capabilities to package-owned UI.

- Updated dependencies [7a7fd97]
  - @voyant-travel/admin@0.126.1
  - @voyant-travel/i18n@0.111.3
  - @voyant-travel/identity-react@0.162.1

## 0.162.0

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/relationships@0.127.0
  - @voyant-travel/identity-react@0.162.0

## 0.161.0

### Patch Changes

- Updated dependencies [c1e37f2]
  - @voyant-travel/admin@0.126.0
  - @voyant-travel/identity-react@0.161.0
  - @voyant-travel/relationships@0.126.1

## 0.160.0

### Patch Changes

- Updated dependencies [bf19d5a]
  - @voyant-travel/relationships@0.126.0
  - @voyant-travel/identity-react@0.160.0

## 0.159.0

### Patch Changes

- Updated dependencies [766d24b]
- Updated dependencies [7e9f77a]
- Updated dependencies [82ffd12]
- Updated dependencies [6147b93]
- Updated dependencies [b459761]
  - @voyant-travel/ui@0.109.2
  - @voyant-travel/admin@0.125.0
  - @voyant-travel/identity-react@0.159.0
  - @voyant-travel/relationships@0.125.4

## 0.158.0

### Patch Changes

- 73ab096: Standardize first-party packages on package-owned deployment manifests, provider selection,
  access metadata, concrete event contracts, selected admin navigation, and published runtime
  references. Add Bookings Extras as an independently selected graph unit and remove the central
  admin navigation catalog.
  Link facets now distinguish entity `linkable` metadata from executable `definition` exports, and
  generated Node registries reject malformed definitions before service registration.
  Provider-owned required config and secrets now apply only when that provider is selected, so
  local and in-memory deployments do not require credentials for inactive remote providers.
- Updated dependencies [73ab096]
  - @voyant-travel/admin@0.124.0
  - @voyant-travel/identity-react@0.158.0
  - @voyant-travel/relationships@0.125.3
  - @voyant-travel/types@0.109.2

## 0.157.0

### Patch Changes

- @voyant-travel/identity-react@0.157.0
- @voyant-travel/relationships@0.125.2

## 0.156.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
- Updated dependencies [8d62a7c]
  - @voyant-travel/types@0.109.1
  - @voyant-travel/utils@0.107.1
  - @voyant-travel/admin@0.123.3
  - @voyant-travel/i18n@0.111.1
  - @voyant-travel/identity-react@0.156.1
  - @voyant-travel/react@0.104.2
  - @voyant-travel/relationships@0.125.1
  - @voyant-travel/ui@0.109.1

## 0.156.0

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/i18n@0.111.0
  - @voyant-travel/relationships@0.125.0
  - @voyant-travel/identity-react@0.156.0
  - @voyant-travel/admin@0.123.2

## 0.155.0

### Patch Changes

- @voyant-travel/relationships@0.124.3
- @voyant-travel/identity-react@0.155.0

## 0.154.0

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [8bd906f]
  - @voyant-travel/types@0.109.0
  - @voyant-travel/utils@0.107.0
  - @voyant-travel/ui@0.109.0
  - @voyant-travel/relationships@0.124.2
  - @voyant-travel/admin@0.123.0
  - @voyant-travel/identity-react@0.154.0

## 0.153.0

### Patch Changes

- 490d132: Move standard first-party admin factories, package copy, slots, contributions, and icons into selected deployment graph composition.
- 490d132: Move Operator Settings and Relationships admin presentation authority into selected package graph factories.
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [cda53b6]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
  - @voyant-travel/relationships@0.124.1
  - @voyant-travel/admin@0.122.0
  - @voyant-travel/types@0.108.1
  - @voyant-travel/identity-react@0.153.0

## 0.152.0

### Patch Changes

- Updated dependencies [d771be3]
- Updated dependencies [d771be3]
- Updated dependencies [d771be3]
  - @voyant-travel/relationships@0.124.0
  - @voyant-travel/types@0.108.0
  - @voyant-travel/admin@0.121.0
  - @voyant-travel/identity-react@0.152.0
  - @voyant-travel/utils@0.106.1

## 0.151.0

### Patch Changes

- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/relationships@0.123.0
  - @voyant-travel/types@0.107.2
  - @voyant-travel/identity-react@0.151.0

## 0.150.0

### Patch Changes

- @voyant-travel/relationships@0.122.12
- @voyant-travel/identity-react@0.150.0

## 0.149.0

### Patch Changes

- Updated dependencies [a97e845]
  - @voyant-travel/admin@0.120.0
  - @voyant-travel/identity-react@0.149.0
  - @voyant-travel/relationships@0.122.10

## 0.148.0

### Patch Changes

- Updated dependencies [8a665f3]
  - @voyant-travel/admin@0.119.0
  - @voyant-travel/identity-react@0.148.0
  - @voyant-travel/relationships@0.122.9

## 0.147.0

### Patch Changes

- @voyant-travel/admin@0.118.0
- @voyant-travel/identity-react@0.147.0
- @voyant-travel/relationships@0.122.8

## 0.146.0

### Patch Changes

- Updated dependencies [ecdf0fc]
  - @voyant-travel/admin@0.117.0
  - @voyant-travel/identity-react@0.146.0
  - @voyant-travel/relationships@0.122.7

## 0.145.0

### Patch Changes

- @voyant-travel/identity-react@0.145.0
- @voyant-travel/relationships@0.122.6

## 0.144.0

### Patch Changes

- @voyant-travel/identity-react@0.144.0
- @voyant-travel/relationships@0.122.5

## 0.143.0

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/utils@0.106.0
  - @voyant-travel/relationships@0.122.4
  - @voyant-travel/ui@0.108.11
  - @voyant-travel/types@0.107.1
  - @voyant-travel/identity-react@0.143.0

## 0.142.0

### Patch Changes

- @voyant-travel/identity-react@0.142.0
- @voyant-travel/relationships@0.122.3

## 0.141.0

### Patch Changes

- @voyant-travel/identity-react@0.141.0
- @voyant-travel/relationships@0.122.2

## 0.140.0

### Patch Changes

- Updated dependencies [62e87ee]
  - @voyant-travel/admin@0.116.0
  - @voyant-travel/i18n@0.110.0
  - @voyant-travel/identity-react@0.140.0
  - @voyant-travel/relationships@0.122.1

## 0.139.0

### Patch Changes

- 2613dfb: Replace native date inputs with shared date picker components in supplier and relationship UI.
- Updated dependencies [c9a356f]
- Updated dependencies [bf2d4a5]
- Updated dependencies [fc71db1]
- Updated dependencies [e1290d9]
  - @voyant-travel/types@0.107.0
  - @voyant-travel/relationships@0.122.0
  - @voyant-travel/admin@0.115.4
  - @voyant-travel/identity-react@0.139.0
  - @voyant-travel/utils@0.105.6

## 0.138.2

### Patch Changes

- 5e6a2ff: Expose person payment methods and communication logs on the person detail UI, add React hooks for those person-scoped resources, and enforce kind-specific payment method validation for cards versus bank transfers.
- 92bac99: Validate person document issue/expiry date ranges and expose add and primary actions in the person detail documents tab.
- 5fa49b1: Keep person relationship auto-inverse pairs synchronized when either side is updated or deleted.
- Updated dependencies [5e6a2ff]
- Updated dependencies [92bac99]
- Updated dependencies [5fa49b1]
- Updated dependencies [c7bd13f]
  - @voyant-travel/relationships@0.121.14

## 0.138.1

### Patch Changes

- 1c7bbdb: Expose organization detail management for identity resources, linked people, and linked activities.
- Updated dependencies [b615127]
- Updated dependencies [1c7bbdb]
  - @voyant-travel/relationships@0.121.12
  - @voyant-travel/identity-react@0.138.3

## 0.138.0

### Patch Changes

- @voyant-travel/identity-react@0.138.0
- @voyant-travel/relationships@0.121.7

## 0.137.1

### Patch Changes

- fd0cb71: Add a reusable admin UI for runtime custom-field definitions.

## 0.137.0

### Patch Changes

- @voyant-travel/relationships@0.121.5
- @voyant-travel/identity-react@0.137.0

## 0.136.1

### Patch Changes

- Updated dependencies [7cb6fa7]
  - @voyant-travel/i18n@0.109.0
  - @voyant-travel/admin@0.115.2
  - @voyant-travel/identity-react@0.136.1
  - @voyant-travel/ui@0.108.2

## 0.136.0

### Patch Changes

- @voyant-travel/identity-react@0.136.0
- @voyant-travel/relationships@0.121.3

## 0.135.0

### Patch Changes

- @voyant-travel/identity-react@0.135.0
- @voyant-travel/relationships@0.121.2

## 0.134.0

### Minor Changes

- 51f7dea: Share one list-response contract instead of per-module copies (voyant#2109).

  `@voyant-travel/types` now owns the canonical offset-paginated list envelope: the `ListResponse<T>` type + `listResponse(data, { total, limit, offset })` builder, plus the zod `paginationSchema` (coerced `limit` 1–200 default 50, `offset` ≥0 default 0) and the `listResponseSchema(item)` factory. Both server services and `*-react` clients import from this single source.

  Server side: every module's local `paginate()` / inline `{ data, total, limit, offset }` construction now routes through the shared `listResponse` builder, and the count read is standardized on `count` internally — fixing the drift where finance, notifications and the legal contracts/policies services read `countResult[0]?.total` while every other module read `countResult[0]?.count` (their `count(*)` selects were aliased `total`; they are now aliased `count`). The returned shape is byte-for-byte identical.

  Client side: the ~23 copied `paginatedEnvelope` zod schemas across the `*-react` packages are replaced by re-exporting the shared `listResponseSchema` factory under the same `paginatedEnvelope` name, so consumers are unchanged.

  Input alignment: `finance-contracts` and `legal-contracts` pagination `limit` caps were raised from `.max(100)` to `.max(200)` to match the framework-wide max.

  Additive and non-breaking.

### Patch Changes

- Updated dependencies [51f7dea]
  - @voyant-travel/types@0.106.0
  - @voyant-travel/relationships@0.121.0
  - @voyant-travel/identity-react@0.134.0
  - @voyant-travel/admin@0.115.1
  - @voyant-travel/utils@0.105.4

## 0.133.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/admin@0.115.0
  - @voyant-travel/i18n@0.108.0
  - @voyant-travel/utils@0.105.3
  - @voyant-travel/relationships@0.120.13
  - @voyant-travel/identity-react@0.133.0
  - @voyant-travel/ui@0.108.1

## 0.132.0

### Patch Changes

- @voyant-travel/identity-react@0.132.0
- @voyant-travel/relationships@0.120.12

## 0.131.0

### Patch Changes

- Updated dependencies [310565b]
  - @voyant-travel/i18n@0.107.3
  - @voyant-travel/identity-react@0.131.0
  - @voyant-travel/relationships@0.120.10

## 0.130.0

### Patch Changes

- Updated dependencies [dbea53e]
  - @voyant-travel/i18n@0.107.2
  - @voyant-travel/identity-react@0.130.0
  - @voyant-travel/relationships@0.120.9

## 0.129.0

### Patch Changes

- @voyant-travel/identity-react@0.129.0
- @voyant-travel/relationships@0.120.7

## 0.128.0

### Patch Changes

- @voyant-travel/identity-react@0.128.0
- @voyant-travel/relationships@0.120.6

## 0.127.0

### Patch Changes

- @voyant-travel/identity-react@0.127.0
- @voyant-travel/relationships@0.120.5

## 0.126.0

### Patch Changes

- @voyant-travel/identity-react@0.126.0
- @voyant-travel/relationships@0.120.3

## 0.125.0

### Patch Changes

- Updated dependencies [a74471e]
- Updated dependencies [a74471e]
  - @voyant-travel/i18n@0.107.0
  - @voyant-travel/ui@0.108.0
  - @voyant-travel/admin@0.114.0
  - @voyant-travel/identity-react@0.125.0
  - @voyant-travel/relationships@0.120.2

## 0.124.0

### Patch Changes

- Updated dependencies [4f92198]
  - @voyant-travel/ui@0.107.0
  - @voyant-travel/admin@0.113.0
  - @voyant-travel/identity-react@0.124.0
  - @voyant-travel/relationships@0.120.1

## 0.123.0

### Patch Changes

- Updated dependencies [94890c3]
- Updated dependencies [170388e]
- Updated dependencies [9c3fe53]
- Updated dependencies [d29dd47]
- Updated dependencies [ce2a568]
- Updated dependencies [3aa90b4]
- Updated dependencies [39d48fe]
- Updated dependencies [9616f1f]
- Updated dependencies [cb9b04b]
  - @voyant-travel/admin@0.112.0
  - @voyant-travel/relationships@0.120.0
  - @voyant-travel/identity-react@0.123.0

## 0.122.0

### Patch Changes

- @voyant-travel/identity-react@0.122.0
- @voyant-travel/relationships@0.119.5

## 0.121.0

### Patch Changes

- @voyant-travel/relationships@0.119.4
- @voyant-travel/identity-react@0.121.0

## 0.120.2

### Patch Changes

- ecec979: Improve operator bundle boundaries by adding route-local admin message provider support, exposing admin extension route helpers, keeping pending skeletons structural, and tightening Vite route ignores and vendor chunk splitting so heavy admin route dependencies stay out of the initial entry.
- Updated dependencies [ecec979]
  - @voyant-travel/admin@0.111.3

## 0.120.1

### Patch Changes

- eef1a00: Republish notification and UI consumer packages so stale beta artifacts no longer reference legacy notification package specifiers.
- Updated dependencies [eef1a00]
  - @voyant-travel/admin@0.111.2
  - @voyant-travel/identity-react@0.120.1

## 0.120.0

### Patch Changes

- Updated dependencies [dd71543]
- Updated dependencies [47fef18]
- Updated dependencies [c8189fc]
  - @voyant-travel/admin@0.111.1
  - @voyant-travel/identity-react@0.120.0
  - @voyant-travel/relationships@0.119.3

## 0.119.2

### Patch Changes

- db9c5cd: Split oversized CRM account tests, contract validation, React detail surfaces, and locale dictionaries into smaller internal modules while preserving existing public exports and behavior.
- Updated dependencies [db9c5cd]
  - @voyant-travel/crm@0.119.2

## 0.119.1

### Patch Changes

- @voyant-travel/crm@0.119.1
- @voyant-travel/identity-react@0.119.1

## 0.119.0

### Patch Changes

- Updated dependencies [b0f1e21]
  - @voyant-travel/utils@0.105.0
  - @voyant-travel/crm@0.119.0
  - @voyant-travel/ui@0.106.1
  - @voyant-travel/identity-react@0.119.0

## 0.118.0

### Patch Changes

- @voyant-travel/identity-react@0.118.0
- @voyant-travel/crm@0.118.0

## 0.117.1

### Patch Changes

- @voyant-travel/crm@0.117.1
- @voyant-travel/identity-react@0.117.1

## 0.117.0

### Patch Changes

- @voyant-travel/crm@0.117.0
- @voyant-travel/identity-react@0.117.0

## 0.116.0

### Patch Changes

- @voyant-travel/crm@0.116.0
- @voyant-travel/identity-react@0.116.0

## 0.115.0

### Patch Changes

- Updated dependencies [41b08db]
  - @voyant-travel/admin@0.111.0
  - @voyant-travel/identity-react@0.115.0
  - @voyant-travel/crm@0.115.0

## 0.114.0

### Patch Changes

- @voyant-travel/identity-react@0.114.0
- @voyant-travel/crm@0.114.0

## 0.113.0

### Patch Changes

- Updated dependencies [9c909e2]
  - @voyant-travel/admin@0.110.0
  - @voyant-travel/identity-react@0.113.0
  - @voyant-travel/crm@0.113.0

## 0.112.0

### Minor Changes

- 279f97c: Slim the admin entry barrels so the host's workspace-chrome chunk stops pinning domain data layers and page hosts (operator client entry: 3.74 MB → 1.83 MB).

  - Route contribution loaders now resolve query options / page-data helpers via dynamic `import()` inside the loader body, keeping clients + response schemas (and the backend validation graphs they pull) out of the eagerly evaluated entry chunk.
  - `@voyant-travel/<domain>-react/admin` barrels no longer re-export page/host/dialog/widget component **values** (packaged-admin RFC §4.8 endgame rule: specific modules, never barrels). Their prop **types** still re-export from the barrels; import component values from their specific modules instead (e.g. `@voyant-travel/bookings-react/admin/booking-detail-host`). New `./admin/*` subpath exports on `@voyant-travel/bookings-react` and `@voyant-travel/availability-react` cover the known host-side imports.
  - Widget slot ids moved into lean `admin/slots` modules (`bookings-react`, `crm-react`, `suppliers-react`); the host modules re-export them, so existing imports keep working.
  - Widget contributions (`PersonBookingsWidget`, the four finance cards) now mount through Suspense-wrapped `React.lazy` loaders, so their chunks fetch when the slot actually renders.
  - Search schemas stay synchronous: `catalogSearchSchema` re-exports from the schema-only `catalog-search-params` module instead of the catalog main barrel; the bookings search contracts already lived in the admin entry.
  - Resources detail-page skeletons extracted to `components/resource-detail-skeletons` (re-exported from the page modules) so `pendingComponent`s no longer pin the detail pages into the entry graph.

- faec538: Generated destination resolver maps (packaged-admin RFC §4.7 endgame).

  `AdminUiRouteContribution` gains `destination?: AdminDestinationKey` +
  `destinationParams?: Record<string, string>`: a route contribution now
  DECLARES which semantic destination key its path satisfies by pure param
  interpolation (e.g. `/suppliers/$id` satisfying
  `"supplier.detail": { supplierId: string }` via `{ id: "supplierId" }`).
  The eight domain packages annotate their 29 route-backed destinations, so
  `voyant admin generate --destinations` can emit the host's resolver map
  instead of the host hand-writing it — the operator's map shrank to
  `{ ...generatedAdminDestinations, ...custom }` with only seven genuinely
  custom resolvers (search-param construction, multi-route targets, and
  host-owned pages), and `voyant admin doctor` gates on drift between the
  annotations and the generated module.

### Patch Changes

- Updated dependencies [faec538]
  - @voyant-travel/admin@0.109.0
  - @voyant-travel/identity-react@0.112.0
  - @voyant-travel/crm@0.112.0

## 0.111.0

### Minor Changes

- 478aa7c: Packaged-admin RFC §4.8 endgame — the code-assembled extension route tree.
  Package-delivered admin pages exist as NO per-route files in the host: the
  operator deleted ~50 thin host route files across all 10 admin domains; the
  route tree for extension routes is assembled in code from the contributions
  and grafted under the file-based workspace layout, with typed links intact.

  - `@voyant-travel/admin`: `AdminUiRouteContribution` grows `page?: () =>
Promise<AdminRoutePageModule>` — a lazy page-module loader (pages stay
    code-split, hover/intent preloading fetches the chunk ahead of
    navigation). The resolved component receives `AdminRoutePageProps`
    (`params`/`search`/`updateSearch`/`title`), dissolving the old "zero-prop
    components only" restriction — param-taking detail pages need no host
    route file. `AdminRouteLoaderContext` gains `params`. New helpers:
    `requireImplementedAdminRoute` (loud failure at module evaluation when a
    bound contribution loses its implementation) and `adminRoutePageModule`
    (adapter for zero-prop / all-optional-prop hosts).
  - `@voyant-travel/admin-app`: new binder — `adminExtensionRouteOptions(extension,
routeId, runtime)` returns router-facing route options (lazy component,
    loader bound to `{ queryClient, runtime, params }`, per-route `ssr`,
    boundaries) ready to spread into a code-based `createRoute({...})`, and
    `attachAdminExtensionRoutes(routeTree, parentRoute, routes)` grafts the
    built routes under the workspace layout idempotently (replace-by-path,
    dev-server re-evaluation safe).
  - All 10 `*-react` admin extensions now carry full route implementations:
    lazy `page` loaders (dynamic imports of the specific host modules, never
    the admin barrel), loaders moved verbatim from the operator route files
    (SSR modes preserved exactly, `data-only` included), pending skeletons,
    and search contracts. Bookings adds host-composition options
    (`indexHeaderActions`, `detailPageComponent` + exported
    `BookingDetailPageComponentProps`) so app-owned composition rides through
    the factory instead of a route file. Finance's supplier-invoices pages
    stay metadata-only (app-owned upload/supplier-picker/cross-domain search
    wiring) and remain host route files.

  Hosts bind everything in one checked-in generated module
  (`src/admin.routes.generated.tsx`): per route a `createRoute` call with the
  path literal + typed search schema, spreading the binder options, plus
  `AdminExtensionRoutesBy*` typed-link maps that `router.tsx` merges with the
  generated `FileRouteTypes` via `_addFileTypes` — `Link`/`navigate` stay
  fully typed for file routes and extension routes alike.

### Patch Changes

- Updated dependencies [478aa7c]
  - @voyant-travel/admin@0.108.0
  - @voyant-travel/identity-react@0.111.0
  - @voyant-travel/crm@0.111.0

## 0.110.0

### Minor Changes

- 6c27159: Merge each module's `*-ui` package into its `*-react` sibling (#1652). The
  `*-react` package is now the whole client tier: the headless exports (root,
  `./hooks`, `./client`, `./provider`) are unchanged, and the styled tier moves
  in under new subpaths — `./ui` (the old `*-ui` root barrel), `./components/*`,
  `./admin`, `./i18n`, `./i18n/en`, `./i18n/ro`, and `./styles.css`.

  Migration from `@voyant-travel/<module>-ui`:

  - `@voyant-travel/<module>-ui` → `@voyant-travel/<module>-react/ui`
  - `@voyant-travel/<module>-ui/<subpath>` → `@voyant-travel/<module>-react/<subpath>`
  - package.json: drop the `-ui` dependency; `-react` covers both tiers.

  Styled-tier peers (`@voyant-travel/ui`, `@voyant-travel/admin`, `@tanstack/react-table`,
  `sonner`, `react-hook-form`, sibling `*-react` hooks packages) are optional
  peers — headless consumers that only import the root/`hooks`/`client` subpaths
  do not need them. The 27 `@voyant-travel/*-ui` packages are deprecated on npm in
  favor of these subpaths; `@voyant-travel/allocation-ui` and
  `@voyant-travel/workflow-runs-ui` (no `-react` sibling) are unaffected.

### Patch Changes

- Updated dependencies [6c27159]
- Updated dependencies [eeb23df]
  - @voyant-travel/identity-react@0.110.0
  - @voyant-travel/admin@0.107.0
  - @voyant-travel/crm@0.110.0

## 0.109.0

### Patch Changes

- @voyant-travel/crm@0.109.0

## 0.108.0

### Patch Changes

- @voyant-travel/crm@0.108.0

## 0.107.1

### Patch Changes

- @voyant-travel/crm@0.107.1

## 0.107.0

### Minor Changes

- d1ad572: Add Quote Version send, view, decline, and expiry lifecycle APIs with a public proposal read model.
- d1ad572: Rename CRM React hooks, UI components, and registry entries from Opportunity to Quote, with Quote Version surfaces split out for proposal/version workflows.
- d1ad572: Add composer-owned Trip snapshot freezing and read APIs for Quote Version proposal snapshots.

### Patch Changes

- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
- Updated dependencies [d1ad572]
  - @voyant-travel/crm@0.107.0

## 0.106.1

### Patch Changes

- Updated dependencies [a0ddf5e]
  - @voyant-travel/crm@0.106.1

## 0.106.0

### Minor Changes

- 6949669: Add CRM people and organization merge contracts, routes, React mutations, and detail-page UI actions.

### Patch Changes

- Updated dependencies [6949669]
  - @voyant-travel/crm@0.106.0

## 0.105.1

### Patch Changes

- Updated dependencies [e096b99]
  - @voyant-travel/crm@0.105.1

## 0.105.0

### Patch Changes

- @voyant-travel/crm@0.105.0

## 0.104.2

### Patch Changes

- @voyant-travel/crm@0.104.2

## 0.104.1

### Patch Changes

- @voyant-travel/crm@0.104.1
- @voyant-travel/react@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/crm@0.104.0
- @voyant-travel/react@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/crm@0.103.0
- @voyant-travel/react@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/crm@0.102.0
- @voyant-travel/react@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/crm@0.101.2
- @voyant-travel/react@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/crm@0.101.1
- @voyant-travel/react@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/crm@0.101.0
- @voyant-travel/react@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/crm@0.100.0
- @voyant-travel/react@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/crm@0.99.0
- @voyant-travel/react@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/crm@0.98.0
- @voyant-travel/react@0.98.0

## 0.97.0

### Patch Changes

- @voyant-travel/crm@0.97.0
- @voyant-travel/react@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/crm@0.96.0
- @voyant-travel/react@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/crm@0.95.0
- @voyant-travel/react@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/crm@0.94.0
- @voyant-travel/react@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/crm@0.93.0
- @voyant-travel/react@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/crm@0.92.0
- @voyant-travel/react@0.92.0

## 0.91.0

### Patch Changes

- @voyant-travel/crm@0.91.0
- @voyant-travel/react@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/crm@0.90.0
- @voyant-travel/react@0.90.0

## 0.89.0

### Minor Changes

- ed45995: Rename CRM organization `vatNumber` to `taxId` and support exact organization lookup by tax id.

### Patch Changes

- Updated dependencies [ed45995]
  - @voyant-travel/crm@0.89.0
  - @voyant-travel/react@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/crm@0.88.0
- @voyant-travel/react@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/crm@0.87.1
- @voyant-travel/react@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/crm@0.87.0
- @voyant-travel/react@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/crm@0.86.0
- @voyant-travel/react@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/crm@0.85.4
- @voyant-travel/react@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/crm@0.85.3
- @voyant-travel/react@0.85.3

## 0.85.2

### Patch Changes

- Updated dependencies [2aac1f9]
  - @voyant-travel/crm@0.85.2
  - @voyant-travel/react@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/crm@0.85.1
- @voyant-travel/react@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/crm@0.85.0
- @voyant-travel/react@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/crm@0.84.4
- @voyant-travel/react@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/crm@0.84.3
- @voyant-travel/react@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/crm@0.84.2
- @voyant-travel/react@0.84.2

## 0.84.1

### Patch Changes

- @voyant-travel/crm@0.84.1
- @voyant-travel/react@0.84.1

## 0.84.0

### Patch Changes

- @voyant-travel/crm@0.84.0
- @voyant-travel/react@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/crm@0.83.1
- @voyant-travel/react@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/crm@0.83.0
- @voyant-travel/react@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/crm@0.82.1
- @voyant-travel/react@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/crm@0.82.0
- @voyant-travel/react@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/crm@0.81.21
- @voyant-travel/react@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/crm@0.81.20
- @voyant-travel/react@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/crm@0.81.19
- @voyant-travel/react@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/crm@0.81.18
- @voyant-travel/react@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/crm@0.81.17
- @voyant-travel/react@0.81.17

## 0.81.16

### Patch Changes

- @voyant-travel/crm@0.81.16
- @voyant-travel/react@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/crm@0.81.15
- @voyant-travel/react@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/crm@0.81.14
- @voyant-travel/react@0.81.14

## 0.81.13

### Patch Changes

- @voyant-travel/crm@0.81.13
- @voyant-travel/react@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/crm@0.81.12
- @voyant-travel/react@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/crm@0.81.11
- @voyant-travel/react@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/crm@0.81.10
- @voyant-travel/react@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/crm@0.81.9
- @voyant-travel/react@0.81.9

## 0.81.8

### Patch Changes

- 688ac4f: Generalize booking traveler identity snapshots from passport-only fields to typed identity documents.
- Updated dependencies [688ac4f]
  - @voyant-travel/crm@0.81.8
  - @voyant-travel/react@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/crm@0.81.7
- @voyant-travel/react@0.81.7

## 0.81.6

### Patch Changes

- Updated dependencies [f92c593]
  - @voyant-travel/crm@0.81.6
  - @voyant-travel/react@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/crm@0.81.5
- @voyant-travel/react@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/crm@0.81.4
- @voyant-travel/react@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/crm@0.81.3
- @voyant-travel/react@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/crm@0.81.2
- @voyant-travel/react@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/crm@0.81.1
- @voyant-travel/react@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/crm@0.81.0
- @voyant-travel/react@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/crm@0.80.18
- @voyant-travel/react@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/crm@0.80.17
- @voyant-travel/react@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/crm@0.80.16
- @voyant-travel/react@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/crm@0.80.15
- @voyant-travel/react@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/crm@0.80.14
- @voyant-travel/react@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/crm@0.80.13
- @voyant-travel/react@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/crm@0.80.12
- @voyant-travel/react@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/crm@0.80.11
- @voyant-travel/react@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/crm@0.80.10
- @voyant-travel/react@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/crm@0.80.9
- @voyant-travel/react@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/crm@0.80.8
- @voyant-travel/react@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/crm@0.80.7
- @voyant-travel/react@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/crm@0.80.6
- @voyant-travel/react@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/crm@0.80.5
- @voyant-travel/react@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/crm@0.80.4
- @voyant-travel/react@0.80.4

## 0.80.3

### Patch Changes

- Updated dependencies [6d816bb]
  - @voyant-travel/crm@0.80.3
  - @voyant-travel/react@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/crm@0.80.2
- @voyant-travel/react@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/crm@0.80.1
- @voyant-travel/react@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/crm@0.80.0
- @voyant-travel/react@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/crm@0.79.0
- @voyant-travel/react@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/crm@0.78.0
- @voyant-travel/react@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/crm@0.77.13
- @voyant-travel/react@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/crm@0.77.12
- @voyant-travel/react@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/crm@0.77.11
- @voyant-travel/react@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/crm@0.77.10
- @voyant-travel/react@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/crm@0.77.9
- @voyant-travel/react@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/crm@0.77.8
- @voyant-travel/react@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/crm@0.77.7
- @voyant-travel/react@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/crm@0.77.6
- @voyant-travel/react@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/crm@0.77.5
- @voyant-travel/react@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/crm@0.77.4
- @voyant-travel/react@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/crm@0.77.3
- @voyant-travel/react@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/crm@0.77.2
- @voyant-travel/react@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/crm@0.77.1
- @voyant-travel/react@0.77.1

## 0.77.0

### Patch Changes

- @voyant-travel/crm@0.77.0
- @voyant-travel/react@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/crm@0.76.0
- @voyant-travel/react@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/crm@0.75.7
- @voyant-travel/react@0.75.7

## 0.75.6

### Patch Changes

- Updated dependencies [347fbd2]
  - @voyant-travel/crm@0.75.6
  - @voyant-travel/react@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/crm@0.75.5
- @voyant-travel/react@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/crm@0.75.4
- @voyant-travel/react@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/crm@0.75.3
- @voyant-travel/react@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/crm@0.75.2
- @voyant-travel/react@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/crm@0.75.1
- @voyant-travel/react@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/crm@0.75.0
- @voyant-travel/react@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/crm@0.74.2
- @voyant-travel/react@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/crm@0.74.1
- @voyant-travel/react@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/crm@0.74.0
- @voyant-travel/react@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/crm@0.73.1
- @voyant-travel/react@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/crm@0.73.0
- @voyant-travel/react@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/crm@0.72.0
- @voyant-travel/react@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/crm@0.71.0
- @voyant-travel/react@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/crm@0.70.0
- @voyant-travel/react@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/crm@0.69.1
- @voyant-travel/react@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/crm@0.69.0
- @voyant-travel/react@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/crm@0.68.0
- @voyant-travel/react@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/crm@0.67.0
- @voyant-travel/react@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/crm@0.66.6
- @voyant-travel/react@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/crm@0.66.5
- @voyant-travel/react@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/crm@0.66.4
- @voyant-travel/react@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/crm@0.66.3
- @voyant-travel/react@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/crm@0.66.2
- @voyant-travel/react@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/crm@0.66.1
- @voyant-travel/react@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/crm@0.66.0
- @voyant-travel/react@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/crm@0.65.0
- @voyant-travel/react@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/crm@0.64.1
- @voyant-travel/react@0.64.1

## 0.64.0

### Patch Changes

- Updated dependencies [6d0c8f3]
  - @voyant-travel/crm@0.64.0
  - @voyant-travel/react@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/crm@0.63.1
- @voyant-travel/react@0.63.1

## 0.63.0

### Minor Changes

- 5bff9c3: Person detail page consolidates onto the canonical surface; identity-document reveal/edit/delete with audit.

  `@voyant-travel/crm-ui`

  - `PersonDetailPage` cleanup: removed the 4 header metric cards, the "Fields update on the left panel" hint, and the "Travel profile" overview card (along with the `travelSnapshot` / `travelSnapshotPending` props on `PersonMain` and the internal `usePersonTravelSnapshot` fetch).
  - New `addresses` tab between Documents and the optional commercial tabs — renders `<PersonAddressesSection personId={person.id} />` by default. Tab union extended; new `tabs.addresses` i18n key in EN ("Addresses") + RO ("Adrese").
  - Relationships now show the related person's display name (hydrated via `usePerson`) instead of the raw TypeID. New optional `onPersonOpen` prop on `PersonDetailPage` and `PersonRelationshipsPanel` — when provided, the name renders as a button (`hover:underline`) that calls the callback so the host can route to the related person's detail page.
  - `PersonDocumentsPanel` accepts an optional `personId`. When provided, each row gets:
    - Eye toggle that lazily calls the new reveal hook and shows the decrypted document number inline (or a destructive error caption when blocked).
    - Pencil that opens the new `PersonDocumentDialog` (form fields: type, number, issuing country, issuing authority, issue + expiry date, primary toggle, notes).
    - "Delete" `ConfirmActionButton` wired to `usePersonDocumentMutation().remove`.
  - New `PersonDocumentDialog` (`@voyant-travel/crm-ui/components/person-document-dialog`) — exports `PersonDocumentDialogProps` + `PersonDocumentDialogDocument`. Uses `useRevealPersonDocument` on open to pre-fill the number; saves via `usePersonDocumentMutation().updateFromPlaintext`.

  `@voyant-travel/crm-react`

  - New hook `useRevealPersonDocument(documentId, { enabled })` — lazy `useQuery` against `GET /v1/crm/person-documents/:id/reveal`. `staleTime: 0` + `gcTime: 0` so every render with `enabled: true` is a fresh audit-logged disclosure on the server. Returns the document id + decrypted number (`null` when no number is on file).
  - New `personDocumentRevealSchema`, `personDocumentRevealResponse`, `PersonDocumentReveal` exports.
  - New `crmQueryKeys.personDocumentReveal(id)`.

  `@voyant-travel/crm`

  - New dependency on `@voyant-travel/action-ledger` (kept at `workspace:*`).
  - New `action-ledger-capabilities.ts` exports `PERSON_DOCUMENT_REVEAL_CAPABILITY` (resource: `person_document`, action: `read`, risk: `high`, required grant `crm-pii:read`) plus action-name / version / authorization-source / decision-policy constants.
  - New route `GET /person-documents/:id/reveal` — gates on the capability (operator's staff sessions with `scopes: ["*"]` satisfy it), KMS-required (503 when not wired), 404 when the document is missing. Wraps the decrypt with `ledgerSensitiveRead` so every reveal writes an action-ledger row tagged `crm.person_document.reveal` with `targetType: "person_document"`.
  - New service method `revealPersonDocumentNumber(db, documentId, { kms, keyRef? })` — pure KMS unwrap; returns `{ documentId, number: string | null }` (the number is `null` when the doc has no `numberEncrypted`). Authorization + audit logging stay in the route layer.

### Patch Changes

- Updated dependencies [5bff9c3]
  - @voyant-travel/crm@0.63.0
  - @voyant-travel/react@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/crm@0.62.3
- @voyant-travel/react@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/crm@0.62.2
- @voyant-travel/react@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/crm@0.62.1
- @voyant-travel/react@0.62.1

## 0.62.0

### Patch Changes

- @voyant-travel/crm@0.62.0
- @voyant-travel/react@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/crm@0.61.0
- @voyant-travel/react@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/crm@0.60.0
- @voyant-travel/react@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/crm@0.59.0
- @voyant-travel/react@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/crm@0.58.0
- @voyant-travel/react@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/crm@0.57.0
- @voyant-travel/react@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/crm@0.56.0
- @voyant-travel/react@0.56.0

## 0.55.1

### Patch Changes

- @voyant-travel/crm@0.55.1
- @voyant-travel/react@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/crm@0.55.0
- @voyant-travel/react@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/crm@0.54.0
- @voyant-travel/react@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/crm@0.53.2
- @voyant-travel/react@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/crm@0.53.1
- @voyant-travel/react@0.53.1

## 0.53.0

### Patch Changes

- Updated dependencies [a315df6]
  - @voyant-travel/crm@0.53.0
  - @voyant-travel/react@0.53.0

## 0.52.4

### Patch Changes

- @voyant-travel/crm@0.52.4
- @voyant-travel/react@0.52.4

## 0.52.3

### Patch Changes

- @voyant-travel/crm@0.52.3
- @voyant-travel/react@0.52.3

## 0.52.2

### Patch Changes

- 3e09123: Expand the CRM person form and detail surface.

  - `PersonForm` gains addresses and relationships subforms with full add/remove/edit affordances; `OrganizationForm` picks up the same address widgets.
  - New exported sections `PersonAddressesSection` and `PersonRelationshipsSection` so the person detail page can render addresses/relationships outside the edit form (e.g. on the read-only detail view).
  - i18n strings for the new sections (EN + RO).
  - `@voyant-travel/crm` service/validation: rename the legacy `birthday` field to `dateOfBirth` to match the rest of identity; migrations `0028_rename_birthday.sql` (dev), `0010_rename_birthday.sql` (dmc), and `0018_rename_birthday.sql` (operator) handle the column rename.
  - Document-attach service tightens its validation around the renamed field.

- Updated dependencies [3e09123]
  - @voyant-travel/crm@0.52.2
  - @voyant-travel/react@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/crm@0.52.1
- @voyant-travel/react@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/crm@0.52.0
- @voyant-travel/react@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/crm@0.51.1
- @voyant-travel/react@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/crm@0.51.0
- @voyant-travel/react@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/crm@0.50.8
- @voyant-travel/react@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/crm@0.50.7
- @voyant-travel/react@0.50.7

## 0.50.6

### Patch Changes

- @voyant-travel/crm@0.50.6
- @voyant-travel/react@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/crm@0.50.5
- @voyant-travel/react@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/crm@0.50.4
- @voyant-travel/react@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/crm@0.50.3
- @voyant-travel/react@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/crm@0.50.2
- @voyant-travel/react@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/crm@0.50.1
- @voyant-travel/react@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/crm@0.50.0
- @voyant-travel/react@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/crm@0.49.0
- @voyant-travel/react@0.49.0

## 0.48.0

### Patch Changes

- Updated dependencies [9132fcf]
  - @voyant-travel/crm@0.48.0
  - @voyant-travel/react@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/crm@0.47.0
- @voyant-travel/react@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/crm@0.46.0
- @voyant-travel/react@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/crm@0.45.0
- @voyant-travel/react@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/crm@0.44.0
- @voyant-travel/react@0.44.0

## 0.43.0

### Patch Changes

- @voyant-travel/crm@0.43.0
- @voyant-travel/react@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/crm@0.42.0
- @voyant-travel/react@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/crm@0.41.3
- @voyant-travel/react@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/crm@0.41.2
- @voyant-travel/react@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/crm@0.41.1
- @voyant-travel/react@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/crm@0.41.0
- @voyant-travel/react@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/crm@0.40.1
- @voyant-travel/react@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/crm@0.40.0
- @voyant-travel/react@0.40.0

## 0.39.0

### Patch Changes

- @voyant-travel/crm@0.39.0
- @voyant-travel/react@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/crm@0.38.2
- @voyant-travel/react@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/crm@0.38.1
- @voyant-travel/react@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/crm@0.38.0
- @voyant-travel/react@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/crm@0.37.1
- @voyant-travel/react@0.37.1

## 0.37.0

### Patch Changes

- @voyant-travel/crm@0.37.0
- @voyant-travel/react@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/crm@0.36.0
- @voyant-travel/react@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/crm@0.35.0
- @voyant-travel/react@0.35.0

## 0.34.0

### Patch Changes

- @voyant-travel/crm@0.34.0
- @voyant-travel/react@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/crm@0.33.1
- @voyant-travel/react@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/crm@0.33.0
- @voyant-travel/react@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/crm@0.32.3
- @voyant-travel/react@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/crm@0.32.2
- @voyant-travel/react@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/crm@0.32.1
- @voyant-travel/react@0.32.1

## 0.32.0

### Patch Changes

- @voyant-travel/crm@0.32.0
- @voyant-travel/react@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/crm@0.31.4
- @voyant-travel/react@0.31.4

## 0.31.3

### Patch Changes

- @voyant-travel/crm@0.31.3
- @voyant-travel/react@0.31.3

## 0.31.2

### Patch Changes

- @voyant-travel/crm@0.31.2
- @voyant-travel/react@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/crm@0.31.1
- @voyant-travel/react@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/crm@0.31.0
- @voyant-travel/react@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/crm@0.30.7
- @voyant-travel/react@0.30.7

## 0.30.6

### Patch Changes

- @voyant-travel/crm@0.30.6
- @voyant-travel/react@0.30.6

## 0.30.5

### Patch Changes

- @voyant-travel/crm@0.30.5
- @voyant-travel/react@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/crm@0.30.4
- @voyant-travel/react@0.30.4

## 0.30.3

### Patch Changes

- @voyant-travel/crm@0.30.3
- @voyant-travel/react@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/crm@0.30.2
- @voyant-travel/react@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/crm@0.30.1
- @voyant-travel/react@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/crm@0.30.0
- @voyant-travel/react@0.30.0

## 0.29.0

### Patch Changes

- Updated dependencies [3420711]
  - @voyant-travel/crm@0.29.0
  - @voyant-travel/react@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/crm@0.28.3
- @voyant-travel/react@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/crm@0.28.2
- @voyant-travel/react@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/crm@0.28.1
- @voyant-travel/react@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/crm@0.28.0
- @voyant-travel/react@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/crm@0.27.0
- @voyant-travel/react@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/crm@0.26.9
- @voyant-travel/react@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/crm@0.26.8
- @voyant-travel/react@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/crm@0.26.7
- @voyant-travel/react@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/crm@0.26.6
- @voyant-travel/react@0.26.6

## 0.26.5

### Patch Changes

- Updated dependencies [7a92aba]
  - @voyant-travel/crm@0.26.5
  - @voyant-travel/react@0.26.5

## 0.26.4

### Patch Changes

- 6493f62: Add `customer_signals` table for the pre-pipeline interest surface (closes #444).

  Customer signals are the lighter-than-opportunities, heavier-than-segments space — wishlist entries, "notify when this departure opens", inquiry calls captured by an operator, abandoned-cart recovery, request-offer leads. The new `crm.customer_signals` table records:

  - `kind` — `wishlist | notify | inquiry | request_offer | referral`.
  - `source` — `form | phone | admin | abandoned_cart | website | booking`.
  - `status` — `new | contacted | qualified | converted | lost | expired`, default `new`.
  - `priority` (text, validation-layer enum `low | normal | high | urgent`), `notes`, `tags`, `assignedToUserId`, `followUpAt`, `sourceSubmissionId`, `metadata`.
  - `productId`, `optionUnitId`, `resolvedBookingId` as plain `text()` columns — cross-module references stay loose per the project FK rule.

  API:

  - `crmService.listCustomerSignals(db, { personId?, assignedToUserId?, status?, kind?, productId?, search? })` paginated.
  - `crmService.listSignalsForPerson(db, personId)` chronological convenience.
  - CRUD + `crmService.resolveCustomerSignalToBooking(db, signalId, bookingId)` which marks the signal `converted` and pins the bookingId.
  - Admin routes: `GET/POST /v1/admin/crm/customer-signals`, `GET/PATCH/DELETE /v1/admin/crm/customer-signals/:id`, `POST /v1/admin/crm/customer-signals/:id/resolve`, `GET /v1/admin/crm/people/:id/signals`.
  - React hooks: `useCustomerSignals(filters)`, `useCustomerSignalsForPerson(personId)`, `useCustomerSignal(id)`, `useCustomerSignalMutation()` returning `{ create, update, remove, resolve }`.

  Migration: `templates/operator/migrations/0027_customer_signals.sql`, registered in `meta/_journal.json`.

  Out of scope (deferred): full "create booking from signal" orchestration UI; auto-expiry cron that sweeps stale signals to `expired`. The data layer supports both.

- Updated dependencies [6493f62]
  - @voyant-travel/crm@0.26.4
  - @voyant-travel/react@0.26.4

## 0.26.3

### Patch Changes

- 372cad5: Add person-to-person relationships table for kinship, emergency contacts, and travel companions (closes #442).

  New `crm.person_relationships` table records directed `fromPerson → toPerson` edges of one of eleven kinds (`spouse`, `partner`, `parent`, `child`, `sibling`, `guardian`, `ward`, `emergency_contact`, `friend`, `travel_companion`, `other`). The optional `inverseKind` lets the service auto-write the symmetric edge in the same transaction (parent↔child, guardian↔ward, etc.) so operator UIs don't have to maintain both sides; the auto-inverse path is idempotent on retry. `(from_person_id, to_person_id, kind)` is uniquely indexed and a CHECK constraint rejects self-edges. Migration: `templates/operator/migrations/0026_person_relationships.sql` (registered in `meta/_journal.json`).

  API surface:

  - `crmService.listPersonRelationships(db, personId, { direction?: "from" | "to" | "both" })` — defaults to `both` so the typical "Jane's family" view returns the union.
  - `crmService.createPersonRelationship(db, fromPersonId, { toPersonId, kind, inverseKind?, autoInverse? })`
  - `crmService.getPersonRelationship` / `updatePersonRelationship` / `deletePersonRelationship`
  - Admin routes: `GET/POST /v1/admin/crm/people/:id/relationships`, `GET/PATCH/DELETE /v1/admin/crm/person-relationships/:id`.
  - React hooks: `usePersonRelationships(personId, { direction, kind })`, `usePersonRelationshipMutation(personId)` returning `{ create, update, remove }`.

  Out of scope (deferred): UI components for the relationship graph; phone-keyed emergency-contact convenience helpers (use `metadata` for now). The data layer is ready for both.

- Updated dependencies [372cad5]
  - @voyant-travel/crm@0.26.3
  - @voyant-travel/react@0.26.3

## 0.26.2

### Patch Changes

- @voyant-travel/crm@0.26.2
- @voyant-travel/react@0.26.2

## 0.26.1

### Patch Changes

- c0507a6: Move toxic PII to `crm.people` and add structured `person_documents` (closes #440 and #443).

  `user_profiles` is no longer the home for encrypted PII. The four free-text slots (accessibility / dietary / loyalty / insurance) move to `crm.people` so operator-managed humans without auth accounts can carry them, and identity documents graduate to a structured `person_documents` table with type / expiry / issuing authority / attachment + a partial unique index pinning a single primary doc per type per person.

  Booking travelers now snapshot dietary, accessibility, and the primary passport from the linked person record at create time (snapshot-on-create, explicit input always wins) via a new `POST /v1/admin/bookings/:id/travelers/with-travel-details` route. Templates wire the snapshot via `createBookingsHonoModule({ resolveTravelSnapshot })` delegating to `crmService.loadPersonTravelSnapshot` — bookings stays free of any direct CRM dependency.

  Customer portal exposes plaintext `accessibility/dietary/loyalty/insurance` on `/me` plus full CRUD over `/me/documents`. CRM admin gains server-side encrypt/decrypt endpoints (`travel-snapshot`, `profile-pii`, `*/from-plaintext`) so the operator booking-traveler dialog can pre-fill from profile and push diverging values back without the browser holding KMS material. The dialog itself now ships a "Travel details" section with passport / dietary / accessibility fields, plus "Pre-fill from profile" and "Save to profile" affordances when a CRM person is linked.

  Breaking changes (intentionally landed pre-1.0):

  - `user_profiles.documentsEncrypted/accessibilityEncrypted/dietaryEncrypted/loyaltyEncrypted/insuranceEncrypted` columns are removed. Migration ships `templates/operator/migrations/0024_people_pii_documents.sql`.
  - `customerPortalProfileSchema.documents` (array) replaced with separate `accessibility/dietary/loyalty/insurance` plaintext string fields. Document CRUD lives at `/v1/public/customer-portal/me/documents`.
  - `bookingsHonoModule` and `crmHonoModule` are still exported but the env-driven default factory `createBookingsHonoModule()` / `createCrmHonoModule()` is the new recommended entry point.

- Updated dependencies [c0507a6]
  - @voyant-travel/crm@0.26.1
  - @voyant-travel/react@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/crm@0.26.0
- @voyant-travel/react@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/crm@0.25.0
- @voyant-travel/react@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/crm@0.24.3
- @voyant-travel/react@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/crm@0.24.2
- @voyant-travel/react@0.24.2

## 0.24.1

### Patch Changes

- @voyant-travel/crm@0.24.1
- @voyant-travel/react@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/crm@0.24.0
- @voyant-travel/react@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/crm@0.23.0
- @voyant-travel/react@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/crm@0.22.0
- @voyant-travel/react@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/crm@0.21.1
- @voyant-travel/react@0.21.1

## 0.21.0

### Patch Changes

- @voyant-travel/crm@0.21.0
- @voyant-travel/react@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/crm@0.20.0
- @voyant-travel/react@0.20.0

## 0.19.0

### Patch Changes

- @voyant-travel/crm@0.19.0
- @voyant-travel/react@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies [8932f60]
  - @voyant-travel/crm@0.18.0
  - @voyant-travel/react@0.18.0

## 0.17.0

### Patch Changes

- @voyant-travel/crm@0.17.0
- @voyant-travel/react@0.17.0

## 0.16.0

### Patch Changes

- @voyant-travel/crm@0.16.0
- @voyant-travel/react@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/crm@0.15.0
- @voyant-travel/react@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/crm@0.14.0
- @voyant-travel/react@0.14.0

## 0.13.0

### Patch Changes

- @voyant-travel/crm@0.13.0
- @voyant-travel/react@0.13.0

## 0.12.0

### Patch Changes

- @voyant-travel/crm@0.12.0
- @voyant-travel/react@0.12.0

## 0.11.0

### Patch Changes

- @voyant-travel/crm@0.11.0
- @voyant-travel/react@0.11.0

## 0.10.0

### Patch Changes

- @voyant-travel/crm@0.10.0
- @voyant-travel/react@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/crm@0.9.0
- @voyant-travel/react@0.9.0

## 0.8.0

### Patch Changes

- @voyant-travel/crm@0.8.0
- @voyant-travel/react@0.8.0

## 0.7.0

### Patch Changes

- @voyant-travel/crm@0.7.0
- @voyant-travel/react@0.7.0

## 0.6.9

### Patch Changes

- @voyant-travel/crm@0.6.9
- @voyant-travel/react@0.6.9

## 0.6.8

### Patch Changes

- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
- Updated dependencies [b218885]
  - @voyant-travel/crm@0.6.8
  - @voyant-travel/react@0.6.8

## 0.6.7

### Patch Changes

- @voyant-travel/crm@0.6.7
- @voyant-travel/react@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/crm@0.6.6
- @voyant-travel/react@0.6.6

## 0.6.5

### Patch Changes

- @voyant-travel/crm@0.6.5
- @voyant-travel/react@0.6.5

## 0.6.4

### Patch Changes

- @voyant-travel/crm@0.6.4
- @voyant-travel/react@0.6.4

## 0.6.3

### Patch Changes

- @voyant-travel/crm@0.6.3
- @voyant-travel/react@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/crm@0.6.2
- @voyant-travel/react@0.6.2

## 0.6.1

### Patch Changes

- @voyant-travel/crm@0.6.1
- @voyant-travel/react@0.6.1

## 0.6.0

### Patch Changes

- @voyant-travel/crm@0.6.0
- @voyant-travel/react@0.6.0

## 0.5.0

### Patch Changes

- @voyant-travel/crm@0.5.0
- @voyant-travel/react@0.5.0

## 0.4.5

### Patch Changes

- Updated dependencies [e3f6e72]
  - @voyant-travel/crm@0.4.5
  - @voyant-travel/react@0.4.5

## 0.4.4

### Patch Changes

- @voyant-travel/crm@0.4.4
- @voyant-travel/react@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/crm@0.4.3
- @voyant-travel/react@0.4.3

## 0.4.2

### Patch Changes

- @voyant-travel/crm@0.4.2
- @voyant-travel/react@0.4.2

## 0.4.1

### Patch Changes

- @voyant-travel/crm@0.4.1
- @voyant-travel/react@0.4.1

## 0.4.0

### Patch Changes

- @voyant-travel/crm@0.4.0
- @voyant-travel/react@0.4.0

## 0.3.1

### Patch Changes

- @voyant-travel/crm@0.3.1
- @voyant-travel/react@0.3.1

## 0.3.0

### Patch Changes

- e57725d: Flatten frontend provider wiring around a shared `@voyant-travel/react` config provider so module react packages can share one app-level Voyant context.
- Updated dependencies [e57725d]
  - @voyant-travel/crm@0.3.0
  - @voyant-travel/react@0.3.0

## 0.2.0

### Minor Changes

- 8d16e77: Introduce `@voyant-travel/crm-react` as the publishable CRM React runtime package and update first-party starters to consume it instead of the private Voyant UI registry workspace.

### Patch Changes

- @voyant-travel/crm@0.2.0
