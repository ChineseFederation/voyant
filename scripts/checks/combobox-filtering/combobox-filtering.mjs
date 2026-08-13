/**
 * Comboboxes that tell base-ui how to stringify an item for submission but not
 * for display.
 *
 * base-ui filters the list by matching the typed query against the item's
 * **label** string, resolved through `itemToStringLabel`. With no
 * `itemToStringLabel` it stringifies the item itself — and every combobox here
 * passes record ids as items. So typing a record's name matched `prod_01k…`,
 * filtered every option out, and the picker reported "No results." for a record
 * its list query had just returned (voyant#4610). Twenty-seven call sites were
 * in that state; three separate issues were filed against the symptom before
 * the shared cause was found.
 *
 * The rule is conditional rather than absolute: passing `itemToStringValue` is
 * the declaration that items are NOT self-describing `{ value, label }` objects
 * base-ui can read on its own. Having said that, a combobox must also say how
 * the item reads — or take filtering over itself, which `filter` and
 * `filteredItems` both do.
 *
 * This one is imperative rather than a rule file because it pins a **call
 * shape**: which props appear together on one JSX element. Nothing about it is
 * expressible as a path, a symbol, or a graph fact.
 */

/** Props that hand filtering to the caller, making the label irrelevant. */
const FILTERING_OPT_OUTS = ["filter=", "filteredItems="]

/**
 * The opening tags of every `<Combobox>` element in `source`.
 *
 * Deliberately not a whole-file substring search: a file may hold two
 * comboboxes and satisfy the rule with only one of them, which is exactly the
 * drift a file-level check would wave through. Brace depth is tracked so a `>`
 * inside a prop expression (`render={<Foo />}`, an arrow body) does not end the
 * tag early.
 */
export function comboboxOpeningTags(source) {
  const tags = []
  const opener = /<Combobox(?=[\s>])/g
  let match = opener.exec(source)

  while (match) {
    const start = match.index
    let depth = 0
    let quote = null
    let end = -1

    for (let index = start; index < source.length; index += 1) {
      const character = source[index]

      if (quote) {
        if (character === "\\") index += 1
        else if (character === quote) quote = null
        continue
      }

      if (character === '"' || character === "'" || character === "`") {
        quote = character
      } else if (character === "{") {
        depth += 1
      } else if (character === "}") {
        depth -= 1
      } else if (character === ">" && depth === 0) {
        end = index
        break
      }
    }

    if (end === -1) break
    tags.push({ start, text: source.slice(start, end + 1) })
    opener.lastIndex = end + 1
    match = opener.exec(source)
  }

  return tags
}

/** 1-indexed line of `offset` in `source`. */
function lineOf(source, offset) {
  let line = 1
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === "\n") line += 1
  }
  return line
}

/**
 * Every `<Combobox>` in `source` that stringifies for submission, does not
 * stringify for display, and has not taken filtering over itself.
 */
export function findViolations(source) {
  const violations = []

  for (const tag of comboboxOpeningTags(source)) {
    if (!tag.text.includes("itemToStringValue")) continue
    if (tag.text.includes("itemToStringLabel")) continue
    if (FILTERING_OPT_OUTS.some((prop) => tag.text.includes(prop))) continue
    violations.push({ line: lineOf(source, tag.start) })
  }

  return violations
}
