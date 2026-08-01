"use client"

import { formatMessage } from "@voyant-travel/i18n"
import { cn } from "@voyant-travel/ui/components"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@voyant-travel/ui/components/combobox"
import { languages } from "@voyant-travel/utils/languages"
import { Pencil } from "lucide-react"
import { type ComponentType, useState } from "react"

import { useCrmUiMessagesOrDefault } from "../i18n/index.js"

const LANGUAGE_CODES = Object.keys(languages).sort()

export interface InlineLanguageFieldProps {
  icon?: ComponentType<{ className?: string }>
  label: string
  value: string | null
  disabled?: boolean
  onSave: (next: string | null) => Promise<void>
}

export function InlineLanguageField({
  icon: Icon,
  label,
  value,
  disabled,
  onSave,
}: InlineLanguageFieldProps) {
  const messages = useCrmUiMessagesOrDefault().inlineEditor
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function commitSelection(next: string | null) {
    setSaving(true)
    setError(null)
    try {
      await onSave(next)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : messages.failedToSave)
    } finally {
      setSaving(false)
    }
  }

  const languageName = value ? languages[value as keyof typeof languages] : null

  return (
    <div className="group flex items-start gap-3 py-1.5">
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : null}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        {editing ? (
          <Combobox
            items={LANGUAGE_CODES}
            defaultOpen
            autoHighlight
            filter={(code, query) => {
              const languageCode = String(code)
              const languageName = languages[languageCode as keyof typeof languages]
              if (!languageName) return false
              const normalized = query.toLowerCase()
              return (
                languageCode.toLowerCase().includes(normalized) ||
                languageName.toLowerCase().includes(normalized)
              )
            }}
            onValueChange={(next) => void commitSelection((next as string | null) ?? null)}
            onOpenChange={(open) => {
              if (!open) setEditing(false)
            }}
          >
            <ComboboxInput
              autoFocus
              placeholder={messages.searchLanguagePlaceholder}
              className="mt-0.5 h-8 text-sm"
              disabled={saving}
            />
            <ComboboxContent>
              <ComboboxEmpty>{messages.noLanguagesFound}</ComboboxEmpty>
              <ComboboxList>
                <ComboboxCollection>
                  {(code: string) => {
                    const languageName = languages[code as keyof typeof languages]
                    return (
                      <ComboboxItem key={code} value={code}>
                        <span className="min-w-10 font-mono text-xs text-muted-foreground">
                          {code}
                        </span>
                        <span className="truncate">{languageName}</span>
                      </ComboboxItem>
                    )
                  }}
                </ComboboxCollection>
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => !disabled && setEditing(true)}
              disabled={disabled}
              className={cn(
                "-mx-1 flex-1 truncate rounded px-1 py-0.5 text-left text-sm transition-colors",
                !disabled && "cursor-text hover:bg-muted/60",
                !value && "text-muted-foreground italic",
              )}
            >
              {value ? (
                <span>
                  <span className="font-mono">{value}</span>
                  {languageName ? (
                    <span className="ml-2 text-muted-foreground">{languageName}</span>
                  ) : null}
                </span>
              ) : (
                formatMessage(messages.addTemplate, { label: label.toLowerCase() })
              )}
            </button>
            {!disabled ? (
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
            ) : null}
          </div>
        )}
        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      </div>
    </div>
  )
}
