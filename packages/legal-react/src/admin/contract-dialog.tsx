// agent-quality: file-size exception -- owner: legal-react; #1730 extracted dialog schema/field helpers and attachment dropzone, while the remaining admin shell coordinates related record searches.
"use client"

import { useQuery } from "@tanstack/react-query"
import { useOperatorAdminMessages } from "@voyant-travel/admin"
import { useChannel, useChannels } from "@voyant-travel/distribution-react"
import { useSupplier, useSuppliers } from "@voyant-travel/distribution-react/suppliers"
import { formatMessage } from "@voyant-travel/i18n"
import {
  useOrganization,
  useOrganizations,
  usePeople,
  usePerson,
} from "@voyant-travel/relationships-react"
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
import {
  fetchWithValidation,
  type LegalContractRecord,
  legalContractTemplateVersionRecordSchema,
  singleEnvelope,
  useLegalContractAttachmentMutation,
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
  type ContractScopeKey,
  contractFormSchema,
  type FormOutput,
  type FormValues,
  inferTemplateVariableKeys,
  languageOptions,
  objectToEntries,
  SCOPE_VALUES,
  type TemplateVariableRow,
  VariableValueField,
} from "./contract-dialog-fields.js"
import { ContractUploadField } from "./contract-upload-field.js"
import { CHANNEL_PAGE_LIMIT, mergeUniqueOptions, SearchableSelect } from "./legal-admin-shared.js"

export type { ContractDialogProps } from "./contract-dialog-fields.js"

