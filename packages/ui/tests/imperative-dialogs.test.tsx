import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => {
  cleanup()
  vi.resetModules()
})

describe("imperative dialogs across module copies", () => {
  it("delivers confirmations to a host imported from another module copy", async () => {
    const hostModule = await import("../src/components/confirm-dialog.js")
    render(<hostModule.ConfirmDialogHost />)

    vi.resetModules()
    const callerModule = await import("../src/components/confirm-dialog.js")
    const result = callerModule.confirmDialog({
      title: "Create this booking?",
      description: "Confirm the booking details.",
    })

    expect(await screen.findByRole("alertdialog")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    await expect(result).resolves.toBe(true)
  })

  it("delivers prompts to a host imported from another module copy", async () => {
    const hostModule = await import("../src/components/prompt-dialog.js")
    render(<hostModule.PromptDialogHost />)

    vi.resetModules()
    const callerModule = await import("../src/components/prompt-dialog.js")
    const result = callerModule.promptDialog({
      title: "Add a note",
      label: "Note",
    })

    fireEvent.change(await screen.findByLabelText("Note"), { target: { value: "Ready" } })
    fireEvent.click(screen.getByRole("button", { name: "OK" }))
    await expect(result).resolves.toBe("Ready")
  })
})
