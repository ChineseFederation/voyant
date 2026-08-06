---
"@voyant-travel/auth": patch
---

Serve storefront channel bindings from the request database when the deployment
wires no `LinkService`.

`createLinkServiceStorefrontChannelBindingProvider` required `context.link`, a
service that reaches the request only when the composition wired the generated
project link registry. `loadVoyantProject` does that; the managed operator
runtime composes the graph straight from a profile snapshot and never reads
those artifacts, so `context.link` was absent on every managed request and the
provider threw on all of them — `GET /v1/admin/storefronts/storefronts` answered
500 and the admin rendered "Storefronts unavailable" on every managed
deployment.

The type already called the service optional. It now is: the provider builds a
request-scoped service over its own `storefrontChannelLink` when the deployment
supplied none, reading and writing the same
`auth_storefront_distribution_channel` pivot table that ships as a
`@voyant-travel/db` migration. A deployment-supplied `LinkService` is still
preferred where one exists, so the self-hosted path is unchanged.

Degrading to "no binding" was the other option on the table and is worse: the
public catalog guard refuses on a missing channel rather than on an error, so a
provider that returned nothing would trade a 500 in the admin for a silent 403
on every storefront read.
