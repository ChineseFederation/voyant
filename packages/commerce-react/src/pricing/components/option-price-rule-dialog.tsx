"use client"

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
  Switch,
  Textarea,
} from "@voyant-travel/ui/components"
import { zodResolver } from "@voyant-travel/ui/lib/zod-resolver"
import { Loader2 } from "lucide-react"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"
import type { OptionPriceRulePricingMode } from "../i18n/messages.js"
import { usePricingUiMessagesOrDefault } from "../i18n/provider.js"
import { type OptionPriceRuleRecord, useOptionPriceRuleMutation } from "../index.js"
import { CancellationPolicyCombobox } from "./cancellation-policy-combobox.js"
import { PriceCatalogCombobox } from "./price-catalog-combobox.js"
import { PriceScheduleCombobox } from "./price-schedule-combobox.js"
import { ProductCombobox } from "./product-combobox.js"
import { ProductOptionCombobox } from "./product-option-combobox.js"

const PRICING_MODES = ["per_person", "per_booking", "starting_from", "free", "on_request"] as const
type PricingMode = (typeof PRICING_MODES)[number]
const OCCUPANCY_PRICE_BASES = ["supplement", "all_in"] as const
type OccupancyPriceBasis = (typeof OCCUPANCY_PRICE_BASES)[number]

function createFormSchema(messages: ReturnType<typeof usePricingUiMessagesOrDefault>) {
  return z.object({
    productId: z.string().min(1, messages.optionPriceRuleDialog.validation.productRequired),
    optionId: z.string().min(1, messages.optionPriceRuleDialog.validation.optionRequired),
    priceCatalogId: z.string().min(1, messages.optionPriceRuleDialog.validation.catalogRequired),
    priceScheduleId: z.string().optional().nullable(),
    cancellationPolicyId: z.string().optional().nullable(),
    name: z.string().min(1, messages.optionPriceRuleDialog.validation.nameRequired).max(255),
    code: z.string().max(100).optional().nullable(),
    description: z.string().optional().nullable(),
    pricingMode: z.enum(PRICING_MODES),
    occupancyPriceBasis: z.enum(OCCUPANCY_PRICE_BASES),
    baseSell: z.coerce.number().min(0),
    baseCost: z.coerce.number().min(0),
    minPerBooking: z.coerce.number().int().min(0).optional().or(z.literal("")).nullable(),
    maxPerBooking: z.coerce.number().int().min(0).optional().or(z.literal("")).nullable(),
    allPricingCategories: z.boolean(),
    isDefault: z.boolean(),
    active: z.boolean(),
    notes: z.string().optional().nullable(),
  })
}

type FormSchema = ReturnType<typeof createFormSchema>
type FormValues = z.input<FormSchema>
type FormOutput = z.output<FormSchema>

export interface OptionPriceRuleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rule?: OptionPriceRuleRecord
  onSuccess?: (rule: OptionPriceRuleRecord) => void
}

const toInt = (value: number | "" | null | undefined): number | null =>
  typeof value === "number" ? value : null

