# @voyant-travel/flights-react

## 0.311.0

### Patch Changes

- @voyant-travel/finance-react@0.311.0
- @voyant-travel/relationships-react@0.311.0

## 0.310.0

### Patch Changes

- @voyant-travel/finance-react@0.310.0
- @voyant-travel/relationships-react@0.310.0

## 0.309.0

### Patch Changes

- Updated dependencies [cdad152]
  - @voyant-travel/finance@0.262.0
  - @voyant-travel/finance-react@0.309.0
  - @voyant-travel/relationships-react@0.309.0

## 0.308.0

### Patch Changes

- @voyant-travel/finance-react@0.308.0
- @voyant-travel/relationships-react@0.308.0

## 0.307.0

### Patch Changes

- @voyant-travel/finance-react@0.307.0
- @voyant-travel/relationships-react@0.307.0

## 0.306.0

### Patch Changes

- @voyant-travel/relationships-react@0.306.0
- @voyant-travel/finance-react@0.306.0

## 0.305.0

### Patch Changes

- Updated dependencies [d631aa1]
  - @voyant-travel/finance@0.261.0
  - @voyant-travel/finance-react@0.305.0
  - @voyant-travel/relationships-react@0.305.0

## 0.304.0

### Patch Changes

- Updated dependencies [72c2616]
  - @voyant-travel/finance@0.260.0
  - @voyant-travel/finance-react@0.304.0
  - @voyant-travel/relationships-react@0.304.0

## 0.303.0

### Patch Changes

- @voyant-travel/finance-react@0.303.0
- @voyant-travel/relationships-react@0.303.0

## 0.302.0

### Patch Changes

- Updated dependencies [18212cc]
  - @voyant-travel/i18n@0.127.0
  - @voyant-travel/finance-react@0.302.0
  - @voyant-travel/relationships-react@0.302.0

## 0.301.0

### Patch Changes

- Updated dependencies [380c46e]
  - @voyant-travel/flights@0.240.0
  - @voyant-travel/finance-react@0.301.0
  - @voyant-travel/relationships-react@0.301.0

## 0.300.0

### Minor Changes

- 2ddcb4b: Show flight availability where the traveller chooses it.

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

### Patch Changes

- Updated dependencies [2ddcb4b]
  - @voyant-travel/flights@0.239.0
  - @voyant-travel/ui@0.112.0
  - @voyant-travel/admin@0.138.0
  - @voyant-travel/finance-react@0.300.0
  - @voyant-travel/relationships-react@0.300.0

## 0.299.0

### Patch Changes

- Updated dependencies [46d00dc]
  - @voyant-travel/finance@0.259.0
  - @voyant-travel/flights@0.238.0
  - @voyant-travel/finance-react@0.299.0
  - @voyant-travel/react@0.106.4
  - @voyant-travel/relationships-react@0.299.0

## 0.298.0

### Patch Changes

- @voyant-travel/react@0.106.3
- @voyant-travel/finance-react@0.298.0
- @voyant-travel/relationships-react@0.298.0

## 0.297.0

### Patch Changes

- @voyant-travel/finance-react@0.297.0
- @voyant-travel/relationships-react@0.297.0

## 0.296.0

### Patch Changes

- Updated dependencies [b78b724]
  - @voyant-travel/finance@0.258.0
  - @voyant-travel/finance-react@0.296.0
  - @voyant-travel/relationships-react@0.296.0

## 0.295.0

### Patch Changes

- @voyant-travel/finance-react@0.295.0
- @voyant-travel/relationships-react@0.295.0

## 0.294.0

### Patch Changes

- Updated dependencies [b11c10e]
  - @voyant-travel/finance@0.257.0
  - @voyant-travel/finance-react@0.294.0
  - @voyant-travel/relationships-react@0.294.0

## 0.293.0

### Patch Changes

- Updated dependencies [c6ccc30]
  - @voyant-travel/i18n@0.126.0
  - @voyant-travel/finance-react@0.293.0
  - @voyant-travel/relationships-react@0.293.0

## 0.292.0

### Patch Changes

- Updated dependencies [c6b5b12]
  - @voyant-travel/finance@0.256.0
  - @voyant-travel/finance-react@0.292.0
  - @voyant-travel/relationships-react@0.292.0

## 0.291.0

### Patch Changes

- Updated dependencies [70752e1]
  - @voyant-travel/i18n@0.125.0
  - @voyant-travel/finance-react@0.291.0
  - @voyant-travel/relationships-react@0.291.0

## 0.290.0

### Patch Changes

- Updated dependencies [1f36964]
  - @voyant-travel/finance@0.255.0
  - @voyant-travel/finance-react@0.290.0
  - @voyant-travel/relationships-react@0.290.0

## 0.289.0

### Patch Changes

- Updated dependencies [798b05b]
  - @voyant-travel/finance@0.254.0
  - @voyant-travel/finance-react@0.289.0
  - @voyant-travel/relationships-react@0.289.0

## 0.288.0

### Patch Changes

- Updated dependencies [e99380d]
  - @voyant-travel/i18n@0.124.0
  - @voyant-travel/finance-react@0.288.0
  - @voyant-travel/relationships-react@0.288.0

## 0.287.0

### Patch Changes

- Updated dependencies [c2aedcb]
  - @voyant-travel/finance@0.253.0
  - @voyant-travel/react@0.106.2
  - @voyant-travel/finance-react@0.287.0
  - @voyant-travel/relationships-react@0.287.0

## 0.286.0

### Patch Changes

- @voyant-travel/finance-react@0.286.0
- @voyant-travel/relationships-react@0.286.0

## 0.285.0

### Patch Changes

- Updated dependencies [1858c5b]
  - @voyant-travel/finance@0.252.0
  - @voyant-travel/finance-react@0.285.0
  - @voyant-travel/relationships-react@0.285.0

## 0.284.0

### Patch Changes

- Updated dependencies [0fe4ce8]
- Updated dependencies [a414f2c]
  - @voyant-travel/finance@0.251.0
  - @voyant-travel/finance-react@0.284.0
  - @voyant-travel/relationships-react@0.284.0

## 0.283.0

### Patch Changes

- Updated dependencies [d3b17e2]
  - @voyant-travel/finance@0.250.0
  - @voyant-travel/finance-react@0.283.0
  - @voyant-travel/relationships-react@0.283.0

## 0.282.0

### Patch Changes

- @voyant-travel/finance-react@0.282.0
- @voyant-travel/relationships-react@0.282.0

## 0.281.0

### Patch Changes

- Updated dependencies [1a3ba50]
- Updated dependencies [599ffed]
- Updated dependencies [c805276]
- Updated dependencies [36f3085]
- Updated dependencies [38531e2]
  - @voyant-travel/finance@0.249.0
  - @voyant-travel/finance-react@0.281.0
  - @voyant-travel/i18n@0.123.1
  - @voyant-travel/react@0.106.1
  - @voyant-travel/relationships-react@0.281.0

## 0.280.0

### Patch Changes

- Updated dependencies [d25f047]
- Updated dependencies [8413c21]
  - @voyant-travel/finance-react@0.280.0
  - @voyant-travel/finance@0.248.0
  - @voyant-travel/relationships-react@0.280.0

## 0.279.0

### Minor Changes

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
- Updated dependencies [ab7133f]
- Updated dependencies [c911139]
- Updated dependencies [8c38592]
- Updated dependencies [c911139]
- Updated dependencies [c911139]
  - @voyant-travel/relationships-react@0.279.0
  - @voyant-travel/finance-react@0.279.0
  - @voyant-travel/finance@0.247.0

## 0.278.0

### Patch Changes

- Updated dependencies [f4ac273]
  - @voyant-travel/ui@0.111.0
  - @voyant-travel/admin@0.137.0
  - @voyant-travel/finance-react@0.278.0
  - @voyant-travel/relationships-react@0.278.0

## 0.277.0

### Patch Changes

- @voyant-travel/finance-react@0.277.0
- @voyant-travel/relationships-react@0.277.0

## 0.276.0

### Patch Changes

- Updated dependencies [7dbd3c7]
- Updated dependencies [2544ff4]
  - @voyant-travel/finance@0.246.0
  - @voyant-travel/finance-react@0.276.0
  - @voyant-travel/relationships-react@0.276.0

## 0.275.0

### Patch Changes

- Updated dependencies [231acfa]
- Updated dependencies [e363b1b]
- Updated dependencies [af3996b]
- Updated dependencies [4c2b4ce]
  - @voyant-travel/flights@0.237.0
  - @voyant-travel/finance-react@0.275.0
  - @voyant-travel/relationships-react@0.275.0

## 0.274.0

### Patch Changes

- @voyant-travel/finance-react@0.274.0
- @voyant-travel/relationships-react@0.274.0

## 0.273.0

### Patch Changes

- @voyant-travel/finance-react@0.273.0
- @voyant-travel/relationships-react@0.273.0

## 0.272.0

### Patch Changes

- @voyant-travel/finance-react@0.272.0
- @voyant-travel/relationships-react@0.272.0

## 0.271.0

### Patch Changes

- @voyant-travel/finance-react@0.271.0
- @voyant-travel/relationships-react@0.271.0

## 0.270.0

### Patch Changes

- Updated dependencies [c8b9c1e]
  - @voyant-travel/finance@0.245.0
  - @voyant-travel/finance-react@0.270.0
  - @voyant-travel/relationships-react@0.270.0

## 0.269.0

### Patch Changes

- Updated dependencies [bd8f49a]
- Updated dependencies [1e0506f]
  - @voyant-travel/admin@0.136.0
  - @voyant-travel/finance-react@0.269.0
  - @voyant-travel/relationships-react@0.269.0

## 0.268.0

### Patch Changes

- @voyant-travel/finance-react@0.268.0
- @voyant-travel/relationships-react@0.268.0

## 0.267.0

### Patch Changes

- @voyant-travel/finance-react@0.267.0
- @voyant-travel/relationships-react@0.267.0

## 0.266.0

### Patch Changes

- Updated dependencies [484b207]
  - @voyant-travel/finance@0.244.0
  - @voyant-travel/finance-react@0.266.0
  - @voyant-travel/i18n@0.123.0
  - @voyant-travel/relationships-react@0.266.0

## 0.265.0

### Patch Changes

- Updated dependencies [7b8ef95]
- Updated dependencies [f56d552]
  - @voyant-travel/react@0.106.0
  - @voyant-travel/admin@0.135.0
  - @voyant-travel/i18n@0.122.1
  - @voyant-travel/finance-react@0.265.0
  - @voyant-travel/relationships-react@0.265.0

## 0.264.0

### Patch Changes

- Updated dependencies [1be6b76]
  - @voyant-travel/finance@0.243.0
  - @voyant-travel/finance-react@0.264.0
  - @voyant-travel/react@0.105.0
  - @voyant-travel/relationships-react@0.264.0

## 0.263.0

### Patch Changes

- Updated dependencies [d98648a]
  - @voyant-travel/finance@0.242.0
  - @voyant-travel/finance-react@0.263.0
  - @voyant-travel/relationships-react@0.263.0

## 0.262.0

