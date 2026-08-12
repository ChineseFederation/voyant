---
"@voyant-travel/ui": minor
"@voyant-travel/admin": patch
"@voyant-travel/admin-app": patch
"@voyant-travel/bookings-react": patch
"@voyant-travel/finance-react": patch
"@voyant-travel/inventory-react": patch
"@voyant-travel/distribution-react": patch
"@voyant-travel/relationships-react": patch
"@voyant-travel/catalog-react": patch
"@voyant-travel/legal-react": patch
"@voyant-travel/notifications-react": patch
"@voyant-travel/operations-react": patch
"@voyant-travel/commerce-react": patch
"@voyant-travel/action-ledger-react": patch
"@voyant-travel/trips-react": patch
---

Make the operator admin usable on a phone. A measured audit at 390x844 found the
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
