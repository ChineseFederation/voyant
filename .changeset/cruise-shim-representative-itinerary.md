---
"@voyant-travel/cruises": patch
"@voyant-travel/catalog-react": patch
---

Publish a representative itinerary for cruises served through the source-adapter shim. The shim fetched every sailing's stops and then discarded them at the cruise level, so the Itinerary section was missing from the detail page; it now carries the first sailing that has a route, matching the Connect adapter. The storefront cruise mapper falls back to the first sailing's stops as well, so a payload without cruise-level stops still renders the section.
