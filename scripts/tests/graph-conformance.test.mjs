import assert from "node:assert/strict"
import test from "node:test"

import { checkActionIdConvention, checkGraphConformance } from "../checks/graph/conformance.ts"

/**
 * These assert the replacement is at least as strict as the substring pins it
 * removed from check-flights-runtime-authority. Everything is checked against a
 * synthetic graph: the query surface is pure, so no resolution happens here and
 * the cases stay fast and hermetic.
 */
const conformantGraph = {
  modules: [
    {
      id: "@voyant-travel/flights",
      packageName: "@voyant-travel/flights",
      requires: { capabilities: ["finance.payment-sessions"], ports: [] },
      provides: { capabilities: [], ports: [] },
      runtimePorts: [{ id: "flights.runtime" }, { id: "flights.durable-action-runtime" }],
    },
  ],
  extensions: [],
  plugins: [],
  adapters: [],
  providers: [],
  packageRecords: [
    {
      packageName: "@voyant-travel/flights",
      metadata: {
        requiresSchemas: ["@voyant-travel/db", "@voyant-travel/finance"],
        runtime: { export: "createFlightsRuntimePortContribution" },
      },
    },
  ],
}

const spec = {
  "@voyant-travel/flights": {
    requiresSchemas: ["@voyant-travel/finance"],
    requiredCapabilities: ["finance.payment-sessions"],
    portIds: ["flights.runtime", "flights.durable-action-runtime"],
    runtimeExport: "createFlightsRuntimePortContribution",
  },
}

const clone = (value) => JSON.parse(JSON.stringify(value))

test("a conformant graph produces no violations", () => {
  assert.deepEqual(checkGraphConformance(conformantGraph, spec), [])
})

test("a dropped capability is caught", () => {
  const graph = clone(conformantGraph)
  graph.modules[0].requires.capabilities = []
  assert.match(
    checkGraphConformance(graph, spec)[0],
    /must require capability "finance.payment-sessions"/,
  )
})

test("a dropped runtime port is caught", () => {
  const graph = clone(conformantGraph)
  graph.modules[0].runtimePorts = [{ id: "flights.runtime" }]
  assert.match(
    checkGraphConformance(graph, spec)[0],
    /must declare runtime port "flights.durable-action-runtime"/,
  )
})

test("a dropped requiresSchemas entry is caught", () => {
  const graph = clone(conformantGraph)
  graph.packageRecords[0].metadata.requiresSchemas = ["@voyant-travel/db"]
  assert.match(
    checkGraphConformance(graph, spec)[0],
    /requiresSchemas entry "@voyant-travel\/finance"/,
  )
})

test("a renamed runtime contributor export is caught", () => {
  const graph = clone(conformantGraph)
  graph.packageRecords[0].metadata.runtime.export = "somethingElse"
  assert.match(
    checkGraphConformance(graph, spec)[0],
    /must be "createFlightsRuntimePortContribution", got "somethingElse"/,
  )
})

test("a package that contributes no unit at all is caught", () => {
  const graph = clone(conformantGraph)
  graph.modules = []
  assert.match(checkGraphConformance(graph, spec)[0], /contributes no selected graph unit/)
})

/**
 * The action-id convention. Both directions matter: a checker that accepted
 * everything would pass the conformant case on its own.
 */
const actionGraph = {
  modules: [
    {
      packageName: "@voyant-travel/bookings",
      actions: [
        { id: "@voyant-travel/bookings#action.cancel-booking" },
        { id: "@voyant-travel/bookings#amendments.action.accept" },
      ],
    },
  ],
  extensions: [],
  plugins: [],
  adapters: [],
  providers: [],
  packageRecords: [],
}

test("package-qualified action ids conform", () => {
  assert.deepEqual(checkActionIdConvention(actionGraph, { allow: {} }), [])
})

test("an action id that is not qualified by its own package is caught", () => {
  const graph = clone(actionGraph)
  graph.modules[0].actions[0].id = "booking.status.cancel"
  assert.match(
    checkActionIdConvention(graph, { allow: {} })[0],
    /graph action id "booking.status.cancel" must be qualified as "@voyant-travel\/bookings#…"/,
  )
})

test("an action id qualified by a different package is caught", () => {
  const graph = clone(actionGraph)
  graph.modules[0].actions[0].id = "@voyant-travel/finance#action.cancel-booking"
  assert.equal(checkActionIdConvention(graph, { allow: {} }).length, 1)
})

test("an allowlisted id is exempt", () => {
  const graph = clone(actionGraph)
  graph.modules[0].actions[0].id = "booking.status.cancel"
  assert.deepEqual(
    checkActionIdConvention(graph, { allow: { "booking.status.cancel": "reason" } }),
    [],
  )
})

test("an allowlist entry for an id nothing declares is caught", () => {
  assert.match(
    checkActionIdConvention(actionGraph, { allow: { "booking.status.cancel": "reason" } })[0],
    /no longer declared; remove the exemption/,
  )
})
