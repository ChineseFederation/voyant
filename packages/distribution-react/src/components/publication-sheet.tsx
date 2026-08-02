"use client"

// agent-quality: file-size exception -- owner: distribution-react; publication rule forms, lists, and preview gating stay co-located until a split preserves the sheet workflow tests.
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
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@voyant-travel/ui/components"
import { useEffect, useState } from "react"
import { useDistributionUiI18nOrDefault } from "../i18n/index.js"
import type { ChannelRow, ProductOption, SupplierOption } from "../index.js"
import {
  useEffectivePublication,
  useProductPublications,
  useProducts,
  usePublicationMutation,
  useSupplierPublications,
  useSuppliers,
} from "../index.js"

type PublicationDecision = "include" | "exclude"

const defaultPublicationDecision: PublicationDecision = "include"
const publicationDecisions: PublicationDecision[] = ["include", "exclude"]

type SupplierPreview = {
  key: string
  affectedProductCount: number
}

export function PublicationSheet({
  open,
  onOpenChange,
  channel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  channel?: ChannelRow
}) {
  const { messages } = useDistributionUiI18nOrDefault()
  const page = messages.settings.channelsPage.publication
  const productsQuery = useProducts({ limit: 200, offset: 0, enabled: open })
  const suppliersQuery = useSuppliers({ limit: 200, offset: 0, enabled: open })
  const productRulesQuery = useProductPublications({
    channelId: channel?.id,
    limit: 200,
    offset: 0,
    enabled: open && !!channel,
  })
  const supplierRulesQuery = useSupplierPublications({
    channelId: channel?.id,
    limit: 200,
    offset: 0,
    enabled: open && !!channel,
  })
  const products = productsQuery.data?.data ?? []
  const suppliers = suppliersQuery.data?.data ?? []
  const productRules = productRulesQuery.data?.data ?? []
  const supplierRules = supplierRulesQuery.data?.data ?? []
  const publication = usePublicationMutation()
  const [productId, setProductId] = useState("")
  const [supplierId, setSupplierId] = useState("")
  const [productDecision, setProductDecision] = useState<PublicationDecision>(
    defaultPublicationDecision,
  )
  const [supplierDecision, setSupplierDecision] = useState<PublicationDecision>(
    defaultPublicationDecision,
  )
  const [productReason, setProductReason] = useState("")
  const [supplierReason, setSupplierReason] = useState("")
  const [inspectorProductId, setInspectorProductId] = useState("")
  const [inspectorSupplierId, setInspectorSupplierId] = useState("")
  const [supplierPreview, setSupplierPreview] = useState<SupplierPreview | null>(null)
  const [supplierPreviewConfirmed, setSupplierPreviewConfirmed] = useState(false)
  const effectiveQuery = useEffectivePublication({
    channelId: channel?.id,
    productId: inspectorProductId,
    canonicalSupplierId: inspectorSupplierId || undefined,
    enabled: open && !!channel && !!inspectorProductId,
  })

  useEffect(() => {
    if (!open) {
      setProductId("")
      setSupplierId("")
      setInspectorProductId("")
      setInspectorSupplierId("")
      setProductDecision(defaultPublicationDecision)
      setSupplierDecision(defaultPublicationDecision)
      setProductReason("")
      setSupplierReason("")
      setSupplierPreview(null)
      setSupplierPreviewConfirmed(false)
    }
  }, [open])

  const supplierPreviewKey = [
    channel?.id ?? "",
    supplierId,
    supplierDecision,
    supplierReason.trim(),
  ].join("|")
  const supplierPreviewIsFresh = supplierPreview?.key === supplierPreviewKey

  const updateSupplierId = (value: string) => {
    setSupplierId(value)
    setSupplierPreview(null)
    setSupplierPreviewConfirmed(false)
  }

  const updateSupplierDecision = (value: PublicationDecision) => {
    setSupplierDecision(value)
    setSupplierPreview(null)
    setSupplierPreviewConfirmed(false)
  }

  const updateSupplierReason = (value: string) => {
    setSupplierReason(value)
    setSupplierPreview(null)
    setSupplierPreviewConfirmed(false)
  }

  const saveProductRule = async () => {
    if (!channel || !productId) return
    await publication.upsertProduct.mutateAsync({
      channelId: channel.id,
      productId,
      decision: productDecision,
      reason: productReason.trim() || null,
    })
    setProductId("")
    setProductReason("")
    await productRulesQuery.refetch()
  }

  const saveSupplierRule = async () => {
    if (!channel || !supplierId || !supplierPreviewIsFresh || !supplierPreviewConfirmed) return
    await publication.upsertSupplier.mutateAsync({
      channelId: channel.id,
      supplierId,
      decision: supplierDecision,
      reason: supplierReason.trim() || null,
    })
    setSupplierId("")
    setSupplierReason("")
    setSupplierPreview(null)
    setSupplierPreviewConfirmed(false)
    await supplierRulesQuery.refetch()
  }

  const previewSupplierRule = async () => {
    if (!channel || !supplierId) return
    const result = await publication.previewSupplier.mutateAsync({
      channelId: channel.id,
      supplierId,
      decision: supplierDecision,
      reason: supplierReason.trim() || null,
    })
    setSupplierPreview({
      key: supplierPreviewKey,
      affectedProductCount: result.affectedProductCount,
    })
    setSupplierPreviewConfirmed(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="xl">
        <SheetHeader>
          <SheetTitle>
            {channel ? page.title.replace("{channel}", channel.name) : page.titleEmpty}
          </SheetTitle>
        </SheetHeader>
        <SheetBody className="space-y-6 overflow-y-auto">
          {channel?.status !== "active" ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {page.inactiveWarning}
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground">{page.defaultDeny}</p>
          <p className="text-xs text-muted-foreground">{page.precedence}</p>

          <Tabs defaultValue="products">
            <TabsList aria-label={page.titleEmpty}>
              <TabsTrigger value="products">{page.productsTitle}</TabsTrigger>
              <TabsTrigger value="suppliers">{page.suppliersTitle}</TabsTrigger>
            </TabsList>
            <TabsContent value="products" className="space-y-3">
              <PublicationRuleForm
                idPrefix="publication-product"
                title={page.productsTitle}
                subjectLabel={page.productLabel}
                subjectPlaceholder={page.productPlaceholder}
                subjects={products}
                subjectId={productId}
                setSubjectId={setProductId}
                decision={productDecision}
                setDecision={setProductDecision}
                reason={productReason}
                setReason={setProductReason}
                onSave={saveProductRule}
                saveLabel={page.saveProduct}
                disabled={!channel || publication.upsertProduct.isPending}
              />
              <PublicationRuleList
                empty={page.productsEmpty}
                rules={productRules}
                subjects={products}
                subjectKey="productId"
                includeLabel={page.include}
                excludeLabel={page.exclude}
                noReason={page.noReason}
                onEdit={(rule) => {
                  setProductId(String(rule.productId))
                  setProductDecision(rule.decision)
                  setProductReason(rule.reason ?? "")
                }}
                onDelete={(id) =>
                  publication.removeProduct.mutateAsync(id).then(() => productRulesQuery.refetch())
                }
                editLabel={page.editRule}
                deleteLabel={page.deleteRule}
              />
            </TabsContent>
            <TabsContent value="suppliers" className="space-y-3">
              <PublicationRuleForm
                idPrefix="publication-supplier"
                title={page.suppliersTitle}
                subjectLabel={page.supplierLabel}
                subjectPlaceholder={page.supplierPlaceholder}
                subjects={suppliers}
                subjectId={supplierId}
                setSubjectId={updateSupplierId}
                decision={supplierDecision}
                setDecision={updateSupplierDecision}
                reason={supplierReason}
                setReason={updateSupplierReason}
                onSave={saveSupplierRule}
                onPreview={previewSupplierRule}
                previewResult={
                  supplierPreviewIsFresh && supplierPreview
                    ? page.supplierImpact.replace(
                        "{count}",
                        String(supplierPreview.affectedProductCount),
                      )
                    : null
                }
                confirmationLabel={
                  supplierPreviewIsFresh && supplierPreview
                    ? page.confirmSupplierImpact.replace(
                        "{count}",
                        String(supplierPreview.affectedProductCount),
                      )
                    : null
                }
                confirmed={supplierPreviewConfirmed}
                setConfirmed={setSupplierPreviewConfirmed}
                saveLabel={page.saveSupplier}
                previewLabel={page.previewSupplier}
                saveHelp={
                  supplierId && !supplierPreviewIsFresh ? page.previewRequiredCurrent : undefined
                }
                disabled={!channel || publication.upsertSupplier.isPending}
                saveDisabled={!supplierPreviewIsFresh || !supplierPreviewConfirmed}
                previewDisabled={publication.previewSupplier.isPending}
              />
              <PublicationRuleList
                empty={page.suppliersEmpty}
                rules={supplierRules}
                subjects={suppliers}
                subjectKey="supplierId"
                includeLabel={page.include}
                excludeLabel={page.exclude}
                noReason={page.noReason}
                onEdit={(rule) => {
                  updateSupplierId(String(rule.supplierId))
                  updateSupplierDecision(rule.decision)
                  updateSupplierReason(rule.reason ?? "")
                }}
                onDelete={(id) =>
                  publication.removeSupplier
                    .mutateAsync(id)
                    .then(() => supplierRulesQuery.refetch())
                }
                editLabel={page.editRule}
                deleteLabel={page.deleteRule}
              />
            </TabsContent>
          </Tabs>

          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">{page.whyTitle}</h3>
              <p className="text-xs text-muted-foreground">{page.whyDescription}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <OptionCombobox
                id="publication-inspector-product"
                label={page.productLabel}
                placeholder={page.productPlaceholder}
                value={inspectorProductId}
                onChange={setInspectorProductId}
                options={products}
              />
              <OptionCombobox
                id="publication-inspector-supplier"
                label={page.supplierLabel}
                placeholder={page.supplierOptional}
                value={inspectorSupplierId}
                onChange={setInspectorSupplierId}
                options={suppliers}
              />
            </div>
            {effectiveQuery.data?.data ? (
              <div className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={effectiveQuery.data.data.published ? "default" : "secondary"}>
                    {effectiveQuery.data.data.published ? page.published : page.denied}
                  </Badge>
                  <span className="text-muted-foreground">
                    {page.source.replace("{source}", effectiveQuery.data.data.source)}
                  </span>
                </div>
                <p className="mt-2">{effectiveQuery.data.data.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {page.reason.replace("{reason}", effectiveQuery.data.data.reason)}
                </p>
              </div>
            ) : null}
          </section>
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {messages.common.cancel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function PublicationRuleForm({
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
  subjects: Array<ProductOption | SupplierOption>
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

function PublicationRuleList<
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
  subjects: Array<ProductOption | SupplierOption>
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

function OptionCombobox({
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
  options: Array<ProductOption | SupplierOption>
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

function DecisionCombobox({
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
