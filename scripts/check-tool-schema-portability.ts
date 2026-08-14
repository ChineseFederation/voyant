/**
 * Fail the build when a Tool advertises a JSON Schema a strict-schema LLM
 * client cannot parse. See `scripts/lib/tool-schema-portability.mjs` for why
 * one such `pattern` breaks every turn of a conversation, not just the ones
 * that reach the offending Tool (voyant#4598).
 *
 * This drives the real serialization path rather than re-deriving it:
 * `createRegisteredTool` is the function that produces `manifest.inputSchema`,
 * the exact document a transport hands a client. Calling `z.toJSONSchema` here
 * with hand-picked options would prove something about this file's arguments
 * and nothing about what ships — the `io: "input"` direction alone changes the
 * emitted document (see `registered-tool.ts`).
 *
 * Runs under `tsx` for the same reason the other Tool checkers do: package
 * `exports` point at `src/*.ts`.
 */
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { collectGraphToolDefinitions } from "./lib/graph-tool-definitions.mjs"
import {
  findUnsupportedPatterns,
  formatPortabilityDiagnostics,
} from "./lib/tool-schema-portability.mjs"

type RegisteredToolFactory = (
  tool: unknown,
  binding: Record<string, unknown>,
) => { manifest: { inputSchema: unknown; outputSchema: unknown } }

void main()

async function main() {
  const rootArg = process.argv.indexOf("--root")
  const repoRoot =
    rootArg >= 0
      ? path.resolve(process.argv[rootArg + 1] ?? "")
      : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

  const createRegisteredTool = await loadRegisteredToolFactory(repoRoot)
  const tools = await collectGraphToolDefinitions(repoRoot)

  const offenders: {
    packageName: string
    toolName: string
    findings: { path: string; pattern: string }[]
  }[] = []

  for (const { packageName, toolName, definition } of tools) {
    // The binding a graph host would supply carries no schema influence, so an
    // empty one serializes the same document. `createRegisteredTool` fills
    // capabilityId/owner from the definition or falls back.
    const { manifest } = createRegisteredTool(definition, {})
    const findings = findUnsupportedPatterns(manifest.inputSchema)
    if (findings.length > 0) offenders.push({ packageName, toolName, findings })
  }

  if (offenders.length > 0) {
    console.error("Tool schema portability failed:\n")
    for (const diagnostic of formatPortabilityDiagnostics(offenders)) {
      console.error(`- ${diagnostic}`)
    }
    console.error(
      "\nA strict-schema client rejects the WHOLE tools payload on one of these, so every " +
        "turn fails, not only calls to the named Tool. Replace `z.email()` / a lookaround " +
        "`.regex()` in the input schema with a plain `z.string()` and keep the check in the " +
        "handler and the admin API, where enforcement already lives.",
    )
    process.exitCode = 1
    return
  }

  console.log(`Tool schema portability: OK (${tools.length} Tool input schemas, no lookaround)`)
}

/**
 * Import the factory from `packages/tools` sources by absolute path. The
 * workspace root does not depend on `@voyant-travel/tools` (or on `zod`), and
 * deliberately should not — the checker borrows the same module the runtime
 * loads instead of pulling a second copy into the root manifest.
 */
async function loadRegisteredToolFactory(repoRoot: string): Promise<RegisteredToolFactory> {
  const source = path.join(repoRoot, "packages/tools/src/registered-tool.ts")
  const module = (await import(pathToFileURL(source).href)) as Record<string, unknown>
  const factory = module.createRegisteredTool
  if (typeof factory !== "function") {
    throw new Error(`${source} does not export createRegisteredTool`)
  }
  return factory as RegisteredToolFactory
}
