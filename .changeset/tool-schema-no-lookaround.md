---
"@voyant-travel/relationships-contracts": patch
"@voyant-travel/suppliers-contracts": patch
"@voyant-travel/identity-contracts": patch
"@voyant-travel/bookings-contracts": patch
"@voyant-travel/distribution": patch
"@voyant-travel/storefront": patch
"@voyant-travel/schema-kit": patch
"@voyant-travel/finance": patch
"@voyant-travel/legal": patch
---

Advertise email fields with a regex a strict-schema LLM client can parse.

Zod's default `z.email()` pattern opens with `^(?!\.)(?!.*\.\.)`, and providers
that validate tool schemas with an RE2-style engine reject regex lookaround
outright. A client sends every authorized tool schema in one model call, so the
18 affected fields took down every turn of a conversation, including questions
that never touched the Tools carrying them.

`@voyant-travel/schema-kit/email` now exports `emailAddress()`, which says
exactly what zod's default says but structurally: the local part is
dot-separated runs of non-dot characters, which is what "no leading dot, no
consecutive dots, no trailing dot" means. A differential fuzz against
`z.regexes.email` over 700k inputs found zero classification differences, so no
field's verdict changes. At 84 characters it is also shorter than the 96-char
default it replaces, which matters because these patterns ship inside every
advertised Tool schema.
