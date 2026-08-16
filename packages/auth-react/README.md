# @voyant-travel/auth-react

The auth client tier: headless data hooks/clients plus the styled UI
components and page surfaces (formerly `@voyant-travel/auth-ui`).

Headless consumers import from the root, `./hooks`, `./client`, or
`./query-keys` — these pull no styling peers. Styled surfaces live under
`./ui`, `./components/*`, `./account`, `./organization-members`, `./i18n`,
and `./styles.css`, whose heavier peers (`@voyant-travel/ui`, `@voyant-travel/admin`,
`lucide-react`) are optional and only needed when you import those subpaths.

React runtime package for Voyant authentication and optional workspace state.

This package wraps the shared Voyant auth HTTP contract:

- `/auth/me`
- `PATCH /auth/me`
- `/auth/status`
- `/auth/request-password-reset`
- `/auth/reset-password`
- `/auth/sign-in/email`
- `/auth/change-password`
- `/auth/email-otp/request-email-change`
- `/auth/email-otp/change-email`
- `/auth/sign-up/email`
- `/auth/verify-email`
- `/auth/email-otp/verify-email`
- `/auth/workspace/current`
- `/auth/workspace/active-organization`
- `/auth/organization/list-members`
- `/auth/organization/list-invitations`
- `/auth/organization/invite-member`
- `/auth/organization/accept-invitation`
- `/auth/organization/update-member-role`
- `/auth/organization/remove-member`
- `/auth/organization/cancel-invitation`
- `/auth/api-tokens`
- `/auth/api-tokens/:keyId`

It provides reusable React surfaces for:

- current user state
- account profile, password, and email-change mutations
- optional workspace and organization state
- organization member listing
- organization invitation listing
- email/password sign-in
- email/password sign-up
- email verification by Better Auth token or email OTP
- password reset request and confirmation
- invite, accept, cancel, remove, and role update mutations
- API token listing, creation, update, and deletion

## Sign-In

`useSignIn()` exposes the shared email/password Better Auth flow:

```tsx
const signIn = useSignIn()

await signIn.email.mutateAsync({
  email,
  password,
  callbackURL: "/",
})
```

After Better Auth accepts the credentials, the hook calls `/auth/status` to
provision the Voyant user profile if needed and invalidates the current auth
queries.

## Account self-service

`useUpdateAccountProfile()` updates Voyant profile fields through
`PATCH /auth/me` and refreshes the current-user query:

```tsx
const updateProfile = useUpdateAccountProfile()

await updateProfile.mutateAsync({
  firstName: "Ana",
  lastName: "Pop",
  locale: "ro",
  timezone: "Europe/Bucharest",
  profilePictureUrl: null,
})
```

Apps can mount `handleAccountProfileRequest(...)` from `@voyant-travel/auth/server`
to provide this route without depending on a specific template. The mounted
route validates the session, calls `updateCurrentUserProfile(...)` from
`@voyant-travel/auth/workspace`, and returns the updated current-user shape.

Password and email changes call the mounted Better Auth API:

```tsx
const changePassword = useChangeAccountPassword()
await changePassword.mutateAsync({
  currentPassword,
  newPassword,
  revokeOtherSessions: true,
})

const requestEmailChange = useRequestAccountEmailChange()
await requestEmailChange.mutateAsync({ newEmail })

const confirmEmailChange = useConfirmAccountEmailChange()
await confirmEmailChange.mutateAsync({ newEmail, otp })
```

## Sign-Up

`useSignUp()` exposes the shared email/password Better Auth registration flow:

```tsx
const signUp = useSignUp()

await signUp.email.mutateAsync({
  name,
  email,
  password,
  callbackURL: "/",
})
```

The hook posts to the mounted Better Auth `/auth/sign-up/email` endpoint, calls
`/auth/status` after success for profile provisioning fallback, and invalidates
the current auth queries. Invitation-backed registration should use the app's
invitation redemption endpoint, because Better Auth email sign-up cannot redeem
Voyant admin-issued invite tokens.

