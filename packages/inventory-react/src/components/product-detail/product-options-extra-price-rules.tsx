import { formatMessage } from "@voyant-travel/i18n"
import {
  Badge,
  Button,
  confirmDialog,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { type ProductExtraRecord, useProductExtraMutation, useProductExtras } from "../../extras.js"
import {
  type ExtraPriceRuleRecord,
  useExtraPriceRuleMutation,
  useExtraPriceRules,
} from "./commerce-client.js"
import { useProductDetailMessages } from "./host.js"
import { getExtraPricingModeLabel, ProductExtraDialog } from "./product-extra-dialog.js"
import { formatProductMoney } from "./product-options-pricing-helpers.js"

export function ExtraPriceRulesPanel({
  productId,
  optionId,
  optionPriceRuleId,
  ensureOptionPriceRuleId,
  productCurrency,
}: {
  productId: string
  optionId: string
  // Optional: extras can be *defined* before the option has a default rate
  // plan. Pricing requires a rule, so `ensureOptionPriceRuleId` lazily creates
  // one when the operator first sets an extra's price.
  optionPriceRuleId?: string
  ensureOptionPriceRuleId?: () => Promise<string>
  productCurrency: string
}) {
  const messages = useProductDetailMessages()
  const extraPriceMessages = messages.products.operations.extraPrices
  const extraMessages = messages.products.operations.extras
  const extrasQuery = useProductExtras({ productId, limit: 100 })
  const rulesQuery = useExtraPriceRules({
    optionPriceRuleId: optionPriceRuleId ?? "__none__",
    optionId,
    active: true,
    limit: 100,
    enabled: !!optionPriceRuleId,
  })
  const { remove: removeExtra } = useProductExtraMutation()
  const [pricingExtraId, setPricingExtraId] = useState<string | null>(null)
  const [pricingRuleId, setPricingRuleId] = useState<string | undefined>(optionPriceRuleId)
  const [definitionDialogOpen, setDefinitionDialogOpen] = useState(false)
  const [editingExtra, setEditingExtra] = useState<ProductExtraRecord | undefined>()
  const extras = (extrasQuery.data?.data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder)
  const rules = rulesQuery.data?.data ?? []
  const ruleByExtraId = new Map(
    rules.flatMap((rule) => (rule.productExtraId ? [[rule.productExtraId, rule] as const] : [])),
  )
  const pricingExtra = extras.find((extra) => extra.id === pricingExtraId) ?? null

  return (
    <div className="mt-4 border-t pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{extraMessages.sectionTitle}</div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setEditingExtra(undefined)
            setDefinitionDialogOpen(true)
          }}
        >
          <Plus className="mr-1 h-3 w-3" />
          {extraMessages.addAction}
        </Button>
      </div>
      {extras.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">{extraMessages.empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {extras.map((extra) => {
            const rule = ruleByExtraId.get(extra.id)
            return (
              <div
                key={extra.id}
                className="flex items-center justify-between gap-3 rounded border px-2 py-1.5 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="font-medium">{extra.name}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {getExtraPricingModeLabel(extra.pricingMode, extraMessages)}
                  </Badge>
                  {extra.pricedPerPerson ? (
                    <span className="text-muted-foreground">{extraPriceMessages.perTraveler}</span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono">
                    {rule?.sellAmountCents != null
                      ? formatProductMoney(rule.sellAmountCents, productCurrency)
                      : extraPriceMessages.noAmount}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void (async () => {
                        const ruleId =
                          optionPriceRuleId ??
                          (ensureOptionPriceRuleId ? await ensureOptionPriceRuleId() : undefined)
                        if (!ruleId) return
                        setPricingRuleId(ruleId)
                        setPricingExtraId(extra.id)
                      })()
                    }}
                  >
                    {extraPriceMessages.setPrice}
                  </Button>
                  <button
                    type="button"
                    aria-label={extraMessages.editAction}
                    onClick={() => {
                      setEditingExtra(extra)
                      setDefinitionDialogOpen(true)
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={extraMessages.deleteAction}
                    onClick={async () => {
                      if (
                        await confirmDialog({
                          description: formatMessage(extraMessages.deleteConfirm, {
                            name: extra.name,
                          }),
                          destructive: true,
                        })
                      ) {
                        removeExtra.mutate(extra.id, {
                          onSuccess: () => void extrasQuery.refetch(),
                        })
                      }
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <ProductExtraDialog
        open={definitionDialogOpen}
        onOpenChange={(open) => {
          setDefinitionDialogOpen(open)
          if (!open) setEditingExtra(undefined)
        }}
        productId={productId}
        extra={editingExtra}
        nextSortOrder={extras.length}
        onSuccess={() => {
          setDefinitionDialogOpen(false)
          setEditingExtra(undefined)
          void extrasQuery.refetch()
        }}
      />
      {pricingExtra && (pricingRuleId ?? optionPriceRuleId) ? (
        <ExtraPriceRuleDialog
          open={!!pricingExtra}
          onOpenChange={(open) => {
            if (!open) setPricingExtraId(null)
          }}
          optionPriceRuleId={(pricingRuleId ?? optionPriceRuleId) as string}
          optionId={optionId}
          extra={pricingExtra}
          existingRule={ruleByExtraId.get(pricingExtra.id)}
          nextSortOrder={rules.length}
          productCurrency={productCurrency}
          onSuccess={() => {
            setPricingExtraId(null)
            void rulesQuery.refetch()
          }}
        />
      ) : null}
    </div>
  )
}

function ExtraPriceRuleDialog({
  open,
  onOpenChange,
  optionPriceRuleId,
  optionId,
  extra,
  existingRule,
  nextSortOrder,
  productCurrency,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  optionPriceRuleId: string
  optionId: string
  extra: { id: string; name: string; pricingMode: string; pricedPerPerson: boolean }
  existingRule?: ExtraPriceRuleRecord
  nextSortOrder: number
  productCurrency: string
  onSuccess: () => void
}) {
  const messages = useProductDetailMessages()
  const extraPriceMessages = messages.products.operations.extraPrices
  const { create, update } = useExtraPriceRuleMutation()
  const [amount, setAmount] = useState("")
  const [pricingMode, setPricingMode] = useState<ExtraPriceRuleRecord["pricingMode"]>("per_booking")

  const isEditing = !!existingRule
  const pricingModes = [
    { value: "per_booking", label: extraPriceMessages.pricingPerBooking },
    { value: "per_person", label: extraPriceMessages.pricingPerPerson },
    { value: "included", label: extraPriceMessages.pricingIncluded },
    { value: "on_request", label: extraPriceMessages.pricingOnRequest },
    { value: "unavailable", label: extraPriceMessages.pricingUnavailable },
  ] as const

  useEffect(() => {
    setAmount(
      existingRule?.sellAmountCents != null ? String(existingRule.sellAmountCents / 100) : "",
    )
    setPricingMode(existingRule?.pricingMode ?? defaultExtraPriceRuleMode(extra))
  }, [existingRule, extra])

  const save = async () => {
    const parsedAmount = amount.trim() === "" ? null : Math.round(Number(amount) * 100)
    if (parsedAmount != null && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) return
    const payload = {
      optionPriceRuleId,
      optionId,
      productExtraId: extra.id,
      optionExtraConfigId: null,
      pricingMode,
      sellAmountCents: parsedAmount,
      costAmountCents: null,
      active: true,
      sortOrder: existingRule?.sortOrder ?? nextSortOrder,
    }
    if (existingRule) await update.mutateAsync({ id: existingRule.id, input: payload })
    else await create.mutateAsync(payload)
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? extraPriceMessages.editTitle : extraPriceMessages.newTitle}
          </DialogTitle>
          <DialogDescription>{extra.name}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="flex flex-col gap-2">
            <Label>{extraPriceMessages.pricingModeLabel}</Label>
            <Select
              value={pricingMode}
              onValueChange={(value) =>
                setPricingMode((value ?? "per_booking") as ExtraPriceRuleRecord["pricingMode"])
              }
              items={pricingModes}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pricingModes.map((mode) => (
                  <SelectItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{extraPriceMessages.sellAmountLabel}</Label>
            <div className="flex items-center gap-2">
              <Input
                value={amount}
                type="number"
                min="0"
                step="0.01"
                onChange={(event) => setAmount(event.target.value)}
              />
              <span className="min-w-12 text-muted-foreground text-sm">{productCurrency}</span>
            </div>
          </div>
        </DialogBody>
        <DialogFooter className="-mx-6 -mb-6">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {extraPriceMessages.cancel}
          </Button>
          <Button onClick={() => void save()}>{extraPriceMessages.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function defaultExtraPriceRuleMode(extra: {
  pricingMode: string
  pricedPerPerson: boolean
}): ExtraPriceRuleRecord["pricingMode"] {
  if (extra.pricedPerPerson || extra.pricingMode === "per_person") return "per_person"
  if (extra.pricingMode === "included" || extra.pricingMode === "free") return "included"
  if (extra.pricingMode === "on_request") return "on_request"
  return "per_booking"
}
