---
"@voyant-travel/operator-standard": minor
"@voyant-travel/auth-react": minor
"@voyant-travel/mcp": minor
---

Ship the MCP connector consent screen in every admin auth mode.

`/mcp-consent` was contributed as part of the local-auth presentation, alongside
`sign-in`, `sign-up`, and the password-reset pages. A deployment running
`VOYANT_ADMIN_AUTH_MODE=voyant-cloud` deliberately does not select that
contribution, so it shipped no consent page: an MCP connector registered and
authorized successfully, then landed on a 404 at the last step before the grant.

That was a miscategorisation. The consent screen is not a local-auth page — it
is an OAuth authorization decision point, and the authorization server issuing
connector grants is local to the deployment in every auth mode, which is why
`/auth/oauth2/consent` and `/auth/oauth2/get-client` are already reachable in
cloud mode.

The screen now has its own presentation, `@voyant-travel/mcp#presentation.consent`,
declared by the MCP module and mounted from a new
`@voyant-travel/auth-react/mcp-consent-routes` export. It ships whenever the MCP
transport ships, and a broker-authenticated Operator gets it without also
getting a local sign-in and sign-up page. `createLocalAuthRouteContribution` no
longer returns an `mcpConsent` route, and the generated route host moved from
`(auth)/mcp-consent.tsx` to `(mcp)/mcp-consent.tsx`; the public path
`/mcp-consent` is unchanged.
