# Monthly Booking Allowance

A deployment may cap how many bookings it accepts per calendar month. The cap
is opt-in: with nothing configured, bookings are unlimited, which is what a
self-hosted deployment gets.

`assertMonthlyBookingLimitAvailable` in `@voyant-travel/bookings` is the single
enforcement and validation authority. Callers invoke it inside the transaction
that accepts a booking; it takes a transaction-scoped advisory lock so
concurrent acceptances observe one another, and it is the only place a
malformed allowance is rejected.

## Two sources for the allowance

**Configured.** `VOYANT_BOOKINGS_MONTHLY_LIMIT` is read from bindings when a
route runtime is composed. For a self-hosted deployment this is the whole
story — the cap is a property of the container.

**Live.** A composed API graph is built once per process and reused for the
process lifetime, so a configured allowance is a boot-time constant. That is
wrong for a managed host serving a tenant whose plan entitlement can change
while the process runs — an upgrade, a downgrade, a trial expiring. There the
allowance is a property of the request's subscription state, so the host
supplies a `MonthlyBookingLimitResolver` and the runtime consults it on every
read.

A resolver returns:

| return | meaning |
|---|---|
| a `number` | that allowance applies right now |
| `null` | unlimited right now, overriding whatever was configured |
| `undefined` | no live answer; fall back to the configured value |

A host typically reads an `AsyncLocalStorage` it populates per request. The
resolver is not validated where it is read — a malformed live answer fails at
enforcement rather than silently capping a tenant at the wrong number.

## Where a host installs a resolver

Three composition sites accept a `resolveMonthlyBookingLimit` option, because
three paths accept bookings and all three consume the same quota. A host that
wires only some of them serves one cap from one path and another cap from the
next.

| package | option on |
|---|---|
| `@voyant-travel/bookings` | `buildBookingRouteRuntime` / `createBookingsApiModule` |
| `@voyant-travel/finance` | `buildFinanceRouteRuntime` / `createFinanceApiModule` |
| `@voyant-travel/commerce` | `createCheckoutFinalizeSubscriberRuntime` |

Omit the option and behaviour is identical to a configured-only deployment.

### A host that constructs modules itself

Pass the option directly to the composition site.

### A host that composes a graph

A graph-composed host — the operator image, and so every managed deployment —
never calls those constructors. It supplies the option per unit and the
selected factory merges it into the module options it was going to build
anyway:

```ts
await loadVoyantNodeRuntime({
  graphRuntime,
  hostOptions: {
    "@voyant-travel/bookings": { resolveMonthlyBookingLimit },
    "@voyant-travel/finance": { resolveMonthlyBookingLimit },
    "@voyant-travel/commerce#catalog-checkout-extension": { resolveMonthlyBookingLimit },
  },
})
```

Keys are stable graph unit ids. Options for a unit the selected graph does not
contain are ignored, so one host can compose several profiles from one map.
See [host options](./graph-host-options.md) for the general seam.

## Reading `monthlyBookingLimit`

Where a resolver is installed, `runtime.monthlyBookingLimit` is an accessor.
Read it per use. Copying it into a local, or spreading the runtime object,
re-freezes exactly what the seam exists to keep live.