### Patch Changes

- Updated dependencies [380dad7]
  - @voyant-travel/finance@0.241.0
  - @voyant-travel/finance-react@0.262.0
  - @voyant-travel/relationships-react@0.262.0

## 0.261.0

### Patch Changes

- @voyant-travel/finance-react@0.261.0
- @voyant-travel/relationships-react@0.261.0

## 0.260.0

### Patch Changes

- Updated dependencies [e8bd000]
  - @voyant-travel/finance@0.240.0
  - @voyant-travel/finance-react@0.260.0
  - @voyant-travel/relationships-react@0.260.0

## 0.259.0

### Patch Changes

- @voyant-travel/finance-react@0.259.0
- @voyant-travel/relationships-react@0.259.0

## 0.258.0

### Patch Changes

- @voyant-travel/finance-react@0.258.0
- @voyant-travel/relationships-react@0.258.0

## 0.257.0

### Patch Changes

- @voyant-travel/finance-react@0.257.0
- @voyant-travel/relationships-react@0.257.0

## 0.256.0

### Patch Changes

- Updated dependencies [64df424]
  - @voyant-travel/i18n@0.122.0
  - @voyant-travel/finance-react@0.256.0
  - @voyant-travel/relationships-react@0.256.0

## 0.255.0

### Patch Changes

- @voyant-travel/finance-react@0.255.0
- @voyant-travel/relationships-react@0.255.0

## 0.254.0

### Patch Changes

- @voyant-travel/finance-react@0.254.0
- @voyant-travel/relationships-react@0.254.0

## 0.253.0

### Patch Changes

- @voyant-travel/finance-react@0.253.0
- @voyant-travel/relationships-react@0.253.0

## 0.252.0

### Patch Changes

- @voyant-travel/finance-react@0.252.0
- @voyant-travel/relationships-react@0.252.0

## 0.251.0

### Patch Changes

- @voyant-travel/finance-react@0.251.0
- @voyant-travel/relationships-react@0.251.0

## 0.250.0

### Patch Changes

- @voyant-travel/finance-react@0.250.0
- @voyant-travel/relationships-react@0.250.0

## 0.249.0

### Patch Changes

- @voyant-travel/finance-react@0.249.0
- @voyant-travel/relationships-react@0.249.0

## 0.248.0

### Patch Changes

- @voyant-travel/finance-react@0.248.0
- @voyant-travel/relationships-react@0.248.0

## 0.247.0

### Patch Changes

- @voyant-travel/finance-react@0.247.0
- @voyant-travel/relationships-react@0.247.0

## 0.246.0

### Patch Changes

- @voyant-travel/finance-react@0.246.0
- @voyant-travel/relationships-react@0.246.0

## 0.245.0

### Patch Changes

- Updated dependencies [ff0b8cc]
- Updated dependencies [645a219]
- Updated dependencies [b7bb6c8]
  - @voyant-travel/finance-react@0.245.0
  - @voyant-travel/i18n@0.121.0
  - @voyant-travel/finance@0.239.0
  - @voyant-travel/relationships-react@0.245.0

## 0.244.0

### Patch Changes

- @voyant-travel/finance-react@0.244.0
- @voyant-travel/relationships-react@0.244.0

## 0.243.0

### Patch Changes

- @voyant-travel/finance-react@0.243.0
- @voyant-travel/relationships-react@0.243.0

## 0.242.0

### Patch Changes

- @voyant-travel/finance-react@0.242.0
- @voyant-travel/relationships-react@0.242.0

## 0.241.0

### Patch Changes

- Updated dependencies [06a79a0]
  - @voyant-travel/finance@0.238.0
  - @voyant-travel/i18n@0.120.0
  - @voyant-travel/finance-react@0.241.0
  - @voyant-travel/relationships-react@0.241.0

## 0.240.0

### Patch Changes

- @voyant-travel/finance-react@0.240.0
- @voyant-travel/relationships-react@0.240.0

## 0.239.0

### Patch Changes

- @voyant-travel/finance-react@0.239.0
- @voyant-travel/relationships-react@0.239.0

## 0.238.0

### Patch Changes

- @voyant-travel/relationships-react@0.238.0
- @voyant-travel/finance-react@0.238.0

## 0.237.0

### Patch Changes

- Updated dependencies [f69e880]
  - @voyant-travel/i18n@0.119.4
  - @voyant-travel/finance@0.237.0
  - @voyant-travel/finance-react@0.237.0
  - @voyant-travel/relationships-react@0.237.0

## 0.236.0

### Patch Changes

- Updated dependencies [eeaa5b5]
  - @voyant-travel/finance@0.236.0
  - @voyant-travel/flights@0.236.0
  - @voyant-travel/finance-react@0.236.0
  - @voyant-travel/relationships-react@0.236.0

## 0.235.0

### Patch Changes

- @voyant-travel/finance@0.235.0
- @voyant-travel/finance-react@0.235.0
- @voyant-travel/relationships-react@0.235.0
- @voyant-travel/flights@0.235.0

## 0.234.0

### Patch Changes

- Updated dependencies [9f412dd]
- Updated dependencies [2ed62d3]
  - @voyant-travel/finance@0.234.0
  - @voyant-travel/finance-react@0.234.0
  - @voyant-travel/flights@0.234.0
  - @voyant-travel/relationships-react@0.234.0

## 0.233.0

### Patch Changes

- Updated dependencies [15c1c64]
  - @voyant-travel/finance@0.233.0
  - @voyant-travel/flights@0.233.0
  - @voyant-travel/finance-react@0.233.0
  - @voyant-travel/relationships-react@0.233.0

## 0.232.0

### Patch Changes

- @voyant-travel/flights@0.232.0
- @voyant-travel/finance-react@0.232.0
- @voyant-travel/relationships-react@0.232.0
- @voyant-travel/finance@0.232.0

## 0.231.0

### Patch Changes

- Updated dependencies [f7adc5b]
  - @voyant-travel/i18n@0.119.3
  - @voyant-travel/finance-react@0.231.0
  - @voyant-travel/relationships-react@0.231.0
  - @voyant-travel/finance@0.231.0
  - @voyant-travel/flights@0.231.0

## 0.230.0

### Patch Changes

- Updated dependencies [72c6753]
- Updated dependencies [79606bb]
  - @voyant-travel/finance@0.230.0
  - @voyant-travel/flights@0.230.0
  - @voyant-travel/finance-react@0.230.0
  - @voyant-travel/relationships-react@0.230.0

## 0.229.0

### Patch Changes

- Updated dependencies [5d3b563]
- Updated dependencies [2601445]
  - @voyant-travel/finance@0.229.0
  - @voyant-travel/flights@0.229.0
  - @voyant-travel/finance-react@0.229.0
  - @voyant-travel/relationships-react@0.229.0

## 0.228.0

### Patch Changes

- Updated dependencies [bf71bca]
  - @voyant-travel/admin@0.134.0
  - @voyant-travel/finance-react@0.228.0
  - @voyant-travel/relationships-react@0.228.0
  - @voyant-travel/finance@0.228.0
  - @voyant-travel/flights@0.228.0

## 0.227.0

### Patch Changes

- Updated dependencies [e65bd25]
  - @voyant-travel/relationships-react@0.227.0
  - @voyant-travel/i18n@0.119.2
  - @voyant-travel/finance@0.227.0
  - @voyant-travel/finance-react@0.227.0
  - @voyant-travel/flights@0.227.0

## 0.226.0

### Patch Changes

- Updated dependencies [6beffa2]
  - @voyant-travel/finance@0.226.0
  - @voyant-travel/finance-react@0.226.0
  - @voyant-travel/relationships-react@0.226.0
  - @voyant-travel/flights@0.226.0

## 0.225.0

### Patch Changes

- Updated dependencies [4fe6f79]
- Updated dependencies [276d44d]
- Updated dependencies [0c30250]
- Updated dependencies [5fa76aa]
  - @voyant-travel/finance@0.225.0
  - @voyant-travel/admin@0.133.0
  - @voyant-travel/finance-react@0.225.0
  - @voyant-travel/flights@0.225.0
  - @voyant-travel/relationships-react@0.225.0

## 0.224.0

### Patch Changes

- @voyant-travel/finance@0.224.0
- @voyant-travel/flights@0.224.0
- @voyant-travel/admin@0.132.0
- @voyant-travel/finance-react@0.224.0
- @voyant-travel/relationships-react@0.224.0

## 0.223.0

### Patch Changes

- @voyant-travel/finance@0.223.0
- @voyant-travel/flights@0.223.0
- @voyant-travel/finance-react@0.223.0
- @voyant-travel/relationships-react@0.223.0

## 0.222.0

### Patch Changes

- @voyant-travel/finance-react@0.222.0
- @voyant-travel/relationships-react@0.222.0
- @voyant-travel/finance@0.222.0
- @voyant-travel/flights@0.222.0

## 0.221.1

## 0.221.0

### Patch Changes

- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
- Updated dependencies [52c794d]
  - @voyant-travel/finance@0.221.0
  - @voyant-travel/flights@0.221.0
  - @voyant-travel/finance-react@0.221.0
  - @voyant-travel/relationships-react@0.221.0

## 0.220.0

### Patch Changes

- Updated dependencies [8adeb23]
- Updated dependencies [7496159]
  - @voyant-travel/finance@0.220.0
  - @voyant-travel/i18n@0.119.0
  - @voyant-travel/finance-react@0.220.0
  - @voyant-travel/flights@0.220.0
  - @voyant-travel/admin@0.131.1
  - @voyant-travel/relationships-react@0.220.0

## 0.219.0

### Patch Changes

- @voyant-travel/finance-react@0.219.0
- @voyant-travel/relationships-react@0.219.0
- @voyant-travel/finance@0.219.0
- @voyant-travel/flights@0.219.0

## 0.218.0

### Patch Changes

- Updated dependencies [a799849]
  - @voyant-travel/finance@0.218.0
  - @voyant-travel/finance-react@0.218.0
  - @voyant-travel/flights@0.218.0
  - @voyant-travel/relationships-react@0.218.0

## 0.217.0

### Patch Changes

- @voyant-travel/finance-react@0.217.0
- @voyant-travel/relationships-react@0.217.0
- @voyant-travel/finance@0.217.0
- @voyant-travel/flights@0.217.0

## 0.216.0

### Patch Changes

- Updated dependencies [903c754]
  - @voyant-travel/i18n@0.118.3
  - @voyant-travel/finance@0.216.0
  - @voyant-travel/finance-react@0.216.0
  - @voyant-travel/relationships-react@0.216.0
  - @voyant-travel/flights@0.216.0

## 0.215.0

### Patch Changes

- Updated dependencies [6c76de3]
  - @voyant-travel/i18n@0.118.2
  - @voyant-travel/finance@0.215.0
  - @voyant-travel/finance-react@0.215.0
  - @voyant-travel/relationships-react@0.215.0
  - @voyant-travel/flights@0.215.0

## 0.214.0

### Patch Changes

