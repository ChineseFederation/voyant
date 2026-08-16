---
"@voyant-travel/flights-contracts": minor
"@voyant-travel/flights": minor
"@voyant-travel/flights-react": minor
"@voyant-travel/ui": minor
---

Show flight availability where the traveller chooses it.

Adds two capability-gated connector methods and the UI that consumes them:

- `flight/fare-calendar` (`searchFareCalendar`) quotes a window of departure
  dates, so the date picker shows the cheapest indicative price per day, bands
  it cheap / mid / expensive against the visible window, and strikes out days
  the provider doesn't fly. Served as `POST /v1/admin/flights/fare-calendar`,
  capped at a 92-day window.
- `flight/served-markets` (`listServedMarkets`) declares the airports a
  connection sells, so the airport picker leads with the operator's own
  network. It ranks, it never filters — every airport stays reachable.

The airport picker also groups by routes this operator has actually searched,
remembered per browser, and the airport reference list is now deterministically
ordered instead of returning an arbitrary slice.

Flight offer rows now name the airline and its flight numbers instead of
relying on the carrier logo alone.

`Calendar` and `DatePicker` gain a `dayAnnotation` prop for rendering a
secondary line under a day's number.

Connectors that declare neither capability answer 501 and every surface
degrades to its previous behaviour.
