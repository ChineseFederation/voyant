---
"@voyant-travel/notifications": minor
---

Add `list_notification_templates` and `get_notification_template` so an agent can read template copy. The package advertised only delivery reads and `send_notification`, so an operator asking "what does our booking confirmation email say?" got "there isn't a tool exposed here to read the template copy" — despite a Templates admin page and a complete `service-templates` layer behind it. Both are read-tier on `notifications:read`. The list returns compact metadata only and the bodies are projected out at the runtime boundary, since a page holds up to 200 rows of unbounded HTML; `get_notification_template` takes either an id or a slug and returns the subject and body so the copy can be quoted back before anything is sent.
