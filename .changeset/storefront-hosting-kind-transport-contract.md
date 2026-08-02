---
"@voyant-travel/auth": patch
"@voyant-travel/auth-react": patch
---

Stop rejecting storefronts whose hosting kind belongs to the runtime provider.
The storefront admin response contract enumerated `cloud_site` and `external`,
so a deployment backed by a control plane that mints its own hosting kinds
failed the whole list response and rendered the storefronts page error state on
a healthy 200. Response hosting kinds are now open; the create input keeps the
operator enum, exported as `operatorStorefrontHostingKindSchema`.
