---
"@voyant-travel/auth-react": minor
"@voyant-travel/operator-settings-react": patch
---

Rebuild the API tokens page around a scope picker, and make a missing permission catalog fail loudly.

Settings → API tokens rendered its permission catalog inline, so a deployment that mounted the page without an `accessCatalog` silently produced a create form with no checkboxes whose only possible outcome was "Select at least one permission." The page now says so — a destructive alert plus a disabled create action — instead of offering a form that cannot succeed.

Creating a token moved into a sheet: name, expiration, then scopes as preset chips, a search box, and one collapsed accordion section per resource. Ticking a resource grants it whole and locks its actions, and the grant names any `wildcard: "explicit"` action alongside the `*` so it covers exactly what it displays. Presets published as `api-token-grant` (the audience-scoped agent presets) are offered too — previously only `api-token` presets were, so deployments that publish only the former showed none.

Existing tokens moved from stacked cards to a table with a per-row action menu, and deleting a token now asks for confirmation the way rotating one already did.

Webhooks: the create-subscription dialog scrolls its body instead of pushing Cancel and Create subscription past the viewport, and both webhook pages use the design-system `Checkbox` rather than a raw `<input type="checkbox">`.
