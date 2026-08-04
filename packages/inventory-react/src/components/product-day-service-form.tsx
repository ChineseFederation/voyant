"use client"

import { Button } from "@voyant-travel/ui/components/button"
import { CurrencyCombobox } from "@voyant-travel/ui/components/currency-combobox"
import { Input } from "@voyant-travel/ui/components/input"
import { Label } from "@voyant-travel/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { Textarea } from "@voyant-travel/ui/components/textarea"
import { Loader2 } from "lucide-react"
import * as React from "react"
import { useProductsUiMessagesOrDefault } from "../i18n/provider.js"
import { type ProductDayServiceRecord, useProductDayServiceMutation } from "../index.js"

type ProductDayServiceType = ProductDayServiceRecord["serviceType"]
type ProductDayServiceInclusionRole = ProductDayServiceRecord["inclusionRole"]
type ProductDayServiceTravelerScope = ProductDayServiceRecord["travelerScope"]

type Mode =
  | { kind: "create"; productId: string; dayId: string; sortOrder?: number }
  | { kind: "edit"; productId: string; dayId: string; service: ProductDayServiceRecord }

export interface ProductDayServiceSupplierServiceOption {
  id: string
  name: string
  serviceType?: ProductDayServiceType
  description?: string | null
  costCurrency?: string
  costAmountCents?: number | null
}

export interface ProductDayServiceFormHelpers {
  setName: (value: string) => void
  setServiceType: (value: ProductDayServiceType) => void
  setDescription: (value: string | null) => void
  setCostCurrency: (value: string) => void
  setCostAmountCents: (value: number | null) => void
}

export interface ProductDayServiceSupplierServiceFieldProps {
  value: string | null
  disabled: boolean
  onChange: (
    supplierServiceId: string | null,
    option?: ProductDayServiceSupplierServiceOption | null,
  ) => void
}

export interface ProductDayServiceFormProps {
  mode: Mode
  onSuccess?: (service: ProductDayServiceRecord) => void
  onCancel?: () => void
  renderSupplierServiceField?: (
    props: ProductDayServiceSupplierServiceFieldProps,
  ) => React.ReactNode
  onSupplierServiceSelected?: (
    option: ProductDayServiceSupplierServiceOption,
    helpers: ProductDayServiceFormHelpers,
  ) => void
}

interface FormState {
  serviceType: ProductDayServiceType
  name: string
  description: string
  countryCode: string
  supplierServiceId: string
  supplierId: string
  facilityId: string
  startTimeLocal: string
  endTimeLocal: string
  durationMinutes: string
  inclusionRole: ProductDayServiceInclusionRole
  travelerScope: ProductDayServiceTravelerScope
  costCurrency: string
  costAmount: string
  quantity: string
  sortOrder: string
  notes: string
}

function initialState(mode: Mode): FormState {
  if (mode.kind === "edit") {
    return {
      serviceType: mode.service.serviceType,
      name: mode.service.name,
      description: mode.service.description ?? "",
      countryCode: mode.service.countryCode ?? "",
      supplierServiceId: mode.service.supplierServiceId ?? "",
      supplierId: mode.service.supplierId ?? "",
      facilityId: mode.service.facilityId ?? "",
      startTimeLocal: mode.service.startTimeLocal ?? "",
      endTimeLocal: mode.service.endTimeLocal ?? "",
      durationMinutes:
        mode.service.durationMinutes == null ? "" : String(mode.service.durationMinutes),
      inclusionRole: mode.service.inclusionRole,
      travelerScope: mode.service.travelerScope,
      costCurrency: mode.service.costCurrency,
      costAmount: String(mode.service.costAmountCents / 100),
      quantity: String(mode.service.quantity),
      sortOrder: mode.service.sortOrder == null ? "" : String(mode.service.sortOrder),
      notes: mode.service.notes ?? "",
    }
  }

  return {
    serviceType: "accommodation",
    name: "",
    description: "",
    countryCode: "",
    supplierServiceId: "",
    supplierId: "",
    facilityId: "",
    startTimeLocal: "",
    endTimeLocal: "",
    durationMinutes: "",
    inclusionRole: "included",
    travelerScope: "all",
    costCurrency: "EUR", // i18n-literal-ok ISO default currency
    costAmount: "0",
    quantity: "1",
    sortOrder: mode.sortOrder == null ? "" : String(mode.sortOrder),
    notes: "",
  }
}

