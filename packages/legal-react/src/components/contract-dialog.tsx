// agent-quality: file-size exception -- owner: legal-react; #1730 extracted dialog schema/field helpers, while the remaining dialog shell still coordinates template, series, and variable form state.
"use client"

import { useQuery } from "@tanstack/react-query"
import { formatMessage } from "@voyant-travel/i18n"
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@voyant-travel/ui/components"
import { DateTimePicker } from "@voyant-travel/ui/components/date-time-picker"
import { zodResolver } from "@voyant-travel/ui/lib/zod-resolver"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { useLegalUiMessagesOrDefault } from "../i18n/index.js"
import { legalContractScopes } from "../i18n/messages.js"
import {
  fetchWithValidation,
  legalContractTemplateVersionRecordSchema,
  singleEnvelope,
  useLegalContractMutation,
  useLegalContractNumberSeries,
  useLegalContractTemplate,
  useLegalContractTemplateAuthoring,
  useLegalContractTemplates,
  useLegalContractTemplateVersions,
  useVoyantLegalContext,
} from "../index.js"

import {
  buildRecordFromPairs,
  buildVariablesPayload,
  type ContractDialogProps,
  clearedOptionalValue,
  contractFormSchema,
  type FormOutput,
  type FormValues,
  inferTemplateVariableKeys,
  LinkedRecordField,
  languageOptions,
  mergeUniqueOptions,
  objectToEntries,
  parseBooleanFormValue,
  SearchableSelect,
  type TemplateVariableRow,
  VariableValueField,
} from "./contract-dialog-fields.js"

export type { ContractDialogProps, LinkedRecordPickerProps } from "./contract-dialog-fields.js"
export {
  buildRecordFromPairs,
  buildVariablesPayload,
  clearedOptionalValue,
} from "./contract-dialog-fields.js"

