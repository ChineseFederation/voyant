---
"@voyant-travel/relationships-react": patch
---

Address the automated review on the Inquiry workspace.

- **Next action no longer drifts by the operator's UTC offset.** The deadline is
  a `datetime-local` control, which the browser reads as local time, and the save
  path parses it back with `new Date(...)`. Slicing the stored ISO string put UTC
  clock fields in it, so anyone outside UTC moved an untouched deadline by their
  offset every time they pressed Save. The instant is now formatted into local
  fields, and a round-trip test pins it.
- **An ownerless closed Inquiry can be reopened again.** Reopening lands in
  triage, which requires an owner or a stated reason for having none, but the
  Reopen button sent an empty command and `onReopen` could not carry one — the
  API answered 409 and there was no way to satisfy it from the packaged UI. The
  button now carries the unassigned reason and is blocked, with the reason shown,
  until there is one.
- **The inquiry-queue loader shares its cache entry with the queue.** The query
  key is the filters object, so the loader's `{ view, limit }` and the host's
  `{ view, limit, offset }` were different keys: every first navigation threw the
  prefetch away and refetched behind the pending state. Both sibling loaders
  already passed `offset: 0`.
