import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  adminWriteOperationsFromDocuments,
  checkAgentWriteCoverageRatchet,
  inspectAgentWriteCoverage,
  resourceKey,
} from "../lib/agent-write-coverage.mjs"

const writeTool = (name, scope = "proposals:write") => ({
  id: name,
  name,
  requiredScopes: [scope],
})
const readTool = (name, scope = "proposals:read") => ({ id: name, name, requiredScopes: [scope] })

describe("admin resource keys", () => {
  it("strips surface prefixes, path params and the module's own repeated segment", () => {
    assert.equal(resourceKey("/v1/admin/proposals/proposals"), "proposal")
    assert.equal(resourceKey("/v1/admin/proposals/proposals/{id}/products"), "proposal/product")
  })

  it("collapses trailing action verbs onto the resource they act on", () => {
    // `send` is a thing you do to a proposal version, not a resource of its own,
    // so it collapses onto the module-scoped proposal-version resource.
    assert.equal(
      resourceKey("/v1/admin/proposals/proposal-versions/{id}/send"),
      "proposal/proposal-version",
    )
    assert.equal(
      resourceKey("/v1/admin/proposals/proposal-versions/{id}/accept"),
      "proposal/proposal-version",
    )
  })
})

describe("agent write coverage", () => {
  const operations = [
    { method: "post", path: "/v1/admin/proposals/proposals" },
    { method: "post", path: "/v1/admin/proposals/proposals/{id}/products" },
  ]

  it("counts a write Tool naming the resource noun as covering it", () => {
    const { rows } = inspectAgentWriteCoverage([
      {
        packageName: "@voyant-travel/proposals",
        unitId: "@voyant-travel/proposals",
        tools: [writeTool("create_proposal"), writeTool("add_proposal_product")],
        adminWriteOperations: operations,
      },
    ])
    assert.deepEqual(
      rows.map(({ resource, posture }) => [resource, posture]),
      [
        ["proposal", "covered"],
        ["proposal/product", "covered"],
      ],
    )
  })

  it("does not let a read Tool cover a write resource", () => {
    // The whole point. `list_notification_templates` must not make
    // POST/PATCH/DELETE on templates look handled.
    const { rows } = inspectAgentWriteCoverage([
      {
        packageName: "@voyant-travel/notifications",
        unitId: "@voyant-travel/notifications",
        tools: [
          readTool("list_notification_templates", "notifications:read"),
          readTool("get_notification_template", "notifications:read"),
        ],
        adminWriteOperations: [{ method: "post", path: "/v1/admin/notifications/templates" }],
      },
    ])
    assert.deepEqual(
      rows.map(({ posture }) => posture),
      ["uncovered"],
    )
  })

  it("treats non-read scopes other than :write as write-capable", () => {
    const { rows } = inspectAgentWriteCoverage([
      {
        packageName: "@voyant-travel/notifications",
        unitId: "@voyant-travel/notifications",
        tools: [writeTool("send_notification", "notifications:send")],
        adminWriteOperations: [{ method: "post", path: "/v1/admin/notifications/notifications" }],
      },
    ])
    assert.equal(rows[0].posture, "covered")
  })

  it("requires a Tool for the resource's own noun, not just its parent", () => {
    // create_proposal must not make `proposal/product` look covered, or the missing
    // line-item Tool hides behind the proposal Tool.
    const { rows } = inspectAgentWriteCoverage([
      {
        packageName: "@voyant-travel/proposals",
        unitId: "@voyant-travel/proposals",
        tools: [writeTool("create_proposal")],
        adminWriteOperations: operations,
      },
    ])
    assert.deepEqual(
      rows.map(({ resource, posture }) => [resource, posture]),
      [
        ["proposal", "covered"],
        ["proposal/product", "uncovered"],
      ],
    )
  })

  it("rejects an allowlist entry that is stale or unexplained", () => {
    const modules = [
      {
        packageName: "@voyant-travel/proposals",
        unitId: "@voyant-travel/proposals",
        tools: [writeTool("create_proposal")],
        adminWriteOperations: [{ method: "post", path: "/v1/admin/proposals/proposals" }],
      },
    ]
    const covered = inspectAgentWriteCoverage(modules, {
      allowlist: new Map([["@voyant-travel/proposals:proposal", { rationale: "n/a" }]]),
    })
    assert.match(covered.diagnostics[0], /drop the allowlist entry/)

    const unmatched = inspectAgentWriteCoverage(modules, {
      allowlist: new Map([["@voyant-travel/proposals:nope", { rationale: "n/a" }]]),
    })
    assert.match(unmatched.diagnostics[0], /matches no admin write resource/)
  })
})

describe("uncovered ratchet", () => {
  const rows = [
    { unitId: "@voyant-travel/proposals", resource: "proposal/media", posture: "uncovered" },
    { unitId: "@voyant-travel/proposals", resource: "proposal/participant", posture: "uncovered" },
    { unitId: "@voyant-travel/proposals", resource: "proposal", posture: "covered" },
  ]

  it("passes at the baseline", () => {
    assert.deepEqual(checkAgentWriteCoverageRatchet(rows, { "@voyant-travel/proposals": 2 }), [])
  })

  it("fails when a new admin write resource has no Tool", () => {
    const diagnostics = checkAgentWriteCoverageRatchet(rows, { "@voyant-travel/proposals": 1 })
    assert.equal(diagnostics.length, 1)
    assert.match(diagnostics[0], /above the baseline of 1/)
    assert.match(diagnostics[0], /proposal\/media, proposal\/participant/)
  })

  it("fails when a gap was closed without lowering the baseline", () => {
    const diagnostics = checkAgentWriteCoverageRatchet(rows, { "@voyant-travel/proposals": 5 })
    assert.equal(diagnostics.length, 1)
    assert.match(diagnostics[0], /lower the baseline to 2/)
  })

  it("fails a module that has gaps but no baseline at all", () => {
    const diagnostics = checkAgentWriteCoverageRatchet(rows, {})
    assert.match(diagnostics[0], /has no baseline/)
  })
})

describe("openapi extraction", () => {
  it("takes write methods only", () => {
    const operations = adminWriteOperationsFromDocuments([
      {
        paths: {
          "/v1/admin/proposals/proposals": { get: {}, post: {}, patch: {} },
          "/v1/admin/proposals/proposals/{id}": { delete: {} },
        },
      },
    ])
    assert.deepEqual(operations.map(({ method }) => method).sort(), ["delete", "patch", "post"])
  })
})
