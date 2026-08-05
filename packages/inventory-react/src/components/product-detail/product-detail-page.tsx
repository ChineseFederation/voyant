import { useQueries } from "@tanstack/react-query"
import { Button, confirmDialog } from "@voyant-travel/ui/components"
import { useMemo } from "react"
import { ProductsUiMessagesProvider } from "../../i18n/index.js"
import { ProductOptionsSection } from "../product-options-section.js"
import { ProductEditorialOverlaySection } from "./editorial-overlay/product-editorial-overlay-section.js"
import {
  useProductDetailApi,
  useProductDetailHost,
  useProductDetailMessages,
  useProductLocale,
} from "./host.js"
import { ProductActivitySection } from "./product-activity-section.js"
import { authoringGroupAnchorId } from "./product-authoring-nav.js"
import { ProductAuthoringNav } from "./product-authoring-nav-view.js"
import { DepartureDialog } from "./product-departure-dialog.js"
import { DeparturePricingOverrideDialog } from "./product-departure-pricing-override-dialog.js"
import { ProductDialog } from "./product-detail-dialog.js"
import { ProductDetailHeader } from "./product-detail-header.js"
import { ProductDetailItinerarySection } from "./product-detail-itinerary-section.js"
import {
  ProductBrochureSection,
  ProductChannelsSection,
  ProductDeparturesSection,
  ProductDetailsSection,
  ProductMediaSection,
  ProductOrganizeSection,
  ProductSchedulesSection,
} from "./product-detail-sections.js"
import { ProductDetailSkeleton } from "./product-detail-skeleton.js"
import { ProductMarketRulesSection } from "./product-market-rules-section.js"
import { PricingPanel } from "./product-options-pricing.js"
import {
  deriveOptionPricingLayout,
  getProductDetailDeparturePriceOverridesQueryOptions,
} from "./product-options-shared.js"
import { ProductPaymentPolicySection } from "./product-payment-policy-section.js"
import { ScheduleDialog } from "./product-schedule-dialog.js"
import { ProductSeoSharingSection } from "./product-seo-sharing-section.js"
import { useProductDetailData } from "./use-product-detail-data.js"
import { useProductDetailDialogs } from "./use-product-detail-dialogs.js"

