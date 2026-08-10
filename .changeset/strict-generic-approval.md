---
"@voyant-travel/tools": patch
---

Reject approval-required generic Tool execution at registration because arbitrary dispatch cannot be durably fenced, stop advertising approval continuations for actions whose policy never requires approval, and tolerate explicit confirmation on execute commands where approval already supplies the required authorization.
