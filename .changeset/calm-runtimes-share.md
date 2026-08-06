---
"@voyant-travel/bookings": patch
"@voyant-travel/db": patch
"@voyant-travel/distribution": patch
"@voyant-travel/finance": patch
"@voyant-travel/framework": patch
"@voyant-travel/inventory": patch
"@voyant-travel/operations": patch
"@voyant-travel/runtime": patch
---

Bound resident Node database pools to four connections by default, allow an
explicit `DATABASE_MAX_CONNECTIONS` override, and only attach dashboard cache
headers after an aggregate response succeeds so transient server errors are not
cached by browsers.