- Updated dependencies [bf20d76]
  - @voyant-travel/ui@0.110.0
  - @voyant-travel/admin@0.131.0
  - @voyant-travel/finance-react@0.214.0
  - @voyant-travel/relationships-react@0.214.0
  - @voyant-travel/finance@0.214.0
  - @voyant-travel/flights@0.214.0

## 0.213.0

### Patch Changes

- @voyant-travel/finance-react@0.213.0
- @voyant-travel/relationships-react@0.213.0
- @voyant-travel/finance@0.213.0
- @voyant-travel/flights@0.213.0

## 0.212.0

### Patch Changes

- @voyant-travel/flights@0.212.0
- @voyant-travel/finance-react@0.212.0
- @voyant-travel/relationships-react@0.212.0
- @voyant-travel/finance@0.212.0

## 0.211.0

### Patch Changes

- @voyant-travel/flights@0.211.0
- @voyant-travel/finance-react@0.211.0
- @voyant-travel/relationships-react@0.211.0
- @voyant-travel/finance@0.211.0

## 0.210.0

### Patch Changes

- @voyant-travel/finance-react@0.210.0
- @voyant-travel/relationships-react@0.210.0
- @voyant-travel/finance@0.210.0
- @voyant-travel/flights@0.210.0

## 0.209.0

### Patch Changes

- @voyant-travel/finance-react@0.209.0
- @voyant-travel/relationships-react@0.209.0
- @voyant-travel/finance@0.209.0
- @voyant-travel/flights@0.209.0

## 0.208.0

### Patch Changes

- Updated dependencies [1873611]
  - @voyant-travel/admin@0.130.0
  - @voyant-travel/i18n@0.118.0
  - @voyant-travel/finance-react@0.208.0
  - @voyant-travel/relationships-react@0.208.0
  - @voyant-travel/finance@0.208.0
  - @voyant-travel/flights@0.208.0

## 0.207.1

### Patch Changes

- edbf937: Declare graph `policy` names on ticket/cancel flight Actions so handler-owned approval mint matches the Tool contract.
- Updated dependencies [edbf937]
  - @voyant-travel/flights@0.207.1

## 0.207.0

### Patch Changes

- @voyant-travel/finance@0.207.0
- @voyant-travel/finance-react@0.207.0
- @voyant-travel/relationships-react@0.207.0
- @voyant-travel/flights@0.207.0

## 0.206.0

### Patch Changes

- Updated dependencies [5daf427]
  - @voyant-travel/i18n@0.117.3
  - @voyant-travel/finance@0.206.0
  - @voyant-travel/finance-react@0.206.0
  - @voyant-travel/relationships-react@0.206.0
  - @voyant-travel/flights@0.206.0

## 0.205.0

### Patch Changes

- Updated dependencies [113edfc]
- Updated dependencies [58baffe]
  - @voyant-travel/flights@0.205.0
  - @voyant-travel/finance@0.205.0
  - @voyant-travel/finance-react@0.205.0
  - @voyant-travel/relationships-react@0.205.0

## 0.204.0

### Patch Changes

- @voyant-travel/finance-react@0.204.0
- @voyant-travel/relationships-react@0.204.0
- @voyant-travel/finance@0.204.0
- @voyant-travel/flights@0.204.0

## 0.203.0

### Patch Changes

- Updated dependencies [17f1239]
  - @voyant-travel/finance@0.203.0
  - @voyant-travel/finance-react@0.203.0
  - @voyant-travel/flights@0.203.0
  - @voyant-travel/relationships-react@0.203.0

## 0.202.0

### Patch Changes

- @voyant-travel/finance-react@0.202.0
- @voyant-travel/relationships-react@0.202.0
- @voyant-travel/finance@0.202.0
- @voyant-travel/flights@0.202.0

## 0.201.1

### Patch Changes

- Updated dependencies [a02a76b]
  - @voyant-travel/finance@0.201.1
  - @voyant-travel/flights@0.201.1
  - @voyant-travel/finance-react@0.201.1

## 0.201.0

### Patch Changes

- Updated dependencies [5e03ae7]
  - @voyant-travel/finance@0.201.0
  - @voyant-travel/finance-react@0.201.0
  - @voyant-travel/flights@0.201.0
  - @voyant-travel/relationships-react@0.201.0

## 0.200.0

### Patch Changes

- @voyant-travel/finance-react@0.200.0
- @voyant-travel/flights@0.200.0
- @voyant-travel/finance@0.200.0
- @voyant-travel/relationships-react@0.200.0
- @voyant-travel/ui@0.109.6

## 0.199.0

### Patch Changes

- @voyant-travel/finance@0.199.0
- @voyant-travel/flights@0.199.0
- @voyant-travel/finance-react@0.199.0
- @voyant-travel/relationships-react@0.199.0

## 0.198.1

### Patch Changes

- e2cb9f5: Give every admin screen consistent page spacing. Previously each page invented
  its own padding (`p-6`, `px-6 py-6 lg:px-8`, `container mx-auto py-6` with no
  horizontal padding, or none at all), so screens like the booking engine had no
  spacing while others differed.

  The admin workspace layout now wraps the page outlet in a single padded content
  region (`px-4 py-6 md:px-6`), and the per-page root padding was removed so it no
  longer double-pads (max-width caps are kept). The full-height settings two-pane
  bleeds back out of that padding and re-applies its own so it stays edge-to-edge.

- e2cb9f5: Plain-language copy pass across the admin UI. Rewrites microcopy on the
  non-developer screens so it reads for travel professionals rather than
  engineers: removes developer jargon (entity, tenant, adapter/connector,
  payload, sync/reconcile internals, raw database column names and code
  fragments), strips internal/roadmap notes that leaked into user copy, cuts
  verbose and redundant helper text, and aligns terminology to the canonical
  Ubiquitous Language (Traveler over pax/guest, Supplier, Quote/Quote Version,
  "record" instead of "entity") with consistent sentence case. English catalog
  copy only; ICU placeholders and en/ro key parity preserved.
- e2cb9f5: Bring the Romanian (ro) admin translations in line with the plain-language
  English copy pass — re-translating the updated strings so the Romanian UI drops
  the same jargon and reads as clearly as the English. Values only; en/ro key
  parity and ICU placeholders preserved.
- e2cb9f5: Make form and dialog select triggers full-width. The shared `SelectTrigger`
  defaults to `w-fit`, so selects that sit in a form or dialog next to full-width
  inputs rendered noticeably narrower. Add `w-full` at those call sites (filter
  popovers, dialogs, and stacked form fields). Toolbar and inline selects that
  carry an intentional fixed width are left unchanged.
- e2cb9f5: Align off-scale spacing utilities to the shared scale: gap-5 to gap-4, p-5 to
  p-6, space-y-5 to space-y-4, space-y-8 to space-y-6, p-10/p-12 to p-8, gap-8 to
  gap-6. Keeps spacing on the consistent 1/2/3/4/6/8 scale used across the app.
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
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
- Updated dependencies [e2cb9f5]
  - @voyant-travel/i18n@0.117.2
  - @voyant-travel/finance-react@0.198.1
  - @voyant-travel/relationships-react@0.198.1
  - @voyant-travel/admin@0.129.1
  - @voyant-travel/ui@0.109.5
  - @voyant-travel/finance@0.198.1
  - @voyant-travel/flights@0.198.1

## 0.198.0

### Patch Changes

- @voyant-travel/relationships-react@0.198.0
- @voyant-travel/finance-react@0.198.0
- @voyant-travel/finance@0.198.0
- @voyant-travel/flights@0.198.0

## 0.197.0

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/finance@0.197.0
  - @voyant-travel/flights@0.197.0
  - @voyant-travel/relationships-react@0.197.0
  - @voyant-travel/finance-react@0.197.0

## 0.196.0

### Patch Changes

- Updated dependencies [58020ec]
  - @voyant-travel/finance@0.196.0
  - @voyant-travel/flights@0.196.0
  - @voyant-travel/relationships-react@0.196.0
  - @voyant-travel/finance-react@0.196.0

## 0.195.0

### Patch Changes

- @voyant-travel/finance@0.195.0
- @voyant-travel/finance-react@0.195.0
- @voyant-travel/relationships-react@0.195.0
- @voyant-travel/flights@0.195.0

## 0.194.0

### Patch Changes

- @voyant-travel/flights@0.194.0
- @voyant-travel/finance-react@0.194.0
- @voyant-travel/relationships-react@0.194.0
- @voyant-travel/finance@0.194.0

## 0.193.0

### Patch Changes

- Updated dependencies [90d44c0]
  - @voyant-travel/admin@0.129.0
  - @voyant-travel/i18n@0.117.0
  - @voyant-travel/finance-react@0.193.0
  - @voyant-travel/relationships-react@0.193.0
  - @voyant-travel/finance@0.193.0
  - @voyant-travel/flights@0.193.0

## 0.192.1

### Patch Changes

- @voyant-travel/finance@0.192.1
- @voyant-travel/flights@0.192.1
- @voyant-travel/finance-react@0.192.1

## 0.192.0

### Patch Changes

- Updated dependencies [e68a705]
  - @voyant-travel/finance@0.192.0
  - @voyant-travel/finance-react@0.192.0
  - @voyant-travel/relationships-react@0.192.0
  - @voyant-travel/flights@0.192.0

## 0.191.0

### Patch Changes

- Updated dependencies [f6aa3a1]
  - @voyant-travel/finance@0.191.0
  - @voyant-travel/finance-react@0.191.0
  - @voyant-travel/flights@0.191.0
  - @voyant-travel/relationships-react@0.191.0

## 0.190.0

### Patch Changes

- @voyant-travel/finance@0.190.0
- @voyant-travel/flights@0.190.0
- @voyant-travel/finance-react@0.190.0
- @voyant-travel/relationships-react@0.190.0

## 0.189.0

### Patch Changes

- @voyant-travel/flights@0.189.0
- @voyant-travel/finance-react@0.189.0
- @voyant-travel/relationships-react@0.189.0
- @voyant-travel/finance@0.189.0

## 0.188.0

### Patch Changes

- @voyant-travel/finance@0.188.0
- @voyant-travel/flights@0.188.0
- @voyant-travel/relationships-react@0.188.0
- @voyant-travel/ui@0.109.4
- @voyant-travel/finance-react@0.188.0

## 0.187.0

### Patch Changes

- @voyant-travel/finance-react@0.187.0
- @voyant-travel/relationships-react@0.187.0
- @voyant-travel/finance@0.187.0
- @voyant-travel/flights@0.187.0

## 0.186.0

### Patch Changes

- @voyant-travel/finance-react@0.186.0
- @voyant-travel/relationships-react@0.186.0
- @voyant-travel/finance@0.186.0
- @voyant-travel/flights@0.186.0

## 0.185.0

### Patch Changes

- Updated dependencies [e7e90bf]
  - @voyant-travel/finance@0.185.0
  - @voyant-travel/finance-react@0.185.0
  - @voyant-travel/flights@0.185.0
  - @voyant-travel/relationships-react@0.185.0

## 0.184.0

### Patch Changes

- @voyant-travel/finance-react@0.184.0
- @voyant-travel/relationships-react@0.184.0
- @voyant-travel/finance@0.184.0
- @voyant-travel/flights@0.184.0

