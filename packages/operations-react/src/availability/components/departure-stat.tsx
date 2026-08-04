"use client"

import { Card, CardContent, cn } from "@voyant-travel/ui/components"
import type { ReactNode } from "react"

/**
 * The workspace's one number-with-a-label primitive. Every headline figure in
 * the departure workspace comes from the composed summary, so they all render
 * identically — a figure that looks different from its neighbours reads as a
 * different KIND of number, which is exactly the confusion this workspace
 * exists to remove.
 */
export function StatCard({
  label,
  children,
  hint,
  badge,
  tone,
}: {
  label: string
  children: ReactNode
  hint?: ReactNode
  badge?: ReactNode
  /** `attention` tints the figure when it is the one that disagrees. */
  tone?: "default" | "attention"
}) {
  return (
    <Card data-slot="departure-stat" data-tone={tone ?? "default"}>
      <CardContent className="flex flex-col gap-1">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={cn(
              "text-xl font-semibold tabular-nums leading-none",
              tone === "attention" && "text-red-600 dark:text-red-400",
            )}
          >
            {children}
          </div>
          {badge}
        </div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  )
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-4 sm:grid-cols-4", className)}>{children}</div>
}

/** Section shell: a heading, an optional description, and its content. */
export function DepartureSection({
  title,
  description,
  actions,
  children,
  slot,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  slot?: string
}) {
  return (
    <section data-slot={slot} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}
