// agent-quality: file-size exception -- owner: inventory-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
"use client"

import { Badge } from "@voyant-travel/ui/components/badge"
import { Button } from "@voyant-travel/ui/components/button"
import { CurrencyCombobox } from "@voyant-travel/ui/components/currency-combobox"
import { Input } from "@voyant-travel/ui/components/input"
import { Label } from "@voyant-travel/ui/components/label"
import { RichTextEditor } from "@voyant-travel/ui/components/rich-text-editor"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { Textarea } from "@voyant-travel/ui/components/textarea"
import { Loader2, X } from "lucide-react"
import * as React from "react"
import { useProductsUiMessagesOrDefault } from "../i18n/index.js"
import { type CreateProductInput, type ProductRecord, useProductMutation } from "../index.js"
import { ProductContractTemplateCombobox } from "./product-contract-template-combobox.js"
import { ProductFacilityCombobox } from "./product-facility-combobox.js"
import { ProductTaxClassCombobox } from "./product-tax-class-combobox.js"
import { ProductTypeCombobox } from "./product-type-combobox.js"

export type ProductFormMode = { kind: "create" } | { kind: "edit"; product: ProductRecord }

export interface ProductFormProps {
  mode: ProductFormMode
  onSuccess?: (product: ProductRecord) => void
  onCancel?: () => void
}

interface FormState {
  name: string
  description: string
  inclusionsHtml: string
  exclusionsHtml: string
  termsHtml: string
  status: "draft" | "active" | "archived"
  bookingMode: "date" | "date_time" | "open" | "stay" | "transfer" | "itinerary" | "other"
  capacityMode: ProductRecord["capacityMode"]
  timezone: string
  facilityId: string
  productTypeId: string
  productSubtypeCode: string
  durationMinutes: string
  contractTemplateId: string
  taxClassId: string
  sellCurrency: string
  sellAmount: string
  costAmount: string
  pax: string
  reservationTimeoutMinutes: string
  tags: string[]
}

function initialState(mode: ProductFormMode): FormState {
  if (mode.kind === "edit") {
    const product = mode.product
    return {
      name: product.name,
      description: product.description ?? "",
      inclusionsHtml: product.inclusionsHtml ?? "",
      exclusionsHtml: product.exclusionsHtml ?? "",
      termsHtml: product.termsHtml ?? "",
      status: product.status,
      bookingMode: product.bookingMode,
      capacityMode: product.capacityMode,
      timezone: product.timezone ?? "",
      facilityId: product.facilityId ?? "__none__",
      productTypeId: product.productTypeId ?? "__none__",
      productSubtypeCode: product.productSubtypeCode ?? "",
      durationMinutes: product.durationMinutes != null ? String(product.durationMinutes) : "",
      contractTemplateId: product.contractTemplateId ?? "__none__",
      taxClassId: product.taxClassId ?? "__none__",
      sellCurrency: product.sellCurrency,
      sellAmount: product.sellAmountCents != null ? String(product.sellAmountCents / 100) : "",
      costAmount: product.costAmountCents != null ? String(product.costAmountCents / 100) : "",
      pax: product.pax != null ? String(product.pax) : "",
      reservationTimeoutMinutes:
        product.reservationTimeoutMinutes != null ? String(product.reservationTimeoutMinutes) : "",
      tags: product.tags ?? [],
    }
  }

  return {
    name: "",
    description: "",
    inclusionsHtml: "",
    exclusionsHtml: "",
    termsHtml: "",
    status: "draft",
    bookingMode: "itinerary",
    capacityMode: "limited",
    timezone: "",
    facilityId: "__none__",
    productTypeId: "__none__",
    productSubtypeCode: "",
    durationMinutes: "",
    contractTemplateId: "__none__",
    taxClassId: "__none__",
    sellCurrency: "EUR", // i18n-literal-ok ISO default currency
    sellAmount: "",
    costAmount: "",
    pax: "",
    reservationTimeoutMinutes: "",
    tags: [],
  }
}

