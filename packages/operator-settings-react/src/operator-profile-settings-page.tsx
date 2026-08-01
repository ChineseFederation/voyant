"use client"

// agent-quality: file-size exception -- owner: operator-settings; the profile form and its coordinated brand-asset upload states stay co-located until its shared save/reset model can be extracted without duplication.

/**
 * Settings -> Organization (source-free, package-delivered).
 *
 * Operator identity, payment instructions, and operator-level booking payment
 * defaults live in separate API/storage concepts, but remain one operational
 * settings form. This is the packaged counterpart of the operator starter's
 * former app-custom page: it resolves its API surface from the admin runtime
 * context ({@link useVoyantReactContext}) and its copy from the shared operator
 * admin messages, so a source-free hosted admin can mount it in one line via
 * `createAdminCoreExtension({ settings: { extraPages: [...] } })`.
 *
 * It talks to the `@voyant-travel/operator-settings` routes already mounted on
 * the deployment runtime (`/v1/admin/settings/operator-*`).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { consumeAdminSetupPrefill } from "@voyant-travel/admin/extensions"
import { useOperatorAdminMessages } from "@voyant-travel/admin/providers/operator-admin-messages"
import {
  noDepositPolicy,
  normalizePaymentPolicy,
  type PaymentPolicy,
} from "@voyant-travel/finance/payment-policy"
import { PaymentPolicyForm, PaymentPolicyPreview } from "@voyant-travel/finance-react/ui"
import {
  DEFAULT_OPERATOR_BRAND_COLOR,
  DEFAULT_OPERATOR_CORNER_RADIUS,
  DEFAULT_OPERATOR_FONT,
  DEFAULT_OPERATOR_LOCALE,
  OPERATOR_CORNER_RADII,
  OPERATOR_FONTS,
  OPERATOR_LOCALES,
  type OperatorCornerRadius,
  type OperatorFontId,
  type OperatorLocaleId,
} from "@voyant-travel/operator-settings/branding"
import { useVoyantReactContext } from "@voyant-travel/react"
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from "@voyant-travel/ui/components"
import { Checkbox } from "@voyant-travel/ui/components/checkbox"
import { CurrencyCombobox } from "@voyant-travel/ui/components/currency-combobox"
import { PhoneInput } from "@voyant-travel/ui/components/phone-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voyant-travel/ui/components/select"
import { ImageIcon, Loader2, UploadCloud } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import {
  mergeOperatorProfileSetupPrefill,
  OPERATOR_PROFILE_SETUP_STEP_ID,
} from "./operator-profile-setup-prefill.js"

interface OperatorProfileForm {
  name?: string | null
  legalName?: string | null
  vatId?: string | null
  registrationNumber?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  logoLightAssetKey?: string | null
  logoLightMimeType?: string | null
  logoDarkAssetKey?: string | null
  logoDarkMimeType?: string | null
  iconLightAssetKey?: string | null
  iconLightMimeType?: string | null
  iconDarkAssetKey?: string | null
  iconDarkMimeType?: string | null
  brandColor?: string
  cornerRadius?: OperatorCornerRadius
  headingFont?: OperatorFontId
  bodyFont?: OperatorFontId
  faviconAssetKey?: string | null
  faviconMimeType?: string | null
  supportEmail?: string | null
  termsUrl?: string | null
  privacyUrl?: string | null
  supportedLocales?: OperatorLocaleId[]
  defaultLocale?: OperatorLocaleId
  bankTransferBeneficiary?: string | null
  iban?: string | null
  bank?: string | null
  notes?: string | null
  license?: string | null
  licenseAuthority?: string | null
  signatoryName?: string | null
  signatoryRole?: string | null
  customerPaymentPolicy?: PaymentPolicy | null
  bookingCheckoutUrlTemplate?: string | null
  invoicePayUrlTemplate?: string | null
}

type OperatorProfileRecord = Omit<
  OperatorProfileForm,
  "bankTransferBeneficiary" | "iban" | "bank" | "notes" | "customerPaymentPolicy"
>
type OperatorPaymentInstructionsRecord = Pick<
  OperatorProfileForm,
  "bankTransferBeneficiary" | "iban" | "bank" | "notes"
>
interface OperatorPaymentDefaultsRecord {
  customerPaymentPolicy?: unknown
}
type OperatorCheckoutLinksRecord = Pick<
  OperatorProfileForm,
  "bookingCheckoutUrlTemplate" | "invoicePayUrlTemplate"
>

const EMPTY_FORM: OperatorProfileForm = {
  name: "",
  legalName: "",
  vatId: "",
  registrationNumber: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  logoLightAssetKey: null,
  logoLightMimeType: null,
  logoDarkAssetKey: null,
  logoDarkMimeType: null,
  iconLightAssetKey: null,
  iconLightMimeType: null,
  iconDarkAssetKey: null,
  iconDarkMimeType: null,
  brandColor: DEFAULT_OPERATOR_BRAND_COLOR,
  cornerRadius: DEFAULT_OPERATOR_CORNER_RADIUS,
  headingFont: DEFAULT_OPERATOR_FONT,
  bodyFont: DEFAULT_OPERATOR_FONT,
  faviconAssetKey: null,
  faviconMimeType: null,
  supportEmail: "",
  termsUrl: "",
  privacyUrl: "",
  supportedLocales: [DEFAULT_OPERATOR_LOCALE],
  defaultLocale: DEFAULT_OPERATOR_LOCALE,
  bankTransferBeneficiary: "",
  iban: "",
  bank: "",
  notes: "",
  license: "",
  licenseAuthority: "",
  signatoryName: "",
  signatoryRole: "",
  customerPaymentPolicy: null,
  bookingCheckoutUrlTemplate: "",
  invoicePayUrlTemplate: "",
}

interface BrandAssetDropzoneProps {
  assetKey: string | null | undefined
  baseUrl: string
  description: string
  id: string
  label: string
  messages: {
    clickHelp: string
    drop: string
    dropActive: string
    remove: string
    replace: string
    uploaded: string
    uploading: string
    uploadFailed: string
  }
  mode: "light" | "dark"
  shape: "icon" | "logo"
  onChange(asset: { key: string; mimeType: string } | null): void
  onUpload(file: File): Promise<{ key: string; mimeType: string }>
}

function mediaUrl(baseUrl: string, assetKey: string | null | undefined) {
  if (!assetKey) return null
  const encodedKey = assetKey.split("/").map(encodeURIComponent).join("/")
  return `${baseUrl}/v1/admin/media/${encodedKey}`
}

function BrandAssetDropzone({
  assetKey,
  baseUrl,
  description,
  id,
  label,
  messages,
  mode,
  shape,
  onChange,
  onUpload,
}: BrandAssetDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const previewUrl = mediaUrl(baseUrl, assetKey)

  const upload = async (file: File) => {
    setIsUploading(true)
    try {
      onChange(await onUpload(file))
      toast.success(messages.uploaded)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : messages.uploadFailed)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        aria-label={label}
        aria-disabled={isUploading}
        onClick={() => {
          if (!isUploading) inputRef.current?.click()
        }}
        onDragEnter={(event) => {
          event.preventDefault()
          if (!isUploading) setIsDragging(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = "copy"
          if (!isUploading) setIsDragging(true)
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsDragging(false)
          }
        }}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragging(false)
          const file = event.dataTransfer.files[0]
          if (file && !isUploading) void upload(file)
        }}
        className={`group flex min-h-40 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/30 bg-muted/20 hover:border-primary/60 hover:bg-muted/40"
        } ${isUploading ? "cursor-wait opacity-70" : ""}`}
      >
        {isUploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        ) : previewUrl ? (
          <div className="flex max-w-full flex-col items-center gap-3">
            <div
              className={`flex items-center justify-center overflow-hidden rounded-md border p-3 shadow-sm ${
                shape === "icon" ? "h-20 w-20" : "h-20 w-48"
              } ${mode === "dark" ? "border-zinc-700 bg-zinc-950" : "bg-white"}`}
            >
              <img src={previewUrl} alt={label} className="max-h-full max-w-full object-contain" />
            </div>
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          </div>
        ) : (
          <UploadCloud className="h-9 w-9 text-muted-foreground transition-colors group-hover:text-primary" />
        )}
        <div>
          <p className="text-sm font-medium">
            {isUploading
              ? messages.uploading
              : isDragging
                ? messages.dropActive
                : previewUrl
                  ? messages.replace
                  : messages.drop}
          </p>
          {!isUploading ? (
            <p className="mt-1 text-xs text-muted-foreground">{messages.clickHelp}</p>
          ) : null}
        </div>
      </button>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        disabled={isUploading}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
          event.currentTarget.value = ""
        }}
      />
      <div className="flex min-h-8 justify-end">
        {previewUrl ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            {messages.remove}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Operator base currency (the FX recording base). Persisted independently of the
 * operator profile because it is a Finance operator-setting, served by the
 * finance module's `/v1/admin/finance/invoice-fx-settings` route. Editing it here
 * keeps the operator's one "financial identity" concept on the same settings page.
 */