## Invitation Acceptance

`useAcceptInvitation()` posts a Better Auth organization invitation token to the
mounted `/auth/organization/accept-invitation` endpoint:

```tsx
const acceptInvitation = useAcceptInvitation()

await acceptInvitation.mutateAsync({ token: invitationId })
```

The helper also accepts Better Auth's native field name:

```tsx
await acceptInvitation.mutateAsync({ invitationId })
```

On success, current-user, current-workspace, organization-member, and
organization-invitation queries are invalidated so app shells can refresh their
membership state.

## Password Reset

`useRequestPasswordReset()` and `useConfirmPasswordReset()` expose the mounted
Better Auth reset-password endpoints:

```tsx
const requestReset = useRequestPasswordReset()

await requestReset.mutateAsync({
  email,
  redirectTo: "https://operator.example/reset-password",
})

const confirmReset = useConfirmPasswordReset()

await confirmReset.mutateAsync({
  token,
  newPassword,
})
```

The request hook posts to `/auth/request-password-reset` with `email` and
`redirectTo`. The confirm hook posts to `/auth/reset-password` with `token` and
`newPassword`, then invalidates the current auth queries.

## Email Verification

`useVerifyEmail()` exposes the shared Better Auth verification flow. Token links
call the mounted Better Auth `/auth/verify-email` endpoint; OTP verification
uses the email OTP plugin route used by the templates.

```tsx
const verifyEmail = useVerifyEmail()

await verifyEmail.mutateAsync({ token })
await verifyEmail.mutateAsync({ email, otp })
```

After verification succeeds, the hook calls `/auth/status` to provision the
Voyant user profile if needed and invalidates the current auth queries.

## Single-Tenant Apps

Single-tenant operator apps should bootstrap their shell from `useCurrentUser()`
or `/auth/me` only. `useCurrentWorkspace()`, `useWorkspaceMutation()`,
organization member hooks, and invitation hooks are opt-in team/workspace
surfaces for apps that expose Better Auth organization routes.

Do not make workspace queries part of the base admin loading gate unless the app
intentionally requires organization switching or team management. Apps that do
not mount the organization routes can still use the current-user hooks without
providing `/auth/workspace/current` or `/auth/organization/*` endpoints.

## API Tokens

The API-token hooks call Voyant's `/auth/api-tokens` facade, not Better Auth's
raw `/auth/api-key/*` plugin routes. Mount
`handleApiTokenManagementRequest(...)` from `@voyant-travel/auth/server` before
falling through to `auth.handler(request)` so the shared UI can manage
permissioned `voy_` service tokens.

## UI components

Importable React UI components for Voyant auth surfaces. Bundler-consumed
(Vite, Next.js, webpack, etc.).

### Install

```bash
pnpm add @voyant-travel/auth-react @voyant-travel/ui @tanstack/react-query react react-dom
```

`@voyant-travel/ui` provides the design-system primitives. `@voyant-travel/auth-react`
provides the data-layer hooks. Both are required peers.

All components accept a `className` prop and merge it with `cn()`. Wrap or
compose to extend; use the registry copy-paste path for components you want to
fork outright.

Workspace page components render with `p-6` outer padding by default and are
intended to mount directly into an app route outlet. Auth flow pages are
card-less, centered form surfaces intended to sit inside an app-owned auth
layout. Pass `className` to extend or override spacing when a shell owns the
page chrome.

### Account self-service

`AccountPage` renders the reusable operator account surface with profile,
email-change, and password-change forms. It uses `OperatorAdminPageShell` and
accepts slot/render-prop panels for app-specific account sections such as API
tokens, sessions, or MFA enrollment.

