# Deployment Host Options

A composed graph is assembled once per process from what the graph declares.
Most of what a package needs is declared: schemas, config keys, and — for
behaviour it needs from elsewhere in the deployment — runtime ports.

Host options carry the remainder. They are values the composing deployment
knows and the graph cannot: something that is a property of the request rather
than of the container the process booted with. The canonical case is a managed
host serving a tenant whose plan entitlement changes while the process runs.

## The seam

`loadVoyantNodeRuntime` accepts `hostOptions`, keyed by stable graph unit id,
and forwards it to `composeVoyantGraphRuntime`. Each unit's slice arrives on
its factory context:

```ts
export const createBookingsVoyantRuntime = defineGraphRuntimeFactory(
  async ({ getPort, hostOptions }) => {
    const finance = await getPort(bookingsFinanceRuntimePort)
    return createBookingsApiModule({
      ...provider.options,
      amendmentFinance: finance,
      ...(hostOptions as Partial<BookingsApiModuleOptions>),
    })
  },
)
```

Options are **merged into** the default factory invocation, not a replacement
for it. A host contributing one option keeps every other default and stays on
the default path as the package evolves. Apply them last: the deployment
composes the graph and is the authority over what it composed.

A unit whose runtime export is a plain option-bearing factory rather than a
`defineGraphRuntimeFactory` receives the slice as its argument, so both unit
shapes are reachable.

`hostOptions` is `{}` when the deployment supplied nothing, so a factory can
spread it unconditionally.

## Ports or host options

| | runtime port | host options |
|---|---|---|
| declared by | the consuming package, in its manifest | nobody — the host supplies it |
| validated | side-effect-free `test`; optional behavioral `verify` in provider CI/release verification | not validated |
| visible to | `verify:graph-conformance`, graph resolution | composition only |
| for | behaviour one graph unit needs from another | knowledge only the host has |

**Reach for a port first.** A port is declared, typed, conformance-tested, and
the graph can tell you when nothing provides it. Host options are none of those
things, and a package that grows a permanent dependency on one has an
undeclared requirement.

Host options are right when the value cannot come from the graph at all,
because it is a property of the deployment's own runtime state. Adding a port
for a live plan entitlement would mean declaring that every deployment has a
subscription service, which self-hosted ones do not.

## Failure modes

Options addressed to a unit the selected graph does not contain are **ignored**.
This matches `bindings` and lets one host compose several profiles from one
option map.

Options addressed to a unit whose runtime export is not callable **fail
composition**. Such a unit can receive neither a factory context nor an
argument, so the options would be dropped in silence — the host believing it
installed something that is not there.

Neither guard can tell you that a factory received host options and ignored
them. A package that accepts host options should merge the whole slice rather
than pick fields out of it.

## Host options or a binding

`bindings` is the older and wider seam: a binding **replaces** the default
invocation for its unit, so the host takes ownership of composing that unit
correctly and stops tracking changes to the default path. It suits a
deployment-local unit the host wrote.

Prefer `hostOptions` to contribute options to a unit the host did not write.

A binding receives `factoryContext` alongside the raw runtime exports. A unit
whose export is a `defineGraphRuntimeFactory` resolves its ports through that
context and cannot be invoked without it, so pass it straight through when
re-invoking such an export.
