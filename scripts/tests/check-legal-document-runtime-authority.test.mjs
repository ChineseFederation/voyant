import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { it } from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const checker = path.resolve(
  fileURLToPath(import.meta.url),
  "../../check-legal-document-runtime-authority.mjs",
)

async function fixture(overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "voyant-legal-document-runtime-"))
  const files = {
    "packages/runtime/src/deployment-resources.ts": "generic primitives",
    "packages/legal/package.json": JSON.stringify({
      exports: {
        "./runtime-contributor": "./src/runtime-contributor.ts",
      },
      voyant: {
        kind: "module",
        runtime: { export: "createLegalRuntimePortContribution" },
      },
      dependencies: {
        "@voyant-travel/bookings": "workspace:^",
      },
    }),
    "packages/legal/src/runtime-contributor.ts":
      "createLegalRuntime legalRuntimePort.id legalContractDocumentRuntimePort.id createLegalDocumentArtifactGraphProvider legalContractDocumentJobRuntimePort.id",
    "packages/legal/src/runtime.ts": "createContractDocumentRoutesOptions resolveStorage",
    "packages/legal/src/document-artifact-runtime.ts":
      "createStandardLegalDocumentArtifactProvider pg_advisory_xact_lock operation.operationKey",
    "packages/legal/src/contract-document-command.ts":
      "executeAdmittedExistingTargetCommand claimActionId claimIdempotencyFingerprint claimCommandPayload",
    "packages/legal/src/contract-document-job.ts":
      "hasPort(legalDocumentArtifactProviderPort) direct selected provider",
    "packages/legal/src/mcp-runtime.ts": "executeLegalContractDocumentCommand",
    "packages/legal/src/voyant.ts":
      'generate_booking_contract_document regenerate_booking_contract_document status: "unavailable" selectedProviderPorts legalDocumentArtifactProviderPort.id legal.contract-document-operations',
    "packages/legal/src/index.ts": "public Legal exports",
    "packages/commerce/src/runtime-port.ts": "Commerce Legal acceptance only",
    "packages/commerce/src/runtime.ts": "createCommerceRuntime",
    "packages/legal/src/contracts/routes.ts": "appendix attachments",
    "packages/operator-standard/package.json": JSON.stringify({
      dependencies: { "@voyant-travel/legal": "workspace:*" },
    }),
    "packages/operator-standard/src/index.ts": 'modules: [{ resolve: "@voyant-travel/legal" }]',
    ...overrides,
  }
  for (const [relativePath, contents] of Object.entries(files)) {
    const target = path.join(root, relativePath)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, contents)
  }
  return root
}

it("accepts package-owned Legal document composition", async () => {
  const result = await execFileAsync(process.execPath, [checker, "--root", await fixture()])
  assert.match(result.stdout, /authority: OK/)
})

it("rejects a restored deployment Legal loader", async () => {
  const root = await fixture({
    "packages/runtime/src/deployment-resources.ts": "loadLegalRuntime",
  })
  await assert.rejects(execFileAsync(process.execPath, [checker, "--root", root]), (error) =>
    error.stderr.includes("loadLegalRuntime"),
  )
})

it("rejects incorrect contributor metadata on the Legal domain package", async () => {
  const root = await fixture({
    "packages/legal/package.json": JSON.stringify({
      exports: {
        "./runtime-contributor": "./src/runtime-contributor.ts",
      },
      voyant: { runtime: { export: "createLegalRuntimePortContribution" } },
    }),
  })
  await assert.rejects(execFileAsync(process.execPath, [checker, "--root", root]), (error) =>
    error.stderr.includes("must declare its standard Node runtime contributor"),
  )
})