## 0.183.0

### Patch Changes

- @voyant-travel/finance@0.183.0
- @voyant-travel/finance-react@0.183.0
- @voyant-travel/relationships-react@0.183.0
- @voyant-travel/flights@0.183.0

## 0.182.2

### Patch Changes

- Updated dependencies [f0f51b4]
  - @voyant-travel/i18n@0.116.0
  - @voyant-travel/admin@0.128.3
  - @voyant-travel/finance-react@0.182.4
  - @voyant-travel/relationships-react@0.182.1
  - @voyant-travel/finance@0.182.4
  - @voyant-travel/flights@0.182.2

## 0.182.1

### Patch Changes

- @voyant-travel/finance@0.182.3
- @voyant-travel/flights@0.182.1
- @voyant-travel/finance-react@0.182.3

## 0.182.0

### Patch Changes

- @voyant-travel/finance-react@0.182.0
- @voyant-travel/relationships-react@0.182.0
- @voyant-travel/finance@0.182.0
- @voyant-travel/flights@0.182.0

## 0.181.0

### Patch Changes

- Updated dependencies [464815c]
- Updated dependencies [464815c]
  - @voyant-travel/finance@0.181.0
  - @voyant-travel/i18n@0.115.1
  - @voyant-travel/finance-react@0.181.0
  - @voyant-travel/flights@0.181.0
  - @voyant-travel/relationships-react@0.181.0

## 0.180.1

### Patch Changes

- Updated dependencies [c2ca4a3]
  - @voyant-travel/i18n@0.115.0
  - @voyant-travel/finance@0.180.1
  - @voyant-travel/admin@0.128.2
  - @voyant-travel/finance-react@0.180.1
  - @voyant-travel/relationships-react@0.180.1
  - @voyant-travel/flights@0.180.1

## 0.180.0

### Patch Changes

- Updated dependencies [ecf1680]
  - @voyant-travel/i18n@0.114.0
  - @voyant-travel/admin@0.128.1
  - @voyant-travel/finance-react@0.180.0
  - @voyant-travel/relationships-react@0.180.0
  - @voyant-travel/finance@0.180.0
  - @voyant-travel/flights@0.180.0

## 0.179.0

### Patch Changes

- @voyant-travel/finance-react@0.179.0
- @voyant-travel/relationships-react@0.179.0
- @voyant-travel/finance@0.179.0
- @voyant-travel/flights@0.179.0

## 0.178.0

### Patch Changes

- Updated dependencies [2bcafc9]
  - @voyant-travel/admin@0.128.0
  - @voyant-travel/i18n@0.113.0
  - @voyant-travel/finance-react@0.178.0
  - @voyant-travel/relationships-react@0.178.0
  - @voyant-travel/finance@0.178.0
  - @voyant-travel/flights@0.178.0

## 0.177.0

### Patch Changes

- @voyant-travel/finance@0.177.0
- @voyant-travel/flights@0.177.0
- @voyant-travel/finance-react@0.177.0
- @voyant-travel/relationships-react@0.177.0

## 0.176.0

### Patch Changes

- @voyant-travel/finance@0.176.0
- @voyant-travel/flights@0.176.0
- @voyant-travel/finance-react@0.176.0
- @voyant-travel/relationships-react@0.176.0

## 0.175.0

### Patch Changes

- @voyant-travel/finance@0.175.0
- @voyant-travel/flights@0.175.0
- @voyant-travel/finance-react@0.175.0
- @voyant-travel/relationships-react@0.175.0

## 0.174.0

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/finance@0.174.0
  - @voyant-travel/flights@0.174.0
  - @voyant-travel/finance-react@0.174.0
  - @voyant-travel/relationships-react@0.174.0

## 0.173.0

### Patch Changes

- @voyant-travel/finance-react@0.173.0
- @voyant-travel/relationships-react@0.173.0
- @voyant-travel/finance@0.173.0
- @voyant-travel/flights@0.173.0

## 0.172.0

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/finance@0.172.0
  - @voyant-travel/flights@0.172.0
  - @voyant-travel/finance-react@0.172.0
  - @voyant-travel/relationships-react@0.172.0
  - @voyant-travel/ui@0.109.3

## 0.171.1

### Patch Changes

- @voyant-travel/finance@0.171.1
- @voyant-travel/flights@0.171.1
- @voyant-travel/finance-react@0.171.1

## 0.171.0

### Patch Changes

- Updated dependencies [d2d7384]
  - @voyant-travel/finance@0.171.0
  - @voyant-travel/finance-react@0.171.0
  - @voyant-travel/flights@0.171.0
  - @voyant-travel/relationships-react@0.171.0

## 0.170.0

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/i18n@0.112.1
  - @voyant-travel/finance@0.170.0
  - @voyant-travel/flights@0.170.0
  - @voyant-travel/finance-react@0.170.0
  - @voyant-travel/relationships-react@0.170.0

## 0.169.1

### Patch Changes

- @voyant-travel/finance@0.169.2
- @voyant-travel/flights@0.169.1
- @voyant-travel/finance-react@0.169.2

## 0.169.0

### Patch Changes

- Updated dependencies [a461920]
- Updated dependencies [a461920]
- Updated dependencies [590d256]
  - @voyant-travel/admin@0.127.0
  - @voyant-travel/finance@0.169.0
  - @voyant-travel/finance-react@0.169.0
  - @voyant-travel/relationships-react@0.169.0
  - @voyant-travel/flights@0.169.0

## 0.168.0

### Patch Changes

- Updated dependencies [158c3a0]
  - @voyant-travel/finance@0.168.0
  - @voyant-travel/finance-react@0.168.0
  - @voyant-travel/flights@0.168.0
  - @voyant-travel/relationships-react@0.168.0

## 0.167.0

### Patch Changes

- Updated dependencies [ca3713e]
  - @voyant-travel/finance@0.167.0
  - @voyant-travel/finance-react@0.167.0
  - @voyant-travel/flights@0.167.0
  - @voyant-travel/relationships-react@0.167.0

## 0.166.0

### Minor Changes

- 926ea47: Add the canonical payment adapter contract and public conformance kit, expose the payments deployment provider role, and route card-payment seams through explicit deployment adapter selection instead of processor package identity.

### Patch Changes

- Updated dependencies [c3bdcbc]
- Updated dependencies [0868f18]
- Updated dependencies [3062a73]
- Updated dependencies [926ea47]
  - @voyant-travel/finance@0.166.0
  - @voyant-travel/admin@0.126.2
  - @voyant-travel/finance-react@0.166.0
  - @voyant-travel/i18n@0.112.0
  - @voyant-travel/flights@0.166.0
  - @voyant-travel/relationships-react@0.166.0

## 0.165.0

### Patch Changes

- Updated dependencies [d6a9973]
  - @voyant-travel/finance@0.165.0
  - @voyant-travel/finance-react@0.165.0
  - @voyant-travel/flights@0.165.0
  - @voyant-travel/relationships-react@0.165.0

## 0.164.0

### Patch Changes

- @voyant-travel/flights@0.164.0
- @voyant-travel/finance-react@0.164.0
- @voyant-travel/relationships-react@0.164.0
- @voyant-travel/finance@0.164.0

## 0.163.0

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/finance@0.163.0
  - @voyant-travel/relationships-react@0.163.0
  - @voyant-travel/flights@0.163.0
  - @voyant-travel/finance-react@0.163.0

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
  - @voyant-travel/finance-react@0.162.2
  - @voyant-travel/i18n@0.111.3
  - @voyant-travel/relationships-react@0.162.1
  - @voyant-travel/finance@0.162.2
  - @voyant-travel/flights@0.162.1

## 0.162.0

### Patch Changes

- Updated dependencies [8f0fa26]
  - @voyant-travel/finance@0.162.0
  - @voyant-travel/flights@0.162.0
  - @voyant-travel/finance-react@0.162.0
  - @voyant-travel/relationships-react@0.162.0

## 0.161.0

### Patch Changes

- Updated dependencies [c1e37f2]
- Updated dependencies [85bfe2c]
  - @voyant-travel/admin@0.126.0
  - @voyant-travel/finance@0.161.0
  - @voyant-travel/finance-react@0.161.0
  - @voyant-travel/relationships-react@0.161.0
  - @voyant-travel/flights@0.161.0

## 0.160.0

### Patch Changes

- Updated dependencies [701ccc4]
- Updated dependencies [372f4f4]
- Updated dependencies [a2fd806]
- Updated dependencies [0079873]
- Updated dependencies [db5adce]
- Updated dependencies [6604f9e]
  - @voyant-travel/finance@0.160.0
  - @voyant-travel/flights@0.160.0
  - @voyant-travel/finance-react@0.160.0
  - @voyant-travel/relationships-react@0.160.0

## 0.159.0

### Patch Changes

- Updated dependencies [766d24b]
- Updated dependencies [7e9f77a]
- Updated dependencies [b459761]
- Updated dependencies [49f55d0]
- Updated dependencies [82ffd12]
- Updated dependencies [9c85101]
- Updated dependencies [6147b93]
- Updated dependencies [b459761]
  - @voyant-travel/ui@0.109.2
  - @voyant-travel/admin@0.125.0
  - @voyant-travel/flights@0.159.0
  - @voyant-travel/finance@0.159.0
  - @voyant-travel/finance-react@0.159.0
  - @voyant-travel/relationships-react@0.159.0

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
  - @voyant-travel/finance-react@0.158.0
  - @voyant-travel/finance@0.158.0
  - @voyant-travel/flights@0.158.0
  - @voyant-travel/relationships-react@0.158.0

## 0.157.0

### Patch Changes

- @voyant-travel/flights@0.157.0
- @voyant-travel/finance-react@0.157.0
- @voyant-travel/relationships-react@0.157.0
- @voyant-travel/finance@0.157.0

## 0.156.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/admin@0.123.3
  - @voyant-travel/finance@0.156.1
  - @voyant-travel/finance-react@0.156.1
  - @voyant-travel/flights@0.156.1
  - @voyant-travel/i18n@0.111.1
  - @voyant-travel/react@0.104.2
  - @voyant-travel/relationships-react@0.156.1
  - @voyant-travel/ui@0.109.1

## 0.156.0

### Patch Changes

- Updated dependencies [bbe6396]
  - @voyant-travel/finance@0.156.0
  - @voyant-travel/finance-react@0.156.0
  - @voyant-travel/i18n@0.111.0
  - @voyant-travel/flights@0.156.0
  - @voyant-travel/admin@0.123.2
  - @voyant-travel/relationships-react@0.156.0

## 0.155.1

### Patch Changes

- Updated dependencies [cc85042]
  - @voyant-travel/finance@0.155.1
  - @voyant-travel/flights@0.155.1
  - @voyant-travel/finance-react@0.155.1

## 0.155.0

### Patch Changes

- @voyant-travel/finance@0.155.0
- @voyant-travel/flights@0.155.0
- @voyant-travel/finance-react@0.155.0
- @voyant-travel/relationships-react@0.155.0

