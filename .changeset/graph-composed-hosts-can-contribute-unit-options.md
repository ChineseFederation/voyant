---
"@voyant-travel/graph-contracts": minor
---

Let a composing deployment contribute per-unit runtime options.

A runtime factory could read everything the graph declared and nothing the host
knew. That was fine while every option-bearing composition site was called by a
host that constructed modules itself, and wrong for the deployment shape the
image standardised on: a graph-composed host had no channel into a unit's
options at all. The monthly booking allowance is the case that surfaced it — a
managed tenant whose plan changed mid-process kept the boot-time allowance,
silently, in the direction that costs money.

`VoyantGraphRuntimeFactoryContext` gains `hostOptions`: the slice of options the
deployment supplied for this unit, keyed by stable graph unit id one layer up.
It is empty when the deployment supplied nothing, so a factory can spread it
unconditionally, and it is merged into the default factory invocation rather
than replacing it — a host contributing one option keeps every other default
and stays on the default path as the package evolves.

Ports remain the seam for behaviour a package declares it needs from elsewhere
in the graph; they are declared, typed, conformance-tested, and visible to
`verify:graph-conformance`. Host options are none of those things and exist for
what the graph cannot supply at all, because it is a property of the
deployment's own runtime state. See `docs/architecture/graph-host-options.md`.

`hostOptions` is required rather than optional on the context, since composition
always supplies it and a factory should be able to read a field off it without
guarding. That is breaking only for code constructing the context itself, which
in this repository is exclusively test fixtures.
