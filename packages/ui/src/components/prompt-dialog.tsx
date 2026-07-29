"use client"

import type * as React from "react"
import { useEffect, useState } from "react"
import { Button } from "./button.js"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./dialog.js"
import { getImperativeDialogChannel } from "./imperative-dialog-channel.js"
import { Input } from "./input.js"
import { Label } from "./label.js"

export interface PromptDialogOptions {
  title: React.ReactNode
  description?: React.ReactNode
  label?: React.ReactNode
  placeholder?: string
  defaultValue?: string
  confirmLabel?: string
  cancelLabel?: string
}

interface PromptRequest {
  id: number
  options: PromptDialogOptions
  resolve: (value: string | null) => void
}

const channel = getImperativeDialogChannel<PromptRequest>("prompt")

/**
 * Imperative, promise-based text prompt — the styled replacement for the native
 * `window.prompt`. Resolves to the entered string, or `null` if cancelled.
 * A single {@link PromptDialogHost} must be mounted once near the app root.
 */
export function promptDialog(options: PromptDialogOptions): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    channel.sequence += 1
    const request: PromptRequest = { id: channel.sequence, options, resolve }
    for (const listener of channel.listeners) listener(request)
  })
}

export interface PromptDialogHostProps {
  defaultConfirmLabel?: string
  defaultCancelLabel?: string
}

/** Renders the single Dialog that {@link promptDialog} drives. Mount once. */
export function PromptDialogHost({
  defaultConfirmLabel = "OK",
  defaultCancelLabel = "Cancel",
}: PromptDialogHostProps = {}) {
  const [request, setRequest] = useState<PromptRequest | null>(null)
  const [value, setValue] = useState("")

  useEffect(() => {
    const listener = (next: PromptRequest) => {
      setRequest(next)
      setValue(next.options.defaultValue ?? "")
    }
    channel.listeners.add(listener)
    return () => {
      channel.listeners.delete(listener)
    }
  }, [])

  const settle = (result: string | null) => {
    request?.resolve(result)
    setRequest(null)
  }

  const options = request?.options

  return (
    <Dialog open={request !== null} onOpenChange={(open) => (open ? undefined : settle(null))}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{options?.title}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3 py-4"
          onSubmit={(event) => {
            event.preventDefault()
            settle(value)
          }}
        >
          {options?.label ? <Label htmlFor="prompt-dialog-input">{options.label}</Label> : null}
          <Input
            id="prompt-dialog-input"
            autoFocus
            placeholder={options?.placeholder}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => settle(null)}>
            {options?.cancelLabel ?? defaultCancelLabel}
          </Button>
          <Button onClick={() => settle(value)}>
            {options?.confirmLabel ?? defaultConfirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
