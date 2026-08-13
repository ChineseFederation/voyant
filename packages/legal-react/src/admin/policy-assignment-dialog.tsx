// agent-quality: file-size exception -- owner: legal-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
import { useOperatorAdminMessages } from "@voyant-travel/admin"
import { useMarket, useMarkets } from "@voyant-travel/commerce-react/markets"
import { useChannel, useChannels } from "@voyant-travel/distribution-react"
import { useSupplier, useSuppliers } from "@voyant-travel/distribution-react/suppliers"
import { useProduct, useProducts } from "@voyant-travel/inventory-react"
import { useOrganization, useOrganizations } from "@voyant-travel/relationships-react"
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
import { DatePicker } from "@voyant-travel/ui/components/date-picker"
import { zodResolver } from "@voyant-travel/ui/lib/zod-resolver"
import { Loader2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"
import { type LegalPolicyAssignmentRecord, useLegalPolicyAssignmentMutation } from "../index.js"

import { CHANNEL_PAGE_LIMIT, mergeUniqueOptions, SearchableSelect } from "./legal-admin-shared.js"

// Parity with the previous operator-local entity combobox, which showed a
// hardcoded "No results." empty state; the loading label is localized via
// the shared legal contract-dialog messages.
const PICKER_EMPTY_LABEL = "No results."

const SCOPE_VALUES = ["product", "channel", "supplier", "market", "organization", "global"] as const
type AssignmentScope = (typeof SCOPE_VALUES)[number]

const assignmentFormSchema = z.object({
  policyId: z.string().min(1, "policyIdRequired"),
  scope: z.enum(SCOPE_VALUES),
  productId: z.string().optional(),
  channelId: z.string().optional(),
  supplierId: z.string().optional(),
  marketId: z.string().optional(),
  organizationId: z.string().optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  priority: z.coerce.number().int().optional(),
})

type FormValues = z.input<typeof assignmentFormSchema>
type FormOutput = z.output<typeof assignmentFormSchema>

export type AssignmentData = LegalPolicyAssignmentRecord

export interface PolicyAssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  policyId: string
  assignment?: AssignmentData
  onSuccess: () => void
}

