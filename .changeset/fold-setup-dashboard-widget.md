---
"@voyant-travel/setup": minor
"@voyant-travel/setup-react": minor
"@voyant-travel/admin": patch
---

Fold organization setup into a dismissible dashboard widget and remove the dedicated Setup page/nav.

Caller migration for `@voyant-travel/setup-react`: the public `SetupPage` export and `/setup` route are removed. Use the `SetupDashboardWidget` contribution on `dashboard.header` (via `createSelectedSetupAdminExtension`) instead of mounting a Setup page or linking to `/setup`.
