---
"@voyant-travel/storefront": major
"@voyant-travel/storefront-react": major
---

Remove the anonymous `contact-exists` endpoints.

`GET /v1/public/customer-portal/contact-exists` and its `/phone` sibling told
any unauthenticated caller whether an address had an auth account, whether it
had a customer record, and whether that record was already claimed by someone
else. That is an account enumeration oracle, and rate limiting only slows it
down.

**Breaking.** Both routes are gone, along with `getCustomerPortalContactExists`,
`getCustomerPortalPhoneContactExists`, their query options, hooks, filters, and
result types. The customer-portal public bundle now declares no anonymous
routes at all.

Storefronts should start a verification challenge instead: the API response is
identical whether or not an account exists, the delivered message differs, and
the client branches on what the user does next rather than on an answer the
server should not give an anonymous caller.
