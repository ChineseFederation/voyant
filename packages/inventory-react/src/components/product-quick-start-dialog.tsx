"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@voyant-travel/ui/components/dialog"
import * as React from "react"

import { useProductsUiI18nOrDefault } from "../i18n/index.js"
import { PRODUCT_QUICK_STARTS, type ProductQuickStart } from "./product-quick-starts.js"

export interface ProductQuickStartDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Invoked with the chosen quick start, or `null` for a blank product. */
  onChoose: (quickStart: ProductQuickStart | null) => void | Promise<void>
  /** Creates a generic draft with only the selected family prefilled. */
  onChooseFamily: (familyCode: string) => void | Promise<void>
  families: ReadonlyArray<{ code: string; name: string }>
  loadingFamilies?: boolean
  /** True while the create request is in flight (disables the choices). */
  creating?: boolean
}

/**
 * Accessible family / quick-start chooser shown when authoring a new product.
 * Every choice creates the SAME generic product draft — a quick start only
 * prefills editable field defaults (family, subtype, booking mode, duration).
 * There is no type-specific product aggregate.
 */
export function ProductQuickStartDialog({
  open,
  onOpenChange,
  onChoose,
  onChooseFamily,
  families,
  loadingFamilies = false,
  creating = false,
}: ProductQuickStartDialogProps) {
  const { messages } = useProductsUiI18nOrDefault()
  const qs = messages.productList.quickStart
  const presetCopy = qs.presets
  const [selectedFamilyCode, setSelectedFamilyCode] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) setSelectedFamilyCode(null)
  }, [open])

  const selectedFamily = families.find((family) => family.code === selectedFamilyCode) ?? null
  const relevantPresets = selectedFamilyCode
    ? PRODUCT_QUICK_STARTS.filter((preset) => preset.familyCode === selectedFamilyCode)
    : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-slot="product-quick-start">
        <DialogHeader>
          <DialogTitle>{qs.title}</DialogTitle>
          <DialogDescription>{qs.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <h3 className="font-medium text-sm">{qs.familyHeading}</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {families.map((family) => (
              <button
                key={family.code}
                type="button"
                disabled={creating || loadingFamilies}
                data-slot={`product-family-${family.code}`}
                aria-pressed={family.code === selectedFamilyCode}
                onClick={() => setSelectedFamilyCode(family.code)}
                className="rounded-lg border border-border px-2 py-2 text-center font-medium text-xs transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-accent disabled:opacity-60"
              >
                {family.name}
              </button>
            ))}
          </div>
        </div>

        {selectedFamily ? (
          <div className="space-y-2">
            <h3 className="font-medium text-sm">
              {qs.presetHeading.replace("{family}", selectedFamily.name)}
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {relevantPresets.map((preset) => {
                const copy = presetCopy[preset.id]
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={creating || loadingFamilies}
                    data-slot={`quick-start-${preset.id}`}
                    onClick={() => void onChoose(preset)}
                    className="flex flex-col items-start gap-1 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="font-medium text-sm">{copy.label}</span>
                    <span className="text-muted-foreground text-xs">{copy.description}</span>
                  </button>
                )
              })}
              <button
                type="button"
                disabled={creating || loadingFamilies}
                data-slot="quick-start-selected-family"
                onClick={() => void onChooseFamily(selectedFamily.code)}
                className="flex flex-col items-start gap-1 rounded-lg border border-dashed border-border p-3 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                <span className="font-medium text-sm">
                  {qs.continueFamily.replace("{family}", selectedFamily.name)}
                </span>
              </button>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            type="button"
            disabled={creating || loadingFamilies}
            data-slot="quick-start-blank"
            onClick={() => void onChoose(null)}
            className="rounded-md px-3 py-1.5 text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {creating ? qs.creating : qs.startBlank}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
