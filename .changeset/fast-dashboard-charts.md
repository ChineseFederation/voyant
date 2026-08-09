---
"@voyant-travel/admin": patch
"@voyant-travel/finance-react": patch
"@voyant-travel/vite-config": patch
---

Load dashboard charts after aggregate data arrives, defer public finance page bodies until their route is visited, and keep vendor chunks from absorbing shared dependencies so workspace chrome does not wait on Recharts or payment UI.
