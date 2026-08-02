// agent-quality: file-size exception -- owner: inventory-react; existing UI surface stays co-located until a dedicated split preserves behavior and tests.
import { useQuery } from "@tanstack/react-query"
import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@voyant-travel/ui/components/combobox"
import { currencies } from "@voyant-travel/utils/currencies"
import { Loader2, X } from "lucide-react"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"
import { useProductDetailApi, useProductDetailMessages, useProductLocale } from "./host.js"
import {
  ContentLanguageSwitcher,
  LanguageCombobox,
  TranslatableField,
  useProductTranslationDrafts,
} from "./product-translation-popover.js"
import { zodResolver } from "./zod-resolver.js"

const CURRENCY_OPTIONS = Object.values(currencies).map((c) => ({
  value: c.code,
  label: `${c.code} — ${c.name} (${c.symbol})`,
}))

export type ProductData = {
  id: string
  name: string
  status: "draft" | "active" | "archived"
  description: string | null
  inclusionsHtml: string | null
  exclusionsHtml: string | null
  termsHtml: string | null
  bookingMode: "date" | "date_time" | "open" | "stay" | "transfer" | "itinerary" | "other"
  visibility: "public" | "private" | "hidden"
  activated: boolean
  productTypeId: string | null
  productSubtypeCode?: string | null
  durationMinutes?: number | null
  taxClassId: string | null
  sellCurrency: string
  tags: string[]
  defaultLanguageTag?: string | null
}

type ProductTypeOption = {
  id: string
  name: string
  code: string
  active: boolean
}

type TaxClassOption = {
  id: string
  code: string
  label: string
  active: boolean
}

export interface ProductDetailFormProps {
  product?: ProductData
  onSuccess: (id?: string) => void
  onCancel?: () => void
}

function initialValues(product: ProductData | undefined) {
  if (product) {
    return {
      name: product.name,
      status: product.status,
      description: product.description ?? "",
      inclusionsHtml: product.inclusionsHtml ?? "",
      exclusionsHtml: product.exclusionsHtml ?? "",
      termsHtml: product.termsHtml ?? "",
      bookingMode: product.bookingMode,
      productTypeId: product.productTypeId ?? "",
      productSubtypeCode: product.productSubtypeCode ?? "",
      durationMinutes: product.durationMinutes ?? null,
      taxClassId: product.taxClassId ?? "",
      sellCurrency: product.sellCurrency,
      tags: product.tags ?? [],
      defaultLanguageTag: product.defaultLanguageTag ?? "",
    }
  }
  return {
    name: "",
    status: "draft" as const,
    description: "",
    inclusionsHtml: "",
    exclusionsHtml: "",
    termsHtml: "",
    bookingMode: "itinerary" as const,
    productTypeId: "",
    productSubtypeCode: "",
    durationMinutes: null,
    taxClassId: "",
    sellCurrency: "EUR",
    tags: [] as string[],
    defaultLanguageTag: "",
  }
}