export function ContractDialog({ open, onOpenChange, contract, onSuccess }: ContractDialogProps) {
  const isEditing = !!contract
  const t = useOperatorAdminMessages().legal.contractDialog
  const legalClient = useVoyantLegalContext()
  const { create, update } = useLegalContractMutation()
  const { upload } = useLegalContractAttachmentMutation()
  const { variableCatalog } = useLegalContractTemplateAuthoring()

  const validationByCode: Record<string, string> = {
    titleRequired: t.validation.titleRequired,
  }
  const resolveValidation = (code: string | undefined) =>
    (code && validationByCode[code]) || code || ""

  const [templateSearch, setTemplateSearch] = useState("")
  const [personSearch, setPersonSearch] = useState("")
  const [organizationSearch, setOrganizationSearch] = useState("")
  const [supplierSearch, setSupplierSearch] = useState("")
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const syncedTemplateVariablesSignatureRef = useRef("")
  const fileInputRef = useRef<HTMLInputElement>(null)

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
        legalClient,
      )
      return data
    },
  })

  const numberSeriesQuery = useLegalContractNumberSeries({ enabled: open })
  const peopleQuery = usePeople({
    search: personSearch || undefined,
    limit: 25,
    enabled: open,
  })
  const selectedPersonQuery = usePerson(selectedPersonId ?? undefined, {
    enabled: open && !!selectedPersonId,
  })
  const organizationsQuery = useOrganizations({
    search: organizationSearch || undefined,
    limit: 25,
    enabled: open,
  })
  const selectedOrganizationQuery = useOrganization(selectedOrganizationId ?? undefined, {
    enabled: open && !!selectedOrganizationId,
  })
  const suppliersQuery = useSuppliers({
    search: supplierSearch || undefined,
    limit: 25,
    enabled: open,
  })
  const selectedSupplierQuery = useSupplier(selectedSupplierId ?? "", {
    enabled: open && !!selectedSupplierId,
  })
  const channelsQuery = useChannels({ limit: CHANNEL_PAGE_LIMIT, enabled: open })
  const selectedChannelQuery = useChannel(selectedChannelId, {
    enabled: open && !!selectedChannelId,
  })

  useEffect(() => {
    if (!open) {
      setTemplateSearch("")
      setPersonSearch("")
      setOrganizationSearch("")
      setSupplierSearch("")
      setTemplateId(null)
      setSelectedFile(null)
      setIsDraggingFile(false)
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
      setSelectedFile(null)
      setIsDraggingFile(false)
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
        description: `${template.slug} · ${template.language} · ${template.scope}`,
      })) ?? []
    const selectedOption = selectedTemplateQuery.data
      ? [
          {
            value: selectedTemplateQuery.data.id,
            label: selectedTemplateQuery.data.name,
            description: `${selectedTemplateQuery.data.slug} · ${selectedTemplateQuery.data.language} · ${selectedTemplateQuery.data.scope}`,
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
          label: `${series.name} · ${series.prefix}${series.separator || ""}${String(
            (series.currentSequence ?? 0) + 1,
          ).padStart(series.padLength, "0")}`,
          description: `${series.scope} · ${series.active ? t.seriesActive : t.seriesInactive}`,
        })) ?? []
    )
  }, [numberSeriesQuery.data, selectedScope, t.seriesActive, t.seriesInactive])

  const personOptions = useMemo(() => {
    const listOptions =
      peopleQuery.data?.data.map((person) => ({
        value: person.id,
        label: `${person.firstName} ${person.lastName}`.trim(),
        description: person.email || person.phone || person.id,
      })) ?? []
    const selectedOption = selectedPersonQuery.data
      ? [
          {
            value: selectedPersonQuery.data.id,
            label:
              `${selectedPersonQuery.data.firstName} ${selectedPersonQuery.data.lastName}`.trim(),
            description:
              selectedPersonQuery.data.email ||
              selectedPersonQuery.data.phone ||
              selectedPersonQuery.data.id,
          },
        ]
      : []
    return mergeUniqueOptions(listOptions, selectedOption)
  }, [peopleQuery.data?.data, selectedPersonQuery.data])

  const organizationOptions = useMemo(() => {
    const listOptions =
      organizationsQuery.data?.data.map((organization) => ({
        value: organization.id,
        label: organization.name,
        description: organization.website || organization.legalName || organization.id,
      })) ?? []
    const selectedOption = selectedOrganizationQuery.data
      ? [
          {
            value: selectedOrganizationQuery.data.id,
            label: selectedOrganizationQuery.data.name,
            description:
              selectedOrganizationQuery.data.website ??
              selectedOrganizationQuery.data.legalName ??
              selectedOrganizationQuery.data.id,
          },
        ]
      : []
    return mergeUniqueOptions(listOptions, selectedOption)
  }, [organizationsQuery.data?.data, selectedOrganizationQuery.data])

  const supplierOptions = useMemo(() => {
    const listOptions =
      suppliersQuery.data?.data.map((supplier) => ({
        value: supplier.id,
        label: supplier.name,
        description: [supplier.type, supplier.city, supplier.country].filter(Boolean).join(" · "),
      })) ?? []
    const selectedOption = selectedSupplierQuery.data
      ? [
          {
            value: selectedSupplierQuery.data.data.id,
            label: selectedSupplierQuery.data.data.name,
            description: [
              selectedSupplierQuery.data.data.type,
              selectedSupplierQuery.data.data.city,
              selectedSupplierQuery.data.data.country,
            ]
              .filter(Boolean)
              .join(" · "),
          },
        ]
      : []
    return mergeUniqueOptions(listOptions, selectedOption)
  }, [suppliersQuery.data?.data, selectedSupplierQuery.data])

  const channelOptions = useMemo(() => {
    const listOptions =
      channelsQuery.data?.data.map((channel) => ({
        value: channel.id,
        label: channel.name,
        description: [channel.kind, channel.status, channel.website].filter(Boolean).join(" · "),
      })) ?? []
    const selectedOption = selectedChannelQuery.data
      ? [
          {
            value: selectedChannelQuery.data.id,
            label: selectedChannelQuery.data.name,
            description: [
              selectedChannelQuery.data.kind,
              selectedChannelQuery.data.status,
              selectedChannelQuery.data.website,
            ]
              .filter(Boolean)
              .join(" · "),
          },
        ]
      : []
    return mergeUniqueOptions(listOptions, selectedOption)
  }, [channelsQuery.data?.data, selectedChannelQuery.data])

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
    const currentValues = new Map<string, { value?: string; booleanValue?: boolean }>()

    for (const row of existingTemplateRows) {
      currentValues.set(row.key, { value: row.value, booleanValue: row.booleanValue })
    }
    for (const row of existingAdditionalRows) {
      const key = row.key?.trim()
      if (!key) continue
      currentValues.set(key, { value: row.value })
    }

    const knownKeys = new Set(inferredTemplateVariableRows.map((row) => row.key))
    const nextTemplateRows = inferredTemplateVariableRows.map((row) => {
      const existing = currentValues.get(row.key)
      return {
        ...row,
        value: typeof existing?.value === "string" ? existing.value : "",
        booleanValue: typeof existing?.booleanValue === "boolean" ? existing.booleanValue : false,
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

  const onSubmit = async (values: FormOutput) => {
    const payload = {
      scope: values.scope,
      title: values.title,
      contractNumber: values.contractNumber?.trim() || null,
      language: values.language || "en",
      templateVersionId: values.templateVersionId || undefined,
      seriesId: values.seriesId || undefined,
      personId: values.personId || undefined,
      organizationId: values.organizationId || undefined,
      supplierId: values.supplierId || undefined,
      channelId: values.channelId || undefined,
      expiresAt: values.expiresAt || undefined,
      variables: buildVariablesPayload(values.templateVariables, values.additionalVariables),
      metadata: buildRecordFromPairs(values.metadataEntries),
    }

    let savedContract: LegalContractRecord
    if (isEditing && contract) {
      savedContract = await update.mutateAsync({ id: contract.id, input: payload })
    } else {
      savedContract = await create.mutateAsync(payload)
    }

    if (selectedFile) {
      await upload.mutateAsync({
        contractId: savedContract.id,
        input: {
          file: selectedFile,
          name: selectedFile.name,
          kind: "document",
        },
      })
    }
    onSuccess()
  }

  const onSelectedFile = (file: File) => {
    setSelectedFile(file)
    setIsDraggingFile(false)
  }

  const isSubmitting =
    form.formState.isSubmitting || create.isPending || update.isPending || upload.isPending
  const submitError = create.error ?? update.error ?? upload.error ?? null

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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>{t.scopeLabel}</Label>
                  <Select
                    items={SCOPE_VALUES.map((value) => ({
                      value,
                      label: t.scopeOptions[value],
                    }))}
                    value={selectedScope}
                    onValueChange={(value) => form.setValue("scope", value as FormValues["scope"])}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCOPE_VALUES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t.scopeOptions[value as ContractScopeKey]}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              <div className="grid gap-4">
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

                <ContractUploadField
                  label={t.attachmentLabel}
                  placeholder={t.attachmentPlaceholder}
                  selectedFile={selectedFile}
                  isDraggingFile={isDraggingFile}
                  fileInputRef={fileInputRef}
                  onSelectedFile={onSelectedFile}
                  onDraggingFileChange={setIsDraggingFile}
                />
              </div>
            </div>

            <div className="grid gap-4">
              <div>
                <h3 className="text-sm font-semibold">{t.linkedSectionTitle}</h3>
                <p className="text-sm text-muted-foreground">{t.linkedSectionDescription}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>{t.personLabel}</Label>
                  <SearchableSelect
                    value={selectedPersonId}
                    onChange={(value) =>
                      form.setValue("personId", value ?? "", {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    options={personOptions}
                    placeholder={t.personPlaceholder}
                    searchPlaceholder={t.personSearchPlaceholder}
                    emptyLabel={t.personEmpty}
                    loading={peopleQuery.isLoading || selectedPersonQuery.isLoading}
                    onSearchChange={setPersonSearch}
                    loadingLabel={t.loading}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label>{t.organizationLabel}</Label>
                  <SearchableSelect
                    value={selectedOrganizationId}
                    onChange={(value) =>
                      form.setValue("organizationId", value ?? "", {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    options={organizationOptions}
                    placeholder={t.organizationPlaceholder}
                    searchPlaceholder={t.organizationSearchPlaceholder}
                    emptyLabel={t.organizationEmpty}
                    loading={organizationsQuery.isLoading}
                    onSearchChange={setOrganizationSearch}
                    loadingLabel={t.loading}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label>{t.supplierLabel}</Label>
                  <SearchableSelect
                    value={selectedSupplierId}
                    onChange={(value) =>
                      form.setValue("supplierId", value ?? "", {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    options={supplierOptions}
                    placeholder={t.supplierPlaceholder}
                    searchPlaceholder={t.supplierSearchPlaceholder}
                    emptyLabel={t.supplierEmpty}
                    loading={suppliersQuery.isLoading || selectedSupplierQuery.isLoading}
                    onSearchChange={setSupplierSearch}
                    loadingLabel={t.loading}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label>{t.channelLabel}</Label>
                  <SearchableSelect
                    value={selectedChannelId}
                    onChange={(value) =>
                      form.setValue("channelId", value ?? "", {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    options={channelOptions}
                    placeholder={t.channelPlaceholder}
                    searchPlaceholder={t.channelSearchPlaceholder}
                    emptyLabel={t.channelEmpty}
                    loading={channelsQuery.isLoading || selectedChannelQuery.isLoading}
                    loadingLabel={t.loading}
                  />
                </div>
              </div>
            </div>

            {selectedTemplateVersionId || templateVariablesFieldArray.fields.length > 0 ? (
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
                            <div className="font-mono text-xs text-muted-foreground">
                              {field.key}
                            </div>
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
                  <div className="flex items-center justify-between">
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
                    <div className="text-sm text-muted-foreground">
                      {t.additionalVariablesEmpty}
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {additionalVariablesFieldArray.fields.map((field, index) => (
                        <div key={field.id} className="grid grid-cols-[1fr_1fr_auto] gap-3">
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
            ) : null}

            <div className="grid gap-3 rounded-md border p-4">
              <div className="flex items-center justify-between">
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
                    <div key={field.id} className="grid grid-cols-[1fr_1fr_auto] gap-3">
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
              {t.cancel}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isEditing ? t.saveChanges : t.createAction}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
