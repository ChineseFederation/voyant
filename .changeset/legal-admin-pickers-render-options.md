---
"@voyant-travel/legal-react": patch
---

Fix the legal admin record pickers so they render the records their list
queries return.

- The combobox told base-ui how to stringify an item for form submission but
  not for display, so the typed query was matched against the raw record id
  and every option was filtered out. Contract templates, people, suppliers,
  channels and the policy-assignment product picker all reported "No results."
  for records the API had just returned.
- The `loading` guards ORed the list query's `isPending` with a detail query
  that is disabled until a record is selected. A disabled query stays pending,
  so a settled empty list read "Loading…" forever. Both terms now use
  `isLoading`, which a disabled query never reports.
- The channel pickers asked for `limit: 250` against an endpoint that caps the
  page at 200, so every dialog open answered 400 and the picker had nothing to
  show. Both call sites now use a shared `CHANNEL_PAGE_LIMIT` at the cap.
