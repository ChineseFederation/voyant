# @voyant-travel/insurance-contracts

Provider-neutral contracts for selling travel insurance alongside a trip.

A policy is not a booking, not a product and not an extra. It has its own
lifecycle (quote → application → issued policy), its own documents, its own
insured persons — who are not always the travellers — and eligibility rules that
belong to the insurer rather than to the operator. This package is the shared
vocabulary for all of that, consumed by the `insurance` runtime module, the
storefront, and every provider adapter.

## What is in here

| Subpath | Contents |
|---|---|
| `./money` | `insuranceMoneySchema` — integer minor units plus their currency |
| `./eligibility` | Structured refusal reasons, `insuranceEligibilitySchema` |
| `./cover` | The cover categories that mean the same thing across insurers |
| `./disclosure` | Pre-contractual disclosures, pinned to the version in force |
| `./document` | `insuranceDocumentSchema`, URL vs inline bytes |
| `./quote` | `insuranceQuoteRequestSchema`, `insuranceQuoteSchema`, `orderInsuranceQuotes` |
| `./application` | Insured persons, contracting party, insurer questions |
| `./policy` | `insurancePolicySchema` and its issue states |
| `./provider` | `InsuranceProviderAdapter` — the five-method port |

## Three design rules the shapes enforce

**Plan tiers are display labels.** `planTier` is an insurer's invention and
means something different to each of them. It is never a sort key and never a
branch condition. What is comparable is the premium, the sum insured, the excess
and the cover categories.

**No market-specific identity fields.** A national identity number is an
`insuranceIdentityDocumentSchema` entry with `type: "national_identity"` and an
`issuingCountry`, exactly like a passport. Promoting one market's document to a
named field makes the contract wrong everywhere else.

**Eligibility is data, not an exception.** An insurer refusing a combination of
trip length, lead time or age returns a quote whose `eligibility.status` is not
`eligible`, carrying reasons a caller can show. Adapters throw only when the call
itself failed.

## Usage

```ts
import {
  type InsuranceProviderAdapter,
  insuranceQuoteRequestSchema,
  orderInsuranceQuotes,
} from "@voyant-travel/insurance-contracts"
```

Use `@voyant-travel/insurance` when you also need persistence, routes, the
provider fan-out, or booking integration.