## 0.154.0

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [8bd906f]
  - @voyant-travel/finance@0.154.0
  - @voyant-travel/ui@0.109.0
  - @voyant-travel/flights@0.154.0
  - @voyant-travel/admin@0.123.0
  - @voyant-travel/finance-react@0.154.0
  - @voyant-travel/relationships-react@0.154.0

## 0.153.0

### Patch Changes

- 490d132: Move standard first-party admin factories, package copy, slots, contributions, and icons into selected deployment graph composition.
- Updated dependencies [047c3f9]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [c65b05c]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
  - @voyant-travel/finance@0.153.0
  - @voyant-travel/flights@0.153.0
  - @voyant-travel/admin@0.122.0
  - @voyant-travel/finance-react@0.153.0
  - @voyant-travel/relationships-react@0.153.0

## 0.152.0

### Patch Changes

- Updated dependencies [60b1970]
- Updated dependencies [977c1bd]
- Updated dependencies [d771be3]
- Updated dependencies [d771be3]
- Updated dependencies [d771be3]
  - @voyant-travel/finance@0.152.0
  - @voyant-travel/flights@0.152.0
  - @voyant-travel/admin@0.121.0
  - @voyant-travel/relationships-react@0.152.0
  - @voyant-travel/finance-react@0.152.0

## 0.151.4

### Patch Changes

- Updated dependencies [1081483]
  - @voyant-travel/finance@0.151.4
  - @voyant-travel/flights@0.151.4
  - @voyant-travel/finance-react@0.151.4

## 0.151.3

### Patch Changes

- @voyant-travel/finance@0.151.3
- @voyant-travel/flights@0.151.3
- @voyant-travel/finance-react@0.151.3

## 0.151.2

### Patch Changes

- @voyant-travel/finance@0.151.2
- @voyant-travel/flights@0.151.2
- @voyant-travel/finance-react@0.151.2

## 0.151.1

### Patch Changes

- Updated dependencies [e4e6621]
  - @voyant-travel/finance@0.151.1
  - @voyant-travel/flights@0.151.1
  - @voyant-travel/finance-react@0.151.1

## 0.151.0

### Patch Changes

- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/finance@0.151.0
  - @voyant-travel/flights@0.151.0
  - @voyant-travel/finance-react@0.151.0
  - @voyant-travel/relationships-react@0.151.0

## 0.150.0

### Patch Changes

- @voyant-travel/finance@0.150.0
- @voyant-travel/finance-react@0.150.0
- @voyant-travel/relationships-react@0.150.0
- @voyant-travel/flights@0.150.0

## 0.149.1

### Patch Changes

- Updated dependencies [5e1d221]
  - @voyant-travel/finance@0.149.1
  - @voyant-travel/flights@0.149.1
  - @voyant-travel/finance-react@0.149.1

## 0.149.0

### Patch Changes

- Updated dependencies [a97e845]
  - @voyant-travel/admin@0.120.0
  - @voyant-travel/finance-react@0.149.0
  - @voyant-travel/relationships-react@0.149.0
  - @voyant-travel/finance@0.149.0
  - @voyant-travel/flights@0.149.0

## 0.148.0

### Patch Changes

- Updated dependencies [8a665f3]
  - @voyant-travel/admin@0.119.0
  - @voyant-travel/finance-react@0.148.0
  - @voyant-travel/relationships-react@0.148.0
  - @voyant-travel/finance@0.148.0
  - @voyant-travel/flights@0.148.0

## 0.147.0

### Patch Changes

- @voyant-travel/admin@0.118.0
- @voyant-travel/finance-react@0.147.0
- @voyant-travel/relationships-react@0.147.0
- @voyant-travel/finance@0.147.0
- @voyant-travel/flights@0.147.0

## 0.146.0

### Patch Changes

- Updated dependencies [ecdf0fc]
  - @voyant-travel/admin@0.117.0
  - @voyant-travel/finance-react@0.146.0
  - @voyant-travel/relationships-react@0.146.0
  - @voyant-travel/finance@0.146.0
  - @voyant-travel/flights@0.146.0

## 0.145.0

### Patch Changes

- @voyant-travel/flights@0.145.0
- @voyant-travel/finance-react@0.145.0
- @voyant-travel/relationships-react@0.145.0
- @voyant-travel/finance@0.145.0

## 0.144.0

### Patch Changes

- @voyant-travel/finance@0.144.0
- @voyant-travel/finance-react@0.144.0
- @voyant-travel/relationships-react@0.144.0
- @voyant-travel/flights@0.144.0

## 0.143.0

### Patch Changes

- @voyant-travel/finance@0.143.0
- @voyant-travel/relationships-react@0.143.0
- @voyant-travel/ui@0.108.11
- @voyant-travel/flights@0.143.0
- @voyant-travel/finance-react@0.143.0

## 0.142.0

### Patch Changes

- Updated dependencies [5028f42]
  - @voyant-travel/flights@0.142.0
  - @voyant-travel/finance-react@0.142.0
  - @voyant-travel/relationships-react@0.142.0
  - @voyant-travel/finance@0.142.0

## 0.141.0

### Patch Changes

- @voyant-travel/flights@0.141.0
- @voyant-travel/finance-react@0.141.0
- @voyant-travel/relationships-react@0.141.0
- @voyant-travel/finance@0.141.0

## 0.140.0

### Minor Changes

- 62e87ee: Surface flight orders (bookings/tickets). Adds a Flights → Orders list page (`FlightOrdersPage`) and an order detail route on the packaged flights admin, so a held order — carrying a ticketing deadline — no longer disappears after the confirmation screen. Operators can review orders, filter by status/search, and from the detail view issue tickets (before the deadline) or cancel. Adds a `useFlightOrderTicket` hook and a capability-gated `POST /orders/:orderId/ticket` route to the flights module. The operator admin sidebar now expands Flights into **Search** and **Orders** sub-items (`admin` nav + `i18n` `flightsSearch` label; `flightOrders` label already existed).

### Patch Changes

- Updated dependencies [62e87ee]
  - @voyant-travel/flights@0.140.0
  - @voyant-travel/admin@0.116.0
  - @voyant-travel/i18n@0.110.0
  - @voyant-travel/finance-react@0.140.0
  - @voyant-travel/relationships-react@0.140.0
  - @voyant-travel/finance@0.140.0

## 0.139.0

### Patch Changes

- Updated dependencies [fc71db1]
- Updated dependencies [fc71db1]
- Updated dependencies [2613dfb]
  - @voyant-travel/finance@0.139.0
  - @voyant-travel/relationships-react@0.139.0
  - @voyant-travel/admin@0.115.4
  - @voyant-travel/finance-react@0.139.0
  - @voyant-travel/flights@0.139.0

## 0.138.2

### Patch Changes

- Updated dependencies [f1090b7]
- Updated dependencies [42f662c]
  - @voyant-travel/i18n@0.109.8
  - @voyant-travel/finance@0.138.8
  - @voyant-travel/flights@0.138.2
  - @voyant-travel/finance-react@0.138.8

## 0.138.1

### Patch Changes

- Updated dependencies [b254511]
- Updated dependencies [141bd2b]
  - @voyant-travel/ui@0.108.10
  - @voyant-travel/finance@0.138.7
  - @voyant-travel/flights@0.138.1
  - @voyant-travel/finance-react@0.138.7

## 0.138.0

### Patch Changes

- @voyant-travel/finance-react@0.138.0
- @voyant-travel/relationships-react@0.138.0
- @voyant-travel/finance@0.138.0
- @voyant-travel/flights@0.138.0

## 0.137.6

### Patch Changes

- c293533: Fix the flight booking wizard landing on a "Booking not found" page after a hold. A flight hold persists a flight order (served at `/v1/admin/flights/orders/:id`), which is a separate entity from a catalog booking and is not resolvable at `/bookings/:id`. The admin wizard previously navigated to the catalog `booking.detail` destination, which 404s for a flight order id. It now renders an inline flight order confirmation from the booking response instead — a readable order surface with no extra fetch.
- dd162b7: Add accessible names to the flight booking seat-map tiles and the services & extras quantity steppers so screen readers and a11y tooling can identify each control.
- Updated dependencies [0b57296]
  - @voyant-travel/ui@0.108.9
  - @voyant-travel/flights@0.137.6

## 0.137.5

### Patch Changes

- 398c5cc: Render the flight offer row as a non-button container so the inner "Select" button no longer nests inside a button, fixing invalid-HTML hydration warnings while preserving click and keyboard selection.
  - @voyant-travel/flights@0.137.5

## 0.137.4

### Patch Changes

- 0622c7f: Show human-readable payment method label on the flight booking confirmation step instead of the raw enum value (e.g. "Ticket on agency credit" rather than "Ticket On_credit").
- Updated dependencies [ad02eae]
  - @voyant-travel/i18n@0.109.5
  - @voyant-travel/flights@0.137.4

## 0.137.3

### Patch Changes

- Updated dependencies [f37a3f1]
- Updated dependencies [b1f90b0]
- Updated dependencies [49ffcd9]
- Updated dependencies [c1d8f71]
  - @voyant-travel/ui@0.108.7
  - @voyant-travel/i18n@0.109.3
  - @voyant-travel/flights@0.137.3

## 0.137.2

### Patch Changes

- 2427218: Create flight order payment sessions for bank-transfer booking intents.
- Updated dependencies [5c53561]
- Updated dependencies [2427218]
- Updated dependencies [7850b66]
- Updated dependencies [bddb539]
  - @voyant-travel/flights@0.137.2
  - @voyant-travel/finance@0.137.6
  - @voyant-travel/finance-react@0.137.6

## 0.137.1

### Patch Changes

- Updated dependencies [9a1197b]
  - @voyant-travel/bookings-react@0.137.1
  - @voyant-travel/finance-react@0.137.1
  - @voyant-travel/finance@0.137.1
  - @voyant-travel/flights@0.137.1

## 0.137.0

### Patch Changes

- @voyant-travel/finance@0.137.0
- @voyant-travel/flights@0.137.0
- @voyant-travel/bookings-react@0.137.0
- @voyant-travel/finance-react@0.137.0
- @voyant-travel/relationships-react@0.137.0

## 0.136.1

### Patch Changes

- Updated dependencies [7cb6fa7]
  - @voyant-travel/i18n@0.109.0
  - @voyant-travel/admin@0.115.2
  - @voyant-travel/bookings-react@0.136.1
  - @voyant-travel/finance-react@0.136.1
  - @voyant-travel/relationships-react@0.136.1
  - @voyant-travel/ui@0.108.2
  - @voyant-travel/finance@0.136.1
  - @voyant-travel/flights@0.136.1

## 0.136.0

### Patch Changes

- @voyant-travel/bookings-react@0.136.0
- @voyant-travel/finance-react@0.136.0
- @voyant-travel/relationships-react@0.136.0
- @voyant-travel/finance@0.136.0
- @voyant-travel/flights@0.136.0

## 0.135.0

### Patch Changes

- @voyant-travel/bookings-react@0.135.0
- @voyant-travel/finance-react@0.135.0
- @voyant-travel/relationships-react@0.135.0
- @voyant-travel/finance@0.135.0
- @voyant-travel/flights@0.135.0

