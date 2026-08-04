"use client"

import type { BookingRequirementsV1 } from "@voyant-travel/catalog-contracts/booking-engine/requirements-contracts"
import { Separator } from "@voyant-travel/ui/components"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { CountryCombobox } from "@voyant-travel/ui/components/country-combobox"
import { Label } from "@voyant-travel/ui/components/label"
import { RadioGroup, RadioGroupItem } from "@voyant-travel/ui/components/radio-group"
import { useBookingsUiMessagesOrDefault } from "../../../i18n/index.js"
import { patchBilling, setBillingBuyerType } from "../../lib/draft-state.js"
import { isValidOptionalEmail } from "../../lib/email-validation.js"
import {
  bookingFieldMessages,
  describeUnsatisfiedRequirements,
  stepLevelUnsatisfiedMessages,
} from "../../lib/unsatisfied-requirements.js"
import type { LeadContactPickerProps } from "../../types.js"
import {
  Field,
  FieldError,
  JourneyErrors,
  JourneyWarnings,
  PhoneField,
  type StepCommonProps,
} from "./shared.js"

// ─────────────────────────────────────────────────────────────────
// Billing
// ─────────────────────────────────────────────────────────────────

/** One input this step draws, addressable from a booking-field requirement. */
type BillingControl =
  | "buyerType"
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "line1"
  | "line2"
  | "city"
  | "postal"
  | "country"
  | "companyName"
  | "vatId"

/** Keys inside the selection's `billing` block, in the group they are declared under. */
const BILLING_GROUP_CONTROLS: Record<string, BillingControl> = {
  "contact.firstName": "firstName",
  "contact.lastName": "lastName",
  "contact.email": "email",
  "contact.phone": "phone",
  "address.line1": "line1",
  "address.line2": "line2",
  "address.city": "city",
  "address.postal": "postal",
  "address.country": "country",
}

/** Keys inside `billing.company` — the `company` group's keys are relative to it. */
const COMPANY_GROUP_CONTROLS: Record<string, BillingControl> = {
  name: "companyName",
  vatId: "vatId",
}

/**
 * The control this step draws for a booking-field requirement, or `null` when
 * it draws none and the message has to group at the step.
 *
 * A `requirementKey` carries the field key but not its group, and the two
 * groups can collide (`name` is a company key), so the group comes from the
 * descriptor that declared the field.
 */
function billingControlForBookingField(
  fieldKey: string,
  shape: BookingRequirementsV1,
  drawsFields: boolean,
  buyerType: "B2C" | "B2B",
): BillingControl | null {
  const group = shape.bookingFields.find((field) => field.key === fieldKey)?.group ?? "billing"
  // The buyer-type radio group renders on every surface, picker or not.
  if (group === "billing" && fieldKey === "buyerType") return "buyerType"
  if (!drawsFields) return null
  if (group === "billing") return BILLING_GROUP_CONTROLS[fieldKey] ?? null
  // Company inputs only exist while the buyer is a company.
  if (group === "company" && buyerType === "B2B") return COMPANY_GROUP_CONTROLS[fieldKey] ?? null
  return null
}