export function ProductDayServiceForm({
  mode,
  onSuccess,
  onCancel,
  renderSupplierServiceField,
  onSupplierServiceSelected,
}: ProductDayServiceFormProps) {
  const messages = useProductsUiMessagesOrDefault()
  const serviceMessages = messages.productDayServiceForm
  const [state, setState] = React.useState<FormState>(() => initialState(mode))
  const [error, setError] = React.useState<string | null>(null)
  const { create, update } = useProductDayServiceMutation()

  React.useEffect(() => {
    setState(initialState(mode))
    setError(null)
  }, [mode])

  const isSubmitting = create.isPending || update.isPending
  const serviceTypes: Array<{ value: ProductDayServiceType; label: string }> = [
    { value: "accommodation", label: serviceMessages.serviceTypes.accommodation },
    { value: "transfer", label: serviceMessages.serviceTypes.transfer },
    { value: "experience", label: serviceMessages.serviceTypes.experience },
    { value: "guide", label: serviceMessages.serviceTypes.guide },
    { value: "meal", label: serviceMessages.serviceTypes.meal },
    { value: "other", label: serviceMessages.serviceTypes.other },
  ]
  const inclusionRoles: Array<{ value: ProductDayServiceInclusionRole; label: string }> = [
    { value: "included", label: serviceMessages.inclusionRoles.included },
    { value: "optional", label: serviceMessages.inclusionRoles.optional },
  ]
  const travelerScopes: Array<{ value: ProductDayServiceTravelerScope; label: string }> = [
    { value: "all", label: serviceMessages.travelerScopes.all },
    { value: "adults", label: serviceMessages.travelerScopes.adults },
    { value: "children", label: serviceMessages.travelerScopes.children },
  ]

  const field =
    <K extends keyof FormState>(key: K) =>
    (value: FormState[K]) => {
      setState((previous) => ({ ...previous, [key]: value }))
    }

  const helpers: ProductDayServiceFormHelpers = {
    setName: field("name"),
    setServiceType: field("serviceType"),
    setDescription: (value) => field("description")(value ?? ""),
    setCostCurrency: field("costCurrency"),
    setCostAmountCents: (value) => {
      field("costAmount")(value == null ? "0" : String(value / 100))
    },
  }

  const handleSupplierServiceChange = (
    supplierServiceId: string | null,
    option?: ProductDayServiceSupplierServiceOption | null,
  ) => {
    field("supplierServiceId")(supplierServiceId ?? "")

    if (!option) return

    if (onSupplierServiceSelected) {
      onSupplierServiceSelected(option, helpers)
      return
    }

    field("name")(option.name)
    if (option.serviceType) field("serviceType")(option.serviceType)
    if (option.description != null) field("description")(option.description)
    if (option.costCurrency) field("costCurrency")(option.costCurrency)
    if (option.costAmountCents != null) field("costAmount")(String(option.costAmountCents / 100))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const costAmount = Number.parseFloat(state.costAmount || "0")
    const quantity = Number.parseInt(state.quantity || "0", 10)
    const sortOrder = state.sortOrder.trim() ? Number.parseInt(state.sortOrder, 10) : null

    if (!state.name.trim()) {
      setError(serviceMessages.validation.nameRequired)
      return
    }
    if (!state.costCurrency.trim() || state.costCurrency.trim().length !== 3) {
      setError(serviceMessages.validation.currencyRequired)
      return
    }
    if (!Number.isFinite(costAmount) || costAmount < 0) {
      setError(serviceMessages.validation.costNonNegative)
      return
    }
    if (!Number.isFinite(quantity) || quantity < 1) {
      setError(serviceMessages.validation.quantityMin)
      return
    }

    const durationMinutes = state.durationMinutes.trim()
      ? Number.parseInt(state.durationMinutes, 10)
      : null

    const payload = {
      serviceType: state.serviceType,
      name: state.name.trim(),
      description: state.description.trim() ? state.description.trim() : null,
      countryCode: state.countryCode.trim() ? state.countryCode.trim().toUpperCase() : null,
      supplierServiceId: state.supplierServiceId.trim() ? state.supplierServiceId.trim() : null,
      supplierId: state.supplierId.trim() ? state.supplierId.trim() : null,
      facilityId: state.facilityId.trim() ? state.facilityId.trim() : null,
      startTimeLocal: state.startTimeLocal.trim() ? state.startTimeLocal.trim() : null,
      endTimeLocal: state.endTimeLocal.trim() ? state.endTimeLocal.trim() : null,
      durationMinutes:
        durationMinutes != null && Number.isFinite(durationMinutes) ? durationMinutes : null,
      inclusionRole: state.inclusionRole,
      travelerScope: state.travelerScope,
      costCurrency: state.costCurrency.trim().toUpperCase(),
      costAmountCents: Math.round(costAmount * 100),
      quantity,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : null,
      notes: state.notes.trim() ? state.notes.trim() : null,
    }

    try {
      const service =
        mode.kind === "create"
          ? await create.mutateAsync({
              productId: mode.productId,
              dayId: mode.dayId,
              ...payload,
            })
          : await update.mutateAsync({
              productId: mode.productId,
              dayId: mode.dayId,
              serviceId: mode.service.id,
              input: payload,
            })
      onSuccess?.(service.data)
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : serviceMessages.validation.saveFailed,
      )
    }
  }

  return (
    <form
      data-slot="product-day-service-form"
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
    >
      {renderSupplierServiceField ? (
        renderSupplierServiceField({
          value: state.supplierServiceId || null,
          disabled: isSubmitting,
          onChange: handleSupplierServiceChange,
        })
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-day-service-supplier-service">
            {serviceMessages.fields.supplierService}
          </Label>
          <Input
            id="product-day-service-supplier-service"
            value={state.supplierServiceId}
            onChange={(event) => handleSupplierServiceChange(event.target.value || null)}
            placeholder={serviceMessages.placeholders.supplierService}
            disabled={isSubmitting}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>{serviceMessages.fields.serviceType}</Label>
          <Select
            value={state.serviceType}
            onValueChange={(value) => field("serviceType")(value as ProductDayServiceType)}
            items={serviceTypes}
            disabled={isSubmitting}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {serviceTypes.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-day-service-country">{serviceMessages.fields.countryCode}</Label>
          <Input
            id="product-day-service-country"
            value={state.countryCode}
            maxLength={2}
            onChange={(event) => field("countryCode")(event.target.value)}
            placeholder={serviceMessages.placeholders.countryCode}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-day-service-name">{serviceMessages.fields.name}</Label>
        <Input
          id="product-day-service-name"
          value={state.name}
          onChange={(event) => field("name")(event.target.value)}
          placeholder={serviceMessages.placeholders.name}
          required
          disabled={isSubmitting}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-day-service-description">
          {serviceMessages.fields.description}
        </Label>
        <Textarea
          id="product-day-service-description"
          value={state.description}
          onChange={(event) => field("description")(event.target.value)}
          placeholder={serviceMessages.placeholders.description}
          disabled={isSubmitting}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-day-service-supplier">{serviceMessages.fields.supplier}</Label>
          <Input
            id="product-day-service-supplier"
            value={state.supplierId}
            onChange={(event) => field("supplierId")(event.target.value)}
            placeholder={serviceMessages.placeholders.supplier}
            disabled={isSubmitting}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-day-service-facility">{serviceMessages.fields.facility}</Label>
          <Input
            id="product-day-service-facility"
            value={state.facilityId}
            onChange={(event) => field("facilityId")(event.target.value)}
            placeholder={serviceMessages.placeholders.facility}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-day-service-start">{serviceMessages.fields.startTime}</Label>
          <Input
            id="product-day-service-start"
            type="time"
            value={state.startTimeLocal}
            onChange={(event) => field("startTimeLocal")(event.target.value)}
            disabled={isSubmitting}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-day-service-end">{serviceMessages.fields.endTime}</Label>
          <Input
            id="product-day-service-end"
            type="time"
            value={state.endTimeLocal}
            onChange={(event) => field("endTimeLocal")(event.target.value)}
            disabled={isSubmitting}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-day-service-duration">
            {serviceMessages.fields.durationMinutes}
          </Label>
          <Input
            id="product-day-service-duration"
            type="number"
            min="0"
            value={state.durationMinutes}
            onChange={(event) => field("durationMinutes")(event.target.value)}
            placeholder={serviceMessages.placeholders.durationMinutes}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>{serviceMessages.fields.inclusionRole}</Label>
          <Select
            value={state.inclusionRole}
            onValueChange={(value) =>
              field("inclusionRole")(value as ProductDayServiceInclusionRole)
            }
            items={inclusionRoles}
            disabled={isSubmitting}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {inclusionRoles.map((role) => (
                <SelectItem key={role.value} value={role.value}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{serviceMessages.fields.travelerScope}</Label>
          <Select
            value={state.travelerScope}
            onValueChange={(value) =>
              field("travelerScope")(value as ProductDayServiceTravelerScope)
            }
            items={travelerScopes}
            disabled={isSubmitting}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {travelerScopes.map((scope) => (
                <SelectItem key={scope.value} value={scope.value}>
                  {scope.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-day-service-currency">
            {serviceMessages.fields.costCurrency}
          </Label>
          <CurrencyCombobox
            value={state.costCurrency || null}
            onChange={(next) => field("costCurrency")(next ?? "")}
            disabled={isSubmitting}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-day-service-cost">{serviceMessages.fields.costAmount}</Label>
          <Input
            id="product-day-service-cost"
            type="number"
            min="0"
            step="0.01"
            value={state.costAmount}
            onChange={(event) => field("costAmount")(event.target.value)}
            disabled={isSubmitting}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-day-service-quantity">{serviceMessages.fields.quantity}</Label>
          <Input
            id="product-day-service-quantity"
            type="number"
            min="1"
            value={state.quantity}
            onChange={(event) => field("quantity")(event.target.value)}
            disabled={isSubmitting}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-day-service-sort">{serviceMessages.fields.sortOrder}</Label>
          <Input
            id="product-day-service-sort"
            type="number"
            value={state.sortOrder}
            onChange={(event) => field("sortOrder")(event.target.value)}
            disabled={isSubmitting}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-day-service-notes">{serviceMessages.fields.notes}</Label>
        <Textarea
          id="product-day-service-notes"
          value={state.notes}
          onChange={(event) => field("notes")(event.target.value)}
          placeholder={serviceMessages.placeholders.notes}
          disabled={isSubmitting}
        />
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            {messages.common.cancel}
          </Button>
        ) : null}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {mode.kind === "create"
            ? serviceMessages.actions.addService
            : serviceMessages.actions.saveService}
        </Button>
      </div>
    </form>
  )
}
