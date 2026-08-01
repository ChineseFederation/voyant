"use client"

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import { Check, Loader2, Pencil, X } from "lucide-react"
import { type ComponentType, useState } from "react"

import { useCrmUiMessagesOrDefault } from "../i18n/index.js"

export interface InlineSelectFieldOption {
  value: string
  label: string
}

export interface InlineSelectFieldProps {
  icon?: ComponentType<{ className?: string }>
  label: string
  value: string | null
  options: readonly InlineSelectFieldOption[]
  placeholder?: string
  disabled?: boolean
  allowClear?: boolean
  onSave: (next: string | null) => Promise<void>
}

export function InlineSelectField({
  icon: Icon,
  label,
  value,
  options,
  placeholder,
  disabled,
  allowClear = true,
  onSave,
}: InlineSelectFieldProps) {
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
      await onSave(draft === "__none__" || draft === "" ? null : draft)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.failedToSave)
    } finally {
      setSaving(false)
    }
  }

  const matched = options.find((option) => option.value === value)

  return (
    <div className="group flex items-start gap-3 py-1.5">
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : null}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        {editing ? (
          <div className="mt-1 flex items-center gap-2">
            <Select value={draft} onValueChange={(next) => setDraft(next ?? "")} disabled={saving}>
              <SelectTrigger className="h-8 flex-1 text-sm">
                <SelectValue placeholder={placeholder || messages.selectPlaceholder} />
              </SelectTrigger>
              <SelectContent>
                {allowClear ? (
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground italic">{messages.noneOption}</span>
                  </SelectItem>
                ) : null}
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              {matched ? (
                matched.label
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