```tsx
import { AccountPage } from "@voyant-travel/auth-react/account"

<AccountPage
  slots={{
    apiTokensPanel: ({ user }) => <ApiTokensPanel userId={user?.id ?? null} />,
  }}
/>
```

The forms are also exported independently:

```tsx
import {
  AccountChangeEmailForm,
  AccountChangePasswordForm,
  AccountProfileForm,
} from "@voyant-travel/auth-react/ui"
```

`AccountProfileForm` expects the app to support `PATCH /auth/me`.
`AccountChangePasswordForm`, `AccountChangeEmailForm`, and `AccountPage` use the
Better Auth password and Email OTP endpoints mounted under `/auth`.

### Organization members

`OrganizationMembersPage` renders the reusable organization staff management
surface with invitation, role assignment, pending invitation resend/cancel, and
member removal controls. It uses the organization member and invitation hooks
from `@voyant-travel/auth-react`; server permissions still determine whether each
mutation succeeds.

```tsx
import { OrganizationMembersPage } from "@voyant-travel/auth-react/organization-members"

<OrganizationMembersPage
  availableRoles={[
    { value: "owner", label: "Owner" },
    { value: "admin", label: "Admin" },
    { value: "member", label: "Member" },
  ]}
/>
```

Pass `organizationId` when the route manages a specific organization. Otherwise
the page uses the active organization from `useCurrentWorkspace()`.

### Sign-in

`SignInPage` provides the shared email/password sign-in surface. It uses
`useSignIn()` from `@voyant-travel/auth-react`, which posts to the mounted Better
Auth email endpoint and refreshes Voyant auth queries after success.

```tsx
import { SignInPage } from "@voyant-travel/auth-react/ui"

<SignInPage
  redirectTo="/"
  forgotPasswordHref="/forgot-password"
  signUpHref="/sign-up"
  onSignedIn={({ redirectTo }) => navigate({ to: redirectTo ?? "/" })}
/>
```

Social providers and email-verification resend behavior stay app-owned because
they need router and provider-plugin wiring:

```tsx
<SignInPage
  socialProviders={[
    {
      id: "google",
      label: "Continue with Google",
      onSignIn: ({ redirectTo }) =>
        authClient.signIn.social({ provider: "google", callbackURL: redirectTo }),
    },
  ]}
  onResendVerification={(email) =>
    authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" })
  }
/>
```

### Sign-up

`SignUpPage` provides the shared email/password registration surface. It uses
`useSignUp()` from `@voyant-travel/auth-react`, renders without a card wrapper, and
leaves redirects and post-sign-up behavior to the host app.

```tsx
import { SignUpPage } from "@voyant-travel/auth-react/ui"

<SignUpPage
  redirectTo="/"
  signInHref="/sign-in"
  onSignedUp={({ email }) => navigate({ to: "/verify-email", search: { email } })}
/>
```

Apps that accept typed invitation tokens must route email registration through
their invitation redemption endpoint. Pass `onEmailSignUp` when an
`invitationToken` is provided or collected from the form:

```tsx
<SignUpPage
  invitationToken={search.invitationToken}
  signInHref="/sign-in"
  onEmailSignUp={async ({ name, password, invitationToken }) => {
    if (!invitationToken) throw new Error("Invitation token is required.")

    const response = await fetch(`/v1/public/invitations/${invitationToken}/redeem`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    })

    if (!response.ok) throw new Error("Could not accept invitation.")
    return response.json()
  }}
/>
```

Social providers stay app-owned because OAuth setup and routing differ by app:

```tsx
<SignUpPage
  socialProviders={[
    {
      id: "google",
      label: "Continue with Google",
      onSignUp: ({ redirectTo }) =>
        authClient.signIn.social({ provider: "google", callbackURL: redirectTo }),
    },
  ]}
/>
```

### Onboarding

`OnboardingPage` provides the shared first-run profile completion surface. It is
card-less and router-agnostic: apps own the surrounding auth layout and decide
where to navigate after `onCompleted`.

