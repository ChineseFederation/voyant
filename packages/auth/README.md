# @voyant-travel/auth

Better Auth wiring for Voyant's reference template stack. Provides server-side
auth helpers, edge runtime variants, backend utilities, and a permissions
contract.

## Install

```bash
pnpm add @voyant-travel/auth better-auth
```

## Usage

```typescript
import {
  createBetterAuth,
  handleAccountProfileRequest,
  handleApiTokenManagementRequest,
} from "@voyant-travel/auth/server"

const auth = createBetterAuth({
  db,
  secret: env.AUTH_SECRET,
  trustedOrigins: ["https://example.com"],
  user: {
    additionalFields: {
      surfaces: {
        type: "string",
        required: false,
      },
    },
  },
})

const profileResponse = await handleAccountProfileRequest(request, auth, { db })
if (profileResponse) return profileResponse

const tokenResponse = await handleApiTokenManagementRequest(request, auth)
if (tokenResponse) return tokenResponse

return auth.handler(request)
```

Auth provider wiring is starter-owned — core Voyant packages only depend on
the normalized `{ userId, actor }` contract, not on Better Auth specifically.

## Local Team Access

Local team deactivation is durable auth state. It revokes the member's current
sessions and API keys, blocks cached-session reuse and new Better Auth sessions,
and suppresses email OTP flows for the deactivated address. Reactivation
restores the member's sign-in providers so new password, social, or OTP sessions
can be created; previously revoked sessions and API keys remain revoked.

Local role changes, activation, and deactivation require an interactive
transaction. Owner-removing mutations serialize and recheck the active-owner
count inside that transaction, so concurrent requests cannot remove the last
active owner. Deployments mounting the team API must therefore select a
transaction-capable database adapter.

`createBetterAuth` forwards Better Auth's `user` options, including
`user.additionalFields`, while preserving Voyant's default change-email support.
When using additional user fields with the Drizzle adapter, the consuming app is
responsible for adding matching columns and migrations to the auth user table.

By default, `createBetterAuth` keeps Voyant's single-tenant guard for admin
signups: once any user exists, another user without explicit surfaces, or with
the `admin` surface, cannot self-register. Customer-facing auth plugins can
still create users by setting a non-admin surface such as `public surface`.

The guarded surfaces are privileged signup surfaces. The default privileged
surface is `admin`; pass `disableSignupWhenUsersExist.surfaces` if a deployment
uses a different staff/admin surface name.

```typescript
const auth = createBetterAuth({
  db,
  user: {
    additionalFields: {
      surfaces: {
        type: "string",
        required: false,
        input: true,
      },
    },
  },
  disableSignupWhenUsersExist: {
    surfaces: ["admin"],
  },
})
```

Better Auth OTP signup flows can apply `user.additionalFields` defaults before
the package signup guard runs. If `surfaces` defaults to `["admin"]`, customer
OTP signups would otherwise be classified as privileged users and rejected once
an admin user exists. Configure `customerSignupSurfaces` to make
`createBetterAuth` stamp the supported customer self-signup endpoints before the
guard evaluates the new user:

```typescript
const auth = createBetterAuth({
  db,
  user: {
    additionalFields: {
      surfaces: {
        type: "string",
        required: false,
        input: false,
        defaultValue: ["admin"],
      },
    },
  },
  customerSignupSurfaces: ["public surface"],
  disableSignupWhenUsersExist: {
    surfaces: ["admin"],
  },
})
```

`customerSignupSurfaces` applies to Better Auth customer self-signup routes that
create a user during OTP verification, including phone-number verification and
email OTP sign-in. It does not change regular admin sign-up or invitation flows.

Better Auth server plugins that define their own tables must pass those Drizzle
tables through `extraSchema` so the shared Drizzle adapter can resolve them:

```typescript
import { createBetterAuth } from "@voyant-travel/auth/server"
import { authInvitation, authMember, authOrganization } from "@voyant-travel/db/schema/iam"
import { organization } from "better-auth/plugins"

const auth = createBetterAuth({
  db,
  plugins: [organization()],
  extraSchema: {
    organization: authOrganization,
    member: authMember,
    invitation: authInvitation,
  },
})
```

The app that mounts the plugin owns the plugin migrations. `extraSchema` only
connects existing Drizzle table definitions to Better Auth; it does not create
or run migrations.

The package also exposes a narrow shared-secret bearer-token helper surface via
`@voyant-travel/utils/session-claims` for runtime-local verification. That helper is
not a replacement for Better Auth session cookies and does not imply a
platform-wide JWKS/JWT-first auth model.

## Voyant Cloud Admin Auth

Voyant Cloud deployments can use `@voyant-travel/auth/cloud-admin-session` to keep
Better Auth as the local session and JWT/JWKS issuer while delegating identity
and membership checks to Voyant Cloud.

Cloud mode is exclusive. A deployment running with
`VOYANT_ADMIN_AUTH_MODE=voyant-cloud` should expose only the Cloud start and
callback routes plus the Better Auth endpoints that remain local session/token
infrastructure (`get-session`, `session`, `sign-out`, `token`, `jwks`, and API
token management when Cloud revalidation is configured). Local sign-in,
sign-up, invitation redemption, password reset, email verification, email OTP,
change-email, and social OAuth routes must stay server-blocked in Cloud mode.
Local/self-host development should set `VOYANT_ADMIN_AUTH_MODE=local` and keeps
the normal Better Auth flows.

