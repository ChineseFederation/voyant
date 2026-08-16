# Public API Keys: The PK/SK Capability Line

A public surface presents one of two access keys, and **which one it is decides
which routes it can reach**. That line is enforced by one middleware and
published on every operation as `x-voyant-key-kind`.

Read this before adding a `/v1/public/*` route. A route that does not declare a
posture is secret-key-only, which means a browser cannot call it.

## The two keys

| | `vpk_` — publishable | `vsk_` — secret |
|---|---|---|
| Where it lives | a browser bundle, a native app, a static host | a server you control |
| Assume it is | **public** | a credential |
| Origin binding | required | not required |
| Reaches | only routes declared `publishable` | `/v1/public/*` **and** `/v1/admin/*` |
| Scoped | no — bounded by this capability line | yes — an access-catalog grant |

A third prefix, `vy_`, is the platform control plane. It is not a public surface key
and never merges into either of these.

## "Public API" does not mean "safe to expose"

`/v1/public/*` names the *audience* — customers, partners, suppliers — not the
trust level. Committing a booking, opening a payment session and reading a
customer's documents all live there.

Before this line existed, `vpk_`/`vsk_` appeared at issuance, in storage, in
prefix classification and on an admin label, and **nothing branched on them for
authorization**. No route required a secret key and none was denied to a
publishable one, so a leaked `vpk_` could commit bookings and open payment
sessions ([#4625](https://github.com/voyant-travel/voyant/issues/4625)).

## Origin binding is a browser control, not the boundary

An allowed-origins list stops *another website* from using your publishable key
inside a victim's browser. That is all it does.

- Any non-browser client sets `Origin` to whatever it likes.
- Origins are operator-declared with no proof of ownership.

So origin binding is a useful browser control and **not** a security boundary.
Never reason about a publishable key as if the origin list contained it.

This is also why the two kinds are treated differently:

- **PK requires an origin.** It is the only thing narrowing where a
  browser-resident credential may be used.
- **SK does not.** Requiring one meant a genuine server-to-server caller could
  not use the API at all — `vsk_` worked only from a BFF forwarding a synthetic
  `x-voyant-public surface-origin` header.
- An origin that *is* presented is always checked, whichever kind sent it. Only
  the requirement differs, never the check.
- Dynamic CORS applies to the PK path only. A secret key is server-only and
  server-to-server callers are not subject to CORS, so echoing an origin for one
  would only ever help a browser that has a `vsk_` in it.

## What PK is allowed to do

PK is deliberately **not** read-only. Making it read-only would force every
custom frontend to run a server and drop static hosts out of the story.

A publishable key may:

- read catalog and content;
- open, quote, hold and commit a **Booking Session**.

It may do the second because the key is never the authority. A Booking Session
carries its own client-minted capability (hashed at rest, compared in constant
time), a set of capability scopes, the public surface it was opened from, a
`revision` and an idempotency key. Those hold with nothing but a `vpk_` present,
and they are what a session action is actually authorized against.

A publishable key may **not**:

- read another customer's booking — every booking-scoped leg is gated by a
  signed guest-access or checkout capability plus a public surface-origin match;
- capture a lead unchallenged — see *Unchallenged intake* below;
- read across customers;
- reach `/v1/admin/*` at all.

## Declaring a route's posture

Declare it on the API bundle in the package manifest, next to `anonymous`:

```ts
{
  id: "@voyant-travel/public-api#api.public",
  surface: "public",
  mount: "/",
  anonymous: ["/departures", "/leads"],
  publishable: ["/departures", "/offers"],
  guardedIntake: ["/leads"],
}
```

`true` opens the whole mount; a string array opens mount-relative sub-paths.

**`anonymous` and `publishable` answer different questions and neither implies
the other.**

| | `anonymous` | `publishable` |
|---|---|---|
| asks | does this need a customer session? | may a credential that ships in a browser bundle call this? |
| catalog read | yes | yes |
| commit a booking session | no | yes |
| an operator-wide export | no | no |

**Silence is a denial.** A bundle that declares neither is secret-key-only. That
is the fail-closed default: "nobody classified this route" must not read as
"safe to expose". `verify:openapi-key-kind` turns that silence into a reviewable
decision — a deliberately secret-only public bundle has to be named in
`scripts/checks/openapi/secret-only-public-bundles.json` with a reason.

## Unchallenged intake

Some public routes capture a person with nothing challenging the submitter: a
lead form, a newsletter sign-up, a booking inquiry. They are declared
`guardedIntake` rather than `publishable`, because the answer depends on a
deployment fact rather than on the route.

A publishable key reaches them **only** when the deployment guards public
intake — with a CAPTCHA, a proof-of-work, whatever it chose. Without one they
are secret-key-only. Two signals count, either of which unlocks them:

- `publicIntakeGuarded: true` on the app config, for a deployment that guards
  intake ahead of the API;
- a module reporting `publicIntakeGuarded` because it was handed a working
  guard — `createPublicApiModule({ intake: { guard } })` sets it. Wiring the
  guard IS the unlock, so there is no second flag to forget and no way to claim
  the deployment guards intake while nothing does.

The framework supplies the seam and the fail-closed default; what fills it is
the deployment's business.

## Where it is enforced

- `requireKeyCapability` (`@voyant-travel/hono`) is the only place the decision
  is made. It runs after `requireAuth`, so it can read the credential class that
  actually admitted the request.
- A **keyless** request on `/v1/public/*` is held to the same allow-list as a
  `vpk_`. The public surface behind a public request is resolved by key *or* by
  origin, so a caller who simply omits the key still gets a public surface channel —
  checking only key-bearing requests would make the whole line removable by
  deleting a header.
- The deployment's own server credentials (`INTERNAL_API_KEY`, a `voy_` key) are
  a different credential class and pass through.
- Classification is by prefix and happens before authentication. It is a
  **ceiling**, not a grant: a garbage token starting with `vsk_` gains nothing
  by being classified as a secret, because it still has to authenticate.

### The shared response cache sits in front of it

`publicResponseCache` is mounted deliberately early — a hit skips module
instantiation, auth and the db client entirely — so a cached response is served
without consulting this line.

That window is empty by construction and must stay that way: only a response a
route explicitly marks `Cache-Control: public, s-maxage=…` is ever stored, which
is a claim that the body is identical for every caller. Every route group in
[`public-route-cache-policy.md`](./public-route-cache-policy.md) is `publishable`
today.

**If you add a route group to the cache policy, it must be publishable.** A
secret-only route that marks itself shared-cacheable is already a bug — the
cache would serve it to anyone — and it would additionally bypass this line.

## Scopes on a secret key

Because a `vsk_` now covers `/v1/admin/*` as well, it carries a grant in the
deployment's own access-catalog vocabulary — the same `{ resource: [action] }`
shape `apikey.permissions` uses, so one scope picker and one permission check
serve both credential kinds.

- Minting a secret key with no explicit grant gets a commerce-shaped default:
  read/write on `bookings`, `finance` and `public surface`, read on `products`,
  `markets` and `legal`. Nothing operator-facing.
- `{"*": ["*"]}` is an explicit opt-in and is called out in the admin surface,
  because a `*` key that also reaches `/v1/admin/*` is the deployment admin key
  by another name.
- Rotation replaces the token, never the grant.
- A key minted before scopes existed stores `null` and is read as the
  commerce-shaped default on admin — a new capability starting narrow, not the
  unrestricted grant.
- Publishable keys carry no scopes. They are bounded by this capability line,
  and a scope set on one would imply it could be widened.

## The deployment admin key is deprecated

A `voy_` deployment API key on `/v1/admin/*` does the same job a secret key now
does, without a capability line or a public surface behind it. It still works — a
self-host deployment consumes these packages from npm and cannot be migrated on
its behalf — but it logs a deprecation on use, and a deployment that has
finished migrating closes the window with:

```
VOYANT_DEPLOYMENT_API_KEY_MODE=disabled
```

Closing the window stops minting as well as authenticating — leaving minting
open would hand operators keys that no longer work.

Admin **sessions** are unaffected, as are `voy_` keys with a customer, partner
or supplier audience.

## Published contract

Every operation in every package OpenAPI document carries
`x-voyant-key-kind: publishable | secret`, derived from the same declaration the
middleware enforces, so a document can never promise a reach the deployment
refuses. Regenerate with `pnpm generate:openapi-key-kind`;
`verify:openapi-key-kind` holds the line.