export function ProductDetailForm({ product, onSuccess, onCancel }: ProductDetailFormProps) {
  const messages = useProductDetailMessages()
  const api = useProductDetailApi()
  const productMessages = messages.products.core
  const isEditing = !!product
  const productFormSchema = z.object({
    name: z.string().min(1, productMessages.validationNameRequired),
    status: z.enum(["draft", "active", "archived"]),
    description: z.string().optional().nullable(),
    inclusionsHtml: z.string().optional().nullable(),
    exclusionsHtml: z.string().optional().nullable(),
    termsHtml: z.string().optional().nullable(),
    bookingMode: z.enum(["date", "date_time", "open", "stay", "transfer", "itinerary", "other"]),
    productTypeId: z.string().optional().nullable(),
    productSubtypeCode: z
      .string()
      .max(64)
      .refine((value) => !value || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value), {
        message: productMessages.validationSubtypeCode,
      }),
    durationMinutes: z.number().int().positive().nullable(),
    taxClassId: z.string().optional().nullable(),
    sellCurrency: z
      .string()
      .min(3, productMessages.validationIsoCurrency)
      .max(3, productMessages.validationIsoCurrency),
    tags: z.array(z.string()).default([]),
    defaultLanguageTag: z.string().optional().nullable(),
  })
  type ProductFormValues = z.input<typeof productFormSchema>
  type ProductFormOutput = z.output<typeof productFormSchema>
  const productStatuses = [
    { value: "draft", label: productMessages.statusDraft },
    { value: "active", label: productMessages.statusActive },
    { value: "archived", label: productMessages.statusArchived },
  ] as const
  // Ordered most-common-first for this operator (multi-day tours, then day
  // trips). The chosen mode also drives the option pricing layout
  // (rooms vs per-person seats) — see deriveOptionPricingLayout.
  const bookingModes = [
    {
      value: "itinerary",
      label: productMessages.bookingModeItinerary,
      basis: productMessages.bookingModeItineraryBasis,
    },
    {
      value: "stay",
      label: productMessages.bookingModeStay,
      basis: productMessages.bookingModeStayBasis,
    },
    {
      value: "date",
      label: productMessages.bookingModeDate,
      basis: productMessages.bookingModeDateBasis,
    },
    {
      value: "date_time",
      label: productMessages.bookingModeDateTime,
      basis: productMessages.bookingModeDateTimeBasis,
    },
    {
      value: "transfer",
      label: productMessages.bookingModeTransfer,
      basis: productMessages.bookingModeTransferBasis,
    },
    {
      value: "open",
      label: productMessages.bookingModeOpen,
      basis: productMessages.bookingModeOpenBasis,
    },
    {
      value: "other",
      label: productMessages.bookingModeOther,
      basis: productMessages.bookingModeOtherBasis,
    },
  ] as const
  const form = useForm<ProductFormValues, unknown, ProductFormOutput>({
    resolver: zodResolver(productFormSchema),
    defaultValues: initialValues(product),
  })

  const translations = useProductTranslationDrafts(product?.id ?? null)
  const resolvedLocale = useProductLocale()
  const adminBaseLocale = resolvedLocale.split("-")[0]?.toLowerCase() || "en"
  const defaultLanguageTag = form.watch("defaultLanguageTag")?.trim() || adminBaseLocale
  const [activeLanguage, setActiveLanguage] = useState(defaultLanguageTag)

  // Following the default language keeps the active field in sync when the
  // product changes (form.reset) or the default-language setting is edited.
  useEffect(() => {
    setActiveLanguage(defaultLanguageTag)
  }, [defaultLanguageTag])

  const [tagInput, setTagInput] = useState("")
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { data: typesData } = useQuery({
    queryKey: ["product-types"],
    queryFn: () =>
      api.get<{ data: ProductTypeOption[] }>(
        "/v1/admin/products/product-types?limit=25&active=true",
      ),
  })

  const { data: taxClassesData } = useQuery({
    queryKey: ["tax-classes"],
    queryFn: () =>
      api.get<{ data: TaxClassOption[] }>("/v1/admin/finance/tax-classes?limit=100&active=true"),
  })

  const productTypes = typesData?.data ?? []
  const taxClasses = taxClassesData?.data ?? []

  useEffect(() => {
    form.reset(initialValues(product))
    setTagInput("")
  }, [product, form])

  const onSubmit = async (values: ProductFormOutput) => {
    setSubmitError(null)
    const resolvedDefaultLanguage = values.defaultLanguageTag?.trim() || adminBaseLocale
    const payload = {
      name: values.name,
      status: values.status,
      description: values.description || null,
      inclusionsHtml: values.inclusionsHtml || null,
      exclusionsHtml: values.exclusionsHtml || null,
      termsHtml: values.termsHtml || null,
      bookingMode: values.bookingMode,
      productTypeId: values.productTypeId || null,
      productSubtypeCode: values.productSubtypeCode || null,
      durationMinutes: values.durationMinutes,
      taxClassId: values.taxClassId || null,
      sellCurrency: values.sellCurrency,
      tags: values.tags,
      defaultLanguageTag: resolvedDefaultLanguage,
    }
    const persistOptions = {
      defaultLanguageTag: resolvedDefaultLanguage,
      baseName: values.name,
      baseDescription: values.description ?? "",
      baseInclusionsHtml: values.inclusionsHtml ?? "",
      baseExclusionsHtml: values.exclusionsHtml ?? "",
      baseTermsHtml: values.termsHtml ?? "",
    }

    try {
      if (isEditing) {
        await api.patch(`/v1/admin/products/${product.id}`, payload)
        await translations.persist(product.id, persistOptions)
        onSuccess()
      } else {
        const result = await api.post<{ id: string }>("/v1/admin/products", payload)
        await translations.persist(result.id, persistOptions)
        onSuccess(result.id)
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : productMessages.saveFailed)
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-1 flex-col gap-4 overflow-hidden"
    >
      <div className="grid gap-4">
        <ContentLanguageSwitcher
          activeLanguage={activeLanguage}
          defaultLanguageTag={defaultLanguageTag}
          languageTags={translations.drafts.map((draft) => draft.languageTag)}
          messages={productMessages}
          onSelect={setActiveLanguage}
          onAddLanguage={(code) => {
            translations.addLanguage(code)
            setActiveLanguage(code)
          }}
          onRemoveLanguage={(code) => {
            translations.removeLanguage(code)
            if (activeLanguage === code) setActiveLanguage(defaultLanguageTag)
          }}
        />

        <TranslatableField
          id="product-detail-name"
          label={productMessages.nameLabel}
          type="text"
          field="name"
          activeLanguage={activeLanguage}
          defaultLanguageTag={defaultLanguageTag}
          base={{
            value: form.watch("name") ?? "",
            onChange: (value) =>
              form.setValue("name", value, { shouldDirty: true, shouldValidate: true }),
          }}
          translations={translations}
          messages={productMessages}
          placeholder={productMessages.namePlaceholder}
          autoFocus
          error={form.formState.errors.name?.message}
        />

        <TranslatableField
          id="product-detail-description"
          label={productMessages.descriptionLabel}
          type="richtext"
          field="description"
          activeLanguage={activeLanguage}
          defaultLanguageTag={defaultLanguageTag}
          base={{
            value: form.watch("description") ?? "",
            onChange: (value) => form.setValue("description", value, { shouldDirty: true }),
          }}
          translations={translations}
          messages={productMessages}
          placeholder={productMessages.descriptionPlaceholder}
        />

        <TranslatableField
          id="product-detail-slug"
          label={productMessages.slugLabel}
          type="text"
          field="slug"
          activeLanguage={activeLanguage}
          defaultLanguageTag={defaultLanguageTag}
          translations={translations}
          messages={productMessages}
          placeholder={productMessages.slugPlaceholder}
        />

        <TranslatableField
          id="product-detail-inclusions"
          label={productMessages.inclusionsLabel}
          type="richtext"
          field="inclusionsHtml"
          activeLanguage={activeLanguage}
          defaultLanguageTag={defaultLanguageTag}
          base={{
            value: form.watch("inclusionsHtml") ?? "",
            onChange: (value) => form.setValue("inclusionsHtml", value, { shouldDirty: true }),
          }}
          translations={translations}
          messages={productMessages}
          placeholder={productMessages.inclusionsPlaceholder}
        />

        <TranslatableField
          id="product-detail-exclusions"
          label={productMessages.exclusionsLabel}
          type="richtext"
          field="exclusionsHtml"
          activeLanguage={activeLanguage}
          defaultLanguageTag={defaultLanguageTag}
          base={{
            value: form.watch("exclusionsHtml") ?? "",
            onChange: (value) => form.setValue("exclusionsHtml", value, { shouldDirty: true }),
          }}
          translations={translations}
          messages={productMessages}
          placeholder={productMessages.exclusionsPlaceholder}
        />

        <TranslatableField
          id="product-detail-terms"
          label={productMessages.termsLabel}
          type="richtext"
          field="termsHtml"
          activeLanguage={activeLanguage}
          defaultLanguageTag={defaultLanguageTag}
          base={{
            value: form.watch("termsHtml") ?? "",
            onChange: (value) => form.setValue("termsHtml", value, { shouldDirty: true }),
          }}
          translations={translations}
          messages={productMessages}
          placeholder={productMessages.termsPlaceholder}
        />

        <div className="flex flex-col gap-2">
          <Label htmlFor="product-detail-default-language">
            {productMessages.defaultLanguageLabel}
          </Label>
          <LanguageCombobox
            id="product-detail-default-language"
            value={form.watch("defaultLanguageTag")?.trim() || adminBaseLocale}
            onValueChange={(code) =>
              form.setValue("defaultLanguageTag", code, { shouldDirty: true })
            }
            placeholder={productMessages.translationLanguageSearch}
            emptyLabel={productMessages.translationLanguageEmpty}
          />
          <p className="text-xs text-muted-foreground">{productMessages.defaultLanguageHint}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="product-detail-tags">{productMessages.tagsLabel}</Label>
          <div className="flex flex-wrap gap-1.5">
            {(form.watch("tags") ?? []).map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1 text-xs">
                {tag}
                <button
                  type="button"
                  aria-label={`${productMessages.delete}: ${tag}`}
                  title={`${productMessages.delete}: ${tag}`}
                  className="ml-0.5 rounded-full hover:text-destructive"
                  onClick={() => {
                    const current = form.getValues("tags") ?? []
                    form.setValue(
                      "tags",
                      current.filter((t) => t !== tag),
                      { shouldDirty: true },
                    )
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <Input
            id="product-detail-tags"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault()
                const value = tagInput.trim().replace(/,+$/, "")
                const current = form.getValues("tags") ?? []
                if (value && !current.includes(value)) {
                  form.setValue("tags", [...current, value], { shouldDirty: true })
                }
                setTagInput("")
              }
            }}
            placeholder={productMessages.tagInputPlaceholder}
          />
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="flex flex-col gap-2">
            <Label id="product-detail-booking-mode-label" htmlFor="product-detail-booking-mode">
              {productMessages.bookingModeLabel}
            </Label>
            <Select
              value={form.watch("bookingMode")}
              onValueChange={(v) =>
                form.setValue("bookingMode", v as ProductFormValues["bookingMode"])
              }
              items={bookingModes}
            >
              <SelectTrigger
                id="product-detail-booking-mode"
                aria-labelledby="product-detail-booking-mode-label"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              {/* Widen past the narrow half-column trigger so the pricing-basis
                  hint isn't clipped (RO labels are the longest). */}
              <SelectContent className="min-w-[19rem]">
                {bookingModes.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <span>{m.label}</span>
                    {m.basis ? (
                      <span className="ml-auto pl-4 text-muted-foreground text-xs">{m.basis}</span>
                    ) : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 rounded-md border p-3 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label id="product-detail-product-type-label" htmlFor="product-detail-product-type">
              {productMessages.familyLabel}
            </Label>
            <Select
              value={form.watch("productTypeId") ?? ""}
              onValueChange={(v) =>
                form.setValue("productTypeId", v === "__none__" ? null : v, {
                  shouldDirty: true,
                })
              }
              items={[
                { value: "__none__", label: productMessages.productTypeNone },
                ...productTypes.map((t) => ({ value: t.id, label: t.name })),
              ]}
            >
              <SelectTrigger
                id="product-detail-product-type"
                aria-labelledby="product-detail-product-type-label"
                className="w-full"
              >
                <SelectValue placeholder={productMessages.productTypeNone} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{productMessages.productTypeNone}</SelectItem>
                {productTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="product-detail-subtype">{productMessages.subtypeLabel}</Label>
            <Input
              id="product-detail-subtype"
              value={form.watch("productSubtypeCode") ?? ""}
              onChange={(event) =>
                form.setValue("productSubtypeCode", event.target.value, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              placeholder={productMessages.subtypePlaceholder}
              aria-invalid={!!form.formState.errors.productSubtypeCode}
            />
            {form.formState.errors.productSubtypeCode?.message ? (
              <p className="text-destructive text-xs">
                {form.formState.errors.productSubtypeCode.message}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="product-detail-duration">{productMessages.durationLabel}</Label>
            <div className="relative">
              <Input
                id="product-detail-duration"
                type="number"
                min={1}
                step={1}
                value={form.watch("durationMinutes") ?? ""}
                onChange={(event) =>
                  form.setValue(
                    "durationMinutes",
                    event.target.value === "" ? null : Number(event.target.value),
                    { shouldDirty: true, shouldValidate: true },
                  )
                }
                className="pr-12"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground text-xs">
                {productMessages.durationMinutesSuffix}
              </span>
            </div>
          </div>
        </div>

        {isEditing && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label id="product-detail-status-label" htmlFor="product-detail-status">
                {productMessages.statusLabel}
              </Label>
              <Select
                value={form.watch("status")}
                onValueChange={(v) => form.setValue("status", v as ProductFormValues["status"])}
                items={productStatuses}
              >
                <SelectTrigger
                  id="product-detail-status"
                  aria-labelledby="product-detail-status-label"
                  className="w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {productStatuses.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label id="product-detail-tax-class-label" htmlFor="product-detail-tax-class">
                {productMessages.taxClassLabel}
              </Label>
              <Select
                value={form.watch("taxClassId") ?? ""}
                onValueChange={(v) =>
                  form.setValue("taxClassId", v === "__none__" ? null : v, {
                    shouldDirty: true,
                  })
                }
                items={[
                  { value: "__none__", label: productMessages.taxClassNone },
                  ...taxClasses.map((taxClass) => ({
                    value: taxClass.id,
                    label: taxClass.label,
                  })),
                ]}
              >
                <SelectTrigger
                  id="product-detail-tax-class"
                  aria-labelledby="product-detail-tax-class-label"
                  className="w-full"
                >
                  <SelectValue placeholder={productMessages.taxClassNone} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{productMessages.taxClassNone}</SelectItem>
                  {taxClasses.map((taxClass) => (
                    <SelectItem key={taxClass.id} value={taxClass.id}>
                      {taxClass.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="product-detail-sell-currency">
                {productMessages.sellCurrencyLabel}
              </Label>
              <CurrencyCombobox
                id="product-detail-sell-currency"
                value={form.watch("sellCurrency")}
                onChange={(v) => form.setValue("sellCurrency", v, { shouldDirty: true })}
                messages={productMessages}
                aria-invalid={form.formState.errors.sellCurrency ? true : undefined}
                aria-describedby={
                  form.formState.errors.sellCurrency
                    ? "product-detail-sell-currency-error"
                    : undefined
                }
              />
              {form.formState.errors.sellCurrency && (
                <p id="product-detail-sell-currency-error" className="text-xs text-destructive">
                  {form.formState.errors.sellCurrency.message}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {submitError ? (
        <p
          role="alert"
          className="whitespace-pre-line rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
        >
          {submitError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {productMessages.cancel}
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? productMessages.saveChanges : productMessages.createProduct}
        </Button>
      </div>
    </form>
  )
}

function CurrencyCombobox({
  id,
  value,
  onChange,
  messages,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedby,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  messages: ReturnType<typeof useProductDetailMessages>["products"]["core"]
  "aria-invalid"?: boolean
  "aria-describedby"?: string
}) {
  return (
    <Combobox value={value} onValueChange={(v) => onChange(v ?? "")}>
      <ComboboxInput
        id={id}
        aria-label={messages.sellCurrencyLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
        placeholder={messages.currencySearchPlaceholder}
        className="w-full"
      />
      <ComboboxContent>
        <ComboboxList>
          {CURRENCY_OPTIONS.map((c) => (
            <ComboboxItem key={c.value} value={c.value}>
              <span className="font-mono text-xs">{c.value}</span>
              <span className="truncate text-muted-foreground">{c.label.split(" — ")[1]}</span>
            </ComboboxItem>
          ))}
          <ComboboxEmpty>{messages.currencyEmpty}</ComboboxEmpty>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
