import { describe, expect, it } from "vitest"

import {
  ContractTemplateSyntaxError,
  mergeContractNumberIntoVariables,
  renderTemplate,
  validateContractTemplateBody,
  validateTemplateVariables,
} from "../../src/contracts/service.js"

/**
 * Unit tests for `renderTemplate` and `validateTemplateVariables`.
 * Mustache-style `{{path.to.value}}` substitution with array-index accessors,
 * plus lexical_json AST walking.
 */

describe("renderTemplate — mustache (markdown/html)", () => {
  it("substitutes a top-level variable", () => {
    const body = "Hello, {{name}}!"
    expect(renderTemplate(body, "markdown", { name: "World" })).toBe("Hello, World!")
  })

  it("substitutes multiple variables", () => {
    const body = "{{greeting}}, {{name}}! Today is {{day}}."
    expect(renderTemplate(body, "markdown", { greeting: "Hi", name: "Alice", day: "Monday" })).toBe(
      "Hi, Alice! Today is Monday.",
    )
  })

  it("resolves dot paths", () => {
    const body = "Customer: {{customer.firstName}} {{customer.lastName}}"
    expect(
      renderTemplate(body, "markdown", {
        customer: { firstName: "Jane", lastName: "Doe" },
      }),
    ).toBe("Customer: Jane Doe")
  })

  it("resolves deep dot paths", () => {
    const body = "Street: {{address.billing.street.line1}}"
    expect(
      renderTemplate(body, "markdown", {
        address: { billing: { street: { line1: "123 Main St" } } },
      }),
    ).toBe("Street: 123 Main St")
  })

  it("resolves array index accessors", () => {
    const body = "First: {{travelers[0].name}}, Second: {{travelers[1].name}}"
    expect(
      renderTemplate(body, "markdown", {
        travelers: [{ name: "Alice" }, { name: "Bob" }],
      }),
    ).toBe("First: Alice, Second: Bob")
  })

  it("resolves mixed dot + index accessors", () => {
    const body = "Item: {{order.items[0].sku}} × {{order.items[0].qty}}"
    expect(
      renderTemplate(body, "markdown", {
        order: { items: [{ sku: "ABC-123", qty: 2 }] },
      }),
    ).toBe("Item: ABC-123 × 2")
  })

  it("substitutes the missing-value placeholder for missing top-level variables", () => {
    expect(renderTemplate("Hello {{name}}!", "markdown", {})).toBe("Hello -!")
  })

  it("substitutes the missing-value placeholder for missing nested paths", () => {
    expect(renderTemplate("Street: {{address.line1}}", "markdown", { address: {} })).toBe(
      "Street: -",
    )
  })

  it("substitutes the missing-value placeholder for out-of-bounds array index", () => {
    expect(renderTemplate("Name: {{arr[5].name}}", "markdown", { arr: [{ name: "Only" }] })).toBe(
      "Name: -",
    )
  })

  it("stringifies numbers and booleans", () => {
    expect(
      renderTemplate("Count: {{n}}, Active: {{active}}", "markdown", { n: 42, active: true }),
    ).toBe("Count: 42, Active: true")
  })

  it("JSON-stringifies objects and arrays", () => {
    expect(renderTemplate("Data: {{obj}}", "markdown", { obj: { a: 1, b: 2 } })).toBe(
      'Data: {"a":1,"b":2}',
    )
  })

  it("trims whitespace inside mustache braces", () => {
    expect(renderTemplate("Hi {{  name  }}!", "markdown", { name: "Bob" })).toBe("Hi Bob!")
  })

  it("leaves body without placeholders unchanged", () => {
    expect(renderTemplate("Plain text with no vars.", "markdown", { anything: "x" })).toBe(
      "Plain text with no vars.",
    )
  })

  it("handles html the same way as markdown", () => {
    expect(renderTemplate("<p>Hi, {{name}}!</p>", "html", { name: "World" })).toBe(
      "<p>Hi, World!</p>",
    )
  })

  it("treats null and undefined as the missing-value placeholder", () => {
    expect(renderTemplate("A:{{a}}|B:{{b}}", "markdown", { a: null, b: undefined })).toBe("A:-|B:-")
  })

  it("supports liquid loops and conditionals in html/markdown templates", () => {
    const body =
      "{% if travelers.size > 0 %}{% for traveler in travelers %}{{ traveler.name }}{% unless forloop.last %}, {% endunless %}{% endfor %}{% else %}No travelers{% endif %}"

    expect(
      renderTemplate(body, "html", {
        travelers: [{ name: "Alice" }, { name: "Bob" }],
      }),
    ).toBe("Alice, Bob")
    expect(renderTemplate(body, "markdown", { travelers: [] })).toBe("No travelers")
  })

  it("renders the default customer agreement traveler heading without the missing-value placeholder", () => {
    const body = `<h2>Travelers ({% if booking.pax != nil and booking.pax != "" and booking.pax > 0 %}{{ booking.pax }}{% elsif travelers.size > 0 %}{{ travelers.size }}{% else %}TBD{% endif %})</h2>
<ol>
{% for t in travelers %}
  <li>{{ t.firstName }} {{ t.lastName }}{% if t.participantType != "traveler" %} — {{ t.participantType }}{% endif %}</li>
{% endfor %}
</ol>

<ul>
  <li>Pax: {{ booking.pax | default: "TBD" }}</li>
</ul>`

    expect(renderTemplate(body, "html", { booking: { pax: null }, travelers: [] })).toContain(
      "<h2>Travelers (TBD)</h2>",
    )
    expect(renderTemplate(body, "html", { booking: { pax: null }, travelers: [] })).toContain(
      "<li>Pax: TBD</li>",
    )
    expect(renderTemplate(body, "html", { booking: { pax: null }, travelers: [] })).not.toContain(
      "Travelers (-)",
    )

    expect(renderTemplate(body, "html", { booking: { pax: 2 }, travelers: [] })).toContain(
      "<h2>Travelers (2)</h2>",
    )
    expect(renderTemplate(body, "html", { booking: { pax: 0 }, travelers: [] })).toContain(
      "<h2>Travelers (TBD)</h2>",
    )

    const renderedWithTravelers = renderTemplate(body, "html", {
      booking: { pax: null },
      travelers: [
        { firstName: "Ada", lastName: "Lovelace", participantType: "traveler" },
        { firstName: "Grace", lastName: "Hopper", participantType: "child" },
      ],
    })
    expect(renderedWithTravelers).toContain("<h2>Travelers (2)</h2>")
    expect(renderedWithTravelers).toContain("<li>Ada Lovelace</li>")
    expect(renderedWithTravelers).toContain("<li>Grace Hopper — child</li>")
    expect(renderedWithTravelers).not.toContain("Travelers (-)")

    expect(
      renderTemplate(body, "html", {
        booking: { pax: 0 },
        travelers: [{ firstName: "Ada", lastName: "Lovelace", participantType: "traveler" }],
      }),
    ).toContain("<h2>Travelers (1)</h2>")
  })
})