export function BillingStep({
  draft,
  setDraft,
  shape,
  defaultPhoneCountry,
  renderLeadContactPicker,
  renderExtras,
  warnings,
  errors,
  unsatisfied,
}: StepCommonProps & {
  renderLeadContactPicker?: (props: LeadContactPickerProps) => React.ReactNode
  renderExtras?: () => React.ReactNode
  warnings?: ReadonlyArray<string>
  errors?: ReadonlyArray<string>
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault()
  const billing = draft.billing
  // `bookingFields.<key>` is a dotted path inside the billing block, and this
  // step draws those inputs — but ONLY on a surface without a CRM picker. With
  // the picker wired the operator edits identity, address and company through
  // the picker, so there is no input to sit on and the messages group at the
  // step. Restructuring the picker to accept per-field messages is a bigger
  // change than #4188 needs.
  const described = describeUnsatisfiedRequirements(unsatisfied, messages, shape)
  const drawsFields = !renderLeadContactPicker
  const controlFor = (fieldKey: string): BillingControl | null =>
    billingControlForBookingField(fieldKey, shape, drawsFields, billing.buyerType)
  const byControl = new Map<BillingControl, string>()
  for (const [fieldKey, message] of bookingFieldMessages(described)) {
    const control = controlFor(fieldKey)
    if (control && !byControl.has(control)) byControl.set(control, message)
  }
  const bookingField = (control: BillingControl): string | undefined => byControl.get(control)
  const stepUnsatisfied = stepLevelUnsatisfiedMessages(
    described,
    "billing",
    (entry) => entry.anchor.kind === "bookingField" && controlFor(entry.anchor.fieldKey) !== null,
  )
  const emailError = isValidOptionalEmail(billing.contact.email)
    ? undefined
    : messages.bookingJourney.validation.invalidEmail
  // Merge each partial from the picker (person record, org record, address
  // lookup) into the billing draft without clobbering the other slices.
  const apply: LeadContactPickerProps["apply"] = (next) => {
    const patch: Partial<typeof billing> = {}
    if (
      next.firstName !== undefined ||
      next.lastName !== undefined ||
      next.email !== undefined ||
      next.phone !== undefined ||
      next.personId !== undefined
    ) {
      patch.contact = {
        ...billing.contact,
        ...(next.firstName !== undefined ? { firstName: next.firstName } : {}),
        ...(next.lastName !== undefined ? { lastName: next.lastName } : {}),
        ...(next.email !== undefined ? { email: next.email } : {}),
        ...(next.phone !== undefined ? { phone: next.phone } : {}),
        ...(next.personId !== undefined ? { personId: next.personId } : {}),
      }
    }
    if (next.organizationId !== undefined) {
      patch.organizationId = next.organizationId
    }
    if (next.companyName !== undefined || next.taxId !== undefined) {
      patch.company = {
        name: next.companyName ?? billing.company?.name ?? "",
        vatId: next.taxId ?? billing.company?.vatId,
      }
    }
    if (next.address) {
      patch.address = { ...billing.address, ...next.address }
    }
    setDraft(patchBilling(draft, patch))
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{messages.bookingJourney.billing.title}</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>{messages.bookingJourney.billing.buyerType}</Label>
          <RadioGroup
            value={billing.buyerType}
            onValueChange={(v) => setDraft(setBillingBuyerType(draft, v as "B2C" | "B2B"))}
            className="flex gap-4"
          >
            {/* RadioGroupItem from radix wires its own internal label association — biome can't see it */}
            {/* biome-ignore lint/a11y/noLabelWithoutControl: radix RadioGroupItem provides the control  -- owner: bookings-react; existing suppression is intentional pending typed cleanup. */}
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="B2C" /> {messages.bookingJourney.billing.individual}
            </label>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: radix RadioGroupItem provides the control  -- owner: bookings-react; existing suppression is intentional pending typed cleanup. */}
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="B2B" /> {messages.bookingJourney.billing.company}
            </label>
          </RadioGroup>
          <FieldError id="bj-billing-buyerType-error" error={bookingField("buyerType")} />
        </div>

        {renderLeadContactPicker ? (
          <div>{renderLeadContactPicker({ apply, buyerType: billing.buyerType })}</div>
        ) : null}

        {/* Operator (CRM picker present): identity, address, and company all
            come from the picked person/org — created/edited via the picker,
            which already shows the selection — so nothing else to render here;
            the warnings flag any gaps. Storefront / no CRM: enter directly. */}
        {renderLeadContactPicker ? null : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                id="bj-billing-firstName"
                label={messages.bookingJourney.billing.firstName}
                value={billing.contact.firstName}
                error={bookingField("firstName")}
                onChange={(v) =>
                  setDraft(
                    patchBilling(draft, {
                      contact: { ...billing.contact, firstName: v },
                    }),
                  )
                }
              />
              <Field
                id="bj-billing-lastName"
                label={messages.bookingJourney.billing.lastName}
                value={billing.contact.lastName}
                error={bookingField("lastName")}
                onChange={(v) =>
                  setDraft(
                    patchBilling(draft, {
                      contact: { ...billing.contact, lastName: v },
                    }),
                  )
                }
              />
              <Field
                id="bj-billing-email"
                label={messages.bookingJourney.billing.email}
                type="email"
                value={billing.contact.email}
                error={emailError ?? bookingField("email")}
                onChange={(v) =>
                  setDraft(
                    patchBilling(draft, {
                      contact: { ...billing.contact, email: v },
                    }),
                  )
                }
              />
              <PhoneField
                id="bj-billing-phone"
                label={messages.bookingJourney.billing.phone}
                defaultCountry={defaultPhoneCountry}
                value={billing.contact.phone ?? ""}
                error={bookingField("phone")}
                onChange={(v) =>
                  setDraft(
                    patchBilling(draft, {
                      contact: { ...billing.contact, phone: v },
                    }),
                  )
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                id="bj-billing-line1"
                label={messages.bookingJourney.billing.addressLine1}
                value={billing.address.line1 ?? ""}
                error={bookingField("line1")}
                onChange={(v) =>
                  setDraft(
                    patchBilling(draft, {
                      address: { ...billing.address, line1: v },
                    }),
                  )
                }
              />
              <Field
                id="bj-billing-line2"
                label={messages.bookingJourney.billing.addressLine2Optional}
                value={billing.address.line2 ?? ""}
                error={bookingField("line2")}
                onChange={(v) =>
                  setDraft(
                    patchBilling(draft, {
                      address: { ...billing.address, line2: v },
                    }),
                  )
                }
              />
              <Field
                id="bj-billing-city"
                label={messages.bookingJourney.billing.city}
                value={billing.address.city ?? ""}
                error={bookingField("city")}
                onChange={(v) =>
                  setDraft(
                    patchBilling(draft, {
                      address: { ...billing.address, city: v },
                    }),
                  )
                }
              />
              <Field
                id="bj-billing-postal"
                label={messages.bookingJourney.billing.postalCode}
                value={billing.address.postal ?? ""}
                error={bookingField("postal")}
                onChange={(v) =>
                  setDraft(
                    patchBilling(draft, {
                      address: { ...billing.address, postal: v },
                    }),
                  )
                }
              />
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="bj-billing-country">
                  {messages.bookingJourney.billing.country}
                </Label>
                <CountryCombobox
                  value={billing.address.country ?? null}
                  onChange={(code) =>
                    setDraft(
                      patchBilling(draft, {
                        address: { ...billing.address, country: code ?? "" },
                      }),
                    )
                  }
                />
                <FieldError id="bj-billing-country-error" error={bookingField("country")} />
              </div>
            </div>

            {billing.buyerType === "B2B" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                  id="bj-billing-companyName"
                  label={messages.bookingJourney.billing.companyName}
                  value={billing.company?.name ?? ""}
                  error={bookingField("companyName")}
                  onChange={(v) =>
                    setDraft(
                      patchBilling(draft, {
                        company: {
                          ...(billing.company ?? { name: "" }),
                          name: v,
                        },
                      }),
                    )
                  }
                />
                <Field
                  id="bj-billing-vatId"
                  label={messages.bookingJourney.billing.vatId}
                  value={billing.company?.vatId ?? ""}
                  error={bookingField("vatId")}
                  onChange={(v) =>
                    setDraft(
                      patchBilling(draft, {
                        company: {
                          ...(billing.company ?? { name: "" }),
                          vatId: v,
                        },
                      }),
                    )
                  }
                />
              </div>
            ) : null}
          </>
        )}

        {renderExtras ? <div>{renderExtras()}</div> : null}
        <JourneyErrors errors={stepUnsatisfied} />
        <JourneyErrors errors={errors} />
        <JourneyWarnings warnings={warnings} />
      </CardContent>
    </Card>
  )
}
