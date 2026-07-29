"use client"

import type * as React from "react"
import { useEffect, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog.js"
import { getImperativeDialogChannel } from "./imperative-dialog-channel.js"

export interface ConfirmDialogOptions {
  title?: React.ReactNode
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Style the confirm action as destructive (red). */
  destructive?: boolean
}

interface ConfirmRequest {
  id: number
  options: ConfirmDialogOptions
  resolve: (value: boolean) => void
}

const channel = getImperativeDialogChannel<ConfirmRequest>("confirm")

/**
 * Imperative, promise-based confirmation — the styled replacement for the
 * native `window.confirm`. Call it from anywhere (event handlers, menu items)
 * and await the boolean result:
 *
 *   if (await confirmDialog({ description: "Delete this?", destructive: true })) {
 *     await remove()
 *   }
 *
 * A single {@link ConfirmDialogHost} must be mounted once near the app root.
 */
export function confirmDialog(input: ConfirmDialogOptions | string): Promise<boolean> {
  const options: ConfirmDialogOptions = typeof input === "string" ? { description: input } : input
  return new Promise<boolean>((resolve) => {
    channel.sequence += 1
    const request: ConfirmRequest = { id: channel.sequence, options, resolve }
    for (const listener of channel.listeners) listener(request)
  })
}

export interface ConfirmDialogHostProps {
  defaultTitle?: string
  defaultConfirmLabel?: string
  defaultCancelLabel?: string
}

/**
 * Renders the single AlertDialog that {@link confirmDialog} drives. Mount once
 * near the app root (alongside the toaster). Pass localized default labels; the
 * per-call `description` carries the localized message.
 */
export function ConfirmDialogHost({
  defaultTitle = "Are you sure?",
  defaultConfirmLabel = "Confirm",
  defaultCancelLabel = "Cancel",
}: ConfirmDialogHostProps = {}) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)

  useEffect(() => {
    const listener = (next: ConfirmRequest) => setRequest(next)
    channel.listeners.add(listener)
    return () => {
      channel.listeners.delete(listener)
    }
  }, [])

  const settle = (value: boolean) => {
    request?.resolve(value)
    setRequest(null)
  }

  const options = request?.options

  return (
    <AlertDialog
      open={request !== null}
      onOpenChange={(open) => (open ? undefined : settle(false))}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{options?.title ?? defaultTitle}</AlertDialogTitle>
          {options?.description ? (
            <AlertDialogDescription>{options.description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {options?.cancelLabel ?? defaultCancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={options?.destructive ? "destructive" : "default"}
            onClick={() => settle(true)}
          >
            {options?.confirmLabel ?? defaultConfirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
