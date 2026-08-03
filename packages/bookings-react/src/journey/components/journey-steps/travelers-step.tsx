"use client"

import {
  type BookingDraftShape,
  paxBandBaseCode,
} from "@voyant-travel/catalog-contracts/booking-engine/draft-shape"
import { Separator } from "@voyant-travel/ui/components"
import { Button } from "@voyant-travel/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { Plus } from "lucide-react"
import { useEffect, useRef } from "react"
import { formatMessage, useBookingsUiMessagesOrDefault } from "../../../i18n/index.js"
import {
  canCopyBillingContactToTraveler,
  type Draft,
  patchConfigure,
  setTravelers,
  totalPax,
} from "../../lib/draft-state.js"
import { isValidOptionalEmail } from "../../lib/email-validation.js"
import type { TravelerContactPickerProps } from "../../types.js"
import { PaxDependencyWarnings, PaxValidation } from "./configure-steps.js"
import {
  computeAge,
  cryptoRowId,
  DateField,
  Field,
  JourneyErrors,
  JourneyWarnings,
  PhoneField,
  SelectField,
  type StepCommonProps,
} from "./shared.js"

// ─────────────────────────────────────────────────────────────────
// Travelers
// ─────────────────────────────────────────────────────────────────

type TravelerBand = Draft["travelers"][number]["band"]

/** Pax counts are DERIVED from the traveler rows — each row's band is the
 *  source of truth, so the quote always matches who's actually in the list. */
function paxFromTravelers(
  travelers: Draft["travelers"],
  bands: BookingDraftShape["paxBands"],
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const band of bands) counts[band.code] = 0
  for (const traveler of travelers) {
    counts[traveler.band] = (counts[traveler.band] ?? 0) + 1
  }
  return counts
}

/** Commit a new traveler list AND re-derive the band counts in one update. */
function applyTravelers(
  draft: Draft,
  next: Draft["travelers"],
  bands: BookingDraftShape["paxBands"],
): Draft {
  return patchConfigure(setTravelers(draft, next), { pax: paxFromTravelers(next, bands) })
}

export function TravelersStep({
  draft,
  setDraft,
  shape,
  defaultPhoneCountry,
  renderTravelerContactPicker,
  warnings,
  errors,
}: StepCommonProps & {
  renderTravelerContactPicker?: (props: TravelerContactPickerProps) => React.ReactNode
  warnings?: ReadonlyArray<string>
  errors?: ReadonlyArray<string>
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault()
  const travelers = draft.travelers
  const bands = shape.paxBands
  const hasBandChoice = bands.length > 1
  const { min, max } = shape.paxBandsAllowedTotal

  // Seed the initial rows ONCE: from any pre-set band counts (detail-page
  // hand-off) or up to the minimum party size, then keep the derived pax in
  // sync. After this, the rows are authoritative.
  const seeded = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot seed guarded by the ref -- owner: bookings-react; existing suppression is intentional pending typed cleanup.
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    const target = Math.max(min, totalPax(draft), travelers.length)
    if (travelers.length >= target) {
      // Rows already exist — just make sure the counts reflect them.
      if (travelers.length > 0) setDraft(applyTravelers(draft, travelers, bands))
      return
    }
    const rows = [...travelers]
    while (rows.length < target) {
      rows.push({
        rowId: cryptoRowId(),
        firstName: "",
        lastName: "",
        band: bandForSeedIndex(draft, rows.length, shape),
      })
    }
    setDraft(applyTravelers(draft, rows, bands))
  }, [])

  const addTraveler = () => {
    const band = (bands[0]?.code ?? "adult") as TravelerBand
    const next = [...travelers, { rowId: cryptoRowId(), firstName: "", lastName: "", band }]
    setDraft(applyTravelers(draft, next, bands))
  }
  const removeTraveler = (idx: number) => {
    setDraft(
      applyTravelers(
        draft,
        travelers.filter((_, i) => i !== idx),
        bands,
      ),
    )
  }

  const atMax = max != null && travelers.length >= max

  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.bookingJourney.travelers.title}</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-4">
        {travelers.map((traveler, idx) => {
          const apply: TravelerContactPickerProps["apply"] = (contact) => {
            const next = [...travelers]
            next[idx] = {
              ...next[idx]!,
              firstName: contact.firstName,
              lastName: contact.lastName,
              email: contact.email,
              phone: contact.phone,
              personId: contact.personId,
            }
            setDraft(applyTravelers(draft, next, bands))
          }
          return (
            <TravelerCard
              key={traveler.rowId ?? idx}
              idx={idx}
              traveler={traveler}
              shape={shape}
              draft={draft}
              setDraft={setDraft}
              defaultPhoneCountry={defaultPhoneCountry}
              renderTravelerContactPicker={renderTravelerContactPicker}
              apply={apply}
              showBandSelect={hasBandChoice}
              onRemove={travelers.length > 1 ? () => removeTraveler(idx) : undefined}
            />
          )
        })}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addTraveler}
          disabled={atMax}
          className="w-full"
        >
          <Plus className="mr-2 h-4 w-4" />
          {messages.bookingJourney.travelers.addTraveler}
        </Button>

        <PaxValidation draft={draft} shape={shape} />
        <PaxDependencyWarnings draft={draft} shape={shape} />
        <JourneyErrors errors={errors} />
        <JourneyWarnings warnings={warnings} />
      </CardContent>
    </Card>
  )
}