function BaseCurrencyCard() {
  const queryClient = useQueryClient()
  const { baseUrl, fetcher } = useVoyantReactContext()
  const page = useOperatorAdminMessages().settings.operatorProfilePage
  const t = page.baseCurrency

  const { data, isPending } = useQuery({
    queryKey: ["operator-invoice-fx-settings"],
    queryFn: async (): Promise<string | null> => {
      const res = await fetcher(`${baseUrl}/v1/admin/finance/invoice-fx-settings`)
      if (!res.ok) return null
      const json = (await res.json()) as { data?: { baseCurrency?: string | null } }
      return json.data?.baseCurrency ?? null
    },
  })

  const [value, setValue] = useState<string | null>(null)
  useEffect(() => {
    if (data !== undefined) setValue(data)
  }, [data])

  const save = useMutation({
    mutationFn: async (next: string | null) => {
      const res = await fetcher(`${baseUrl}/v1/admin/finance/invoice-fx-settings`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ baseCurrency: next }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Save failed (${res.status})`)
      }
      const json = (await res.json()) as { data?: { baseCurrency?: string | null } }
      return json.data?.baseCurrency ?? null
    },
    onSuccess: (saved) => {
      setValue(saved)
      toast.success(t.savedToast)
      void queryClient.invalidateQueries({ queryKey: ["operator-invoice-fx-settings"] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t.saveFailed)
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="op-baseCurrency">{t.label}</Label>
          <CurrencyCombobox
            id="op-baseCurrency"
            value={value}
            placeholder={t.placeholder}
            disabled={isPending || save.isPending}
            onChange={setValue}
          />
          <p className="text-xs text-muted-foreground">{t.help}</p>
        </div>
        <div className="flex items-end justify-start md:justify-end">
          <Button
            type="button"
            disabled={isPending || save.isPending || value === (data ?? null)}
            onClick={() => save.mutate(value)}
          >
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {page.saveChanges}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function OperatorProfileSettingsPage() {
  const queryClient = useQueryClient()
  const { baseUrl, fetcher } = useVoyantReactContext()
  const t = useOperatorAdminMessages().settings.operatorProfilePage
  const [setupPrefill] = useState(() => consumeAdminSetupPrefill(OPERATOR_PROFILE_SETUP_STEP_ID))

  const { data, isPending } = useQuery({
    queryKey: ["operator-profile-settings"],
    queryFn: async (): Promise<OperatorProfileForm | null> => {
      const [profileRes, instructionsRes, defaultsRes] = await Promise.all([
        fetcher(`${baseUrl}/v1/admin/settings/operator-profile`),
        fetcher(`${baseUrl}/v1/admin/settings/operator-payment-instructions`),
        fetcher(`${baseUrl}/v1/admin/settings/operator-payment-defaults`),
      ])
      if (!profileRes.ok && !instructionsRes.ok && !defaultsRes.ok) return null

      const [profileJson, instructionsJson, defaultsJson] = await Promise.all([
        profileRes.ok
          ? ((await profileRes.json()) as { data?: OperatorProfileRecord | null })
          : { data: null },
        instructionsRes.ok
          ? ((await instructionsRes.json()) as { data?: OperatorPaymentInstructionsRecord | null })
          : { data: null },
        defaultsRes.ok
          ? ((await defaultsRes.json()) as {
              data?: (OperatorPaymentDefaultsRecord & OperatorCheckoutLinksRecord) | null
            })
          : { data: null },
      ])

      return {
        ...EMPTY_FORM,
        ...(profileJson.data ?? {}),
        ...(instructionsJson.data ?? {}),
        customerPaymentPolicy:
          normalizePaymentPolicy(defaultsJson.data?.customerPaymentPolicy) ?? noDepositPolicy,
        bookingCheckoutUrlTemplate: defaultsJson.data?.bookingCheckoutUrlTemplate ?? "",
        invoicePayUrlTemplate: defaultsJson.data?.invoicePayUrlTemplate ?? "",
      }
    },
  })
  const [form, setForm] = useState<OperatorProfileForm>(EMPTY_FORM)

  useEffect(() => {
    if (data) {
      setForm(mergeOperatorProfileSetupPrefill({ ...EMPTY_FORM, ...data }, setupPrefill))
    }
  }, [data, setupPrefill])

  const save = useMutation({
    mutationFn: async (next: OperatorProfileForm) => {
      const jsonHeaders = { "content-type": "application/json" }
      const responses = await Promise.all([
        fetcher(`${baseUrl}/v1/admin/settings/operator-profile`, {
          method: "PATCH",
          headers: jsonHeaders,
          body: JSON.stringify({
            name: next.name ?? null,
            legalName: next.legalName ?? null,
            vatId: next.vatId ?? null,
            registrationNumber: next.registrationNumber ?? null,
            address: next.address ?? null,
            phone: next.phone ?? null,
            email: next.email ?? null,
            website: next.website ?? null,
            logoLightAssetKey: next.logoLightAssetKey ?? null,
            logoLightMimeType: next.logoLightMimeType ?? null,
            logoDarkAssetKey: next.logoDarkAssetKey ?? null,
            logoDarkMimeType: next.logoDarkMimeType ?? null,
            iconLightAssetKey: next.iconLightAssetKey ?? null,
            iconLightMimeType: next.iconLightMimeType ?? null,
            iconDarkAssetKey: next.iconDarkAssetKey ?? null,
            iconDarkMimeType: next.iconDarkMimeType ?? null,
            brandColor: next.brandColor ?? DEFAULT_OPERATOR_BRAND_COLOR,
            cornerRadius: next.cornerRadius ?? DEFAULT_OPERATOR_CORNER_RADIUS,
            headingFont: next.headingFont ?? DEFAULT_OPERATOR_FONT,
            bodyFont: next.bodyFont ?? DEFAULT_OPERATOR_FONT,
            faviconAssetKey: next.faviconAssetKey ?? null,
            faviconMimeType: next.faviconMimeType ?? null,
            supportEmail: next.supportEmail || null,
            termsUrl: next.termsUrl || null,
            privacyUrl: next.privacyUrl || null,
            supportedLocales: next.supportedLocales ?? [DEFAULT_OPERATOR_LOCALE],
            defaultLocale: next.defaultLocale ?? DEFAULT_OPERATOR_LOCALE,
            license: next.license ?? null,
            licenseAuthority: next.licenseAuthority ?? null,
            signatoryName: next.signatoryName ?? null,
            signatoryRole: next.signatoryRole ?? null,
          }),
        }),
        fetcher(`${baseUrl}/v1/admin/settings/operator-payment-instructions`, {
          method: "PATCH",
          headers: jsonHeaders,
          body: JSON.stringify({
            bankTransferBeneficiary: next.bankTransferBeneficiary ?? null,
            iban: next.iban ?? null,
            bank: next.bank ?? null,
            notes: next.notes ?? null,
          }),
        }),
        fetcher(`${baseUrl}/v1/admin/settings/operator-payment-defaults`, {
          method: "PATCH",
          headers: jsonHeaders,
          body: JSON.stringify({
            customerPaymentPolicy: next.customerPaymentPolicy ?? null,
            bookingCheckoutUrlTemplate: next.bookingCheckoutUrlTemplate || null,
            invoicePayUrlTemplate: next.invoicePayUrlTemplate || null,
          }),
        }),
      ])
      const failed = responses.find((res) => !res.ok)
      if (failed) {
        const body = (await failed.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Save failed (${failed.status})`)
      }
    },
    onSuccess: () => {
      toast.success(t.savedToast)
      void queryClient.invalidateQueries({ queryKey: ["operator-profile-settings"] })
      void queryClient.invalidateQueries({ queryKey: ["public-operator-profile"] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t.saveFailed)
    },
  })

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const setField = <K extends keyof OperatorProfileForm>(key: K, value: OperatorProfileForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const uploadBrandAsset = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      throw new Error(t.branding.imageOnly)
    }
    if (file.size > 2 * 1_024 * 1_024) {
      throw new Error(t.branding.tooLarge)
    }

    const body = new FormData()
    body.append("file", file)
    const response = await fetcher(`${baseUrl}/v1/admin/uploads`, {
      method: "POST",
      body,
    })
    if (!response.ok) throw new Error(`${t.branding.uploadFailed} (${response.status})`)
    return (await response.json()) as { key: string; mimeType: string }
  }

  return (
    <form
      className="mx-auto flex max-w-4xl flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(form)
      }}
    >
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.descriptionPrefix}
          <code>{t.descriptionCodeFragment}</code>
          {t.descriptionSuffix}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t.branding.title}</CardTitle>
          <CardDescription>{t.branding.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="op-brandColor">{t.branding.brandColorLabel}</Label>
              <div className="flex gap-2">
                <Input
                  id="op-brandColor"
                  type="color"
                  className="w-14 shrink-0 p-1"
                  value={form.brandColor ?? DEFAULT_OPERATOR_BRAND_COLOR}
                  onChange={(e) => setField("brandColor", e.target.value)}
                />
                <Input
                  aria-label={t.branding.brandColorHexLabel}
                  value={form.brandColor ?? DEFAULT_OPERATOR_BRAND_COLOR}
                  onChange={(e) => setField("brandColor", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="op-cornerRadius">{t.branding.cornerRadiusLabel}</Label>
              <Select
                value={form.cornerRadius ?? DEFAULT_OPERATOR_CORNER_RADIUS}
                onValueChange={(value) => setField("cornerRadius", value as OperatorCornerRadius)}
              >
                <SelectTrigger id="op-cornerRadius" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATOR_CORNER_RADII.map((radius) => (
                    <SelectItem key={radius} value={radius}>
                      {radius}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="op-headingFont">{t.branding.headingFontLabel}</Label>
              <Select
                value={form.headingFont ?? DEFAULT_OPERATOR_FONT}
                onValueChange={(value) => setField("headingFont", value as OperatorFontId)}
              >
                <SelectTrigger id="op-headingFont" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATOR_FONTS.map((font) => (
                    <SelectItem key={font.id} value={font.id}>
                      {font.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="op-bodyFont">{t.branding.bodyFontLabel}</Label>
              <Select
                value={form.bodyFont ?? DEFAULT_OPERATOR_FONT}
                onValueChange={(value) => setField("bodyFont", value as OperatorFontId)}
              >
                <SelectTrigger id="op-bodyFont" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATOR_FONTS.map((font) => (
                    <SelectItem key={font.id} value={font.id}>
                      {font.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">{t.branding.horizontalLogoTitle}</h3>
              <p className="text-sm text-muted-foreground">
                {t.branding.horizontalLogoDescription}
              </p>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <BrandAssetDropzone
                id="op-logo-light"
                label={`${t.branding.horizontalLogoTitle} — ${t.branding.lightModeLabel}`}
                description={t.branding.lightModeHelp}
                assetKey={form.logoLightAssetKey}
                baseUrl={baseUrl}
                mode="light"
                shape="logo"
                messages={t.branding}
                onUpload={uploadBrandAsset}
                onChange={(asset) =>
                  setForm((current) => ({
                    ...current,
                    logoLightAssetKey: asset?.key ?? null,
                    logoLightMimeType: asset?.mimeType ?? null,
                  }))
                }
              />
              <BrandAssetDropzone
                id="op-logo-dark"
                label={`${t.branding.horizontalLogoTitle} — ${t.branding.darkModeLabel}`}
                description={t.branding.darkModeHelp}
                assetKey={form.logoDarkAssetKey}
                baseUrl={baseUrl}
                mode="dark"
                shape="logo"
                messages={t.branding}
                onUpload={uploadBrandAsset}
                onChange={(asset) =>
                  setForm((current) => ({
                    ...current,
                    logoDarkAssetKey: asset?.key ?? null,
                    logoDarkMimeType: asset?.mimeType ?? null,
                  }))
                }
              />
            </div>
          </section>
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">{t.branding.iconTitle}</h3>
              <p className="text-sm text-muted-foreground">{t.branding.iconDescription}</p>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <BrandAssetDropzone
                id="op-icon-light"
                label={`${t.branding.iconTitle} — ${t.branding.lightModeLabel}`}
                description={t.branding.lightModeHelp}
                assetKey={form.iconLightAssetKey}
                baseUrl={baseUrl}
                mode="light"
                shape="icon"
                messages={t.branding}
                onUpload={uploadBrandAsset}
                onChange={(asset) =>
                  setForm((current) => ({
                    ...current,
                    iconLightAssetKey: asset?.key ?? null,
                    iconLightMimeType: asset?.mimeType ?? null,
                  }))
                }
              />
              <BrandAssetDropzone
                id="op-icon-dark"
                label={`${t.branding.iconTitle} — ${t.branding.darkModeLabel}`}
                description={t.branding.darkModeHelp}
                assetKey={form.iconDarkAssetKey}
                baseUrl={baseUrl}
                mode="dark"
                shape="icon"
                messages={t.branding}
                onUpload={uploadBrandAsset}
                onChange={(asset) =>
                  setForm((current) => ({
                    ...current,
                    iconDarkAssetKey: asset?.key ?? null,
                    iconDarkMimeType: asset?.mimeType ?? null,
                  }))
                }
              />
            </div>
          </section>
          <section className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">{t.branding.faviconTitle}</h3>
              <p className="text-sm text-muted-foreground">{t.branding.faviconDescription}</p>
            </div>
            <BrandAssetDropzone
              id="op-favicon"
              label={t.branding.faviconTitle}
              description={t.branding.faviconHelp}
              assetKey={form.faviconAssetKey}
              baseUrl={baseUrl}
              mode="light"
              shape="icon"
              messages={t.branding}
              onUpload={uploadBrandAsset}
              onChange={(asset) =>
                setForm((current) => ({
                  ...current,
                  faviconAssetKey: asset?.key ?? null,
                  faviconMimeType: asset?.mimeType ?? null,
                }))
              }
            />
          </section>
          <p className="text-xs text-muted-foreground">{t.branding.assetHelp}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.customerExperience.title}</CardTitle>
          <CardDescription>{t.customerExperience.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="op-supportEmail">{t.customerExperience.supportEmailLabel}</Label>
              <Input
                id="op-supportEmail"
                type="email"
                value={form.supportEmail ?? ""}
                onChange={(e) => setField("supportEmail", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="op-termsUrl">{t.customerExperience.termsUrlLabel}</Label>
              <Input
                id="op-termsUrl"
                type="url"
                value={form.termsUrl ?? ""}
                onChange={(e) => setField("termsUrl", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="op-privacyUrl">{t.customerExperience.privacyUrlLabel}</Label>
              <Input
                id="op-privacyUrl"
                type="url"
                value={form.privacyUrl ?? ""}
                onChange={(e) => setField("privacyUrl", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t.customerExperience.supportedLocalesLabel}</Label>
              {OPERATOR_LOCALES.map((locale) => {
                const supported = form.supportedLocales ?? [DEFAULT_OPERATOR_LOCALE]
                return (
                  <div key={locale.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`op-locale-${locale.id}`}
                      checked={supported.includes(locale.id)}
                      disabled={supported.length === 1 && supported[0] === locale.id}
                      onCheckedChange={(checked) => {
                        const next = checked
                          ? [...new Set([...supported, locale.id])]
                          : supported.filter((value) => value !== locale.id)
                        setForm((current) => ({
                          ...current,
                          supportedLocales: next,
                          defaultLocale: next.includes(
                            current.defaultLocale ?? DEFAULT_OPERATOR_LOCALE,
                          )
                            ? current.defaultLocale
                            : next[0],
                        }))
                      }}
                    />
                    <Label htmlFor={`op-locale-${locale.id}`} className="font-normal">
                      {locale.label}
                    </Label>
                  </div>
                )
              })}
            </div>
            <div className="space-y-1">
              <Label htmlFor="op-defaultLocale">{t.customerExperience.defaultLocaleLabel}</Label>
              <Select
                value={form.defaultLocale ?? DEFAULT_OPERATOR_LOCALE}
                onValueChange={(value) => setField("defaultLocale", value as OperatorLocaleId)}
              >
                <SelectTrigger id="op-defaultLocale" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATOR_LOCALES.filter((locale) =>
                    (form.supportedLocales ?? [DEFAULT_OPERATOR_LOCALE]).includes(locale.id),
                  ).map((locale) => (
                    <SelectItem key={locale.id} value={locale.id}>
                      {locale.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.identity.title}</CardTitle>
          <CardDescription>{t.identity.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="op-name">{t.identity.nameLabel}</Label>
            <Input
              id="op-name"
              value={form.name ?? ""}
              onChange={(e) => setField("name", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-legalName">{t.identity.legalNameLabel}</Label>
            <Input
              id="op-legalName"
              value={form.legalName ?? ""}
              onChange={(e) => setField("legalName", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-vatId">{t.identity.vatIdLabel}</Label>
            <Input
              id="op-vatId"
              value={form.vatId ?? ""}
              onChange={(e) => setField("vatId", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-regNum">{t.identity.registrationNumberLabel}</Label>
            <Input
              id="op-regNum"
              value={form.registrationNumber ?? ""}
              onChange={(e) => setField("registrationNumber", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.contact.title}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="op-address">{t.contact.addressLabel}</Label>
            <Textarea
              id="op-address"
              value={form.address ?? ""}
              onChange={(e) => setField("address", e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-phone">{t.contact.phoneLabel}</Label>
            <PhoneInput
              id="op-phone"
              value={form.phone ?? ""}
              onChange={(value) => setField("phone", value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-email">{t.contact.emailLabel}</Label>
            <Input
              id="op-email"
              type="email"
              value={form.email ?? ""}
              onChange={(e) => setField("email", e.target.value)}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="op-website">{t.contact.websiteLabel}</Label>
            <Input
              id="op-website"
              type="url"
              value={form.website ?? ""}
              onChange={(e) => setField("website", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.paymentCollection.title}</CardTitle>
          <CardDescription>{t.paymentCollection.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="op-bankTransferBeneficiary">
              {t.paymentCollection.beneficiaryLabel}
            </Label>
            <Input
              id="op-bankTransferBeneficiary"
              value={form.bankTransferBeneficiary ?? ""}
              placeholder={t.paymentCollection.beneficiaryPlaceholder}
              onChange={(e) => setField("bankTransferBeneficiary", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-iban">{t.paymentCollection.ibanLabel}</Label>
            <Input
              id="op-iban"
              value={form.iban ?? ""}
              onChange={(e) => setField("iban", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-bank">{t.paymentCollection.bankLabel}</Label>
            <Input
              id="op-bank"
              value={form.bank ?? ""}
              onChange={(e) => setField("bank", e.target.value)}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="op-notes">{t.paymentCollection.notesLabel}</Label>
            <Textarea
              id="op-notes"
              value={form.notes ?? ""}
              onChange={(e) => setField("notes", e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <BaseCurrencyCard />

      <Card>
        <CardHeader>
          <CardTitle>{t.license.title}</CardTitle>
          <CardDescription>{t.license.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="op-license">{t.license.licenseLabel}</Label>
            <Input
              id="op-license"
              value={form.license ?? ""}
              onChange={(e) => setField("license", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-licenseAuthority">{t.license.authorityLabel}</Label>
            <Input
              id="op-licenseAuthority"
              value={form.licenseAuthority ?? ""}
              onChange={(e) => setField("licenseAuthority", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.signatory.title}</CardTitle>
          <CardDescription>{t.signatory.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="op-signatoryName">{t.signatory.nameLabel}</Label>
            <Input
              id="op-signatoryName"
              value={form.signatoryName ?? ""}
              onChange={(e) => setField("signatoryName", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-signatoryRole">{t.signatory.roleLabel}</Label>
            <Input
              id="op-signatoryRole"
              placeholder={t.signatory.rolePlaceholder}
              value={form.signatoryRole ?? ""}
              onChange={(e) => setField("signatoryRole", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.defaultPaymentPolicy.title}</CardTitle>
          <CardDescription>{t.defaultPaymentPolicy.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <PaymentPolicyForm
            value={form.customerPaymentPolicy ?? null}
            onChange={(next) => setField("customerPaymentPolicy", next)}
            inheritable={false}
          />
          <PaymentPolicyPreview policy={form.customerPaymentPolicy ?? noDepositPolicy} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.checkoutLinks.title}</CardTitle>
          <CardDescription>{t.checkoutLinks.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="space-y-1">
            <Label htmlFor="op-bookingCheckoutUrlTemplate">
              {t.checkoutLinks.bookingCheckoutUrlTemplateLabel}
            </Label>
            <Input
              id="op-bookingCheckoutUrlTemplate"
              value={form.bookingCheckoutUrlTemplate ?? ""}
              placeholder={t.checkoutLinks.bookingCheckoutUrlTemplatePlaceholder}
              onChange={(e) => setField("bookingCheckoutUrlTemplate", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t.checkoutLinks.bookingCheckoutUrlTemplateHelp}
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-invoicePayUrlTemplate">
              {t.checkoutLinks.invoicePayUrlTemplateLabel}
            </Label>
            <Input
              id="op-invoicePayUrlTemplate"
              value={form.invoicePayUrlTemplate ?? ""}
              placeholder={t.checkoutLinks.invoicePayUrlTemplatePlaceholder}
              onChange={(e) => setField("invoicePayUrlTemplate", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t.checkoutLinks.invoicePayUrlTemplateHelp}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {t.saveChanges}
        </Button>
      </div>
    </form>
  )
}
