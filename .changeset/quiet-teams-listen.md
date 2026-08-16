---
"@voyant-travel/auth-react": patch
"@voyant-travel/auth": patch
---

Say "team members" instead of "roster" in team settings

Settings > Team called its member list a "Roster", a word from a domain Voyant
does not have — an agency has a team and team members, and the Romanian copy
already said so. The card is now "Team members", its description drops
"provider-supplied activity" for what the columns actually show, and the invite
card no longer mentions the identity provider a travel agent never configured.

The `viewRoster` team-management capability is renamed `viewMembers` across the
runtime port, both adapters, and the guarded provider, so the vocabulary the UI
reads matches the one it renders.