export function ProductDetailPage({ id }: { id: string }) {
  const messages = useProductDetailMessages()
  const productMessages = messages.products.core
  const { navigate, renderOptionExtras } = useProductDetailHost()
  const resolvedLocale = useProductLocale()
  const api = useProductDetailApi()

  const data = useProductDetailData(id)
  const dialogs = useProductDetailDialogs()

  const { product, isPending, slots, rules, channels, mappings, media, itineraryNameById } = data
  const { mutations, refetch, invalidateProduct } = data

  const overrideQueries = useQueries({
    queries: slots.map((slot) => ({
      ...getProductDetailDeparturePriceOverridesQueryOptions(api, slot.id),
      enabled: !!slot.id,
    })),
  })

  const slotIdsWithOverrides = useMemo(() => {
    const set = new Set<string>()
    slots.forEach((slot, index) => {
      const result = overrideQueries[index]
      const items = result?.data?.data ?? []
      if (items.some((o) => o.active)) set.add(slot.id)
    })
    return set
  }, [slots, overrideQueries])
  const brochure =
    media.find((item) => item.isBrochure && item.isBrochureCurrent) ??
    media.find((item) => item.isBrochure) ??
    null
  const galleryMedia = media.filter((item) => !item.isBrochure)

  if (isPending) {
    return <ProductDetailSkeleton />
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-muted-foreground">{productMessages.detailNotFound}</p>
        <Button variant="outline" onClick={() => navigate.toProducts()}>
          {productMessages.backToProducts}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <ProductDetailHeader
        product={product}
        isDuplicating={mutations.duplicateProduct.isPending}
        isDeleting={mutations.deleteProduct.isPending}
        onEdit={dialogs.edit.openNow}
        onBookingCreate={
          navigate.toBookingCreate ? () => navigate.toBookingCreate?.(product.id) : undefined
        }
        onDuplicate={() => {
          mutations.duplicateProduct.mutate(undefined, {
            onSuccess: (result) => {
              navigate.toProduct(result.data.id)
            },
          })
        }}
        onDelete={async () => {
          if (
            await confirmDialog({ description: productMessages.deleteConfirm, destructive: true })
          ) {
            mutations.deleteProduct.mutate(undefined, {
              onSuccess: () => navigate.toProducts(),
            })
          }
        }}
      />

      {/* Authoring is organized around seven ordered, deep-linkable groups:
          Overview & readiness, Content, Plan, Options & pricing, Availability,
          Distribution, History. `ProductAuthoringNav` renders the contextual
          deep links; each group below anchors to its stable id. */}
      <ProductAuthoringNav productId={id} />

      {/* Content — two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Left column (main) ── */}
        <div className="flex min-w-0 flex-col gap-6">
          <section
            id={authoringGroupAnchorId("overview")}
            className="flex scroll-mt-16 flex-col gap-6"
          >
            <ProductDetailsSection product={product} onEdit={dialogs.edit.openNow} />
          </section>

          <section
            id={authoringGroupAnchorId("content")}
            className="flex scroll-mt-16 flex-col gap-6"
          >
            <ProductSeoSharingSection
              product={product}
              media={galleryMedia}
              isUploading={mutations.uploadMedia.isPending}
              isSavingImage={mutations.setOpenGraph.isPending}
              onUpload={async (file) => {
                const result = await mutations.uploadMedia.mutateAsync({ file })
                return result.data
              }}
              onSetOpenGraph={(mediaId) => mutations.setOpenGraph.mutateAsync(mediaId)}
            />

            <ProductMediaSection
              productId={id}
              media={galleryMedia}
              isUploading={mutations.uploadMedia.isPending}
              onUpload={(file) => mutations.uploadMedia.mutate({ file })}
              onSelectFromLibrary={(assets) => mutations.addMediaFromLibrary.mutate({ assets })}
              onSetCover={(mediaId) => mutations.setCover.mutate(mediaId)}
              onDelete={async (mediaId) => {
                if (
                  await confirmDialog({
                    description: productMessages.deleteMediaConfirm,
                    destructive: true,
                  })
                ) {
                  mutations.deleteMedia.mutate(mediaId)
                }
              }}
            />

            <ProductEditorialOverlaySection productId={id} />
          </section>

          <section id={authoringGroupAnchorId("plan")} className="flex scroll-mt-16 flex-col gap-6">
            <ProductDetailItinerarySection productId={id} />
          </section>

          <section
            id={authoringGroupAnchorId("options")}
            className="flex scroll-mt-16 flex-col gap-6"
          >
            <ProductsUiMessagesProvider locale={resolvedLocale}>
              <ProductOptionsSection
                productId={id}
                renderOptionDetails={(option) => (
                  <PricingPanel
                    productId={id}
                    optionId={option.id}
                    optionName={option.name}
                    productCurrency={product.sellCurrency}
                    layout={deriveOptionPricingLayout(product.bookingMode)}
                    extras={renderOptionExtras?.(id, option.id)}
                  />
                )}
              />
            </ProductsUiMessagesProvider>

            <ProductPaymentPolicySection product={product} onSuccess={invalidateProduct} />
            <ProductMarketRulesSection productId={id} />
          </section>

          <section
            id={authoringGroupAnchorId("availability")}
            className="flex scroll-mt-16 flex-col gap-6"
          >
            <ProductDeparturesSection
              slots={slots}
              itineraryNameById={itineraryNameById}
              slotIdsWithOverrides={slotIdsWithOverrides}
              onCreate={dialogs.departure.openNew}
              onEdit={dialogs.departure.openEdit}
              onOverridePrice={dialogs.departureOverride.openEdit}
              onManageAvailability={(slot) => navigate.toAvailability(slot.id)}
              onDelete={async (slotId) => {
                if (
                  await confirmDialog({
                    description: productMessages.deleteDepartureConfirm,
                    destructive: true,
                  })
                ) {
                  mutations.deleteSlot.mutate(slotId)
                }
              }}
            />

            <ProductSchedulesSection
              rules={rules}
              onCreate={dialogs.schedule.openNew}
              onEdit={dialogs.schedule.openEdit}
              onDelete={async (ruleId) => {
                if (
                  await confirmDialog({
                    description: productMessages.deleteScheduleConfirm,
                    destructive: true,
                  })
                ) {
                  mutations.deleteRule.mutate(ruleId)
                }
              }}
            />
          </section>
        </div>

        {/* ── Right column (sidebar) ── */}
        <div className="flex flex-col gap-6">
          <section
            id={authoringGroupAnchorId("distribution")}
            className="flex scroll-mt-16 flex-col gap-6"
          >
            <ProductChannelsSection
              allChannels={channels}
              mappings={mappings}
              onAddChannel={(channelId) => mutations.addChannelMapping.mutate(channelId)}
              onRemoveChannel={(mappingId) => mutations.removeChannelMapping.mutate(mappingId)}
            />

            <ProductOrganizeSection product={product} onEdit={dialogs.edit.openNow} />

            <ProductBrochureSection
              brochure={brochure}
              isGenerating={mutations.generateBrochure.isPending}
              generateError={
                mutations.generateBrochure.error
                  ? mutations.generateBrochure.error.message ||
                    productMessages.brochureGenerateFailed
                  : null
              }
              onGenerate={() => mutations.generateBrochure.mutate()}
            />
          </section>

          <section
            id={authoringGroupAnchorId("history")}
            className="flex scroll-mt-16 flex-col gap-6"
          >
            <ProductActivitySection productId={id} />
          </section>
        </div>
      </div>

      {/* Dialogs */}
      <ProductDialog
        open={dialogs.edit.open}
        onOpenChange={dialogs.edit.setOpen}
        product={product}
        onSuccess={() => {
          dialogs.edit.close()
          invalidateProduct()
        }}
      />

      <DepartureDialog
        open={dialogs.departure.open}
        onOpenChange={dialogs.departure.setOpen}
        productId={id}
        durationMinutes={
          product.classification?.durationProvenance === "explicit"
            ? product.classification.durationMinutes
            : null
        }
        slot={dialogs.departure.editing}
        onSuccess={() => {
          dialogs.departure.close()
          refetch.slots()
        }}
      />

      <ScheduleDialog
        open={dialogs.schedule.open}
        onOpenChange={dialogs.schedule.setOpen}
        productId={id}
        rule={dialogs.schedule.editing}
        onSuccess={() => {
          dialogs.schedule.close()
          refetch.rules()
        }}
      />

      <DeparturePricingOverrideDialog
        open={dialogs.departureOverride.open}
        onOpenChange={dialogs.departureOverride.setOpen}
        departureId={dialogs.departureOverride.editing?.id ?? null}
        optionId={dialogs.departureOverride.editing?.optionId ?? null}
        onSuccess={() => {
          dialogs.departureOverride.close()
        }}
      />
    </div>
  )
}
