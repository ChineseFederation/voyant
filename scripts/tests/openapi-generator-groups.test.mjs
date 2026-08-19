import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  CONCURRENCY,
  commandGroups,
  inParallel,
  readerCommands,
} from "../checks/openapi/generator-groups.mjs"

test("commands that share no file are independent", () => {
  const groups = commandGroups([
    { command: "a", files: ["one.json"] },
    { command: "b", files: ["two.json"] },
  ])
  assert.equal(groups.length, 2)
  assert.deepEqual(groups.map((group) => group.sort()).sort(), [["a"], ["b"]])
})

test("commands that write the same file stay in one group, so they cannot overlap", () => {
  const groups = commandGroups([
    { command: "a", files: ["shared.json"] },
    { command: "b", files: ["shared.json"] },
  ])
  assert.deepEqual(groups, [["a", "b"]])
})

// The case the union-find is for: a and c never touch the same file, but b
// bridges them, so all three have to be serialised.
test("sharing is transitive", () => {
  const groups = commandGroups([
    { command: "a", files: ["one.json"] },
    { command: "b", files: ["one.json", "two.json"] },
    { command: "c", files: ["two.json"] },
  ])
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].sort(), ["a", "b", "c"])
})

test("every writer appears in exactly one group", () => {
  const { generators } = JSON.parse(
    readFileSync(new URL("../checks/openapi/generated-specs.json", import.meta.url), "utf8"),
  )
  const groups = commandGroups(generators)
  const flat = groups.flat()
  assert.equal(flat.length, new Set(flat).size, "a command appears twice")
  const writers = generators
    .filter((generator) => !generator.reads?.length)
    .map((generator) => generator.command)
  assert.deepEqual([...new Set(flat)].sort(), [...new Set(writers)].sort())
})

// The property the whole parallelisation rests on: if two groups could write the
// same file, a concurrent probe would read back paths another generator wrote.
test("no file is written by two different groups", () => {
  const { generators } = JSON.parse(
    readFileSync(new URL("../checks/openapi/generated-specs.json", import.meta.url), "utf8"),
  )
  const groupOf = new Map()
  commandGroups(generators).forEach((group, index) => {
    for (const command of group) groupOf.set(command, index)
  })

  const owner = new Map()
  for (const { command, files } of generators) {
    for (const file of files) {
      const index = groupOf.get(command)
      const existing = owner.get(file)
      assert.ok(
        existing === undefined || existing === index,
        `${file} is written by groups ${existing} and ${index}`,
      )
      owner.set(file, index)
    }
  }
})

test("inParallel preserves input order regardless of completion order", async () => {
  const delays = [30, 1, 20, 2]
  const results = await inParallel(
    delays,
    (ms, index) => new Promise((resolve) => setTimeout(() => resolve(index), ms)),
    4,
  )
  assert.deepEqual(results, [0, 1, 2, 3])
})

test("inParallel runs no more than the limit at once", async () => {
  let live = 0
  let peak = 0
  await inParallel(
    Array.from({ length: 20 }, (_, index) => index),
    async () => {
      live += 1
      peak = Math.max(peak, live)
      await new Promise((resolve) => setTimeout(resolve, 5))
      live -= 1
    },
    3,
  )
  assert.equal(peak, 3)
})

test("concurrency is bounded, because each lane is a whole pnpm process tree", () => {
  assert.ok(CONCURRENCY >= 1 && CONCURRENCY <= 4, `unexpected concurrency ${CONCURRENCY}`)
})

// A reader must never overlap a writer of the same file: both checks work by
// writing an artifact and reading back what a generator put there, so a reader
// observing a document mid-rewrite would produce output matching nothing.
// Unioning it into the writers' group is correct but collapses everything into
// one sequential group, so readers are deferred to a second phase instead.
test("a reader is kept out of the writer groups and deferred", () => {
  const input = [
    { command: "writer", files: ["doc.json"] },
    { command: "reader", files: ["out.ts"], reads: ["doc.json"] },
  ]
  assert.deepEqual(commandGroups(input).flat(), ["writer"])
  assert.deepEqual(readerCommands(input), ["reader"])
})

test("the api-client generator is a reader, so it runs after every writer", () => {
  const { generators } = JSON.parse(
    readFileSync(new URL("../checks/openapi/generated-specs.json", import.meta.url), "utf8"),
  )
  const client = generators.find((generator) => generator.command.includes("generate:api-client"))
  assert.ok(client?.reads?.length > 50, "the client generator must declare what it reads")
  assert.deepEqual(readerCommands(generators), [client.command])
  assert.ok(
    !commandGroups(generators).flat().includes(client.command),
    "a reader must not be scheduled alongside the writers",
  )
})
