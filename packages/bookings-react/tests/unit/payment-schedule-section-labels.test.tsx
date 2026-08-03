// @vitest-environment jsdom

import type * as ReactTypes from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("@voyant-travel/ui/components", () => ({
  Button: ({ children, ...props }: ReactTypes.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Checkbox: () => <input type="checkbox" readOnly />,
  Input: (props: ReactTypes.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Label: ({ children }: { children?: ReactTypes.ReactNode }) => <span>{children}</span>,
  Select: ({ children }: { children?: ReactTypes.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactTypes.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: ReactTypes.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactTypes.ReactNode }) => <div>{children}</div>,
  SelectValue: () => <span />,
}))

vi.mock("@voyant-travel/ui/components/currency-input", () => ({
  CurrencyInput: ({ placeholder }: { placeholder?: string }) => <input placeholder={placeholder} />,
}))

// Stand-in for the real picker: renders the placeholder as its trigger text
// when there is no value, which is exactly what the real DatePicker does.
vi.mock("@voyant-travel/ui/components/date-picker", () => ({
  DatePicker: ({ value, placeholder }: { value?: string | null; placeholder?: string }) => (
    <button type="button" data-testid="date-picker">
      {value ? value : placeholder}
    </button>
  ),
}))

import {
  createInstallment,
  PaymentScheduleSection,
  type PaymentScheduleValue,
} from "../../src/components/payment-schedule-section.js"
import { BookingsUiMessagesProvider } from "../../src/i18n/provider.js"

function splitValue(count: number): PaymentScheduleValue {
  return {
    mode: "split",
    installments: Array.from({ length: count }, () =>
      createInstallment({ amountCents: 10_000, dueDate: null }),
    ),
  }
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root.unmount()
  })
  container.remove()
  vi.clearAllMocks()
})

function renderSection(locale: string, value: PaymentScheduleValue) {
  act(() => {
    root.render(
      <BookingsUiMessagesProvider locale={locale}>
        <PaymentScheduleSection value={value} onChange={() => {}} totalAmountCents={30_000} />
      </BookingsUiMessagesProvider>,
    )
  })
}

function rowLabels(): string[] {
  return [...container.querySelectorAll("span.text-xs.font-medium")].map(
    (node) => node.textContent ?? "",
  )
}

describe("PaymentScheduleSection installment labels", () => {
  it("labels each Romanian row distinctly", () => {
    renderSection("ro", splitValue(3))

    expect(rowLabels()).toEqual(["Prima rata", "A doua rata", "Rata 3"])
  })

  it("labels each English row distinctly", () => {
    renderSection("en", splitValue(4))

    expect(rowLabels()).toEqual([
      "First installment",
      "Second installment",
      "Installment 3",
      "Installment 4",
    ])
  })

  it("does not repeat the first-installment label on a two-row schedule", () => {
    renderSection("ro", splitValue(2))

    const labels = rowLabels()
    expect(labels).toHaveLength(2)
    expect(new Set(labels).size).toBe(2)
  })

  it("translates the due-date picker placeholder", () => {
    renderSection("ro", splitValue(2))

    const placeholders = [...container.querySelectorAll("[data-testid='date-picker']")].map(
      (node) => node.textContent ?? "",
    )
    expect(placeholders).not.toHaveLength(0)
    expect(placeholders).not.toContain("Pick a date")
    expect(placeholders).toContain("Selecteaza data scadentei")
  })
})