describe("renderTemplate — lexical_json", () => {
  it("walks the lexical AST and substitutes text nodes", () => {
    const lexical = JSON.stringify({
      root: {
        type: "root",
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "Hello, {{name}}!" }],
          },
        ],
      },
    })
    const output = renderTemplate(lexical, "lexical_json", { name: "Alice" })
    const parsed = JSON.parse(output)
    expect(parsed.root.children[0].children[0].text).toBe("Hello, Alice!")
  })

  it("walks nested children recursively", () => {
    const lexical = JSON.stringify({
      root: {
        children: [
          {
            type: "list",
            children: [
              {
                type: "item",
                children: [{ type: "text", text: "First: {{a}}" }],
              },
              {
                type: "item",
                children: [{ type: "text", text: "Second: {{b}}" }],
              },
            ],
          },
        ],
      },
    })
    const output = renderTemplate(lexical, "lexical_json", { a: "foo", b: "bar" })
    const parsed = JSON.parse(output)
    expect(parsed.root.children[0].children[0].children[0].text).toBe("First: foo")
    expect(parsed.root.children[0].children[1].children[0].text).toBe("Second: bar")
  })

  it("leaves non-text properties unchanged", () => {
    const lexical = JSON.stringify({
      root: {
        type: "root",
        format: "ltr",
        children: [{ type: "text", text: "Hi {{x}}", format: "bold" }],
      },
    })
    const output = renderTemplate(lexical, "lexical_json", { x: "Z" })
    const parsed = JSON.parse(output)
    expect(parsed.root.format).toBe("ltr")
    expect(parsed.root.children[0].format).toBe("bold")
    expect(parsed.root.children[0].text).toBe("Hi Z")
  })

  it("falls back to mustache on invalid JSON", () => {
    const invalid = "not valid {{name}} json"
    expect(renderTemplate(invalid, "lexical_json", { name: "X" })).toBe("not valid X json")
  })

  it("handles lexical without root wrapper", () => {
    const lexical = JSON.stringify({ type: "text", text: "{{msg}}" })
    const output = renderTemplate(lexical, "lexical_json", { msg: "hi" })
    const parsed = JSON.parse(output)
    expect(parsed.text).toBe("hi")
  })

  it("supports liquid filters inside lexical text nodes", () => {
    const lexical = JSON.stringify({
      root: {
        type: "root",
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "Travelers: {{ travelers | json }}" }],
          },
        ],
      },
    })

    const output = renderTemplate(lexical, "lexical_json", {
      travelers: [{ name: "Alice" }],
    })
    const parsed = JSON.parse(output)
    expect(parsed.root.children[0].children[0].text).toBe('Travelers: [{"name":"Alice"}]')
  })
})

