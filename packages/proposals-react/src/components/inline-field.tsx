"use client"

import { Button, cn, Input, Textarea } from "@voyant-travel/ui/components"
import { Check, Loader2, Pencil, X } from "lucide-react"
import { type ComponentType, type KeyboardEvent, useState } from "react"

import { useCrmUiMessagesOrDefault } from "../i18n/index.js"

export type InlineFieldKind = "text" | "email" | "url" | "textarea"

export interface InlineFieldProps {
  icon?: ComponentType<{ className?: string }>
  label: string
  value: string | null
  kind?: InlineFieldKind
  href?: string
  placeholder?: string
  disabled?: boolean
  onSave: (next: string | null) => Promise<void>
}

export function InlineField({
  icon: Icon,
  label,
  value,
  kind = "text",
  href,
  placeholder,
  disabled,
  onSave,
}: InlineFieldProps) {
  const messages = useCrmUiMessagesOrDefault().inlineEditor
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleCancel() {
    setDraft(value ?? "")
    setEditing(false)
    setError(null)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const trimmed = draft.trim()
      await onSave(trimmed === "" ? null : trimmed)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.failedToSave)
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (kind !== "textarea" && event.key === "Enter") {
      event.preventDefault()
      void handleSave()
    } else if (event.key === "Escape") {
      event.preventDefault()
      handleCancel()
    }
  }

  const display = value || (
    <span className="text-muted-foreground italic">{placeholder || messages.notSet}</span>
  )

  return (
    <div className="group flex items-start gap-3 py-1.5">
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : null}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        {editing ? (
          <div className="mt-1 flex items-start gap-2">
            {kind === "textarea" ? (
              <Textarea
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                disabled={saving}
                className="min-h-[80px] text-sm"
                placeholder={placeholder}
              />
            ) : (
              <Input
                autoFocus
                type={kind === "email" ? "email" : kind === "url" ? "url" : "text"}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                disabled={saving}
                className="h-8 text-sm"
                placeholder={placeholder}
              />
            )}
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void handleSave()}
                disabled={saving}
                className="h-8 w-8 p-0"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancel}
                disabled={saving}
                className="h-8 w-8 p-0"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className={cn("flex-1 text-sm", kind !== "textarea" && "truncate")}>
              {href && value ? (
                <a
                  href={href}
                  className="text-primary hover:underline"
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel={href.startsWith("http") ? "noreferrer" : undefined}
                >
                  {value}
                </a>
              ) : (
                display
              )}
            </div>
            {!disabled ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(true)}
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        )}
        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      </div>
    </div>
  )
}