/**
 * One traveler block — type (band) selector, name, optional contact, age, and
 * any descriptor-driven document fields. Honors `appliesToBands` so DOB is
 * required for child / infant bands and adult-only fields like passport drop
 * off the form for non-adult travelers.
 */
function TravelerCard({
  idx,
  traveler,
  shape,
  draft,
  setDraft,
  defaultPhoneCountry,
  renderTravelerContactPicker,
  apply,
  showBandSelect,
  onRemove,
}: {
  idx: number
  traveler: Draft["travelers"][number]
  shape: BookingDraftShape
  draft: Draft
  setDraft: (next: Draft) => void
  /** Default country (ISO 3166-1 alpha-2) for the traveler's phone input. */
  defaultPhoneCountry?: string
  renderTravelerContactPicker?: (props: TravelerContactPickerProps) => React.ReactNode
  apply: TravelerContactPickerProps["apply"]
  showBandSelect?: boolean
  onRemove?: () => void
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault()
  const bands = shape.paxBands
  const applicableFields = shape.travelerFields.filter((f) => {
    if (!f.appliesToBands || f.appliesToBands.length === 0) return true
    // Field requirements are stated per canonical category, so a product's
    // own tier ("child:pricing_…") matches on the category it belongs to —
    // while an explicit tier code in `appliesToBands` still wins.
    return (
      f.appliesToBands.includes(traveler.band) ||
      f.appliesToBands.includes(paxBandBaseCode(traveler.band))
    )
  })

  const dobField = applicableFields.find((f) => f.key === "dateOfBirth")
  const phoneField = applicableFields.find((f) => f.key === "phone")
  const dynamicFields = applicableFields.filter(
    (f) => !["firstName", "lastName", "email", "phone", "dateOfBirth"].includes(f.key),
  )

  // When a contact picker is wired (operator), identity comes from the picked
  // CRM contact — the manual name/email/phone inputs are never shown (pick an
  // existing contact or Create new). Only surfaces (e.g. storefront) WITHOUT a
  // picker show the manual identity fields. Travel-specific fields (DOB,
  // documents) always show.
  const showIdentity = !renderTravelerContactPicker
  const gridHasContent = showIdentity || Boolean(dobField) || dynamicFields.length > 0
  const emailError = isValidOptionalEmail(traveler.email)
    ? undefined
    : messages.bookingJourney.validation.invalidEmail

  // Live age from DOB — surfaces in the header so the user gets feedback as
  // they pick a date.
  const computedAge = traveler.dateOfBirth ? computeAge(traveler.dateOfBirth) : null

  // All row mutations go through here so the derived band counts stay in sync.
  const patchRow = (patch: Partial<Draft["travelers"][number]>) => {
    const next = [...draft.travelers]
    if (!next[idx]) return
    next[idx] = { ...next[idx], ...patch }
    setDraft(applyTravelers(draft, next, bands))
  }

  // Picking a DOB that lands in a different band snaps the type selector to
  // match, so pricing stays correct.
  const onDobChange = (v: string) => {
    const age = v ? computeAge(v) : null
    let band = traveler.band
    if (age != null) {
      const target = bands.find((b) => {
        if (b.minAge != null && age < b.minAge) return false
        if (b.maxAge != null && age > b.maxAge) return false
        return true
      })
      if (target) band = target.code as TravelerBand
    }
    patchRow({ dateOfBirth: v, band })
  }

  // Out-of-range warning — only when the DOB fits NO band (e.g. older than the
  // supplier accepts); we can't auto-fix that, the booking would be rejected.
  const ageOutOfBounds =
    computedAge != null &&
    !bands.some((b) => {
      if (b.minAge != null && computedAge < b.minAge) return false
      if (b.maxAge != null && computedAge > b.maxAge) return false
      return true
    })

  // Quick-fill from billing — useful when the lead booker is also a traveler.
  const billingContact = draft.billing.contact
  const canCopyFromBilling = canCopyBillingContactToTraveler(billingContact)
  const copyFromBilling = () => {
    patchRow({
      firstName: billingContact.firstName,
      lastName: billingContact.lastName,
      email: billingContact.email || undefined,
      phone: billingContact.phone || undefined,
      personId: billingContact.personId || undefined,
    })
  }

  const travelerName = [traveler.firstName, traveler.lastName].filter(Boolean).join(" ").trim()
  return (
    <div className="space-y-4 rounded-md border p-4">
      {/* Header: who this traveler is, with subtle row-level actions. */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">
          {formatMessage(messages.bookingJourney.travelers.travelerNumber, {
            number: idx + 1,
          })}
          {travelerName ? (
            <span className="text-muted-foreground font-normal">{` · ${travelerName}`}</span>
          ) : null}
          {computedAge != null ? (
            <span className="text-muted-foreground font-normal">
              {" · "}
              {formatMessage(messages.bookingJourney.travelers.ageLabel, {
                age: computedAge,
              })}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {canCopyFromBilling ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-muted-foreground"
              onClick={copyFromBilling}
            >
              {messages.bookingJourney.travelers.copyFromBilling}
            </Button>
          ) : null}
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-destructive hover:text-destructive"
              onClick={onRemove}
            >
              {messages.bookingJourney.travelers.remove}
            </Button>
          ) : null}
        </div>
      </div>
      {/* Traveler type — only when the product distinguishes bands. */}
      {showBandSelect ? (
        <SelectField
          id={`bj-trav-${idx}-band`}
          label={messages.bookingJourney.travelers.travelerType}
          value={traveler.band}
          options={bands.map((b) => ({ value: b.code, label: b.label }))}
          onChange={(code) => patchRow({ band: code as TravelerBand })}
        />
      ) : null}
      {/* Link an existing CRM contact (or create one) — full-width, the
          primary action; it auto-fills the name fields below. */}
      {renderTravelerContactPicker ? (
        <div>
          {renderTravelerContactPicker({
            rowIndex: idx,
            apply,
            selectedPersonId: traveler.personId,
          })}
        </div>
      ) : null}
      {gridHasContent ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {showIdentity ? (
            <>
              <Field
                id={`bj-trav-${idx}-first`}
                label={messages.bookingJourney.billing.firstName}
                value={traveler.firstName}
                onChange={(v) => patchRow({ firstName: v })}
              />
              <Field
                id={`bj-trav-${idx}-last`}
                label={messages.bookingJourney.billing.lastName}
                value={traveler.lastName}
                onChange={(v) => patchRow({ lastName: v })}
              />
              {applicableFields.some((f) => f.key === "email") ? (
                <Field
                  id={`bj-trav-${idx}-email`}
                  label={messages.bookingJourney.billing.email}
                  type="email"
                  value={traveler.email ?? ""}
                  error={emailError}
                  onChange={(v) => patchRow({ email: v })}
                />
              ) : null}
              {phoneField ? (
                <PhoneField
                  id={`bj-trav-${idx}-phone`}
                  // i18n-literal-ok Required marker appended to a descriptor-supplied field label.
                  label={phoneField.label + (phoneField.required ? " *" : "")}
                  defaultCountry={defaultPhoneCountry}
                  value={traveler.phone ?? ""}
                  onChange={(v) => patchRow({ phone: v })}
                />
              ) : null}
            </>
          ) : null}
          {dobField ? (
            <div className="space-y-1">
              <DateField
                id={`bj-trav-${idx}-dob`}
                // i18n-literal-ok Required marker appended to a descriptor-supplied field label.
                label={dobField.label + (dobField.required ? " *" : "")}
                value={traveler.dateOfBirth ?? ""}
                onChange={onDobChange}
                range="past"
              />
              {ageOutOfBounds ? (
                <p className="text-amber-600 text-xs dark:text-amber-400">
                  ⚠{" "}
                  {formatMessage(messages.bookingJourney.validation.ageOutOfRange, {
                    age: computedAge,
                  })}
                </p>
              ) : null}
            </div>
          ) : null}
          {dynamicFields.map((field) => {
            const value = (traveler.documents?.[field.key] as string | undefined) ?? ""
            const onFieldChange = (v: string) =>
              patchRow({ documents: { ...traveler.documents, [field.key]: v } })
            // i18n-literal-ok Required marker appended to a descriptor-supplied field label.
            const labelText = field.label + (field.required ? " *" : "")
            if (field.type === "select" && field.options) {
              return (
                <SelectField
                  key={field.key}
                  id={`bj-trav-${idx}-${field.key}`}
                  label={labelText}
                  value={value}
                  options={field.options}
                  onChange={onFieldChange}
                />
              )
            }
            if (field.type === "date") {
              return (
                <DateField
                  key={field.key}
                  id={`bj-trav-${idx}-${field.key}`}
                  label={labelText}
                  value={value}
                  onChange={onFieldChange}
                  range={field.key === "documentExpiry" ? "document" : "future"}
                />
              )
            }
            return (
              <Field
                key={field.key}
                id={`bj-trav-${idx}-${field.key}`}
                label={labelText}
                type="text"
                value={value}
                onChange={onFieldChange}
              />
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/** Band for a freshly-seeded row at `idx`, distributing across any pre-set
 *  band counts in order (so a detail-page hand-off of 1 adult + 1 child seeds
 *  the right two rows). Falls back to the first band. */
function bandForSeedIndex(draft: Draft, idx: number, shape: BookingDraftShape): TravelerBand {
  let cursor = 0
  for (const band of shape.paxBands) {
    const count = draft.configure.pax?.[band.code] ?? 0
    if (idx < cursor + count) return band.code as TravelerBand
    cursor += count
  }
  return (shape.paxBands[0]?.code ?? "adult") as TravelerBand
}