export function PolicyAssignmentDialog({
  open,
  onOpenChange,
  policyId,
  assignment,
  onSuccess,
}: PolicyAssignmentDialogProps) {
  const isEditing = !!assignment
  const t = useOperatorAdminMessages().legal.policyAssignmentDialog
  const { create, update } = useLegalPolicyAssignmentMutation()

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(assignmentFormSchema),
    defaultValues: {
      policyId,
      scope: "global",
      productId: "",
      channelId: "",
      supplierId: "",
      marketId: "",
      organizationId: "",
      validFrom: "",
      validTo: "",
      priority: 0,
    },
  })

  useEffect(() => {
    if (open && assignment) {
      form.reset({
        policyId: assignment.policyId,
        scope: assignment.scope as FormValues["scope"],
        productId: assignment.productId ?? "",
        channelId: assignment.channelId ?? "",
        supplierId: assignment.supplierId ?? "",
        marketId: assignment.marketId ?? "",
        organizationId: assignment.organizationId ?? "",
        validFrom: assignment.validFrom ?? "",
        validTo: assignment.validTo ?? "",
        priority: assignment.priority,
      })
    } else if (open) {
      form.reset({ policyId, scope: "global", priority: 0 })
    }
  }, [open, assignment, policyId, form])

  const onSubmit = async (values: FormOutput) => {
    const payload = {
      policyId: values.policyId,
      scope: values.scope,
      productId: values.productId || undefined,
      channelId: values.channelId || undefined,
      supplierId: values.supplierId || undefined,
      marketId: values.marketId || undefined,
      organizationId: values.organizationId || undefined,
      validFrom: values.validFrom || undefined,
      validTo: values.validTo || undefined,
      priority: values.priority ?? 0,
    }

    if (isEditing && assignment) {
      await update.mutateAsync({ id: assignment.id, input: payload })
    } else {
      await create.mutateAsync(payload)
    }
    onSuccess()
  }

  const watchedScope = form.watch("scope")
  const setReferenceField = (
    field: "productId" | "channelId" | "supplierId" | "marketId" | "organizationId",
    value: string | null,
  ) => {
    form.setValue(field, value ?? "", { shouldDirty: true, shouldValidate: true })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{isEditing ? t.titleEdit : t.titleNew}</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <SheetBody className="grid gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>{t.scopeLabel}</Label>
                <Select
                  items={SCOPE_VALUES.map((value) => ({ value, label: t.scopeOptions[value] }))}
                  value={form.watch("scope")}
                  onValueChange={(v) => {
                    form.setValue("scope", v as FormValues["scope"], {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                    form.setValue("productId", "")
                    form.setValue("channelId", "")
                    form.setValue("supplierId", "")
                    form.setValue("marketId", "")
                    form.setValue("organizationId", "")
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCOPE_VALUES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t.scopeOptions[value as AssignmentScope]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t.priorityLabel}</Label>
                <Input {...form.register("priority")} type="number" />
              </div>
            </div>

            {watchedScope === "product" && (
              <div className="flex flex-col gap-2">
                <Label>{t.productLabel}</Label>
                <ProductPicker
                  value={form.watch("productId") || null}
                  onChange={(id) => setReferenceField("productId", id)}
                  placeholder={t.productSearchPlaceholder}
                />
              </div>
            )}
            {watchedScope === "channel" && (
              <div className="flex flex-col gap-2">
                <Label>{t.channelLabel}</Label>
                <ChannelPicker
                  value={form.watch("channelId") || null}
                  onChange={(id) => setReferenceField("channelId", id)}
                  placeholder={t.channelSearchPlaceholder}
                />
              </div>
            )}
            {watchedScope === "supplier" && (
              <div className="flex flex-col gap-2">
                <Label>{t.supplierLabel}</Label>
                <SupplierPicker
                  value={form.watch("supplierId") || null}
                  onChange={(id) => setReferenceField("supplierId", id)}
                  placeholder={t.supplierSearchPlaceholder}
                />
              </div>
            )}
            {watchedScope === "market" && (
              <div className="flex flex-col gap-2">
                <Label>{t.marketLabel}</Label>
                <MarketPicker
                  value={form.watch("marketId") || null}
                  onChange={(id) => setReferenceField("marketId", id)}
                  placeholder={t.marketSearchPlaceholder}
                />
              </div>
            )}
            {watchedScope === "organization" && (
              <div className="flex flex-col gap-2">
                <Label>{t.organizationLabel}</Label>
                <OrganizationPicker
                  value={form.watch("organizationId") || null}
                  onChange={(id) => setReferenceField("organizationId", id)}
                  placeholder={t.organizationSearchPlaceholder}
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>{t.validFromLabel}</Label>
                <DatePicker
                  value={form.watch("validFrom") || null}
                  onChange={(next) =>
                    form.setValue("validFrom", next ?? "", {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                  placeholder={t.validFromPlaceholder}
                  className="w-full"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t.validToLabel}</Label>
                <DatePicker
                  value={form.watch("validTo") || null}
                  onChange={(next) =>
                    form.setValue("validTo", next ?? "", {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                  placeholder={t.validToPlaceholder}
                  className="w-full"
                />
              </div>
            </div>
          </SheetBody>
          <SheetFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t.cancel}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? t.saveChanges : t.createAction}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Scoped record pickers. The operator starter's previous app-local
 * `EntityCombobox` hit the same list/detail endpoints through the app RPC
 * client; these bind the equivalent domain react hooks (shared Voyant
 * provider context) so the dialog ships package-clean. The selected
 * record's detail query keeps the label resolvable when it falls outside
 * the searched page.
 */
interface ScopedPickerProps {
  value: string | null
  onChange: (id: string | null) => void
  placeholder: string
}

function usePickerLoadingLabel(): string {
  return useOperatorAdminMessages().legal.contractDialog.loading
}

function ProductPicker({ value, onChange, placeholder }: ScopedPickerProps) {
  const loadingLabel = usePickerLoadingLabel()
  const [search, setSearch] = useState("")
  const listQuery = useProducts({ search: search || undefined, limit: 25 })
  const selectedQuery = useProduct(value ?? undefined, { enabled: Boolean(value) })

  const options = useMemo(() => {
    const describe = (product: { status?: string | null; bookingMode?: string | null }) =>
      [product.status, product.bookingMode].filter(Boolean).join(" / ") || undefined
    return mergeUniqueOptions(
      listQuery.data?.data.map((product) => ({
        value: product.id,
        label: product.name,
        description: describe(product),
      })),
      selectedQuery.data
        ? [
            {
              value: selectedQuery.data.id,
              label: selectedQuery.data.name,
              description: describe(selectedQuery.data),
            },
          ]
        : undefined,
    )
  }, [listQuery.data?.data, selectedQuery.data])

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder={placeholder}
      emptyLabel={PICKER_EMPTY_LABEL}
      loadingLabel={loadingLabel}
      loading={listQuery.isLoading || selectedQuery.isLoading}
      onSearchChange={setSearch}
    />
  )
}

function ChannelPicker({ value, onChange, placeholder }: ScopedPickerProps) {
  const loadingLabel = usePickerLoadingLabel()
  // Channels expose no server-side search filter; load the widest page the
  // endpoint allows and let the combobox narrow client-side (same approach as
  // the contract dialog). 200 is the distribution list cap — asking for more
  // is a 400 and an empty picker.
  const listQuery = useChannels({ limit: CHANNEL_PAGE_LIMIT })
  const selectedQuery = useChannel(value, { enabled: Boolean(value) })

  const options = useMemo(() => {
    const describe = (channel: { kind?: string | null; status?: string | null }) =>
      [channel.kind, channel.status].filter(Boolean).join(" / ") || undefined
    return mergeUniqueOptions(
      listQuery.data?.data.map((channel) => ({
        value: channel.id,
        label: channel.name,
        description: describe(channel),
      })),
      selectedQuery.data
        ? [
            {
              value: selectedQuery.data.id,
              label: selectedQuery.data.name,
              description: describe(selectedQuery.data),
            },
          ]
        : undefined,
    )
  }, [listQuery.data?.data, selectedQuery.data])

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder={placeholder}
      emptyLabel={PICKER_EMPTY_LABEL}
      loadingLabel={loadingLabel}
      loading={listQuery.isLoading || selectedQuery.isLoading}
    />
  )
}

function SupplierPicker({ value, onChange, placeholder }: ScopedPickerProps) {
  const loadingLabel = usePickerLoadingLabel()
  const [search, setSearch] = useState("")
  const listQuery = useSuppliers({ search: search || undefined, limit: 25 })
  const selectedQuery = useSupplier(value ?? "", { enabled: Boolean(value) })

  const options = useMemo(() => {
    const describe = (supplier: { city?: string | null; country?: string | null }) =>
      [supplier.city, supplier.country].filter(Boolean).join(" / ") || undefined
    return mergeUniqueOptions(
      listQuery.data?.data.map((supplier) => ({
        value: supplier.id,
        label: supplier.name,
        description: describe(supplier),
      })),
      selectedQuery.data
        ? [
            {
              value: selectedQuery.data.data.id,
              label: selectedQuery.data.data.name,
              description: describe(selectedQuery.data.data),
            },
          ]
        : undefined,
    )
  }, [listQuery.data?.data, selectedQuery.data])

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder={placeholder}
      emptyLabel={PICKER_EMPTY_LABEL}
      loadingLabel={loadingLabel}
      loading={listQuery.isLoading || selectedQuery.isLoading}
      onSearchChange={setSearch}
    />
  )
}

function MarketPicker({ value, onChange, placeholder }: ScopedPickerProps) {
  const loadingLabel = usePickerLoadingLabel()
  const [search, setSearch] = useState("")
  const listQuery = useMarkets({ search: search || undefined, limit: 25 })
  const selectedQuery = useMarket(value, { enabled: Boolean(value) })

  const options = useMemo(() => {
    const describe = (market: { code?: string | null; defaultCurrency?: string | null }) =>
      [market.code, market.defaultCurrency].filter(Boolean).join(" / ") || undefined
    return mergeUniqueOptions(
      listQuery.data?.data.map((market) => ({
        value: market.id,
        label: market.name,
        description: describe(market),
      })),
      selectedQuery.data
        ? [
            {
              value: selectedQuery.data.id,
              label: selectedQuery.data.name,
              description: describe(selectedQuery.data),
            },
          ]
        : undefined,
    )
  }, [listQuery.data?.data, selectedQuery.data])

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder={placeholder}
      emptyLabel={PICKER_EMPTY_LABEL}
      loadingLabel={loadingLabel}
      loading={listQuery.isLoading || selectedQuery.isLoading}
      onSearchChange={setSearch}
    />
  )
}

function OrganizationPicker({ value, onChange, placeholder }: ScopedPickerProps) {
  const loadingLabel = usePickerLoadingLabel()
  const [search, setSearch] = useState("")
  const listQuery = useOrganizations({ search: search || undefined, limit: 25 })
  const selectedQuery = useOrganization(value ?? undefined, { enabled: Boolean(value) })

  const options = useMemo(() => {
    const describe = (organization: { website?: string | null; industry?: string | null }) =>
      [organization.website, organization.industry].filter(Boolean).join(" / ") || undefined
    return mergeUniqueOptions(
      listQuery.data?.data.map((organization) => ({
        value: organization.id,
        label: organization.name,
        description: describe(organization),
      })),
      selectedQuery.data
        ? [
            {
              value: selectedQuery.data.id,
              label: selectedQuery.data.name,
              description: describe(selectedQuery.data),
            },
          ]
        : undefined,
    )
  }, [listQuery.data?.data, selectedQuery.data])

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder={placeholder}
      emptyLabel={PICKER_EMPTY_LABEL}
      loadingLabel={loadingLabel}
      loading={listQuery.isLoading || selectedQuery.isLoading}
      onSearchChange={setSearch}
    />
  )
}
