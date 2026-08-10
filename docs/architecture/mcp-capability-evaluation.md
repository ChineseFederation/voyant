# MCP Capability Evaluation

The MCP capability evaluation answers one question: can a real model complete an
operator job through the real selected deployment graph and MCP JSON-RPC transport?
It is not a substitute for deterministic package tests. It measures whether the Tool
surface is discoverable, drivable, and complete when the caller is a model.

The harness is `apps/operator/tests/mcp-capability.test.ts`. Writes are graded from
the disposable database, reads must dispatch a real data Tool, and the textual answer
is secondary evidence.

## Supported command

Run a one-attempt smoke evaluation:

```sh
pnpm eval:mcp-capability -- --mode smoke
```

Measure a Tool-surface change across five attempts:

```sh
pnpm eval:mcp-capability -- --mode measure --model gpt-5.6-terra
```

Run one independently seeded operator-job group:

```sh
pnpm eval:mcp-capability -- --mode smoke --group supplier
```

`--group` keeps each journey's fixture boundary local to that group, so an unrelated
commercial-chain failure cannot cap its result. Use `--journey <id>` for a single
independently seeded diagnostic. The two selectors are mutually exclusive.

The default `--provider codex` lane uses the locally ChatGPT-authenticated Codex CLI.
It starts a loopback-only HTTP bridge to the same selected-graph MCP transport, runs
Codex non-interactively in an empty read-only workspace, removes database and API
credentials from the child environment, and records Tool calls at the MCP boundary.
This keeps the model from bypassing the Tool surface through repository or database
access. Use `--provider openai` to exercise the direct Responses API lane; that lane
requires `OPENAI_API_KEY` or the existing `~/.config/agent-run/openai-token`.

When `TEST_DATABASE_URL` is absent the runner starts a
temporary PostgreSQL 16 Docker container on a random localhost port, migrates it,
runs the focused evaluation, and removes the container. A supplied database is
assumed disposable and is not dropped by the runner.

Migration runs with the repository's development export condition and the `tsx`
loader, matching the integration CI lane. A clean workspace therefore does not
depend on stale JavaScript beside package TypeScript sources.

The default model is `gpt-5.6-terra` at medium reasoning effort: the balanced
quality/cost tier for a multi-step operator capability evaluation. Use
`--model gpt-5.6-luna` for an explicit cost-sensitive comparison; never mix model
or provider results under one baseline. The OpenAI provider uses the Responses API
with medium reasoning and continues each Tool turn through `previous_response_id`. GPT-5.6
does not support function Tools with nonzero reasoning effort on Chat Completions;
using Responses preserves the reasoning baseline instead of silently setting it
to `none`.

Artifacts are written under `.agent-runs/mcp-capability/<timestamp>/` unless
`--artifacts` selects another directory. `report.json` records the model, run count,
per-journey pass rate, calls, error state, bounded traces, and token usage. Logs and
the final exit code are stored beside it. Each call records its serialized response
size, and `largestResponses` identifies the ten largest live results across the run.
`cleanup.json` records whether temporary-container cleanup was attempted and whether
it succeeded; a caller-provided database is explicitly recorded as not cleaned up.
Never point the runner at production data.

## Remote lane

The Mac is the control plane. Run the command on `lab1` through the approved
`agent-run` fleet when measuring a pushed branch, or through a Sprite when a safe
snapshot and the required credential/database arrangement are available. Never use
`lab2`; it is reserved for GitHub Actions CI.

The execution brief must request the exact command above, sequential execution, the
result artifact directory, and database cleanup confirmation. Remote execution and
secret injection remain owned by `../internal-dev-agent`; this repository owns the
product harness and its artifact contract.

## Reading results

The default commercial journeys are chained. Diagnose the first link below 5/5;
downstream failures are usually consequences. Operator-job groups selected with
`--group` are independently seeded and must be read as their own capability rates.
A refusal is useful only if the model-visible payload explains and enables the repair.
A model answer without a data dispatch is not a read success.
Call budgets count dispatched Tool calls, not model turns. A model may finish its
answer after the last allowed Tool call, but another attempted dispatch marks the
journey exhausted and fails a gated attempt.

Use smoke mode for wiring checks only. Claims about a write-path improvement require
five-attempt measurement evidence, because a single model-driven run cannot separate
a real fix from variance.
