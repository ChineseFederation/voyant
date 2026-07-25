---
"@voyant-travel/auth": patch
---

Quarantine `team.action.revoke-invitation`, `team.action.update-member-role`,
`team.action.activate-member`, and `team.action.deactivate-member` from
agent Tool exposure (`availability: "unavailable"`,
`effectBoundary: "multistage"`), matching the existing
`team.action.invite-member` posture. All four share the
`auth.team-management-runtime` port, whose cloud adapter calls an external
identity provider with no proven crash-safe replay contract, so declaring
`effectBoundary: "local"` would misrepresent the actual effect boundary.
Admin UI management of team members is unaffected — those routes call the
runtime provider directly rather than through the Tool registry.
