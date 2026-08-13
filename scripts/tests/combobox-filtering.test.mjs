import assert from "node:assert/strict"
import { test } from "node:test"

import {
  comboboxOpeningTags,
  findViolations,
} from "../checks/combobox-filtering/combobox-filtering.mjs"

const BROKEN = `
  <Combobox
    items={items.map((item) => item.id)}
    itemToStringValue={(id) => itemMap.get(id as string)?.name ?? ""}
  >
    <ComboboxInput placeholder="Product" />
  </Combobox>
`

test("reports a combobox that stringifies for submission but not for display", () => {
  const violations = findViolations(BROKEN)
  assert.equal(violations.length, 1)
  assert.equal(violations[0].line, 2)
})

test("accepts a combobox that also stringifies for display", () => {
  const fixed = BROKEN.replace(
    "itemToStringValue=",
    'itemToStringLabel={(id) => itemMap.get(id as string)?.name ?? ""}\n    itemToStringValue=',
  )
  assert.deepEqual(findViolations(fixed), [])
})

test("accepts a combobox that has taken filtering over itself", () => {
  // `filter={null}` and a custom `filter` both mean base-ui never matches the
  // query against a label, so the label function is not what makes the list
  // correct. packages/ui/src/components/currency-combobox.tsx does exactly this.
  for (const optOut of ["filter={null}", "filter={(id, query) => matches(id, query)}"]) {
    const source = BROKEN.replace("itemToStringValue=", `${optOut}\n    itemToStringValue=`)
    assert.deepEqual(findViolations(source), [], optOut)
  }
  const external = BROKEN.replace(
    "itemToStringValue=",
    "filteredItems={itemKeys}\n    itemToStringValue=",
  )
  assert.deepEqual(findViolations(external), [])
})

test("ignores a combobox that stringifies neither way", () => {
  // Items shaped `{ value, label }` are read by base-ui without either prop.
  // Reporting those would be a false positive, so the rule is conditional on
  // `itemToStringValue` being present.
  assert.deepEqual(findViolations("<Combobox items={options}>\n</Combobox>"), [])
})

test("judges each combobox in a file separately", () => {
  // The failure a whole-file substring search waves through: one combobox
  // correct, its neighbour not.
  const source = `${BROKEN.replace(
    "itemToStringValue=",
    "itemToStringLabel={(id) => labels[id]}\n    itemToStringValue=",
  )}\n${BROKEN}`
  assert.equal(findViolations(source).length, 1)
})

test("does not confuse ComboboxInput and friends for the root", () => {
  const source = `
    <ComboboxInput itemToStringValue={(id) => id} />
    <ComboboxCollection itemToStringValue={(id) => id} />
  `
  assert.deepEqual(comboboxOpeningTags(source), [])
  assert.deepEqual(findViolations(source), [])
})

test("a `>` inside a prop expression does not end the opening tag", () => {
  // Arrow bodies and rendered elements both put `>` inside braces. Ending the
  // tag there would truncate the props and report a combobox that is fine.
  const source = `
    <Combobox
      items={items}
      render={<div className="x" />}
      itemToStringLabel={(id) => (id as string) > "" ? labels[id] : ""}
      itemToStringValue={(id) => labels[id]}
    >
    </Combobox>
  `
  assert.equal(comboboxOpeningTags(source).length, 1)
  assert.deepEqual(findViolations(source), [])
})

test("a `>` inside a string literal does not end the opening tag", () => {
  const source = `
    <Combobox
      items={items}
      placeholder="a > b"
      itemToStringValue={(id) => labels[id]}
    >
    </Combobox>
  `
  assert.equal(comboboxOpeningTags(source).length, 1)
  assert.equal(findViolations(source).length, 1)
})
