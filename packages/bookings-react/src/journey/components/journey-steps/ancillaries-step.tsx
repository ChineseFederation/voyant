"use client"

import type {
  AncillaryDisclosureV1,
  AncillaryOfferGroupV1,
  AncillaryOfferV1,
  AncillarySelectionV1,
  AncillaryTravelerFieldV1,
} from "@voyant-travel/catalog-contracts/booking-engine/ancillary-contracts"
import {
  ancillaryOfferKey,
  ancillarySelectionKey,
  hasMultipleAncillaryProviders,
  isAncillaryOfferSelectable,
} from "@voyant-travel/catalog-contracts/booking-engine/ancillary-contracts"
import { Alert, AlertDescription, AlertTitle } from "@voyant-travel/ui/components/alert"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@voyant-travel/ui/components/card"
import { Checkbox } from "@voyant-travel/ui/components/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@voyant-travel/ui/components/collapsible"
import { Label } from "@voyant-travel/ui/components/label"
import { RadioGroup, RadioGroupItem } from "@voyant-travel/ui/components/radio-group"
import { Separator } from "@voyant-travel/ui/components/separator"
import { cn } from "@voyant-travel/ui/lib/utils"
import {
  formatMessage,
  useBookingsUiI18nOrDefault,
  useBookingsUiMessagesOrDefault,
} from "../../../i18n/index.js"
import { type Draft, setAncillarySelection } from "../../lib/draft-state.js"
import { decidableAncillaryGroups } from "../booking-journey-rules.js"
import { DateField, Field, SelectField, type StepCommonProps } from "./shared.js"

// ─────────────────────────────────────────────────────────────────
// Ancillaries — third-party offers quoted live during checkout
//
// Generic over the offer group's `kind`: nothing in this file knows what is
// being offered. The group's own label, the offer titles, the provider names
// and the eligibility reasons all arrive already localised in the data; only
// the chrome around them comes from this package's catalogue.
// ─────────────────────────────────────────────────────────────────

/**
 * Radio values. Offers are prefixed so a provider cannot collide with the
 * decline control by naming an offer after it, and the value itself is the
 * source/provider/offer triple rather than the provider-local `offerId` —
 * two insurers can both call their quote `"Q-1"`.
 */
const OFFER_VALUE_PREFIX = "offer:"
const DECLINE_VALUE = "decline"

function offerValue(offer: AncillaryOfferV1): string {
  return `${OFFER_VALUE_PREFIX}${ancillaryOfferKey(offer)}`
}

export function AncillariesStep({
  draft,
  setDraft,
  shape,
}: StepCommonProps): React.ReactElement | null {
  const groups = decidableAncillaryGroups(shape)
  // Nothing connected, or nothing quoted: render nothing at all. Not an empty
  // state, not a notice — a traveller is never told about something this
  // operator does not sell.
  if (groups.length === 0) return null
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <AncillaryGroupCard key={group.kind} draft={draft} setDraft={setDraft} group={group} />
      ))}
    </div>
  )
}

