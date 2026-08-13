"use client"

import { Input, Label, Switch } from "@voyant-travel/ui/components"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@voyant-travel/ui/components/combobox"
import { DatePicker } from "@voyant-travel/ui/components/date-picker"
import { DateTimePicker } from "@voyant-travel/ui/components/date-time-picker"
import { languages } from "@voyant-travel/utils/languages"
import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import type { UseFormSetValue, UseFormWatch } from "react-hook-form"
import { z } from "zod/v4"
import type { useLegalUiMessagesOrDefault } from "../i18n/index.js"
import { type LegalContractScope, legalContractScopes } from "../i18n/messages.js"

import type { LegalContractRecord } from "../index.js"

type ContractDialogMessages = ReturnType<typeof useLegalUiMessagesOrDefault>["contractDialog"]

export const contractFormSchema = z.object({
  scope: z.enum(legalContractScopes),
  title: z.string().min(1, "titleRequired"),
  contractNumber: z.string().optional(),
  language: z.string().min(2).max(10).optional(),
  templateVersionId: z.string().optional(),
  seriesId: z.string().optional(),
  personId: z.string().optional(),
  organizationId: z.string().optional(),
  supplierId: z.string().optional(),
  channelId: z.string().optional(),
  expiresAt: z.string().optional(),
  templateVariables: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      type: z.string(),
      description: z.string().optional(),
      example: z.string().optional(),
      required: z.boolean().default(false),
      value: z.string().optional(),
      booleanValue: z.boolean().default(false),
      includeBooleanValue: z.boolean().default(false),
    }),
  ),
  additionalVariables: z.array(
    z.object({
      key: z.string().optional(),
      value: z.string().optional(),
    }),
  ),
  metadataEntries: z.array(
    z.object({
      key: z.string().optional(),
      value: z.string().optional(),
    }),
  ),
})

export type FormValues = z.input<typeof contractFormSchema>
export type FormOutput = z.output<typeof contractFormSchema>
export type TemplateVariableRow = FormValues["templateVariables"][number]

export interface LinkedRecordPickerProps {
  value: string | undefined
  onChange: (id: string | undefined) => void
  scope: LegalContractScope
}

export interface ContractDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contract?: LegalContractRecord
  onSuccess: () => void
  renderPersonPicker?: (props: LinkedRecordPickerProps) => ReactNode
  renderOrganizationPicker?: (props: LinkedRecordPickerProps) => ReactNode
  renderSupplierPicker?: (props: LinkedRecordPickerProps) => ReactNode
  renderChannelPicker?: (props: LinkedRecordPickerProps) => ReactNode
}

export type ComboboxOption = {
  value: string
  label: string
  description?: string
}

const PREFERRED_LANGUAGE_ORDER = ["en", "ro", "fr", "de", "es", "it"] as const

export const languageOptions: ComboboxOption[] = Object.entries(languages)
  .sort(([codeA, nameA], [codeB, nameB]) => {
    const preferredA = PREFERRED_LANGUAGE_ORDER.indexOf(
      codeA as (typeof PREFERRED_LANGUAGE_ORDER)[number],
    )
    const preferredB = PREFERRED_LANGUAGE_ORDER.indexOf(
      codeB as (typeof PREFERRED_LANGUAGE_ORDER)[number],
    )
    if (preferredA !== -1 || preferredB !== -1) {
      if (preferredA === -1) return 1
      if (preferredB === -1) return -1
      return preferredA - preferredB
    }
    return nameA.localeCompare(nameB)
  })
  .map(([code, name]) => ({
    value: code,
    label: `${name} (${code})`,
    description: code,
  }))

export function mergeUniqueOptions(
  ...groups: Array<ComboboxOption[] | undefined>
): ComboboxOption[] {
  const map = new Map<string, ComboboxOption>()
  for (const group of groups) {
    for (const option of group ?? []) {
      map.set(option.value, option)
    }
  }
  return Array.from(map.values())
}

export function objectToEntries(record: Record<string, unknown> | null | undefined) {
  return Object.entries(record ?? {}).map(([key, value]) => ({
    key,
    value:
      typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value),
  }))
}

export function parseLooseValue(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return trimmed
    }
  }
  return trimmed
}

export function buildRecordFromPairs(entries: Array<{ key?: string; value?: string }>) {
  const record: Record<string, unknown> = {}
  for (const entry of entries) {
    const key = entry.key?.trim()
    if (!key) continue
    const parsed = parseLooseValue(entry.value ?? "")
    if (parsed === undefined) continue
    record[key] = parsed
  }
  return Object.keys(record).length ? record : undefined
}

export function buildVariablesPayload(
  rows: TemplateVariableRow[],
  additional: Array<{ key?: string; value?: string }>,
) {
  const variables: Record<string, unknown> = {}

  for (const row of rows) {
    if (row.type === "boolean") {
      if (row.booleanValue || row.required || row.includeBooleanValue) {
        variables[row.key] = row.booleanValue
      }
      continue
    }

    const parsed = parseLooseValue(row.value ?? "")
    if (parsed !== undefined) variables[row.key] = parsed
  }

  for (const entry of additional) {
    const key = entry.key?.trim()
    if (!key) continue
    const parsed = parseLooseValue(entry.value ?? "")
    if (parsed !== undefined) variables[key] = parsed
  }

  return Object.keys(variables).length ? variables : undefined
}

export function clearedOptionalValue(value: string | undefined, isEditing: boolean) {
  const trimmed = value?.trim()
  if (trimmed) return trimmed
  return isEditing ? null : undefined
}

