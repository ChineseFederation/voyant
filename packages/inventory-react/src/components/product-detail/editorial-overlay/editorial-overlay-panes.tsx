"use client"

import { Image as MediaImage } from "@voyant-travel/ui/components/image"
import { cn } from "@voyant-travel/ui/lib/utils"
import * as React from "react"

import { displayValue, type EditorialOverlayFieldKind, isEmptyValue } from "./types.js"

/** Wide layouts show source/overlay/effective side by side; narrow ones compare in tabs. */
const WIDE_COMPARE_QUERY = "(min-width: 1024px)"

export function useWideCompareLayout(): boolean {
  const [isWide, setIsWide] = React.useState(true)

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mql = window.matchMedia(WIDE_COMPARE_QUERY)
    const onChange = () => setIsWide(mql.matches)
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isWide
}

export interface ValuePaneProps {
  label: string
  value: unknown
  kind: EditorialOverlayFieldKind
  emptyLabel: string
  /** Rendered instead of the value — the inline editor occupies the overlay pane. */
  children?: React.ReactNode
  className?: string
  testId?: string
}

export function ValuePane({
  label,
  value,
  kind,
  emptyLabel,
  children,
  className,
  testId,
}: ValuePaneProps) {
  const headingId = React.useId()
  return (
    <section
      aria-labelledby={headingId}
      data-testid={testId}
      className={cn("flex min-w-0 flex-col gap-2", className)}
    >
      <p
        id={headingId}
        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </p>
      {children ?? <ValueBody value={value} kind={kind} emptyLabel={emptyLabel} />}
    </section>
  )
}

function ValueBody({
  value,
  kind,
  emptyLabel,
}: {
  value: unknown
  kind: EditorialOverlayFieldKind
  emptyLabel: string
}) {
  if (isEmptyValue(value)) {
    return <p className="text-sm text-muted-foreground italic">{emptyLabel}</p>
  }

  if (kind === "media") {
    const urls = mediaUrls(value)
    if (urls.length === 0) {
      return <p className="text-sm text-muted-foreground italic">{emptyLabel}</p>
    }
    return (
      <ul className="flex flex-wrap gap-2">
        {urls.map((url) => (
          <li key={url}>
            <MediaImage
              src={url}
              alt=""
              className="h-16 w-24 rounded border object-cover"
              loading="lazy"
            />
          </li>
        ))}
      </ul>
    )
  }

  if (kind === "string-list" && Array.isArray(value)) {
    return (
      <ul className="list-disc pl-4 text-sm">
        {value.map((entry, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: list entries are plain strings without ids. -- owner: products
          <li key={`${String(entry)}-${index}`}>{String(entry)}</li>
        ))}
      </ul>
    )
  }

  if (kind === "html") {
    // Provider/overlay HTML is sanitized server-side; admin compares it as
    // source text so a comparison view can never execute markup.
    return (
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-sm">
        {displayValue(value)}
      </pre>
    )
  }

  return <p className="whitespace-pre-wrap break-words text-sm">{displayValue(value)}</p>
}

export function mediaUrls(value: unknown): string[] {
  if (typeof value === "string") return value ? [value] : []
  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        typeof entry === "string" ? entry : ((entry as { url?: string })?.url ?? ""),
      )
      .filter(Boolean)
  }
  return []
}