function AncillaryGroupCard({
  draft,
  setDraft,
  group,
}: {
  draft: Draft
  setDraft: StepCommonProps["setDraft"]
  group: AncillaryOfferGroupV1
}): React.ReactElement | null {
  const messages = useBookingsUiMessagesOrDefault().bookingJourney.ancillaries
  const selection = (draft.ancillaries ?? []).find((entry) => entry.kind === group.kind)
  const acceptedSelection = selection?.decision === "accepted" ? selection : undefined
  const acceptedOffer = acceptedSelection
    ? group.offers.find(
        (offer) => ancillaryOfferKey(offer) === ancillarySelectionKey(acceptedSelection),
      )
    : undefined

  // One connected provider is not a comparison. When there is only one, no
  // comparison language, no ranking, no branding contest appears at all.
  const showsComparison = hasMultipleAncillaryProviders(group.offers)
  const providerCount = new Set(group.offers.map((offer) => offer.providerId)).size
  const unreachableSources = group.diagnostics.filter(
    (diagnostic) => diagnostic.status !== "ok",
  ).length

  const choose = (next: string | null): void => {
    if (!next) return
    if (next === DECLINE_VALUE) {
      setDraft((previous) =>
        setAncillarySelection(previous, group.kind, {
          kind: group.kind,
          decision: "declined",
          travelers: [],
          selectedOptionIds: [],
          acceptedDisclosures: [],
        }),
      )
      return
    }
    const offer = group.offers.find((candidate) => offerValue(candidate) === next)
    if (!offer || !isAncillaryOfferSelectable(offer)) return
    setDraft((previous) =>
      setAncillarySelection(previous, group.kind, {
        kind: group.kind,
        decision: "accepted",
        offerId: offer.offerId,
        sourceId: offer.sourceId,
        providerId: offer.providerId,
        quoteRef: offer.quoteRef,
        // What the traveller is agreeing to, recorded at the moment they agree.
        // Checkout compares the price the source can actually hold against this
        // and refuses rather than charging terms nobody consented to.
        acceptedPriceMinor: offer.price.amountMinor,
        acceptedCurrency: offer.price.currency,
        travelers: [],
        selectedOptionIds: [],
        acceptedDisclosures: [],
      }),
    )
  }

  const patchSelection = (patch: (current: AncillarySelectionV1) => AncillarySelectionV1): void => {
    setDraft((previous) => {
      const current = (previous.ancillaries ?? []).find(
        (entry) => entry.kind === group.kind && entry.decision === "accepted",
      )
      if (!current) return previous
      return setAncillarySelection(previous, group.kind, patch(current))
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{group.label}</CardTitle>
      </CardHeader>
      <Separator />
      <CardContent className="space-y-4">
        {showsComparison ? (
          <div className="space-y-1">
            <p className="font-medium text-sm">
              {formatMessage(messages.multipleProvidersTitle, { count: providerCount })}
            </p>
            <p className="text-muted-foreground text-xs">{messages.multipleProvidersHint}</p>
          </div>
        ) : null}

        {unreachableSources > 0 ? (
          <Alert>
            <AlertTitle>{messages.sourceUnavailableTitle}</AlertTitle>
            <AlertDescription>{messages.sourceUnavailableBody}</AlertDescription>
          </Alert>
        ) : null}

        <RadioGroup
          aria-label={messages.decisionLegend}
          value={radioValueFor(selection)}
          onValueChange={(next: string | null) => choose(next)}
          className="gap-3"
        >
          {/* Rendered in the order supplied. The list arrives already ordered
              eligible-first then cheapest; re-sorting here would be a second,
              unaccountable opinion about what to show first. */}
          {group.offers.map((offer) => (
            <OfferChoice
              key={ancillaryOfferKey(offer)}
              offer={offer}
              active={
                selection?.decision === "accepted" &&
                ancillarySelectionKey(selection) === ancillaryOfferKey(offer)
              }
            />
          ))}
          {/* Declining is a peer of every offer above: same container, same
              radio, same weight. It is a decision, not an escape hatch. */}
          <ChoiceShell
            value={DECLINE_VALUE}
            inputId={`bj-anc-${group.kind}-decline`}
            title={messages.declineLabel}
            description={messages.declineDescription}
            active={selection?.decision === "declined"}
          />
        </RadioGroup>

        {acceptedOffer && acceptedSelection ? (
          <AcceptedOfferDetails
            draft={draft}
            group={group}
            offer={acceptedOffer}
            selection={acceptedSelection}
            patchSelection={patchSelection}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}

function radioValueFor(selection: AncillarySelectionV1 | undefined): string | null {
  // Nothing decided yet reads as no value: no offer arrives pre-ticked and the
  // decline control is not a default either.
  if (!selection) return null
  if (selection.decision === "declined") return DECLINE_VALUE
  const key = ancillarySelectionKey(selection)
  return key ? `${OFFER_VALUE_PREFIX}${key}` : null
}

/**
 * One offer, selectable or not.
 *
 * An ineligible offer stays in place with its reason attached to it, because
 * eligibility is per entry: the same traveller may be refused by one provider
 * and accepted by the next, and hoisting the refusal to a step-level error
 * would say something untrue about the others.
 */
function OfferChoice({
  offer,
  active,
}: {
  offer: AncillaryOfferV1
  active: boolean
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault().bookingJourney.ancillaries
  const { formatCurrency, formatDateTime } = useBookingsUiI18nOrDefault()
  const selectable = isAncillaryOfferSelectable(offer)
  const inputId = `bj-anc-offer-${ancillaryOfferKey(offer)}`
  const price = formatCurrency(offer.price.amountMinor / 100, offer.price.currency)
  const priceLine = formatMessage(
    offer.pricedPerPerson ? messages.perPerson : messages.perBooking,
    { price },
  )

  return (
    <ChoiceShell
      value={offerValue(offer)}
      inputId={inputId}
      title={offer.title}
      description={formatMessage(messages.providedBy, { provider: offer.providerLabel })}
      badge={offer.planLabel ?? undefined}
      trailing={selectable ? priceLine : undefined}
      active={active}
      disabled={!selectable}
    >
      {offer.summary ? <p className="text-muted-foreground text-xs">{offer.summary}</p> : null}

      {selectable ? null : (
        <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-900 text-xs dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-medium">{messages.notAvailable}</p>
          <ul className="space-y-0.5">
            {offer.eligibility.reasons.map((reason) => (
              <li key={`${reason.code}-${reason.message}`}>{reason.message}</li>
            ))}
          </ul>
        </div>
      )}

      {offer.highlights.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger className="text-muted-foreground text-xs underline underline-offset-2">
            {messages.detailsToggle}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <dl className="mt-2 space-y-1 text-xs">
              {offer.highlights.map((highlight) => (
                <div key={highlight.label} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{highlight.label}</dt>
                  {highlight.value ? <dd>{highlight.value}</dd> : null}
                </div>
              ))}
            </dl>
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      {/* The provider's own documents, reachable before anything is bought —
          not behind acceptance and not behind a purchase. */}
      {offer.disclosures.length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium text-xs">{messages.documentsTitle}</p>
          <ul className="space-y-0.5">
            {offer.disclosures.map((disclosure) => (
              <li key={`${disclosure.kind}-${disclosure.versionId}`} className="text-xs">
                <DisclosureLink disclosure={disclosure} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-muted-foreground text-xs">
        {formatMessage(messages.priceHeldUntil, { until: formatDateTime(offer.validUntil) })}
      </p>
    </ChoiceShell>
  )
}

function DisclosureLink({ disclosure }: { disclosure: AncillaryDisclosureV1 }): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault().bookingJourney.ancillaries
  if (!disclosure.url) return <span>{disclosure.label}</span>
  return (
    <a
      href={disclosure.url}
      target="_blank"
      rel="noreferrer noopener"
      className="underline underline-offset-2"
      title={messages.documentOpensInNewTab}
    >
      {disclosure.label}
    </a>
  )
}

/**
 * The one row shape every choice uses — an offer and the decline alike.
 *
 * Sharing the container is the point: the decline control is not a link, is
 * not smaller, and does not sit below a divider. It is another radio in the
 * same group with the same weight.
 */
function ChoiceShell({
  value,
  inputId,
  title,
  description,
  badge,
  trailing,
  active,
  disabled,
  children,
}: {
  value: string
  inputId: string
  title: string
  description?: string
  badge?: string
  trailing?: string
  active: boolean
  disabled?: boolean
  children?: React.ReactNode
}): React.ReactElement {
  return (
    <div
      className={cn(
        "space-y-2 rounded-md border bg-background p-3 transition-colors",
        active ? "border-primary bg-primary/5" : null,
        disabled ? "opacity-70" : "hover:border-primary/40",
      )}
    >
      <div className="flex items-start gap-3">
        <RadioGroupItem id={inputId} value={value} disabled={disabled} className="mt-1" />
        <label htmlFor={inputId} className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-sm">{title}</span>
            {badge ? <Badge variant="secondary">{badge}</Badge> : null}
          </span>
          {description ? (
            <span className="text-muted-foreground text-xs">{description}</span>
          ) : null}
        </label>
        {trailing ? <span className="shrink-0 font-medium text-sm">{trailing}</span> : null}
      </div>
      {children ? <div className="space-y-2 pl-7">{children}</div> : null}
    </div>
  )
}

/**
 * Everything that only becomes relevant once an offer is accepted: the
 * acknowledgements the provider requires, and the per-traveller details it
 * needs to commit.
 *
 * Sensitive answers are collected here and nowhere earlier, are never echoed
 * into a summary, and are never passed to a logger or an analytics call.
 */
function AcceptedOfferDetails({
  draft,
  group,
  offer,
  selection,
  patchSelection,
}: {
  draft: Draft
  group: AncillaryOfferGroupV1
  offer: AncillaryOfferV1
  selection: AncillarySelectionV1
  patchSelection: (patch: (current: AncillarySelectionV1) => AncillarySelectionV1) => void
}): React.ReactElement | null {
  const messages = useBookingsUiMessagesOrDefault().bookingJourney.ancillaries
  const requiredDisclosures = offer.disclosures.filter((disclosure) => disclosure.required)
  const isAcknowledged = (disclosure: AncillaryDisclosureV1): boolean =>
    selection.acceptedDisclosures.some(
      (accepted) =>
        accepted.kind === disclosure.kind && accepted.versionId === disclosure.versionId,
    )
  const outstanding = requiredDisclosures.filter((disclosure) => !isAcknowledged(disclosure))

  const toggleDisclosure = (disclosure: AncillaryDisclosureV1, accepted: boolean): void => {
    patchSelection((current) => {
      const rest = current.acceptedDisclosures.filter(
        (entry) => !(entry.kind === disclosure.kind && entry.versionId === disclosure.versionId),
      )
      return {
        ...current,
        acceptedDisclosures: accepted
          ? [
              ...rest,
              {
                kind: disclosure.kind,
                versionId: disclosure.versionId,
                acceptedAt: new Date().toISOString(),
              },
            ]
          : rest,
      }
    })
  }

  const setTravelerField = (ref: string, key: string, value: string): void => {
    patchSelection((current) => {
      const rows = [...current.travelers]
      const index = rows.findIndex((row) => row.ref === ref)
      const existing = index >= 0 ? rows[index] : undefined
      const next = { ref, fields: { ...(existing?.fields ?? {}), [key]: value } }
      if (index >= 0) rows[index] = next
      else rows.push(next)
      return { ...current, travelers: rows }
    })
  }

  const hasTravelerFields = offer.requiredTravelerFields.length > 0 && draft.travelers.length > 0
  if (requiredDisclosures.length === 0 && !hasTravelerFields) return null

  return (
    <div className="space-y-4 rounded-md border border-dashed p-3">
      {requiredDisclosures.length > 0 ? (
        <div className="space-y-2">
          <p className="font-medium text-sm">{messages.documentsTitle}</p>
          {requiredDisclosures.map((disclosure) => {
            const checkboxId = `bj-anc-${group.kind}-ack-${disclosure.kind}-${disclosure.versionId}`
            return (
              <div key={checkboxId} className="flex items-start gap-2">
                <Checkbox
                  id={checkboxId}
                  checked={isAcknowledged(disclosure)}
                  onCheckedChange={(checked: boolean) => toggleDisclosure(disclosure, checked)}
                  className="mt-0.5"
                />
                {/* The link to the document itself is on the offer entry
                    above, where it is reachable before any of this. Repeating
                    it inside the label would put a link inside the checkbox's
                    own hit area. */}
                <Label htmlFor={checkboxId} className="text-xs leading-snug">
                  {formatMessage(messages.acknowledgeLabel, { document: disclosure.label })}
                </Label>
              </div>
            )
          })}
          {outstanding.length > 0 ? (
            <p className="text-muted-foreground text-xs">{messages.acknowledgeRequired}</p>
          ) : null}
        </div>
      ) : null}

      {hasTravelerFields ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="font-medium text-sm">{messages.travelerFieldsTitle}</p>
            <p className="text-muted-foreground text-xs">{messages.travelerFieldsHint}</p>
          </div>
          {draft.travelers.map((traveler, index) => {
            const ref = traveler.rowId ?? String(index)
            const row = selection.travelers.find((entry) => entry.ref === ref)
            return (
              <div key={ref} className="space-y-2">
                <p className="font-medium text-xs">
                  {formatMessage(messages.travelerNumber, { number: index + 1 })}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {offer.requiredTravelerFields.map((field) => (
                    <AncillaryTravelerFieldControl
                      key={field.key}
                      idPrefix={`bj-anc-${group.kind}-${ref}`}
                      field={field}
                      value={row?.fields[field.key] ?? ""}
                      onChange={(next) => setTravelerField(ref, field.key, next)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/**
 * One provider-declared field.
 *
 * Autofill is off for every one of them: these are a third party's one-off
 * questions, not the browser's idea of the traveller's profile. A `sensitive`
 * field additionally drops its help text, so it takes as little room on screen
 * as the answer needs.
 */
function AncillaryTravelerFieldControl({
  idPrefix,
  field,
  value,
  onChange,
}: {
  idPrefix: string
  field: AncillaryTravelerFieldV1
  value: string
  onChange: (next: string) => void
}): React.ReactElement {
  const messages = useBookingsUiMessagesOrDefault().bookingJourney.ancillaries
  const id = `${idPrefix}-${field.key}`
  // i18n-literal-ok Required marker appended to a provider-supplied field label.
  const label = field.label + (field.required ? " *" : "")

  if (field.type === "select" && field.options) {
    return (
      <SelectField
        id={id}
        label={label}
        value={value}
        options={field.options}
        onChange={onChange}
      />
    )
  }
  if (field.type === "date") {
    return <DateField id={id} label={label} value={value} onChange={onChange} range="past" />
  }
  return (
    <div className="space-y-1">
      <Field id={id} label={label} value={value} onChange={onChange} autoComplete="off" />
      {field.sensitive ? (
        <p className="text-muted-foreground text-xs">{messages.sensitiveHint}</p>
      ) : field.helpText ? (
        <p className="text-muted-foreground text-xs">{field.helpText}</p>
      ) : null}
    </div>
  )
}
