"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components"
import type { ReactNode } from "react"

/**
 * Shared skeleton for both staff alert screens.
 *
 * They list the same alerts and users move between them, so they share one
 * rhythm instead of each inventing its own.
 *
 * Width is capped: the admin shell is as wide as the window, and a settings row
 * whose label sits a thousand pixels from its switch is unreadable at any
 * spacing.
 */
export function StaffAlertShell({ children }: { children: ReactNode }) {
  return <div className="max-w-3xl space-y-4">{children}</div>
}

/**
 * One domain group — Sales, Bookings, Finance, Contracts.
 *
 * `Card` already supplies `py-6` and a `gap-6` between header and content, and
 * `CardContent` supplies `px-6`. Adding vertical padding here double-pads the
 * card, which is what made earlier revisions look loose and uneven.
 */
export function StaffAlertSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">{children}</CardContent>
    </Card>
  )
}

export interface StaffAlertRowProps {
  title: ReactNode
  description: string
  /** Secondary line — recipients, or inherited state. Omitted when empty. */
  meta?: ReactNode
  /** Right-hand controls. */
  control: ReactNode
}

/**
 * One alert.
 *
 * `first:pt-0 last:pb-0` keeps the first and last rows flush with the card's
 * own padding, so the gap above row one is the card's `gap-6` alone rather than
 * that plus the row's own padding.
 *
 * Controls are top-aligned with a small offset rather than centred: rows are
 * one to three lines tall depending on whether they carry a meta line, and
 * centring makes the switches wander down the column.
 */
export function StaffAlertRow({ title, description, meta, control }: StaffAlertRowProps) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2 font-medium">{title}</div>
        <p className="text-sm leading-snug text-muted-foreground">{description}</p>
        {/* Metadata, not prose: smaller than the description and the same muted
            colour. An opacity modifier here (`text-muted-foreground/80`) does
            not compose with the themed CSS variable and silently renders at
            full foreground, which made this line louder than the sentence
            above it. */}
        {meta ? <p className="truncate text-xs text-muted-foreground">{meta}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">{control}</div>
    </div>
  )
}

/** Loading and empty states, so they sit in a card like everything else. */
export function StaffAlertNotice({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  )
}