export function OptionPriceRuleDialog({
  open,
  onOpenChange,
  rule,
  onSuccess,
}: OptionPriceRuleDialogProps) {
  const isEditing = !!rule
  const { create, update } = useOptionPriceRuleMutation()
  const messages = usePricingUiMessagesOrDefault()
  const formSchema = createFormSchema(messages)

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      productId: "",
      optionId: "",
      priceCatalogId: "",
      priceScheduleId: "",
      cancellationPolicyId: "",
      name: "",
      code: "",
      description: "",
      pricingMode: "per_person",
      occupancyPriceBasis: "supplement",
      baseSell: 0,
      baseCost: 0,
      minPerBooking: "",
      maxPerBooking: "",
      allPricingCategories: true,
      isDefault: false,
      active: true,
      notes: "",
    },
  })

  const watchedProductId = form.watch("productId")
  const watchedCatalogId = form.watch("priceCatalogId")

  useEffect(() => {
    if (open && rule) {
      form.reset({
        productId: rule.productId,
        optionId: rule.optionId,
        priceCatalogId: rule.priceCatalogId,
        priceScheduleId: rule.priceScheduleId ?? "",
        cancellationPolicyId: rule.cancellationPolicyId ?? "",
        name: rule.name,
        code: rule.code ?? "",
        description: rule.description ?? "",
        pricingMode: rule.pricingMode,
        occupancyPriceBasis: rule.occupancyPriceBasis ?? "supplement",
        baseSell: rule.baseSellAmountCents != null ? rule.baseSellAmountCents / 100 : 0,
        baseCost: rule.baseCostAmountCents != null ? rule.baseCostAmountCents / 100 : 0,
        minPerBooking: rule.minPerBooking ?? "",
        maxPerBooking: rule.maxPerBooking ?? "",
        allPricingCategories: rule.allPricingCategories,
        isDefault: rule.isDefault,
        active: rule.active,
        notes: rule.notes ?? "",
      })
    } else if (open) {
      form.reset()
    }
  }, [open, rule, form])

  const onSubmit = async (values: FormOutput) => {
    const payload = {
      productId: values.productId,
      optionId: values.optionId,
      priceCatalogId: values.priceCatalogId,
      priceScheduleId: values.priceScheduleId || null,
      cancellationPolicyId: values.cancellationPolicyId || null,
      name: values.name,
      code: values.code || null,
      description: values.description || null,
      pricingMode: values.pricingMode,
      occupancyPriceBasis: values.occupancyPriceBasis,
      baseSellAmountCents: Math.round(values.baseSell * 100),
      baseCostAmountCents: Math.round(values.baseCost * 100),
      minPerBooking: toInt(values.minPerBooking),
      maxPerBooking: toInt(values.maxPerBooking),
      allPricingCategories: values.allPricingCategories,
      isDefault: values.isDefault,
      active: values.active,
      notes: values.notes || null,
    }

    const saved = isEditing
      ? await update.mutateAsync({ id: rule.id, input: payload })
      : await create.mutateAsync(payload)

    onSuccess?.(saved)
    onOpenChange(false)
  }

  const isSubmitting = create.isPending || update.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <SheetTitle>
            {isEditing
              ? messages.optionPriceRuleDialog.titles.edit
              : messages.optionPriceRuleDialog.titles.create}
          </SheetTitle>
        </SheetHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <SheetBody className="grid gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>{messages.optionPriceRuleDialog.fields.product}</Label>
                <ProductCombobox
                  value={form.watch("productId")}
                  onChange={(value) => {
                    form.setValue("productId", value ?? "", {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                    form.setValue("optionId", "", { shouldDirty: true, shouldValidate: true })
                  }}
                  disabled={isEditing}
                />
                {form.formState.errors.productId ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.productId.message}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Label>{messages.optionPriceRuleDialog.fields.option}</Label>
                <ProductOptionCombobox
                  productId={watchedProductId}
                  value={form.watch("optionId")}
                  onChange={(value) =>
                    form.setValue("optionId", value ?? "", {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  disabled={isEditing}
                />
                {form.formState.errors.optionId ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.optionId.message}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>{messages.optionPriceRuleDialog.fields.name}</Label>
                <Input {...form.register("name")} />
                {form.formState.errors.name ? (
                  <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Label>{messages.optionPriceRuleDialog.fields.code}</Label>
                <Input {...form.register("code")} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="flex flex-col gap-2">
                <Label>{messages.optionPriceRuleDialog.fields.catalog}</Label>
                <PriceCatalogCombobox
                  value={form.watch("priceCatalogId")}
                  onChange={(value) => {
                    form.setValue("priceCatalogId", value ?? "", {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                    form.setValue("priceScheduleId", "", { shouldDirty: true })
                  }}
                />
                {form.formState.errors.priceCatalogId ? (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.priceCatalogId.message}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Label>{messages.optionPriceRuleDialog.fields.schedule}</Label>
                <PriceScheduleCombobox
                  priceCatalogId={watchedCatalogId}
                  value={form.watch("priceScheduleId")}
                  onChange={(value) =>
                    form.setValue("priceScheduleId", value ?? "", { shouldDirty: true })
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{messages.optionPriceRuleDialog.fields.cancellationPolicy}</Label>
                <CancellationPolicyCombobox
                  value={form.watch("cancellationPolicyId")}
                  onChange={(value) =>
                    form.setValue("cancellationPolicyId", value ?? "", { shouldDirty: true })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="flex flex-col gap-2">
                <Label>{messages.optionPriceRuleDialog.fields.pricingMode}</Label>
                <Select
                  items={PRICING_MODES.map((mode) => ({
                    label:
                      messages.common.optionPriceRulePricingModeLabels[
                        mode as OptionPriceRulePricingMode
                      ],
                    value: mode,
                  }))}
                  value={form.watch("pricingMode")}
                  onValueChange={(value) => form.setValue("pricingMode", value as PricingMode)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRICING_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {
                          messages.common.optionPriceRulePricingModeLabels[
                            mode as OptionPriceRulePricingMode
                          ]
                        }
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>{messages.optionPriceRuleDialog.fields.occupancyPriceBasis}</Label>
                <Select
                  items={OCCUPANCY_PRICE_BASES.map((basis) => ({
                    label: messages.optionPriceRuleDialog.occupancyPriceBasisLabels[basis],
                    value: basis,
                  }))}
                  value={form.watch("occupancyPriceBasis")}
                  onValueChange={(value) =>
                    form.setValue("occupancyPriceBasis", value as OccupancyPriceBasis, {
                      shouldDirty: true,
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OCCUPANCY_PRICE_BASES.map((basis) => (
                      <SelectItem key={basis} value={basis}>
                        {messages.optionPriceRuleDialog.occupancyPriceBasisLabels[basis]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {messages.optionPriceRuleDialog.helpText.occupancyPriceBasis}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Label>{messages.optionPriceRuleDialog.fields.baseSell}</Label>
                <Input {...form.register("baseSell")} type="number" min="0" step="0.01" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{messages.optionPriceRuleDialog.fields.baseCost}</Label>
                <Input {...form.register("baseCost")} type="number" min="0" step="0.01" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>{messages.optionPriceRuleDialog.fields.minPerBooking}</Label>
                <Input {...form.register("minPerBooking")} type="number" min="0" />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{messages.optionPriceRuleDialog.fields.maxPerBooking}</Label>
                <Input {...form.register("maxPerBooking")} type="number" min="0" />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{messages.optionPriceRuleDialog.fields.description}</Label>
              <Textarea {...form.register("description")} rows={2} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.watch("allPricingCategories")}
                  onCheckedChange={(checked) => form.setValue("allPricingCategories", checked)}
                />
                <Label>{messages.optionPriceRuleDialog.fields.allPricingCategories}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.watch("isDefault")}
                  onCheckedChange={(checked) => form.setValue("isDefault", checked)}
                />
                <Label>{messages.optionPriceRuleDialog.fields.defaultRule}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.watch("active")}
                  onCheckedChange={(checked) => form.setValue("active", checked)}
                />
                <Label>{messages.optionPriceRuleDialog.fields.active}</Label>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{messages.optionPriceRuleDialog.fields.notes}</Label>
              <Textarea {...form.register("notes")} rows={2} />
            </div>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {messages.common.cancel}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isEditing
                ? messages.common.saveChanges
                : messages.optionPriceRuleDialog.actions.create}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
