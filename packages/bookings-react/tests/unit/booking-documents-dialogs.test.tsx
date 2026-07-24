// @vitest-environment jsdom

import type * as ReactTypes from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const testState = vi.hoisted(() => ({
  createDocument: vi.fn(async () => ({ id: "bdoc_123" })),
}))

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.mock("../../src/index.js", () => ({
  useBookingTravelerDocumentMutation: () => ({
    create: {
      isPending: false,
      mutateAsync: testState.createDocument,
    },
  }),
  useTravelers: () => ({ data: { data: [] } }),
}))

vi.mock("@voyant-travel/ui/components/date-picker", () => ({
  DatePicker: ({
    placeholder,
  }: {
    value?: string | null
    onChange?: (next: string | null) => void
    placeholder?: string
  }) => <input aria-label={placeholder} />,
}))

vi.mock("../../src/components/file-dropzone.js", () => ({
  FileDropzone: ({
    helperText,
    onUploaded,
    onCleared,
  }: {
    helperText?: string
    onUploaded: (upload: {
      key: string
      url: string
      mimeType: string
      size: number
      name: string
    }) => void
    onCleared?: () => void
  }) => (
    <div>
      <p>{helperText}</p>
      <button
        type="button"
        onClick={() =>
          onUploaded({
            key: "upload_123",
            url: "https://cdn.example.test/passport.pdf",
            mimeType: "application/pdf",
            size: 1234,
            name: "passport.pdf",
          })
        }
      >
        Mock upload
      </button>
      <button type="button" onClick={() => onCleared?.()}>
        Mock clear
      </button>
    </div>
  ),
}))

vi.mock("@voyant-travel/ui/components", () => ({
  Button: ({ children, ...props }: ReactTypes.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Dialog: ({
    children,
    open,
  }: {
    children?: ReactTypes.ReactNode
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }) => (open ? <div>{children}</div> : null),
  DialogBody: ({ children }: { children?: ReactTypes.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children?: ReactTypes.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: ReactTypes.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: ReactTypes.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactTypes.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactTypes.ReactNode }) => <h2>{children}</h2>,
  Input: (props: ReactTypes.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Label: ({ children }: { children?: ReactTypes.ReactNode }) => <span>{children}</span>,
  Select: ({ children }: { children?: ReactTypes.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children?: ReactTypes.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children?: ReactTypes.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children?: ReactTypes.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: () => null,
  Skeleton: () => <div />,
  Textarea: (props: ReactTypes.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
}))

import { BookingDocumentDialog } from "../../src/components/booking-document-dialog.js"

function getButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(label),
  )
  if (!button) throw new Error(`Button not found: ${label}`)
  return button
}

describe("booking document dialogs", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    testState.createDocument.mockClear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("keeps document upload submit disabled until an uploaded file exists", () => {
    act(() => {
      root.render(
        <BookingDocumentDialog open onOpenChange={() => undefined} bookingId="book_123" />,
      )
    })

    expect(getButton(container, "Add document").disabled).toBe(true)
    expect(container.textContent).not.toContain("Must be a valid URL")

    act(() => {
      getButton(container, "Mock upload").click()
    })

    expect(getButton(container, "Add document").disabled).toBe(false)

    act(() => {
      getButton(container, "Mock clear").click()
    })

    expect(getButton(container, "Add document").disabled).toBe(true)
  })
})