describe("validateTemplateVariables", () => {
  it("returns no issues when schema is empty/undefined/null", () => {
    expect(validateTemplateVariables(undefined, {})).toEqual([])
    expect(validateTemplateVariables(null, {})).toEqual([])
    expect(validateTemplateVariables({}, {})).toEqual([])
  })

  it("returns no issues when schema has no required field", () => {
    expect(validateTemplateVariables({ properties: { a: {} } }, {})).toEqual([])
  })

  it("returns an issue for each missing required variable", () => {
    const schema = { required: ["name", "email"] }
    const issues = validateTemplateVariables(schema, {})
    expect(issues).toHaveLength(2)
    expect(issues[0]).toContain("name")
    expect(issues[1]).toContain("email")
  })

  it("considers null and empty-string values as missing", () => {
    const schema = { required: ["name", "email", "phone"] }
    const issues = validateTemplateVariables(schema, {
      name: null,
      email: "",
      phone: "x",
    })
    expect(issues).toHaveLength(2)
    expect(issues.some((i) => i.includes("name"))).toBe(true)
    expect(issues.some((i) => i.includes("email"))).toBe(true)
  })

  it("returns no issues when all required variables are present", () => {
    const schema = { required: ["name", "email"] }
    expect(validateTemplateVariables(schema, { name: "Alice", email: "a@example.com" })).toEqual([])
  })

  it("supports dot-path required keys", () => {
    const schema = { required: ["customer.email"] }
    expect(validateTemplateVariables(schema, { customer: { email: "" } })).toHaveLength(1)
    expect(validateTemplateVariables(schema, { customer: { email: "a@example.com" } })).toEqual([])
  })

  it("supports bracket and numeric dot indexes in required keys", () => {
    const values = {
      booking: {
        items: [{ title: "Original tour", quantity: 2 }],
      },
    }

    expect(
      validateTemplateVariables(
        { required: ["booking.items[0].title", "booking.items.0.quantity"] },
        values,
      ),
    ).toEqual([])
  })

  it("reports missing and out-of-range array paths", () => {
    const values = { booking: { items: [{ title: "Original tour" }] } }

    expect(
      validateTemplateVariables(
        { required: ["booking.items[1].title", "booking.items[99].title"] },
        values,
      ),
    ).toEqual([
      "missing required variable: booking.items[1].title",
      "missing required variable: booking.items[99].title",
    ])
  })

  it("does not resolve unsafe prototype path segments", () => {
    expect(
      validateTemplateVariables(
        { required: ["booking.__proto__.polluted", "booking.constructor.name"] },
        { booking: {} },
      ),
    ).toEqual([
      "missing required variable: booking.__proto__.polluted",
      "missing required variable: booking.constructor.name",
    ])
  })

  it("accepts numeric and boolean values as present", () => {
    const schema = { required: ["count", "active"] }
    expect(validateTemplateVariables(schema, { count: 0, active: false })).toEqual([])
  })

  it("ignores non-array required field", () => {
    const schema = { required: "not an array" }
    expect(validateTemplateVariables(schema, {})).toEqual([])
  })
})

describe("validateContractTemplateBody", () => {
  it("accepts valid contract Liquid bodies", () => {
    expect(() =>
      validateContractTemplateBody(
        "{% if contract.signed_at %}{{ contract.signed_at | format_date }}{% endif %}",
      ),
    ).not.toThrow()
  })

  it("rejects rich-text-split Liquid output tags before rendering", () => {
    expect(() =>
      validateContractTemplateBody('{{ </p><p>contract.signed_at | default: "-" }}'),
    ).toThrow(ContractTemplateSyntaxError)
  })

  it("renderTemplate reports malformed Liquid as a template syntax error", () => {
    expect(() =>
      renderTemplate('{{ </p><p>contract.signed_at | default: "-" }}', "html", {
        contract: { signed_at: "2026-05-12" },
      }),
    ).toThrow(ContractTemplateSyntaxError)
  })
})

describe("mergeContractNumberIntoVariables — issue #1335", () => {
  it("injects the allocated number into both contract.number aliases", () => {
    const merged = mergeContractNumberIntoVariables({}, "INV-2026-0042")
    expect(merged.contract).toEqual({
      contractNumber: "INV-2026-0042",
      number: "INV-2026-0042",
    })
  })

  it("preserves existing contract.* fields", () => {
    const merged = mergeContractNumberIntoVariables(
      {
        today: "2026-05-27",
        contract: { date: "2026-05-27", series: "Default" },
      },
      "INV-2026-0042",
    )
    expect(merged).toEqual({
      today: "2026-05-27",
      contract: {
        date: "2026-05-27",
        series: "Default",
        contractNumber: "INV-2026-0042",
        number: "INV-2026-0042",
      },
    })
  })

  it("renders {{ contract.number }} and {{ contract.contractNumber }} from the merged vars", () => {
    const merged = mergeContractNumberIntoVariables({}, "NR-001")
    expect(
      renderTemplate("Nr: {{contract.number}} / {{contract.contractNumber}}", "html", merged),
    ).toBe("Nr: NR-001 / NR-001")
  })

  it("replaces an invalid contract value (array/null) with the merged object", () => {
    const merged = mergeContractNumberIntoVariables({ contract: ["should-not-happen"] }, "NR-002")
    expect(merged.contract).toEqual({ contractNumber: "NR-002", number: "NR-002" })
  })
})