export function parseBooleanFormValue(value: string | undefined) {
  const parsed = parseLooseValue(value ?? "")
  return typeof parsed === "boolean" ? parsed : undefined
}

export function inferTemplateVariableKeys(body: string | null | undefined, requiredKeys: string[]) {
  if (!body) return new Set(requiredKeys)
  const detected = new Set(requiredKeys)
  const variablePattern = /\{\{\s*([a-zA-Z0-9_.[\]]+)\s*\}\}/g

  for (const match of body.matchAll(variablePattern)) {
    if (match[1]) detected.add(match[1])
  }

  return detected
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  loadingLabel,
  loading,
  disabled,
  onSearchChange,
}: {
  value: string | null | undefined
  onChange: (value: string | null) => void
  options: ComboboxOption[]
  placeholder: string
  searchPlaceholder?: string
  emptyLabel: string
  loadingLabel: string
  loading?: boolean
  disabled?: boolean
  onSearchChange?: (value: string) => void
}) {
  const optionMap = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options],
  )
  const selected = value ? optionMap.get(value) : undefined
  const selectedLabel = selected?.label ?? ""
  const [inputValue, setInputValue] = useState(selectedLabel)

  useEffect(() => {
    setInputValue(selectedLabel)
  }, [selectedLabel])

  return (
    <Combobox
      items={options.map((option) => option.value)}
      value={value ?? null}
      inputValue={inputValue}
      autoHighlight
      disabled={disabled}
      // base-ui matches the typed query against the item's *label* string, and
      // filters everything out when it is left to stringify the raw id.
      itemToStringLabel={(id) => optionMap.get(id as string)?.label ?? ""}
      itemToStringValue={(id) => optionMap.get(id as string)?.label ?? ""}
      onInputValueChange={(next) => {
        setInputValue(next)
        onSearchChange?.(next)
        if (!next) onChange(null)
      }}
      onValueChange={(next) => {
        const resolved = (next as string | null) ?? null
        onChange(resolved)
        setInputValue(resolved ? (optionMap.get(resolved)?.label ?? "") : "")
      }}
    >
      <ComboboxInput
        placeholder={searchPlaceholder ?? placeholder}
        showClear={!!value}
        disabled={disabled}
      />
      <ComboboxContent>
        <ComboboxEmpty>{loading ? loadingLabel : emptyLabel}</ComboboxEmpty>
        <ComboboxList>
          <ComboboxCollection>
            {(id) => {
              const option = optionMap.get(id as string)
              if (!option) return null
              return (
                <ComboboxItem key={option.value} value={option.value}>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{option.label}</span>
                    {option.description ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
                  </div>
                </ComboboxItem>
              )
            }}
          </ComboboxCollection>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export function VariableValueField({
  row,
  index,
  setValue,
  watch,
  messages,
}: {
  row: TemplateVariableRow
  index: number
  setValue: UseFormSetValue<FormValues>
  watch: UseFormWatch<FormValues>
  messages: ContractDialogMessages
}) {
  const valuePath = `templateVariables.${index}.value` as const
  const booleanPath = `templateVariables.${index}.booleanValue` as const
  const includeBooleanPath = `templateVariables.${index}.includeBooleanValue` as const

  if (row.type === "boolean") {
    return (
      <div className="flex min-h-10 items-center rounded-md border border-input px-3 text-sm">
        <div className="flex items-center gap-2">
          <Switch
            aria-label={row.label}
            checked={watch(booleanPath)}
            onCheckedChange={(checked) => {
              setValue(booleanPath, checked, {
                shouldDirty: true,
                shouldValidate: true,
              })
              setValue(includeBooleanPath, true, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }}
          />
          <span>{watch(booleanPath) ? messages.booleanYes : messages.booleanNo}</span>
        </div>
      </div>
    )
  }

  if (row.type === "datetime") {
    return (
      <DateTimePicker
        value={watch(valuePath) || null}
        onChange={(next) =>
          setValue(valuePath, next ?? "", {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
        placeholder={row.example || messages.datetimeFallbackPlaceholder}
        className="w-full"
      />
    )
  }

  if (row.type === "date") {
    return (
      <DatePicker
        value={watch(valuePath) || null}
        onChange={(next) =>
          setValue(valuePath, next ?? "", {
            shouldDirty: true,
            shouldValidate: true,
          })
        }
        placeholder={row.example || messages.dateFallbackPlaceholder}
        className="w-full"
      />
    )
  }

  const inputType =
    row.type === "email"
      ? "email"
      : row.type === "url"
        ? "url"
        : row.type === "phone"
          ? "tel"
          : row.type === "number"
            ? "number"
            : "text"

  return (
    <Input
      type={inputType}
      step={row.type === "number" ? "1" : undefined}
      value={watch(valuePath) || ""}
      onChange={(event) =>
        setValue(valuePath, event.target.value, {
          shouldDirty: true,
          shouldValidate: true,
        })
      }
      placeholder={row.example || messages.valueFallbackPlaceholder}
    />
  )
}

export function LinkedRecordField({
  label,
  value,
  scope,
  onChange,
  renderPicker,
}: {
  label: string
  value: string | null
  scope: LegalContractScope
  onChange: (id: string | undefined) => void
  renderPicker?: (props: LinkedRecordPickerProps) => ReactNode
}) {
  if (!renderPicker) return null

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {renderPicker({
        value: value ?? undefined,
        onChange,
        scope,
      })}
    </div>
  )
}
