"use client"

import {
  Badge,
  Button,
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
} from "@voyant-travel/ui/components"
import { useEffect, useState } from "react"
import { useDistributionUiI18nOrDefault } from "../i18n/index.js"
import type { ChannelRow } from "../index.js"
import {
  useEffectivePublication,
  useProductPublications,
  useProducts,
  usePublicationMutation,
  useSupplierPublications,
  useSuppliers,
} from "../index.js"
import {
  defaultPublicationDecision,
  OptionCombobox,
  type PublicationDecision,
  PublicationRuleForm,
  PublicationRuleList,
} from "./publication-rule-controls.js"
import { PublicationSourcesTab } from "./publication-sources-tab.js"

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
              <TabsTrigger value="sources">{page.sourcesTitle}</TabsTrigger>
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
            <TabsContent value="sources">
              <PublicationSourcesTab channel={channel} open={open} />
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