function toAmountCents(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100)
}

function toIntegerOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 0) return null
  return parsed
}

function toPositiveIntegerOrNull(value: string): number | null {
  const parsed = toIntegerOrNull(value)
  return parsed == null || parsed < 1 ? null : parsed
}

function toPayload(state: FormState): CreateProductInput {
  return {
    name: state.name.trim(),
    description: state.description.trim() || null,
    inclusionsHtml: state.inclusionsHtml.trim() || null,
    exclusionsHtml: state.exclusionsHtml.trim() || null,
    termsHtml: state.termsHtml.trim() || null,
    status: state.status,
    bookingMode: state.bookingMode,
    capacityMode: state.capacityMode,
    timezone: state.timezone.trim() || null,
    facilityId: state.facilityId === "__none__" ? null : state.facilityId,
    productTypeId: state.productTypeId === "__none__" ? null : state.productTypeId,
    productSubtypeCode: state.productSubtypeCode.trim() || null,
    durationMinutes: toPositiveIntegerOrNull(state.durationMinutes),
    contractTemplateId: state.contractTemplateId === "__none__" ? null : state.contractTemplateId,
    taxClassId: state.taxClassId === "__none__" ? null : state.taxClassId,
    sellCurrency: state.sellCurrency.trim().toUpperCase(),
    sellAmountCents: toAmountCents(state.sellAmount),
    costAmountCents: toAmountCents(state.costAmount),
    pax: toPositiveIntegerOrNull(state.pax),
    reservationTimeoutMinutes: toIntegerOrNull(state.reservationTimeoutMinutes),
    tags: state.tags,
  }
}

