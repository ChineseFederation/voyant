---
"@voyant-travel/auth": patch
---

Retarget cloud-auth staff links to the active runtime deployment after a successful platform revalidation so managed deploy cutover does not strand signed-in admin sessions on `/v1/admin/*`.