## 0.134.1

### Patch Changes

- @voyant-travel/finance@0.134.1
- @voyant-travel/flights@0.134.1
- @voyant-travel/bookings-react@0.134.1
- @voyant-travel/finance-react@0.134.1

## 0.134.0

### Patch Changes

- Updated dependencies [51f7dea]
- Updated dependencies [0a0a014]
  - @voyant-travel/finance@0.134.0
  - @voyant-travel/bookings-react@0.134.0
  - @voyant-travel/finance-react@0.134.0
  - @voyant-travel/relationships-react@0.134.0
  - @voyant-travel/flights@0.134.0
  - @voyant-travel/admin@0.115.1

## 0.133.0

### Patch Changes

- Updated dependencies [4abf9a2]
  - @voyant-travel/admin@0.115.0
  - @voyant-travel/i18n@0.108.0
  - @voyant-travel/finance@0.133.0
  - @voyant-travel/flights@0.133.0
  - @voyant-travel/bookings-react@0.133.0
  - @voyant-travel/finance-react@0.133.0
  - @voyant-travel/relationships-react@0.133.0
  - @voyant-travel/ui@0.108.1

## 0.132.0

### Patch Changes

- Updated dependencies [6a0edd2]
  - @voyant-travel/flights@0.132.0
  - @voyant-travel/bookings-react@0.132.0
  - @voyant-travel/finance-react@0.132.0
  - @voyant-travel/relationships-react@0.132.0
  - @voyant-travel/finance@0.132.0

## 0.131.1

### Patch Changes

- @voyant-travel/finance@0.131.2
- @voyant-travel/flights@0.131.1
- @voyant-travel/bookings-react@0.131.1
- @voyant-travel/finance-react@0.131.2

## 0.131.0

### Patch Changes

- Updated dependencies [310565b]
  - @voyant-travel/i18n@0.107.3
  - @voyant-travel/bookings-react@0.131.0
  - @voyant-travel/finance-react@0.131.0
  - @voyant-travel/relationships-react@0.131.0
  - @voyant-travel/finance@0.131.0
  - @voyant-travel/flights@0.131.0

## 0.130.0

### Patch Changes

- Updated dependencies [dbea53e]
  - @voyant-travel/i18n@0.107.2
  - @voyant-travel/bookings-react@0.130.0
  - @voyant-travel/finance-react@0.130.0
  - @voyant-travel/relationships-react@0.130.0
  - @voyant-travel/finance@0.130.0
  - @voyant-travel/flights@0.130.0

## 0.129.0

### Patch Changes

- @voyant-travel/flights@0.129.0
- @voyant-travel/bookings-react@0.129.0
- @voyant-travel/finance-react@0.129.0
- @voyant-travel/relationships-react@0.129.0
- @voyant-travel/finance@0.129.0

## 0.128.0

### Patch Changes

- @voyant-travel/bookings-react@0.128.0
- @voyant-travel/finance-react@0.128.0
- @voyant-travel/relationships-react@0.128.0
- @voyant-travel/finance@0.128.0
- @voyant-travel/flights@0.128.0

## 0.127.0

### Patch Changes

- Updated dependencies [c143531]
  - @voyant-travel/flights@0.127.0
  - @voyant-travel/bookings-react@0.127.0
  - @voyant-travel/finance@0.127.0
  - @voyant-travel/finance-react@0.127.0
  - @voyant-travel/relationships-react@0.127.0

## 0.126.0

### Patch Changes

- @voyant-travel/bookings-react@0.126.0
- @voyant-travel/finance-react@0.126.0
- @voyant-travel/relationships-react@0.126.0
- @voyant-travel/finance@0.126.0
- @voyant-travel/flights@0.126.0

## 0.125.0

### Patch Changes

- Updated dependencies [a74471e]
- Updated dependencies [a74471e]
  - @voyant-travel/i18n@0.107.0
  - @voyant-travel/ui@0.108.0
  - @voyant-travel/admin@0.114.0
  - @voyant-travel/bookings-react@0.125.0
  - @voyant-travel/finance-react@0.125.0
  - @voyant-travel/relationships-react@0.125.0
  - @voyant-travel/finance@0.125.0
  - @voyant-travel/flights@0.125.0

## 0.124.0

### Patch Changes

- 4f92198: Voyant 1.0 visual refactor of the framework UI.

  - **Tokens** (`@voyant-travel/ui` `globals.css`): warm off-white paper, near-black ink, and a single hot-orange brand accent (`--brand`, new token) reserved for charts/focus/active state. Inter Tight type. Fixed brand chart palette (`--chart-1..5`). A coherent radius system: controls + their dropdowns at `rounded-sm` (4px), cards/table surfaces at `rounded-md` (6px), dialogs/sheets at `rounded-xl`.
  - **`@voyant-travel/ui` components**: new `SegmentedControl`; `Button` gains a `brand` variant; sharper, consistent radii across Button/Input/Select/Combobox/Textarea/Toggle/Tabs/Menus/Command/Card/DataTable/Badge; bordered active sidebar items (primary + sub) and inset-panel border; assorted fixes (Command search-input radius, toggle-group corners, sidebar sub-menu spacing).
  - **`@voyant-travel/admin`**: Voyant 1.0 brand logo lockup (composed mark + wordmark, collapse-to-badge); operator shell defaults to the inset sidebar layout; dashboard KPI cards, brand chart colors, and Figma-matched sidebar (bordered active item, near-black nav text, bordered user card with open-state).
  - **Domain `*-react` packages**: card surfaces normalized to the new `rounded-md` radius; flights search bar (trip-type toggle, route cards, airport dropdown) and the resources tabs aligned to the system.

- Updated dependencies [4f92198]
- Updated dependencies [4f92198]
  - @voyant-travel/finance-react@0.124.0
  - @voyant-travel/ui@0.107.0
  - @voyant-travel/admin@0.113.0
  - @voyant-travel/bookings-react@0.124.0
  - @voyant-travel/relationships-react@0.124.0
  - @voyant-travel/finance@0.124.0
  - @voyant-travel/flights@0.124.0

## 0.123.0

### Patch Changes

- Updated dependencies [94890c3]
- Updated dependencies [e9d9dbb]
- Updated dependencies [cb9b04b]
  - @voyant-travel/admin@0.112.0
  - @voyant-travel/finance@0.123.0
  - @voyant-travel/bookings-react@0.123.0
  - @voyant-travel/finance-react@0.123.0
  - @voyant-travel/relationships-react@0.123.0
  - @voyant-travel/flights@0.123.0

## 0.122.0

### Patch Changes

- Updated dependencies [c9de9c4]
- Updated dependencies [14f4234]
- Updated dependencies [89d4ca9]
- Updated dependencies [14f4234]
- Updated dependencies [51dd276]
  - @voyant-travel/finance@0.122.0
  - @voyant-travel/flights@0.122.0
  - @voyant-travel/finance-react@0.122.0
  - @voyant-travel/bookings-react@0.122.0
  - @voyant-travel/relationships-react@0.122.0

## 0.121.0

### Patch Changes

- Updated dependencies [13fe70b]
- Updated dependencies [d44c0ae]
  - @voyant-travel/finance@0.121.0
  - @voyant-travel/flights@0.121.0
  - @voyant-travel/finance-react@0.121.0
  - @voyant-travel/bookings-react@0.121.0
  - @voyant-travel/relationships-react@0.121.0

## 0.120.1

### Patch Changes

- eef1a00: Republish notification and UI consumer packages so stale beta artifacts no longer reference legacy notification package specifiers.
- Updated dependencies [eef1a00]
  - @voyant-travel/admin@0.111.2
  - @voyant-travel/bookings-react@0.120.1
  - @voyant-travel/finance-react@0.120.1
  - @voyant-travel/relationships-react@0.120.1
  - @voyant-travel/finance@0.120.1
  - @voyant-travel/flights@0.120.1

## 0.120.0

### Patch Changes

- 47fef18: Retarget first-party imports from the removed beta package names to their owner
  packages. Operated product UI now imports Inventory React, commercial UI imports
  Commerce React, supplier UI imports Distribution React, checkout UI imports
  Finance React, and operated place/availability schema references import
  Operations owner paths.
- Updated dependencies [dd71543]
- Updated dependencies [3cc83b6]
- Updated dependencies [0fa993c]
- Updated dependencies [9e970a5]
- Updated dependencies [b711b04]
- Updated dependencies [44c3875]
- Updated dependencies [3408b2a]
- Updated dependencies [47fef18]
- Updated dependencies [6196b3b]
  - @voyant-travel/admin@0.111.1
  - @voyant-travel/bookings-react@0.120.0
  - @voyant-travel/finance@0.120.0
  - @voyant-travel/finance-react@0.120.0
  - @voyant-travel/flights@0.120.0
  - @voyant-travel/relationships-react@0.120.0

## 0.119.2

### Patch Changes

- d4e3d54: Split oversized cruise route, service, booking, search, and catalog policy modules into smaller vertical slices while preserving the existing public exports and behavior.

  Split oversized flights UI, charter booking, and accommodation content modules into smaller internal slices while preserving the existing public exports and behavior.

- Updated dependencies [f1c05dc]
  - @voyant-travel/bookings-react@0.119.2
  - @voyant-travel/finance@0.119.3
  - @voyant-travel/flights@0.119.2

## 0.119.1

### Patch Changes

- @voyant-travel/finance@0.119.1
- @voyant-travel/flights@0.119.1
- @voyant-travel/bookings-react@0.119.1
- @voyant-travel/crm-react@0.119.1

## 0.119.0

### Patch Changes

- @voyant-travel/finance@0.119.0
- @voyant-travel/crm-react@0.119.0
- @voyant-travel/ui@0.106.1
- @voyant-travel/bookings-react@0.119.0
- @voyant-travel/checkout-react@0.119.0
- @voyant-travel/flights@0.119.0

## 0.118.0

### Patch Changes

- @voyant-travel/finance@0.118.0
- @voyant-travel/bookings-react@0.118.0
- @voyant-travel/checkout-react@0.118.0
- @voyant-travel/crm-react@0.118.0
- @voyant-travel/flights@0.118.0

## 0.117.1

### Patch Changes

- Updated dependencies [b7056f1]
  - @voyant-travel/finance@0.117.1
  - @voyant-travel/flights@0.117.1
  - @voyant-travel/bookings-react@0.117.1
  - @voyant-travel/checkout-react@0.117.1
  - @voyant-travel/crm-react@0.117.1

## 0.117.0

### Patch Changes

- Updated dependencies [7255353]
  - @voyant-travel/finance@0.117.0
  - @voyant-travel/flights@0.117.0
  - @voyant-travel/bookings-react@0.117.0
  - @voyant-travel/checkout-react@0.117.0
  - @voyant-travel/crm-react@0.117.0

## 0.116.0

### Patch Changes

- @voyant-travel/finance@0.116.0
- @voyant-travel/flights@0.116.0
- @voyant-travel/bookings-react@0.116.0
- @voyant-travel/checkout-react@0.116.0
- @voyant-travel/crm-react@0.116.0

