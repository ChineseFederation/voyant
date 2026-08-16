"use client"

import { Input } from "@voyant-travel/ui/components/input"
import { cn } from "@voyant-travel/ui/lib/utils"
import { Search } from "lucide-react"
import { useEffect, useRef, useState } from "react"

export interface CatalogSearchInputProps {
  /** Controlled query, typically from URL state. */
  value: string
  /** Emitted after `debounceMs` of quiet, never on every keystroke. */
  onChange: (query: string) => void
  placeholder: string
  /** Debounce on keystrokes, milliseconds. Default 200. */
  debounceMs?: number
  className?: string
  "aria-label"?: string
}

/**
 * The catalog's search box.
 *
 * Typing is buffered locally and only published after a quiet period, because
 * every consumer here writes the query into router state: emitting per
 * keystroke pushes a history entry per character, and the re-render that
 * follows would otherwise clobber the caret. `value` is re-seeded into the
 * buffer only when it changes to something this component did not emit — a
 * back/forward navigation or an external clear — so the reader's own typing is
 * never overwritten by the echo of an earlier keystroke.
 */
export function CatalogSearchInput({
  value,
  onChange,
  placeholder,
  debounceMs = 200,
  className,
  "aria-label": ariaLabel,
}: CatalogSearchInputProps) {
  const [buffer, setBuffer] = useState(value)
  const lastEmittedRef = useRef(value)

  useEffect(() => {
    if (value === lastEmittedRef.current) return
    lastEmittedRef.current = value
    setBuffer(value)
  }, [value])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (buffer === lastEmittedRef.current) return
      lastEmittedRef.current = buffer
      onChange(buffer)
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [buffer, debounceMs, onChange])

  return (
    <div className={cn("relative", className)}>
      <Search
        className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={buffer}
        onChange={(event) => setBuffer(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="pl-9"
      />
    </div>
  )
}
