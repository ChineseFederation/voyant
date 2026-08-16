---
"@voyant-travel/operator-settings-react": minor
"@voyant-travel/i18n": patch
---

Redesign Settings → Payments as a single processor list.

The screen previously rendered one connection three times — an "Active
provider" card, a "Connections" list, and an "Available providers" grid — with
up to four badges per row. Two of those badges could never disagree:
`paymentConnectionReadiness` is `state === "connected"`, so `Ready` and
`Connected` were the same fact rendered twice.

Each processor is now one card carrying its brand mark, one status badge from a
precedence where anything broken or blocked outranks being active, and its
connections as rows underneath. A processor nobody has set up shows no badge at
all. Mode is presented as an attribute of a connection rather than as a status.
Processor logos resolve from the descriptor's existing `logoRef` and sit on a
constant white plate so fixed-colour brand assets read the same in light and
dark.
