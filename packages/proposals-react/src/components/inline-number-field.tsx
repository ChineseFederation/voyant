"use client"

import { formatMessage } from "@voyant-travel/i18n"
import { Button, Input } from "@voyant-travel/ui/components"
import { Check, Loader2, Pencil, X } from "lucide-react"
import { type ComponentType, type KeyboardEvent, useState } from "react"

import { useCrmUiI18nOrDefault } from "../i18n/index.js"

export interface InlineNumberFieldProps {
  icon?: ComponentType<{ className?: string }>
  label: string
  value: number | null
  placeholder?: string
  disabled?: boolean
  min?: number
  max?: number
  onSave: (next: number | null) => Promise<void>
}

export function InlineNumberField({
  icon: Icon,
  label,
  value,
  placeholder,
  disabled,
  min,
  max,
  onSave,
}: InlineNumberFieldProps) {
  const { formatNumber, messages: rootMessages } = useCrmUiI18nOrDefault()
  const messages = rootMessages.inlineEditor
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value != null ? String(value) : "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleCancel() {
    setDraft(value != null ? String(value) : "")
    setEditing(false)
    setError(null)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      if (draft.trim() === "") {
        await onSave(null)
      } else {
        const parsed = Number.parseInt(draft, 10)
        if (!Number.isFinite(parsed)) throw new Error(messages.invalidNumber)
        if (min != null && parsed < min) {
          throw new Error(formatMessage(messages.minNumber, { min: String(min) }))
        }
        if (max != null && parsed > max) {
          throw new Error(formatMessage(messages.maxNumber, { max: String(max) }))
        }
        await onSave(parsed)
      }
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.failedToSave)
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault()
      void handleSave()
    } else if (event.key === "Escape") {
      event.preventDefault()
      handleCancel()
    }
  }

  return (
    <div className="group flex items-start gap-3 py-1.5">
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : null}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        {editing ? (
          <div className="mt-1 flex items-center gap-2">
            <Input
              autoFocus
              type="number"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={saving}
              className="h-8 text-sm"
              placeholder={placeholder}
              min={min}
              max={max}
            />
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
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1 truncate text-sm">
              {value != null ? (
                formatNumber(value)
              ) : (
                <span className="text-muted-foreground italic">
                  {placeholder || messages.notSet}
                </span>
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
