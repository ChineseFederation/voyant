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
import { currencies } from "@voyant-travel/utils/currencies"
import { Pencil } from "lucide-react"
import { type ComponentType, useState } from "react"

import { useCrmUiMessagesOrDefault } from "../i18n/index.js"

const CURRENCY_CODES = Object.keys(currencies).sort()

export interface InlineCurrencyFieldProps {
  icon?: ComponentType<{ className?: string }>
  label: string
  value: string | null
  disabled?: boolean
  onSave: (next: string | null) => Promise<void>
}

export function InlineCurrencyField({
  icon: Icon,
  label,
  value,
  disabled,
  onSave,
}: InlineCurrencyFieldProps) {
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

  const currencyInfo = value ? currencies[value as keyof typeof currencies] : null

  return (
    <div className="group flex items-start gap-3 py-1.5">
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : null}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        {editing ? (
          <Combobox
            items={CURRENCY_CODES}
            defaultOpen
            autoHighlight
            filter={(code, query) => {
              const currency = currencies[code as keyof typeof currencies]
              if (!currency) return false
              const normalized = query.toLowerCase()
              return (
                currency.code.toLowerCase().includes(normalized) ||
                currency.name.toLowerCase().includes(normalized) ||
                currency.symbol.toLowerCase().includes(normalized)
              )
            }}
            onValueChange={(next) => void commitSelection((next as string | null) ?? null)}
            onOpenChange={(open) => {
              if (!open) setEditing(false)
            }}
          >
            <ComboboxInput
              autoFocus
              placeholder={messages.searchCurrencyPlaceholder}
              className="mt-0.5 h-8 text-sm"
              disabled={saving}
            />
            <ComboboxContent>
              <ComboboxEmpty>{messages.noCurrenciesFound}</ComboboxEmpty>
              <ComboboxList>
                <ComboboxCollection>
                  {(code: string) => {
                    const currency = currencies[code as keyof typeof currencies]
                    return (
                      <ComboboxItem key={code} value={code}>
                        <span className="min-w-10 font-mono text-xs text-muted-foreground">
                          {code}
                        </span>
                        <span className="truncate">{currency?.name ?? code}</span>
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
                  {currencyInfo ? (
                    <span className="ml-2 text-muted-foreground">{currencyInfo.name}</span>
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
