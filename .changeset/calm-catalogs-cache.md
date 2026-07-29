---
"@voyant-travel/inventory": patch
"@voyant-travel/framework": patch
---

Cache non-personalized public product catalog responses in shared caches for fifteen minutes, keeping repeated storefront browsing off application and database computes while leaving availability, booking, customer, and payment routes untouched. Publish a new Framework runtime coordinate so managed images can roll this cache policy together with the serverless database idle-connection fix.