```tsx
import { OnboardingPage } from "@voyant-travel/auth-react/ui"

<OnboardingPage
  initialProfile={user}
  onCompleted={() => navigate({ to: "/" })}
  slots={{
    afterFields: <WorkspaceInvitePicker />,
  }}
/>
```

The page submits first name, last name, and optional locale/timezone fields via
`useUpdateAccountProfile()`. Pass `showLocale={false}` or
`showTimezone={false}` if the mounted app API does not support those fields.

### Invitation Acceptance

`AcceptInvitationPage` provides a card-less, router-agnostic organization
invitation flow. Pass a token when the route already parsed one, or omit it to
render a token input. Signed-out and new-user flows stay app-owned through
callbacks or links so apps can wire their own sign-in and sign-up routes.

```tsx
import { AcceptInvitationPage } from "@voyant-travel/auth-react/ui"

<AcceptInvitationPage
  token={search.id}
  isAuthenticated={Boolean(user)}
  signInHref={`/sign-in?next=${encodeURIComponent(location.href)}`}
  signUpHref={`/sign-up?next=${encodeURIComponent(location.href)}`}
  continueHref="/"
  onAccepted={({ token }) => console.log("accepted", token)}
/>
```

For apps that handle navigation imperatively, use the handoff callbacks instead
of hrefs:

```tsx
<AcceptInvitationPage
  defaultToken={search.id}
  isAuthenticated={false}
  onSignIn={({ token }) => navigate({ to: "/sign-in", search: { invitation: token } })}
  onSignUp={({ token }) => navigate({ to: "/sign-up", search: { invitation: token } })}
/>
```

### Password Reset

`ForgotPasswordPage` and `ResetPasswordPage` provide the shared password reset
surfaces. They are card-less and router-agnostic like `SignInPage`: pass hrefs
for plain anchors, callbacks for router navigation, and message overrides for
app copy.

```tsx
import { ForgotPasswordPage, ResetPasswordPage } from "@voyant-travel/auth-react/ui"

<ForgotPasswordPage
  redirectTo="https://operator.example/reset-password"
  signInHref="/sign-in"
  onNavigateToSignIn={() => navigate({ to: "/sign-in" })}
/>

<ResetPasswordPage
  token={tokenFromRouteOrSearch}
  signInHref="/sign-in"
  forgotPasswordHref="/forgot-password"
  onPasswordReset={() => navigate({ to: "/sign-in" })}
/>
```

Apps own token extraction from the route or query string and pass it through the
`token` prop. `redirectTo` is forwarded to Better Auth's password-reset request
endpoint so emailed links can return to the app reset route.

### Email verification

`VerifyEmailPage` provides the shared card-less email verification surface. It
uses `useVerifyEmail()` from `@voyant-travel/auth-react` and supports both Better
Auth token verification links and the email OTP flow mounted by the templates.
The page is router-agnostic: pass hrefs for plain links, callbacks for app-owned
navigation, and `onResendVerification` when the app wires the email OTP client.

```tsx
import { VerifyEmailPage } from "@voyant-travel/auth-react/ui"

<VerifyEmailPage
  email={search.email}
  signInHref="/sign-in"
  onCompleted={() => navigate({ to: "/" })}
  onResendVerification={(email) =>
    authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" })
  }
/>
```

Token links can pass the token directly. By default the page submits supplied
tokens on mount.

```tsx
<VerifyEmailPage token={search.token} onCompleted={() => navigate({ to: "/" })} />
```
# Customer business accounts

The selected `createSelectedCustomerBusinessAccountsAdminExtension` contributes
the provider-neutral `/business-accounts` operator page. It loads capabilities
before request data, supports approve/reject actions, and provisions access for
an existing customer by normalized email using either a new business profile or
an existing CRM organization. This surface manages public surface customer
accounts; it does not reuse staff organization UI or expose an identity-provider
choice.
