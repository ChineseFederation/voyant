---
"@voyant-travel/relationships-react": minor
---

Make the Inquiry workspace usable by an operator who does not know the data model.

- A disabled lifecycle action now states its reason on the page. The reasons rode
  on `title`, which the shared Button suppresses through
  `disabled:pointer-events-none`, so a greyed-out "Mark triaged" explained
  nothing to anyone and nothing at all to a screen reader.
- Targets can be managed from the workspace: the attached Products are listed,
  detachable, and a Product can be attached from a search. Previously targets
  were API-only, which left "Start booking journey" permanently unreachable for
  any Inquiry an operator created.
- Owner assignment is a colleague picker rather than a free-text "Owner ID"
  field, and the queue's Owner column shows the colleague's name.
- Status, priority, kind and activity-type labels are no longer run through
  `capitalize`, which title-cased translated sentences ("Waiting On Customer").
  Activity types are translated rather than printed as raw enum values.
- The travel brief renders as a brief — destinations, dates, travellers, budget —
  instead of `JSON.stringify` in a `<pre>`.
- Detail order follows triage: the customer's request, its context, what it
  points at, then the paperwork. The duplicate "Work details" card title is gone,
  the attachment caption field is labelled, the private-document picker uses the
  Media uploader's control instead of the browser's native file input, and the
  optional Proposal pipeline/stage ids sit behind an Advanced disclosure.