export function ProductForm({ mode, onSuccess, onCancel }: ProductFormProps) {
  const messages = useProductsUiMessagesOrDefault()
  const productMessages = messages.productForm
  const [state, setState] = React.useState<FormState>(() => initialState(mode))
  const [tagInput, setTagInput] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const { create, update } = useProductMutation()

  const isSubmitting = create.isPending || update.isPending
  const productStatuses = React.useMemo(
    () =>
      [
        { value: "draft", label: messages.common.productStatusLabels.draft },
        { value: "active", label: messages.common.productStatusLabels.active },
        { value: "archived", label: messages.common.productStatusLabels.archived },
      ] as const,
    [messages],
  )
  const bookingModes = React.useMemo(() => {
    const labels = messages.common.productBookingModeLabels
    const basis = messages.common.productBookingModeBasis
    return [
      { value: "date", label: labels.date, basis: basis.date },
      { value: "date_time", label: labels.date_time, basis: basis.date_time },
      { value: "open", label: labels.open, basis: basis.open },
      { value: "stay", label: labels.stay, basis: basis.stay },
      { value: "transfer", label: labels.transfer, basis: basis.transfer },
      { value: "itinerary", label: labels.itinerary, basis: basis.itinerary },
      { value: "other", label: labels.other, basis: basis.other },
    ] as const
  }, [messages])
  const capacityModes = React.useMemo(
    () =>
      [
        { value: "free_sale", label: messages.common.productCapacityModeLabels.free_sale },
        { value: "limited", label: messages.common.productCapacityModeLabels.limited },
        { value: "on_request", label: messages.common.productCapacityModeLabels.on_request },
      ] as const,
    [messages],
  )
  const field =
    <K extends keyof FormState>(key: K) =>
    (value: FormState[K]) => {
      setState((prev) => ({ ...prev, [key]: value }))
    }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (!state.name.trim()) {
      setError(productMessages.validation.nameRequired)
      return
    }

    if (state.sellCurrency.trim().length !== 3) {
      setError(productMessages.validation.sellCurrencyInvalid)
      return
    }

    if (state.pax.trim() && toPositiveIntegerOrNull(state.pax) == null) {
      setError(productMessages.validation.paxInvalid)
      return
    }

    if (
      state.reservationTimeoutMinutes.trim() &&
      toIntegerOrNull(state.reservationTimeoutMinutes) == null
    ) {
      setError(productMessages.validation.reservationTimeoutInvalid)
      return
    }

    if (
      state.productSubtypeCode.trim() &&
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(state.productSubtypeCode.trim())
    ) {
      setError(productMessages.validation.subtypeInvalid)
      return
    }

    if (state.durationMinutes.trim() && toPositiveIntegerOrNull(state.durationMinutes) == null) {
      setError(productMessages.validation.durationInvalid)
      return
    }

    const payload = toPayload(state)

    try {
      const product =
        mode.kind === "create"
          ? await create.mutateAsync(payload)
          : await update.mutateAsync({ id: mode.product.id, input: payload })
      onSuccess?.(product)
    } catch (err) {
      setError(err instanceof Error ? err.message : productMessages.validation.saveFailed)
    }
  }

  return (
    <form
      data-slot="product-form"
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1"
    >
      <div className="grid grid-cols-1 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-name">{productMessages.fields.name}</Label>
          <Input
            id="product-name"
            required
            autoFocus
            value={state.name}
            onChange={(event) => field("name")(event.target.value)}
            placeholder={productMessages.placeholders.name}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-description">{productMessages.fields.description}</Label>
          <Textarea
            id="product-description"
            value={state.description}
            onChange={(event) => field("description")(event.target.value)}
            placeholder={productMessages.placeholders.description}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-inclusions">{productMessages.fields.inclusions}</Label>
          <RichTextEditor
            value={state.inclusionsHtml}
            onChange={field("inclusionsHtml")}
            placeholder={productMessages.placeholders.inclusions}
            editorClassName="max-h-[320px] overflow-y-auto"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-exclusions">{productMessages.fields.exclusions}</Label>
          <RichTextEditor
            value={state.exclusionsHtml}
            onChange={field("exclusionsHtml")}
            placeholder={productMessages.placeholders.exclusions}
            editorClassName="max-h-[320px] overflow-y-auto"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-terms">{productMessages.fields.terms}</Label>
          <RichTextEditor
            value={state.termsHtml}
            onChange={field("termsHtml")}
            placeholder={productMessages.placeholders.terms}
            editorClassName="max-h-[320px] overflow-y-auto"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>{productMessages.fields.tags}</Label>
          <div className="flex flex-wrap gap-1.5">
            {state.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1 text-xs">
                {tag}
                <button
                  type="button"
                  className="ml-0.5 rounded-full hover:text-destructive"
                  onClick={() => field("tags")(state.tags.filter((value) => value !== tag))}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            ))}
          </div>
          <Input
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault()
                const value = tagInput.trim().replace(/,+$/, "")
                if (value && !state.tags.includes(value)) {
                  field("tags")([...state.tags, value])
                }
                setTagInput("")
              }
            }}
            placeholder={productMessages.placeholders.tagInput}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>{productMessages.fields.status}</Label>
            <Select
              value={state.status}
              onValueChange={(value) => value && field("status")(value as FormState["status"])}
              items={productStatuses}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {productStatuses.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{productMessages.fields.bookingMode}</Label>
            <Select
              items={bookingModes}
              value={state.bookingMode}
              onValueChange={(value) =>
                value && field("bookingMode")(value as FormState["bookingMode"])
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              {/* Widen past the narrow trigger so the pricing-basis hint isn't
                  clipped (RO labels are the longest). */}
              <SelectContent className="min-w-[19rem]">
                {bookingModes.map((modeOption) => (
                  <SelectItem key={modeOption.value} value={modeOption.value}>
                    <span>{modeOption.label}</span>
                    {modeOption.basis ? (
                      <span className="ml-auto pl-4 text-muted-foreground text-xs">
                        {modeOption.basis}
                      </span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{productMessages.fields.productType}</Label>
            <ProductTypeCombobox
              value={state.productTypeId === "__none__" ? null : state.productTypeId}
              onChange={(value) => field("productTypeId")(value ?? "__none__")}
              placeholder={productMessages.placeholders.productTypeSearch}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-subtype-code">{productMessages.fields.productSubtype}</Label>
            <Input
              id="product-subtype-code"
              value={state.productSubtypeCode}
              onChange={(event) => field("productSubtypeCode")(event.target.value)}
              placeholder={productMessages.placeholders.productSubtype}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-duration-minutes">
              {productMessages.fields.durationMinutes}
            </Label>
            <Input
              id="product-duration-minutes"
              type="number"
              min="1"
              step="1"
              value={state.durationMinutes}
              onChange={(event) => field("durationMinutes")(event.target.value)}
              placeholder={productMessages.placeholders.durationMinutes}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{productMessages.fields.facility}</Label>
            <ProductFacilityCombobox
              value={state.facilityId === "__none__" ? null : state.facilityId}
              onChange={(value) => field("facilityId")(value ?? "__none__")}
              placeholder={productMessages.placeholders.facilitySearch}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{productMessages.fields.taxClass}</Label>
            <ProductTaxClassCombobox
              value={state.taxClassId === "__none__" ? null : state.taxClassId}
              onChange={(value) => field("taxClassId")(value ?? "__none__")}
              placeholder={productMessages.placeholders.taxClassSearch}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{productMessages.fields.contractTemplate}</Label>
            <ProductContractTemplateCombobox
              value={state.contractTemplateId === "__none__" ? null : state.contractTemplateId}
              onChange={(value) => field("contractTemplateId")(value ?? "__none__")}
              placeholder={productMessages.placeholders.contractTemplateSearch}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{productMessages.fields.capacityMode}</Label>
            <Select
              items={capacityModes}
              value={state.capacityMode}
              onValueChange={(value) =>
                value && field("capacityMode")(value as FormState["capacityMode"])
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {capacityModes.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-timezone">{productMessages.fields.timezone}</Label>
            <Input
              id="product-timezone"
              value={state.timezone}
              onChange={(event) => field("timezone")(event.target.value)}
              placeholder={productMessages.placeholders.timezone}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-pax">{productMessages.fields.pax}</Label>
            <Input
              id="product-pax"
              type="number"
              min="1"
              step="1"
              value={state.pax}
              onChange={(event) => field("pax")(event.target.value)}
              placeholder={productMessages.placeholders.pax}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-reservation-timeout">
              {productMessages.fields.reservationTimeout}
            </Label>
            <Input
              id="product-reservation-timeout"
              type="number"
              min="0"
              step="1"
              value={state.reservationTimeoutMinutes}
              onChange={(event) => field("reservationTimeoutMinutes")(event.target.value)}
              placeholder={productMessages.placeholders.reservationTimeout}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{productMessages.fields.sellCurrency}</Label>
            <CurrencyCombobox
              value={state.sellCurrency}
              onChange={(value) => field("sellCurrency")(value ?? "")}
              placeholder={productMessages.placeholders.currencySearch}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-sell-amount">{productMessages.fields.sellAmount}</Label>
            <Input
              id="product-sell-amount"
              type="number"
              min="0"
              step="0.01"
              value={state.sellAmount}
              onChange={(event) => field("sellAmount")(event.target.value)}
              placeholder={productMessages.placeholders.amount}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-cost-amount">{productMessages.fields.costAmount}</Label>
            <Input
              id="product-cost-amount"
              type="number"
              min="0"
              step="0.01"
              value={state.costAmount}
              onChange={(event) => field("costAmount")(event.target.value)}
              placeholder={productMessages.placeholders.amount}
            />
          </div>
        </div>
      </div>

      {error ? (
        <p data-slot="product-form-error" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            {productMessages.actions.cancel}
          </Button>
        ) : null}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              {productMessages.actions.saving}
            </>
          ) : mode.kind === "create" ? (
            productMessages.actions.create
          ) : (
            productMessages.actions.saveChanges
          )}
        </Button>
      </div>
    </form>
  )
}