export function ContractDialog({
  open,
  onOpenChange,
  contract,
  onSuccess,
  renderPersonPicker,
  renderOrganizationPicker,
  renderSupplierPicker,
  renderChannelPicker,
}: ContractDialogProps) {
  const isEditing = !!contract
  const messages = useLegalUiMessagesOrDefault()
  const t = messages.contractDialog
  const { baseUrl, fetcher } = useVoyantLegalContext()
  const { create, update } = useLegalContractMutation()
  const { variableCatalog } = useLegalContractTemplateAuthoring()
  const hasLinkedRecordPicker = Boolean(
    renderPersonPicker || renderOrganizationPicker || renderSupplierPicker || renderChannelPicker,
  )

  const validationByCode: Record<string, string> = {
    titleRequired: t.validation.titleRequired,
  }
  const resolveValidation = (code: string | undefined) =>
    (code && validationByCode[code]) || code || ""

  const [templateSearch, setTemplateSearch] = useState("")
  const [templateId, setTemplateId] = useState<string | null>(null)
  const syncedTemplateVariablesSignatureRef = useRef("")

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: {
      scope: "customer",
      title: "",
      contractNumber: "",
      language: "en",
      templateVersionId: "",
      seriesId: "",
      personId: "",
      organizationId: "",
      supplierId: "",
      channelId: "",
      expiresAt: "",
      templateVariables: [],
      additionalVariables: [],
      metadataEntries: [],
    },
  })

  const templateVariablesFieldArray = useFieldArray({
    control: form.control,
    name: "templateVariables",
  })
  const additionalVariablesFieldArray = useFieldArray({
    control: form.control,
    name: "additionalVariables",
  })
  const metadataEntriesFieldArray = useFieldArray({
    control: form.control,
    name: "metadataEntries",
  })

  const selectedScope = form.watch("scope")
  const selectedLanguage = form.watch("language") || "en"
  const selectedTemplateVersionId = form.watch("templateVersionId") || null
  const selectedSeriesId = form.watch("seriesId") || null
  const selectedPersonId = form.watch("personId") || null
  const selectedOrganizationId = form.watch("organizationId") || null
  const selectedSupplierId = form.watch("supplierId") || null
  const selectedChannelId = form.watch("channelId") || null

  const templateListQuery = useLegalContractTemplates({
    search: templateSearch || undefined,
    scope: selectedScope,
    limit: 25,
    offset: 0,
    enabled: open,
  })
  const selectedTemplateQuery = useLegalContractTemplate(templateId ?? "", {
    enabled: open && !!templateId,
  })
  const templateVersionsQuery = useLegalContractTemplateVersions({
    templateId: templateId ?? "",
    enabled: open && !!templateId,
  })
  const selectedTemplateVersionQuery = useQuery({
    queryKey: ["legal", "template-version", selectedTemplateVersionId],
    enabled: open && !!selectedTemplateVersionId,
    queryFn: async () => {
      const { data } = await fetchWithValidation(
        `/v1/admin/legal/contracts/template-versions/${selectedTemplateVersionId}`,
        singleEnvelope(legalContractTemplateVersionRecordSchema),
        { baseUrl, fetcher },
      )
      return data
    },
  })

  const numberSeriesQuery = useLegalContractNumberSeries({ enabled: open })

  useEffect(() => {
    if (!open) {
      setTemplateSearch("")
      setTemplateId(null)
      syncedTemplateVariablesSignatureRef.current = ""
      return
    }

    if (contract) {
      form.reset({
        scope: contract.scope,
        title: contract.title,
        contractNumber: contract.contractNumber ?? "",
        language: contract.language ?? "en",
        templateVersionId: contract.templateVersionId ?? "",
        seriesId: contract.seriesId ?? "",
        personId: contract.personId ?? "",
        organizationId: contract.organizationId ?? "",
        supplierId: contract.supplierId ?? "",
        channelId: contract.channelId ?? "",
        expiresAt: contract.expiresAt ?? "",
        templateVariables: [],
        additionalVariables: objectToEntries(contract.variables),
        metadataEntries: objectToEntries(contract.metadata),
      })
    } else {
      form.reset({
        scope: "customer",
        title: "",
        contractNumber: "",
        language: "en",
        templateVersionId: "",
        seriesId: "",
        personId: "",
        organizationId: "",
        supplierId: "",
        channelId: "",
        expiresAt: "",
        templateVariables: [],
        additionalVariables: [],
        metadataEntries: [],
      })
    }
  }, [open, contract, form])

  useEffect(() => {
    if (!open) return
    if (selectedTemplateVersionQuery.data?.templateId) {
      setTemplateId((current) => current ?? selectedTemplateVersionQuery.data?.templateId ?? null)
    }
  }, [open, selectedTemplateVersionQuery.data])

  const templateOptions = useMemo(() => {
    const listOptions =
      templateListQuery.data?.data.map((template) => ({
        value: template.id,
        label: template.name,
        description: `${template.slug} - ${template.language} - ${template.scope}`,
      })) ?? []
    const selectedOption = selectedTemplateQuery.data
      ? [
          {
            value: selectedTemplateQuery.data.id,
            label: selectedTemplateQuery.data.name,
            description: `${selectedTemplateQuery.data.slug} - ${selectedTemplateQuery.data.language} - ${selectedTemplateQuery.data.scope}`,
          },
        ]
      : []
    return mergeUniqueOptions(listOptions, selectedOption)
  }, [templateListQuery.data?.data, selectedTemplateQuery.data])

  const templateVersionOptions = useMemo(() => {
    const listedOptions =
      templateVersionsQuery.data?.map((version) => ({
        value: version.id,
        label: formatMessage(t.templateVersionLabelFormat, { version: version.version }),
        description: version.changelog || t.templateVersionMostRecentDraft,
      })) ?? []
    const selectedOption = selectedTemplateVersionQuery.data
      ? [
          {
            value: selectedTemplateVersionQuery.data.id,
            label: formatMessage(t.templateVersionLabelFormat, {
              version: selectedTemplateVersionQuery.data.version,
            }),
            description:
              selectedTemplateVersionQuery.data.changelog || t.templateVersionSelectedFallback,
          },
        ]
      : []
    return mergeUniqueOptions(listedOptions, selectedOption)
  }, [
    selectedTemplateVersionQuery.data,
    t.templateVersionLabelFormat,
    t.templateVersionMostRecentDraft,
    t.templateVersionSelectedFallback,
    templateVersionsQuery.data,
  ])

  const seriesOptions = useMemo(() => {
    return (
      numberSeriesQuery.data?.data
        .filter((series) => series.scope === selectedScope)
        .map((series) => ({
          value: series.id,
          label: `${series.name} - ${series.prefix}${series.separator || ""}${String(
            (series.currentSequence ?? 0) + 1,
          ).padStart(series.padLength, "0")}`,
          description: `${series.scope} - ${series.active ? t.seriesActive : t.seriesInactive}`,
        })) ?? []
    )
  }, [numberSeriesQuery.data, selectedScope, t.seriesActive, t.seriesInactive])

  const flattenedVariableCatalog = useMemo(() => {
    return variableCatalog.flatMap((group) =>
      group.variables.map((variable) => ({
        ...variable,
        groupLabel: group.label,
      })),
    )
  }, [variableCatalog])

  const selectedTemplateVersion = selectedTemplateVersionQuery.data
  const inferredTemplateVariableRows = useMemo(() => {
    if (!selectedTemplateVersion) return []

    const requiredKeys = Array.isArray(selectedTemplateVersion.variableSchema?.required)
      ? (selectedTemplateVersion.variableSchema.required as string[])
      : []
    const detectedKeys = inferTemplateVariableKeys(selectedTemplateVersion.body, requiredKeys)

    return flattenedVariableCatalog
      .filter((variable) => detectedKeys.has(variable.key))
      .map((variable) => ({
        key: variable.key,
        label: variable.label,
        type: variable.type,
        description: variable.description || variable.groupLabel,
        example: String(variable.example),
        required: requiredKeys.includes(variable.key),
        value: "",
        booleanValue: false,
        includeBooleanValue: false,
      }))
  }, [flattenedVariableCatalog, selectedTemplateVersion])

  const templateVariablesSignature = useMemo(
    () =>
      `${selectedTemplateVersionId ?? "none"}:${inferredTemplateVariableRows.map((row) => row.key).join("|")}`,
    [inferredTemplateVariableRows, selectedTemplateVersionId],
  )

  useEffect(() => {
    if (!open) return
    if (syncedTemplateVariablesSignatureRef.current === templateVariablesSignature) return

    const existingTemplateRows = form.getValues("templateVariables")
    const existingAdditionalRows = form.getValues("additionalVariables")
    const currentValues = new Map<
      string,
      { value?: string; booleanValue?: boolean; includeBooleanValue?: boolean }
    >()

    for (const row of existingTemplateRows) {
      currentValues.set(row.key, {
        value: row.value,
        booleanValue: row.booleanValue,
        includeBooleanValue: row.includeBooleanValue,
      })
    }
    for (const row of existingAdditionalRows) {
      const key = row.key?.trim()
      if (!key) continue
      const booleanValue = parseBooleanFormValue(row.value)
      currentValues.set(key, {
        value: row.value,
        booleanValue,
        includeBooleanValue: booleanValue !== undefined,
      })
    }

    const knownKeys = new Set(inferredTemplateVariableRows.map((row) => row.key))
    const nextTemplateRows = inferredTemplateVariableRows.map((row) => {
      const existing = currentValues.get(row.key)
      return {
        ...row,
        value: typeof existing?.value === "string" ? existing.value : "",
        booleanValue: typeof existing?.booleanValue === "boolean" ? existing.booleanValue : false,
        includeBooleanValue: row.required || existing?.includeBooleanValue === true,
      }
    })

    const nextAdditionalRows = [
      ...existingAdditionalRows.filter((row) => {
        const key = row.key?.trim()
        return key && !knownKeys.has(key)
      }),
      ...existingTemplateRows
        .filter((row) => !knownKeys.has(row.key))
        .map((row) => ({
          key: row.key,
          value: row.type === "boolean" ? String(row.booleanValue) : row.value,
        })),
    ]

    templateVariablesFieldArray.replace(nextTemplateRows)
    additionalVariablesFieldArray.replace(
      nextAdditionalRows.filter(
        (row, index, rows) =>
          rows.findIndex(
            (candidate) => candidate.key === row.key && candidate.value === row.value,
          ) === index,
      ),
    )
    syncedTemplateVariablesSignatureRef.current = templateVariablesSignature
  }, [
    additionalVariablesFieldArray,
    form,
    inferredTemplateVariableRows,
    open,
    templateVariablesSignature,
    templateVariablesFieldArray,
  ])

  const setLinkedRecordField = (
    field: "personId" | "organizationId" | "supplierId" | "channelId",
    value: string | undefined,
  ) =>
    form.setValue(field, value ?? "", {
      shouldDirty: true,
      shouldValidate: true,
    })

  const onSubmit = async (values: FormOutput) => {
    const variables = buildVariablesPayload(values.templateVariables, values.additionalVariables)
    const metadata = buildRecordFromPairs(values.metadataEntries)
    const payload = {
      scope: values.scope,
      title: values.title,
      contractNumber: values.contractNumber?.trim() || null,
      language: values.language || "en",
      templateVersionId: clearedOptionalValue(values.templateVersionId, isEditing),
      seriesId: clearedOptionalValue(values.seriesId, isEditing),
      personId: clearedOptionalValue(values.personId, isEditing),
      organizationId: clearedOptionalValue(values.organizationId, isEditing),
      supplierId: clearedOptionalValue(values.supplierId, isEditing),
      channelId: clearedOptionalValue(values.channelId, isEditing),
      expiresAt: clearedOptionalValue(values.expiresAt, isEditing),
      variables: variables ?? (isEditing ? null : undefined),
      metadata: metadata ?? (isEditing ? null : undefined),
    }

    if (isEditing && contract) {
      await update.mutateAsync({ id: contract.id, input: payload })
    } else {
      await create.mutateAsync(payload)
    }
    onSuccess()
  }

  const isSubmitting = form.formState.isSubmitting || create.isPending || update.isPending
  const submitError = create.error ?? update.error ?? null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        size="xl"
        className="h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)]"
      >
        <SheetHeader>
          <SheetTitle>{isEditing ? t.titleEdit : t.titleNew}</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <SheetBody className="grid gap-6">
            <div className="grid gap-4">
              <div>
                <h3 className="text-sm font-semibold">{t.setupSectionTitle}</h3>
                <p className="text-sm text-muted-foreground">{t.setupSectionDescription}</p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label>{t.scopeLabel}</Label>
                  <Select
                    items={legalContractScopes.map((value) => ({
                      value,
                      label: messages.common.contractScopeLabels[value],
                    }))}
                    value={selectedScope}
                    onValueChange={(value) =>
                      form.setValue("scope", value as FormValues["scope"], {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {legalContractScopes.map((value) => (
                        <SelectItem key={value} value={value}>
                          {messages.common.contractScopeLabels[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label>{t.languageLabel}</Label>
                  <SearchableSelect
                    value={selectedLanguage}
                    onChange={(value) =>
                      form.setValue("language", value ?? "en", {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    options={languageOptions}
                    placeholder={t.languagePlaceholder}
                    searchPlaceholder={t.languageSearchPlaceholder}
                    emptyLabel={t.languageEmpty}
                    loadingLabel={t.loading}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>{t.titleLabel}</Label>
                <Input {...form.register("title")} placeholder={t.titlePlaceholder} />
                {form.formState.errors.title ? (
                  <p className="text-xs text-destructive">
                    {resolveValidation(form.formState.errors.title.message)}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label>{t.contractNumberLabel}</Label>
                  <Input
                    {...form.register("contractNumber")}
                    placeholder={t.contractNumberPlaceholder}
                    maxLength={100}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label>{t.expiresAtLabel}</Label>
                  <DateTimePicker
                    value={form.watch("expiresAt") || null}
                    onChange={(next) =>
                      form.setValue("expiresAt", next ?? "", {
                        shouldValidate: true,
                        shouldDirty: true,
                      })
                    }
                    placeholder={t.expiresAtPlaceholder}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label>{t.templateLabel}</Label>
                  <SearchableSelect
                    value={templateId}
                    onChange={(value) => {
                      setTemplateId(value)
                      form.setValue("templateVersionId", "", {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                      syncedTemplateVariablesSignatureRef.current = ""
                    }}
                    options={templateOptions}
                    placeholder={t.templatePlaceholder}
                    searchPlaceholder={t.templateSearchPlaceholder}
                    emptyLabel={t.templateEmpty}
                    loading={templateListQuery.isLoading || selectedTemplateQuery.isLoading}
                    onSearchChange={setTemplateSearch}
                    loadingLabel={t.loading}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label>{t.templateVersionLabel}</Label>
                  <SearchableSelect
                    value={selectedTemplateVersionId}
                    onChange={(value) => {
                      form.setValue("templateVersionId", value ?? "", {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                      syncedTemplateVariablesSignatureRef.current = ""
                    }}
                    options={templateVersionOptions}
                    placeholder={t.templateVersionPlaceholder}
                    searchPlaceholder={t.templateVersionSearchPlaceholder}
                    emptyLabel={
                      templateId ? t.templateVersionEmpty : t.templateVersionPickTemplateFirst
                    }
                    loading={
                      templateVersionsQuery.isLoading || selectedTemplateVersionQuery.isLoading
                    }
                    disabled={!templateId}
                    loadingLabel={t.loading}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label>{t.numberSeriesLabel}</Label>
                <SearchableSelect
                  value={selectedSeriesId}
                  onChange={(value) =>
                    form.setValue("seriesId", value ?? "", {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  options={seriesOptions}
                  placeholder={t.numberSeriesPlaceholder}
                  searchPlaceholder={t.numberSeriesSearchPlaceholder}
                  emptyLabel={t.numberSeriesEmpty}
                  loading={numberSeriesQuery.isLoading}
                  loadingLabel={t.loading}
                />
              </div>
            </div>

            {hasLinkedRecordPicker ? (
              <div className="grid gap-4">
                <div>
                  <h3 className="text-sm font-semibold">{t.linkedSectionTitle}</h3>
                  <p className="text-sm text-muted-foreground">{t.linkedSectionDescription}</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <LinkedRecordField
                    label={t.personLabel}
                    value={selectedPersonId}
                    scope={selectedScope}
                    onChange={(value) => setLinkedRecordField("personId", value)}
                    renderPicker={renderPersonPicker}
                  />
                  <LinkedRecordField
                    label={t.organizationLabel}
                    value={selectedOrganizationId}
                    scope={selectedScope}
                    onChange={(value) => setLinkedRecordField("organizationId", value)}
                    renderPicker={renderOrganizationPicker}
                  />
                  <LinkedRecordField
                    label={t.supplierLabel}
                    value={selectedSupplierId}
                    scope={selectedScope}
                    onChange={(value) => setLinkedRecordField("supplierId", value)}
                    renderPicker={renderSupplierPicker}
                  />
                  <LinkedRecordField
                    label={t.channelLabel}
                    value={selectedChannelId}
                    scope={selectedScope}
                    onChange={(value) => setLinkedRecordField("channelId", value)}
                    renderPicker={renderChannelPicker}
                  />
                </div>
              </div>
            ) : null}

            <div className="grid gap-4">
              <h3 className="text-sm font-semibold">{t.templateVariablesSectionTitle}</h3>

              {!selectedTemplateVersionId ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  {t.templateVariablesNoVersion}
                </div>
              ) : templateVariablesFieldArray.fields.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  {t.templateVariablesNoneDetected}
                </div>
              ) : (
                <div className="grid gap-4">
                  {templateVariablesFieldArray.fields.map((field, index) => (
                    <div key={field.id} className="grid gap-2 rounded-md border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">
                            {field.label}
                            {field.required ? (
                              <span className="ml-1 text-destructive">*</span>
                            ) : null}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">{field.key}</div>
                        </div>
                        {field.description ? (
                          <div className="max-w-sm text-right text-xs text-muted-foreground">
                            {field.description}
                          </div>
                        ) : null}
                      </div>
                      <VariableValueField
                        row={field as TemplateVariableRow}
                        index={index}
                        setValue={form.setValue}
                        watch={form.watch}
                        messages={t}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="grid gap-3 rounded-md border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-medium">{t.additionalVariablesTitle}</h4>
                    <p className="text-xs text-muted-foreground">
                      {t.additionalVariablesDescription}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => additionalVariablesFieldArray.append({ key: "", value: "" })}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t.addVariable}
                  </Button>
                </div>

                {additionalVariablesFieldArray.fields.length === 0 ? (
                  <div className="text-sm text-muted-foreground">{t.additionalVariablesEmpty}</div>
                ) : (
                  <div className="grid gap-3">
                    {additionalVariablesFieldArray.fields.map((field, index) => (
                      <div key={field.id} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                        <Input
                          {...form.register(`additionalVariables.${index}.key`)}
                          placeholder={t.variableKeyPlaceholder}
                        />
                        <Input
                          {...form.register(`additionalVariables.${index}.value`)}
                          placeholder={t.variableValuePlaceholder}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => additionalVariablesFieldArray.remove(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3 rounded-md border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">{t.metadataSectionTitle}</h3>
                  <p className="text-sm text-muted-foreground">{t.metadataSectionDescription}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => metadataEntriesFieldArray.append({ key: "", value: "" })}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t.addMetadata}
                </Button>
              </div>

              {metadataEntriesFieldArray.fields.length === 0 ? (
                <div className="text-sm text-muted-foreground">{t.metadataEmpty}</div>
              ) : (
                <div className="grid gap-3">
                  {metadataEntriesFieldArray.fields.map((field, index) => (
                    <div key={field.id} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                      <Input
                        {...form.register(`metadataEntries.${index}.key`)}
                        placeholder={t.metadataKeyPlaceholder}
                      />
                      <Input
                        {...form.register(`metadataEntries.${index}.value`)}
                        placeholder={t.metadataValuePlaceholder}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => metadataEntriesFieldArray.remove(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {submitError ? <p className="text-xs text-destructive">{submitError.message}</p> : null}
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {messages.common.cancel}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isEditing ? messages.common.saveChanges : t.createAction}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
