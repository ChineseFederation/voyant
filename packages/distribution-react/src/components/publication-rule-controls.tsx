"use client"

/**
 * Presentational controls shared by every publication rule tab.
 *
 * Product, supplier, and supply-source rules are the same interaction — pick a
 * subject, pick include/exclude, say why, optionally preview the blast radius
 * before committing — over three different subject types. Keeping the form,
 * the rule list, and the two comboboxes here lets each tab supply only its
 * subject options and mutation, and keeps `publication-sheet.tsx` from growing
 * a third near-identical copy.
 */

import {
  Badge,
  Button,
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  Label,
  Textarea,
} from "@voyant-travel/ui/components"
import { useEffect, useState } from "react"
import { useDistributionUiI18nOrDefault } from "../i18n/index.js"

export type PublicationDecision = "include" | "exclude"

export const defaultPublicationDecision: PublicationDecision = "include"
export const publicationDecisions: PublicationDecision[] = ["include", "exclude"]

/**
 * A publication subject as the controls need it: an opaque id plus something
 * to show. Products and suppliers use their record id; supply sources have no
 * single id, so their tab encodes `(sourceKind, sourceConnectionId)` into one.
 */
export type PublicationSubjectOption = { id: string; name?: string | null }

export function PublicationRuleForm({
  title,
  idPrefix,
  subjectLabel,
  subjectPlaceholder,
  subjects,
  subjectId,
  setSubjectId,
  decision,
  setDecision,
  reason,
  setReason,
  onSave,
  onPreview,
  previewResult,
  confirmationLabel,
  confirmed,
  setConfirmed,
  saveLabel,
  previewLabel,
  saveHelp,
  disabled,
  saveDisabled = false,
  previewDisabled = false,
}: {
  title: string
  idPrefix: string
  subjectLabel: string
  subjectPlaceholder: string
  subjects: PublicationSubjectOption[]
  subjectId: string
  setSubjectId: (value: string) => void
  decision: PublicationDecision
  setDecision: (value: PublicationDecision) => void
  reason: string
  setReason: (value: string) => void
  onSave: () => Promise<void>
  onPreview?: () => Promise<void>
  previewResult?: string | null
  confirmationLabel?: string | null
  confirmed?: boolean
  setConfirmed?: (value: boolean) => void
  saveLabel: string
  previewLabel?: string
  saveHelp?: string
  disabled: boolean
  saveDisabled?: boolean
  previewDisabled?: boolean
}) {
  const { messages } = useDistributionUiI18nOrDefault()
  const page = messages.settings.channelsPage.publication

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <OptionCombobox
          id={`${idPrefix}-subject`}
          label={subjectLabel}
          placeholder={subjectPlaceholder}
          value={subjectId}
          onChange={setSubjectId}
          options={subjects}
        />
        <DecisionCombobox
          id={`${idPrefix}-decision`}
          label={page.decisionLabel}
          value={decision}
          onChange={setDecision}
          includeLabel={page.include}
          excludeLabel={page.exclude}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-reason`}>{page.reasonLabel}</Label>
        <Textarea
          id={`${idPrefix}-reason`}
          value={reason}
          placeholder={page.reasonPlaceholder}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled || !subjectId || saveDisabled}
          onClick={() => void onSave()}
        >
          {saveLabel}
        </Button>
        {onPreview && previewLabel ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!subjectId || previewDisabled}
            onClick={() => void onPreview()}
          >
            {previewLabel}
          </Button>
        ) : null}
        {previewResult ? (
          <span className="text-xs text-muted-foreground">{previewResult}</span>
        ) : null}
      </div>
      {confirmationLabel && setConfirmed ? (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={!!confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>{confirmationLabel}</span>
        </label>
      ) : null}
      {saveHelp ? <p className="text-xs text-muted-foreground">{saveHelp}</p> : null}
    </section>
  )
}

export function PublicationRuleList<
  TRule extends { id: string; decision: PublicationDecision; reason: string | null },
>({
  empty,
  rules,
  subjects,
  subjectKey,
  includeLabel,
  excludeLabel,
  noReason,
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
}: {
  empty: string
  rules: TRule[]
  subjects: PublicationSubjectOption[]
  subjectKey: keyof TRule
  includeLabel: string
  excludeLabel: string
  noReason: string
  onEdit: (rule: TRule) => void
  onDelete: (id: string) => Promise<unknown>
  editLabel: string
  deleteLabel: string
}) {
  if (rules.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>
  }

  return (
    <div className="space-y-2">
      {rules.map((rule) => {
        const subjectId = String(rule[subjectKey])
        const subject = subjects.find((entry) => entry.id === subjectId)
        return (
          <div
            key={rule.id}
            className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{subject?.name ?? subjectId}</span>
                <Badge variant={rule.decision === "include" ? "default" : "secondary"}>
                  {rule.decision === "include" ? includeLabel : excludeLabel}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{rule.reason ?? noReason}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button type="button" variant="outline" size="sm" onClick={() => onEdit(rule)}>
                {editLabel}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void onDelete(rule.id)}
              >
                {deleteLabel}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function OptionCombobox({
  id,
  label,
  placeholder,
  value,
  onChange,
  options,
}: {
  id: string
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  options: PublicationSubjectOption[]
}) {
  const selected = options.find((option) => option.id === value)
  const [inputValue, setInputValue] = useState(selected?.name ?? "")

  useEffect(() => {
    setInputValue(selected?.name ?? "")
  }, [selected?.name])

  const itemToStringLabel = (optionId: unknown) => {
    const option = options.find((entry) => entry.id === optionId)
    return option?.name ?? String(optionId ?? "")
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Combobox
        items={options.map((option) => option.id)}
        value={value}
        inputValue={inputValue}
        autoHighlight
        itemToStringLabel={itemToStringLabel}
        itemToStringValue={(optionId) => String(optionId ?? "")}
        onInputValueChange={(next) => {
          setInputValue(next)
          if (!next) onChange("")
        }}
        onValueChange={(next) => {
          const nextValue = (next as string | null) ?? ""
          onChange(nextValue)
          setInputValue(nextValue ? itemToStringLabel(nextValue) : "")
        }}
      >
        <ComboboxInput id={id} placeholder={placeholder} showClear={!!value} />
        <ComboboxContent>
          <ComboboxEmpty>{placeholder}</ComboboxEmpty>
          <ComboboxList>
            <ComboboxCollection>
              {(optionId) => {
                const option = options.find((entry) => entry.id === optionId)
                return option ? (
                  <ComboboxItem key={option.id} value={option.id}>
                    {option.name}
                  </ComboboxItem>
                ) : null
              }}
            </ComboboxCollection>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}

export function DecisionCombobox({
  id,
  label,
  value,
  onChange,
  includeLabel,
  excludeLabel,
}: {
  id: string
  label: string
  value: PublicationDecision
  onChange: (value: PublicationDecision) => void
  includeLabel: string
  excludeLabel: string
}) {
  const inputLabel = value === "include" ? includeLabel : excludeLabel
  const labelForDecision = (decision: PublicationDecision) =>
    decision === "include" ? includeLabel : excludeLabel
  const [inputValue, setInputValue] = useState(inputLabel)

  useEffect(() => {
    setInputValue(inputLabel)
  }, [inputLabel])

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Combobox
        items={publicationDecisions}
        value={value}
        inputValue={inputValue}
        autoHighlight
        itemToStringLabel={(decision) => labelForDecision(decision as PublicationDecision)}
        itemToStringValue={(decision) => String(decision)}
        onInputValueChange={setInputValue}
        onValueChange={(next) => {
          const decision = (next as PublicationDecision | null) ?? defaultPublicationDecision
          onChange(decision)
          setInputValue(labelForDecision(decision))
        }}
      >
        <ComboboxInput id={id} placeholder={label} />
        <ComboboxContent>
          <ComboboxList>
            <ComboboxCollection>
              {(decision) => (
                <ComboboxItem key={decision} value={decision}>
                  {labelForDecision(decision as PublicationDecision)}
                </ComboboxItem>
              )}
            </ComboboxCollection>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}