## 0.115.0

### Patch Changes

- Updated dependencies [41b08db]
  - @voyant-travel/admin@0.111.0
  - @voyant-travel/bookings-react@0.115.0
  - @voyant-travel/crm-react@0.115.0
  - @voyant-travel/checkout-react@0.115.0
  - @voyant-travel/finance@0.115.0
  - @voyant-travel/flights@0.115.0

## 0.114.0

### Minor Changes

- f7bd971: Three more operator surfaces become package-delivered admin contributions (packaged-admin RFC §4.8):

  - `@voyant-travel/flights-react/admin` (new entry): `createFlightsAdminExtension` ships the flight search page and the booking wizard as full route contributions — package-owned search contracts (`flightsIndexSearchSchema`, `flightsBookSearchSchema`), lazy page modules, and semantic destinations (`flight.search` route-backed; `flightBooking.start` declared for the host's hand-written resolver; post-booking lands on the shared `booking.detail`). The wizard mounts as a flat sibling of the search route, reproducing the old file-based `flights_.book` section-chrome escape exactly.
  - `@voyant-travel/distribution-react/admin` (new entry): `createDistributionAdminExtension` ships the channel-sync page as a lazy route contribution; the page reads `baseUrl` + credentialed fetcher from the shared provider context, so the host needs no props and no route file.
  - `@voyant-travel/finance-react/admin`: the two supplier-invoices contributions graduate from metadata-only to full implementations. The previously app-owned wiring travels package-side: attachment uploads post to the template-level `/v1/uploads` through the finance provider context (the `BookingInvoicesWidget` precedent), inline supplier creation rides `useSupplierMutation().create` from `@voyant-travel/suppliers-react`, and the allocation dialog's cross-domain target search composes `getProductsQueryOptions` / `getBookingsQueryOptions` / `getSlotsQueryOptions` through the same context client (new optional peers: `@voyant-travel/products-react`, `@voyant-travel/availability-react`). New route-backed destinations: `supplierInvoice.list`, `supplierInvoice.detail`.

### Patch Changes

- @voyant-travel/bookings-react@0.114.0
- @voyant-travel/checkout-react@0.114.0
- @voyant-travel/crm-react@0.114.0
- @voyant-travel/finance@0.114.0
- @voyant-travel/flights@0.114.0

## 0.113.0

### Patch Changes

- @voyant-travel/crm-react@0.113.0
- @voyant-travel/checkout-react@0.113.0
- @voyant-travel/finance@0.113.0
- @voyant-travel/flights@0.113.0

## 0.112.0

### Patch Changes

- Updated dependencies [279f97c]
- Updated dependencies [faec538]
  - @voyant-travel/crm-react@0.112.0
  - @voyant-travel/checkout-react@0.112.0
  - @voyant-travel/finance@0.112.0
  - @voyant-travel/flights@0.112.0

## 0.111.0

### Patch Changes

- Updated dependencies [478aa7c]
  - @voyant-travel/crm-react@0.111.0
  - @voyant-travel/checkout-react@0.111.0
  - @voyant-travel/finance@0.111.0
  - @voyant-travel/flights@0.111.0

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
  - @voyant-travel/checkout-react@0.110.0
  - @voyant-travel/crm-react@0.110.0
  - @voyant-travel/finance@0.110.0
  - @voyant-travel/flights@0.110.0

## 0.109.0

### Patch Changes

- @voyant-travel/flights@0.109.0

## 0.108.0

### Patch Changes

- @voyant-travel/flights@0.108.0

## 0.107.0

### Patch Changes

- Updated dependencies [c2aef18]
  - @voyant-travel/flights@0.107.0

## 0.106.0

### Patch Changes

- @voyant-travel/flights@0.106.0

## 0.105.0

### Patch Changes

- @voyant-travel/flights@0.105.0

## 0.104.1

### Patch Changes

- @voyant-travel/flights@0.104.1
- @voyant-travel/react@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/flights@0.104.0
- @voyant-travel/react@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/flights@0.103.0
- @voyant-travel/react@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/flights@0.102.0
- @voyant-travel/react@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/flights@0.101.2
- @voyant-travel/react@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/flights@0.101.1
- @voyant-travel/react@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/flights@0.101.0
- @voyant-travel/react@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/flights@0.100.0
- @voyant-travel/react@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/flights@0.99.0
- @voyant-travel/react@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/flights@0.98.0
- @voyant-travel/react@0.98.0

## 0.97.0

### Patch Changes

- Updated dependencies [2555264]
  - @voyant-travel/flights@0.97.0
  - @voyant-travel/react@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/flights@0.96.0
- @voyant-travel/react@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/flights@0.95.0
- @voyant-travel/react@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/flights@0.94.0
- @voyant-travel/react@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/flights@0.93.0
- @voyant-travel/react@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/flights@0.92.0
- @voyant-travel/react@0.92.0

## 0.91.0

### Patch Changes

- @voyant-travel/flights@0.91.0
- @voyant-travel/react@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/flights@0.90.0
- @voyant-travel/react@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/flights@0.89.0
- @voyant-travel/react@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/flights@0.88.0
- @voyant-travel/react@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/flights@0.87.1
- @voyant-travel/react@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/flights@0.87.0
- @voyant-travel/react@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/flights@0.86.0
- @voyant-travel/react@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/flights@0.85.4
- @voyant-travel/react@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/flights@0.85.3
- @voyant-travel/react@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/flights@0.85.2
- @voyant-travel/react@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/flights@0.85.1
- @voyant-travel/react@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/flights@0.85.0
- @voyant-travel/react@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/flights@0.84.4
- @voyant-travel/react@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/flights@0.84.3
- @voyant-travel/react@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/flights@0.84.2
- @voyant-travel/react@0.84.2

## 0.84.1

### Patch Changes

- @voyant-travel/flights@0.84.1
- @voyant-travel/react@0.84.1

## 0.84.0

### Patch Changes

- @voyant-travel/flights@0.84.0
- @voyant-travel/react@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/flights@0.83.1
- @voyant-travel/react@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/flights@0.83.0
- @voyant-travel/react@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/flights@0.82.1
- @voyant-travel/react@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/flights@0.82.0
- @voyant-travel/react@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/flights@0.81.21
- @voyant-travel/react@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/flights@0.81.20
- @voyant-travel/react@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/flights@0.81.19
- @voyant-travel/react@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/flights@0.81.18
- @voyant-travel/react@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/flights@0.81.17
- @voyant-travel/react@0.81.17

## 0.81.16

### Patch Changes

- @voyant-travel/flights@0.81.16
- @voyant-travel/react@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/flights@0.81.15
- @voyant-travel/react@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/flights@0.81.14
- @voyant-travel/react@0.81.14

## 0.81.13

### Patch Changes

- @voyant-travel/flights@0.81.13
- @voyant-travel/react@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/flights@0.81.12
- @voyant-travel/react@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/flights@0.81.11
- @voyant-travel/react@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/flights@0.81.10
- @voyant-travel/react@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/flights@0.81.9
- @voyant-travel/react@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/flights@0.81.8
- @voyant-travel/react@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/flights@0.81.7
- @voyant-travel/react@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/flights@0.81.6
- @voyant-travel/react@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/flights@0.81.5
- @voyant-travel/react@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/flights@0.81.4
- @voyant-travel/react@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/flights@0.81.3
- @voyant-travel/react@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/flights@0.81.2
- @voyant-travel/react@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/flights@0.81.1
- @voyant-travel/react@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/flights@0.81.0
- @voyant-travel/react@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/flights@0.80.18
- @voyant-travel/react@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/flights@0.80.17
- @voyant-travel/react@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/flights@0.80.16
- @voyant-travel/react@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/flights@0.80.15
- @voyant-travel/react@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/flights@0.80.14
- @voyant-travel/react@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/flights@0.80.13
- @voyant-travel/react@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/flights@0.80.12
- @voyant-travel/react@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/flights@0.80.11
- @voyant-travel/react@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/flights@0.80.10
- @voyant-travel/react@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/flights@0.80.9
- @voyant-travel/react@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/flights@0.80.8
- @voyant-travel/react@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/flights@0.80.7
- @voyant-travel/react@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/flights@0.80.6
- @voyant-travel/react@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/flights@0.80.5
- @voyant-travel/react@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/flights@0.80.4
- @voyant-travel/react@0.80.4

## 0.80.3

### Patch Changes

- @voyant-travel/flights@0.80.3
- @voyant-travel/react@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/flights@0.80.2
- @voyant-travel/react@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/flights@0.80.1
- @voyant-travel/react@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/flights@0.80.0
- @voyant-travel/react@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/flights@0.79.0
- @voyant-travel/react@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/flights@0.78.0
- @voyant-travel/react@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/flights@0.77.13
- @voyant-travel/react@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/flights@0.77.12
- @voyant-travel/react@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/flights@0.77.11
- @voyant-travel/react@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/flights@0.77.10
- @voyant-travel/react@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/flights@0.77.9
- @voyant-travel/react@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/flights@0.77.8
- @voyant-travel/react@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/flights@0.77.7
- @voyant-travel/react@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/flights@0.77.6
- @voyant-travel/react@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/flights@0.77.5
- @voyant-travel/react@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/flights@0.77.4
- @voyant-travel/react@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/flights@0.77.3
- @voyant-travel/react@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/flights@0.77.2
- @voyant-travel/react@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/flights@0.77.1
- @voyant-travel/react@0.77.1

## 0.77.0

### Patch Changes

- @voyant-travel/flights@0.77.0
- @voyant-travel/react@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/flights@0.76.0
- @voyant-travel/react@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/flights@0.75.7
- @voyant-travel/react@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/flights@0.75.6
- @voyant-travel/react@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/flights@0.75.5
- @voyant-travel/react@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/flights@0.75.4
- @voyant-travel/react@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/flights@0.75.3
- @voyant-travel/react@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/flights@0.75.2
- @voyant-travel/react@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/flights@0.75.1
- @voyant-travel/react@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/flights@0.75.0
- @voyant-travel/react@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/flights@0.74.2
- @voyant-travel/react@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/flights@0.74.1
- @voyant-travel/react@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/flights@0.74.0
- @voyant-travel/react@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/flights@0.73.1
- @voyant-travel/react@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/flights@0.73.0
- @voyant-travel/react@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/flights@0.72.0
- @voyant-travel/react@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/flights@0.71.0
- @voyant-travel/react@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/flights@0.70.0
- @voyant-travel/react@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/flights@0.69.1
- @voyant-travel/react@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/flights@0.69.0
- @voyant-travel/react@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/flights@0.68.0
- @voyant-travel/react@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/flights@0.67.0
- @voyant-travel/react@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/flights@0.66.6
- @voyant-travel/react@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/flights@0.66.5
- @voyant-travel/react@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/flights@0.66.4
- @voyant-travel/react@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/flights@0.66.3
- @voyant-travel/react@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/flights@0.66.2
- @voyant-travel/react@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/flights@0.66.1
- @voyant-travel/react@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/flights@0.66.0
- @voyant-travel/react@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/flights@0.65.0
- @voyant-travel/react@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/flights@0.64.1
- @voyant-travel/react@0.64.1

## 0.64.0

### Patch Changes

- @voyant-travel/flights@0.64.0
- @voyant-travel/react@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/flights@0.63.1
- @voyant-travel/react@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/flights@0.63.0
- @voyant-travel/react@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/flights@0.62.3
- @voyant-travel/react@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/flights@0.62.2
- @voyant-travel/react@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/flights@0.62.1
- @voyant-travel/react@0.62.1

## 0.62.0

### Patch Changes

- @voyant-travel/flights@0.62.0
- @voyant-travel/react@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/flights@0.61.0
- @voyant-travel/react@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/flights@0.60.0
- @voyant-travel/react@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/flights@0.59.0
- @voyant-travel/react@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/flights@0.58.0
- @voyant-travel/react@0.58.0

## 0.57.0

### Patch Changes

- Updated dependencies [0829145]
  - @voyant-travel/flights@0.57.0
  - @voyant-travel/react@0.57.0

## 0.56.0

### Patch Changes

- Updated dependencies [fe403fc]
  - @voyant-travel/flights@0.56.0
  - @voyant-travel/react@0.56.0

## 0.55.1

### Patch Changes

- @voyant-travel/flights@0.55.1
- @voyant-travel/react@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/flights@0.55.0
- @voyant-travel/react@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/flights@0.54.0
- @voyant-travel/react@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/flights@0.53.2
- @voyant-travel/react@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/flights@0.53.1
- @voyant-travel/react@0.53.1

## 0.53.0

### Patch Changes

- @voyant-travel/flights@0.53.0
- @voyant-travel/react@0.53.0

## 0.52.4

### Patch Changes

- @voyant-travel/flights@0.52.4
- @voyant-travel/react@0.52.4

## 0.52.3

### Patch Changes

- @voyant-travel/flights@0.52.3
- @voyant-travel/react@0.52.3

## 0.52.2

### Patch Changes

- @voyant-travel/flights@0.52.2
- @voyant-travel/react@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/flights@0.52.1
- @voyant-travel/react@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/flights@0.52.0
- @voyant-travel/react@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/flights@0.51.1
- @voyant-travel/react@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/flights@0.51.0
- @voyant-travel/react@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/flights@0.50.8
- @voyant-travel/react@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/flights@0.50.7
- @voyant-travel/react@0.50.7

## 0.50.6

### Patch Changes

- @voyant-travel/flights@0.50.6
- @voyant-travel/react@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/flights@0.50.5
- @voyant-travel/react@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/flights@0.50.4
- @voyant-travel/react@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/flights@0.50.3
- @voyant-travel/react@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/flights@0.50.2
- @voyant-travel/react@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/flights@0.50.1
- @voyant-travel/react@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/flights@0.50.0
- @voyant-travel/react@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/flights@0.49.0
- @voyant-travel/react@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/flights@0.48.0
- @voyant-travel/react@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/flights@0.47.0
- @voyant-travel/react@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/flights@0.46.0
- @voyant-travel/react@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/flights@0.45.0
- @voyant-travel/react@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/flights@0.44.0
- @voyant-travel/react@0.44.0

## 0.43.0

### Patch Changes

- @voyant-travel/flights@0.43.0
- @voyant-travel/react@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/flights@0.42.0
- @voyant-travel/react@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/flights@0.41.3
- @voyant-travel/react@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/flights@0.41.2
- @voyant-travel/react@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/flights@0.41.1
- @voyant-travel/react@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/flights@0.41.0
- @voyant-travel/react@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/flights@0.40.1
- @voyant-travel/react@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/flights@0.40.0
- @voyant-travel/react@0.40.0

## 0.39.0

### Patch Changes

- @voyant-travel/flights@0.39.0
- @voyant-travel/react@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/flights@0.38.2
- @voyant-travel/react@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/flights@0.38.1
- @voyant-travel/react@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/flights@0.38.0
- @voyant-travel/react@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/flights@0.37.1
- @voyant-travel/react@0.37.1

## 0.37.0

### Patch Changes

- @voyant-travel/flights@0.37.0
- @voyant-travel/react@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/flights@0.36.0
- @voyant-travel/react@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/flights@0.35.0
- @voyant-travel/react@0.35.0

## 0.34.0

### Patch Changes

- @voyant-travel/flights@0.34.0
- @voyant-travel/react@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/flights@0.33.1
- @voyant-travel/react@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/flights@0.33.0
- @voyant-travel/react@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/flights@0.32.3
- @voyant-travel/react@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/flights@0.32.2
- @voyant-travel/react@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/flights@0.32.1
- @voyant-travel/react@0.32.1

## 0.32.0

### Patch Changes

- @voyant-travel/flights@0.32.0
- @voyant-travel/react@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/flights@0.31.4
- @voyant-travel/react@0.31.4

## 0.31.3

### Patch Changes

- @voyant-travel/flights@0.31.3
- @voyant-travel/react@0.31.3

## 0.31.2

### Patch Changes

- @voyant-travel/flights@0.31.2
- @voyant-travel/react@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/flights@0.31.1
- @voyant-travel/react@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/flights@0.31.0
- @voyant-travel/react@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/flights@0.30.7
- @voyant-travel/react@0.30.7

## 0.30.6

### Patch Changes

- @voyant-travel/flights@0.30.6
- @voyant-travel/react@0.30.6

## 0.30.5

### Patch Changes

- @voyant-travel/flights@0.30.5
- @voyant-travel/react@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/flights@0.30.4
- @voyant-travel/react@0.30.4

## 0.30.3

### Patch Changes

- @voyant-travel/flights@0.30.3
- @voyant-travel/react@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/flights@0.30.2
- @voyant-travel/react@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/flights@0.30.1
- @voyant-travel/react@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/flights@0.30.0
- @voyant-travel/react@0.30.0

## 0.29.0

### Patch Changes

- @voyant-travel/flights@0.29.0
- @voyant-travel/react@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/flights@0.28.3
- @voyant-travel/react@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/flights@0.28.2
- @voyant-travel/react@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/flights@0.28.1
- @voyant-travel/react@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/flights@0.28.0
- @voyant-travel/react@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/flights@0.27.0
- @voyant-travel/react@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/flights@0.26.9
- @voyant-travel/react@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/flights@0.26.8
- @voyant-travel/react@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/flights@0.26.7
- @voyant-travel/react@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/flights@0.26.6
- @voyant-travel/react@0.26.6

## 0.26.5

### Patch Changes

- @voyant-travel/flights@0.26.5
- @voyant-travel/react@0.26.5

## 0.26.4

### Patch Changes

- @voyant-travel/flights@0.26.4
- @voyant-travel/react@0.26.4

## 0.26.3

### Patch Changes

- @voyant-travel/flights@0.26.3
- @voyant-travel/react@0.26.3

## 0.26.2

### Patch Changes

- @voyant-travel/flights@0.26.2
- @voyant-travel/react@0.26.2

## 0.26.1

### Patch Changes

- @voyant-travel/flights@0.26.1
- @voyant-travel/react@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/flights@0.26.0
- @voyant-travel/react@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/flights@0.25.0
- @voyant-travel/react@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/flights@0.24.3
- @voyant-travel/react@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/flights@0.24.2
- @voyant-travel/react@0.24.2

## 0.24.1

### Patch Changes

- @voyant-travel/flights@0.24.1
- @voyant-travel/react@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/flights@0.24.0
- @voyant-travel/react@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/flights@0.23.0
- @voyant-travel/react@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/flights@0.22.0
- @voyant-travel/react@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/flights@0.21.1
- @voyant-travel/react@0.21.1

## 0.21.0

### Patch Changes

- @voyant-travel/flights@0.21.0
- @voyant-travel/react@0.21.0

## 0.20.0

### Minor Changes

- cc3eddd: **Demo flight adapter is now a standalone HTTP service with its own DB; flight orders get a list page, payment status badges, and search/filter/sort.**

  The previous demo adapter lived inside the operator template, used an in-memory `Map` for "persistence" (orders vanished on every restart), and bled fake tables into the template's primary Postgres. None of that scales to "show me my bookings". This release extracts the demo into a proper standalone provider so the operator template no longer pretends a demo is real.

  - **New runnable** `apps/flights-demo-api` (Node + Hono + drizzle + postgres) — own database, own migrations, own `docker-compose.yml`. Mirrors the `FlightConnectorAdapter` 1:1 over REST: `POST /search`, `POST /price`, `POST /book`, `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel`, `POST /ancillaries`, `POST /seatmap`, `GET /health`. Fails fast at startup if its Postgres is unreachable. Set `FLIGHTS_DEMO_DATABASE_URL` (preferred over the shared `DATABASE_URL` so the demo can never silently inherit the operator's DB).
  - **Booking** is no longer "idempotent" via deterministic order id — `synthesizeOrder` now seeds with the offer hash + `Date.now()` + a random nonce so every `bookFlight` call mints a unique PNR, matching real GDS behaviour. Same offer + same passengers → distinct order rows.
  - **Contract: `FlightConnectorAdapter.listOrders?(ctx, query)`** is a new optional method (`flight/list-orders` capability), with `FlightOrdersListQuery` and `FlightOrdersListResponse` types. Adapters that own a persistent store (the demo, real travel-tech connectors with agency-side APIs) implement it; pass-through GDS connectors simply omit it. `FlightAdapterContext.deps` is a new optional escape hatch for adapter-specific runtime handles (DB, FX clients, etc.) — real connectors ignore it.
  - **`useFlightOrders(filters?)`** hook in `@voyant-travel/flights-react` with `cursor` / `limit` / `search` / `status` / `paymentStatus` filters, plus the `FlightOrdersListResponseDto` schema and the new `FlightOrderPaymentStatus` enum.
  - **Operator template** gets `/flights/orders` route, sidebar "Orders" sub-item under Flights (en + ro i18n), payment status badge on the booking confirmation page, and the orders list now includes Booking + Payment status columns, search debounced 250ms, two filter dropdowns (booking status + payment status — operator-side filter against the bulk-fetched session map, no N+1), and toggle-direction sort headers on Order/Total.
  - **Webhook + redirect plumbing**: the operator template adds the Netopia callback path (`/v1/finance/providers/netopia/callback`) to `publicPaths`, sets `vite.config.ts` `server.allowedHosts: true` (Cloudflare-tunnel friendly for dev webhook delivery), and ships a `/pay` resolver route + `POST /v1/public/payment-link/resolve?ref=` + `POST /v1/public/payment-link/:sessionId/retry` + `POST /v1/public/payment-link/:sessionId/start-card` so any orderID/clientReference echoed back by Netopia resolves to the canonical session id, lazy-starts the card path on demand, and supports retrying after a failed payment by minting a fresh session.

  Migration: drop the `demo_flight_orders` table from the operator DB; migration `0006_common_vance_astro` handles this idempotently for templates following the operator one.

### Patch Changes

- Updated dependencies [cc3eddd]
  - @voyant-travel/flights@0.20.0
  - @voyant-travel/react@0.20.0