```typescript
import { createVoyantCloudAdminAuthPlugin } from "@voyant-travel/auth/cloud-admin-session"
import { createBetterAuth } from "@voyant-travel/auth/server"

const auth = createBetterAuth({
  db,
  basePath: "/auth/admin",
  plugins: [
    createVoyantCloudAdminAuthPlugin({
      db,
      cookieSecret: env.SESSION_CLAIMS_ADMIN_SECRET,
      exchange: {
        exchangeUrl: env.VOYANT_CLOUD_ADMIN_AUTH_EXCHANGE_URL,
        deploymentId: env.VOYANT_CLOUD_DEPLOYMENT_ID,
        clientToken: env.VOYANT_CLOUD_ADMIN_AUTH_CLIENT_TOKEN,
        assertionJwksUrl: env.VOYANT_CLOUD_ADMIN_AUTH_JWKS_URL,
        assertionAudience: env.VOYANT_CLOUD_ADMIN_AUTH_AUDIENCE ?? env.VOYANT_CLOUD_DEPLOYMENT_ID,
      },
      onUserProvisioning: async ({ db, assertion, user, isNewUser }) => {
        // Optional Cloud-mode side effects or app-owned profile/user columns.
        // Better Auth databaseHooks.user.create.* do not fire for this trusted
        // mirror path because it bypasses public sign-up.
      },
    }),
  ],
})
```

The plugin mounts Better Auth's `/auth/admin/cloud/callback` endpoint. That endpoint
validates the signed broker state, exchanges the one-time Cloud code, verifies
the signed Cloud assertion, upserts the local mirror user/account/profile,
stores Cloud linkage side-table rows, and then creates the local Better Auth
session cookie through Better Auth's own session and cookie helpers.

Cloud mode is intentionally a direct mirror provisioning path, similar to a
trusted invitation redemption path. Consumer Better Auth
`databaseHooks.user.create.*` are not invoked. Use `onUserProvisioning` for
Cloud-mode custom fields or side effects.

The mirror user uses a generated local Better Auth `user.id`; WorkOS user ids
are stored in local account/linkage rows and must not be used as JWT `sub`.
Cloud linkage metadata lives in `cloud_auth_user_links` and
`cloud_auth_session_links`, not in the Better Auth session response shape.

For ongoing access, call `revalidateVoyantCloudAdminAuthSession(...)` before
Cloud-mode browser-session-sensitive operations and
`revalidateVoyantCloudAdminAuthUser(...)` for local API-token callers. A revoked
Cloud membership marks the Cloud link revoked and disables local Better Auth API
keys for that mirrored user. Current v1 revalidation is pull/cached; a Cloud
webhook can later reduce revocation latency but should not replace pull checks.

Voyant Cloud-provisioned deployments receive these settings from Cloud:

```dotenv
VOYANT_ADMIN_AUTH_MODE=voyant-cloud
VOYANT_CLOUD_ADMIN_AUTH_START_URL=https://dash.voyantcloud.com/admin-auth/start
VOYANT_CLOUD_ADMIN_AUTH_EXCHANGE_URL=https://api.voyant.travel/cloud/v1/admin-auth/exchange
VOYANT_CLOUD_ADMIN_AUTH_JWKS_URL=https://api.voyant.travel/.well-known/admin-auth/jwks.json
VOYANT_CLOUD_ADMIN_AUTH_REVALIDATE_URL=https://api.voyant.travel/cloud/v1/admin-auth/revalidate
VOYANT_CLOUD_ADMIN_AUTH_AUDIENCE=dep_...
VOYANT_CLOUD_ADMIN_AUTH_CLIENT_TOKEN=...
VOYANT_CLOUD_DEPLOYMENT_ID=dep_...
```

Self-hosted deployments do not need WorkOS or Voyant Cloud configuration.

## API Token Management

Better Auth's API Key plugin owns token storage and verification. Voyant adds a
small `/auth/api-tokens` facade for operator management UI because the UI needs
server-only plugin fields such as `permissions`, `remaining`, and `enabled`.
Mount `handleApiTokenManagementRequest(...)` before falling through to
`auth.handler(request)`.

In Cloud mode, API-token management and raw `voy_` API-token request handling
must both call Cloud revalidation. This prevents a personal API token from
outliving the user's WorkOS/Voyant Cloud membership.

## Account Profile

Voyant auth UIs use `PATCH /auth/me` to update the signed-in user's basic
profile fields: `firstName`, `lastName`, `locale`, `timezone`, and
`profilePictureUrl`. Mount `handleAccountProfileRequest(...)` before falling
through to `auth.handler` when the app wants shared onboarding or account UI to
submit directly to the auth facade.

`updateCurrentUserProfile(db, { userId, ...patch })` from
`@voyant-travel/auth/workspace` updates the Voyant profile row and returns the
normalized `CurrentUser`.

## Exports

| Entry | Description |
| --- | --- |
| `.` | Barrel re-exports |
| `./server` | Node.js/server `createAuth` factory |
| `./edge` | Edge/Workers `createAuth` factory |
| `./backend` | Backend helpers (session inspection, API keys) |
| `./cloud-admin-session` | Better Auth plugin for Voyant Cloud broker callbacks |
| `./cloud-broker` | Browser state and assertion exchange helpers for the Cloud broker |
| `./workspace` | Current-user/profile helpers for mounted auth routes |
| `./permissions` | Permission/role contracts |

## License

Apache-2.0
