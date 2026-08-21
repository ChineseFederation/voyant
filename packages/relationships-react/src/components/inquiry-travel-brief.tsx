"use client"

import type { InquiryRecord } from "@voyant-travel/relationships-contracts"
import { Badge } from "@voyant-travel/ui/components"
import { useCrmUiI18nOrDefault } from "../i18n/index.js"

export interface InquiryTravelBriefProps {
  brief: InquiryRecord["travelBrief"]
}

/**
 * The customer's trip requirements, read as a brief rather than as its storage.
 *
 * This used to render `JSON.stringify(travelBrief)` in a `<pre>`, which asks a
 * travel agent to read `durationNights` and `amountCents` out of a code block.
 */
export function InquiryTravelBrief({ brief }: InquiryTravelBriefProps) {
  const i18n = useCrmUiI18nOrDefault()
  const messages = i18n.messages.inquiryDetail
  const t = messages.brief

  if (!brief) return <p className="text-sm text-muted-foreground">{messages.noContext}</p>

  const dates = [
    brief.startDate ? i18n.formatDate(brief.startDate) : null,
    brief.endDate ? i18n.formatDate(brief.endDate) : null,
  ].filter(Boolean)
  const travellers = [
    brief.adults === undefined ? null : `${brief.adults} ${t.adults}`,
    brief.children?.length ? `${brief.children.length} ${t.children}` : null,
  ].filter(Boolean)
  const budget = brief.budget
    ? [
        brief.budget.amountCents === undefined
          ? brief.budget.currency
          : i18n.formatCurrency(brief.budget.amountCents / 100, brief.budget.currency),
        brief.budget.basis === "per_person" ? t.budgetPerPerson : t.budgetTotal,
      ].join(" ")
    : null

  const rows: { label: string; value: string }[] = [
    ...(brief.destinations?.length
      ? [
          {
            label: t.destinations,
            value: brief.destinations.map((place) => place.label).join(", "),
          },
        ]
      : []),
    ...(brief.origin ? [{ label: t.origin, value: brief.origin.label }] : []),
    ...(dates.length
      ? [
          {
            label: t.dates,
            value: [
              dates.join(" – "),
              brief.dateFlexibility ? t.flexibility[brief.dateFlexibility] : null,
            ]
              .filter(Boolean)
              .join(" · "),
          },
        ]
      : []),
    ...(brief.durationNights
      ? [{ label: t.duration, value: `${brief.durationNights} ${t.nights}` }]
      : []),
    ...(travellers.length ? [{ label: t.travellers, value: travellers.join(", ") }] : []),
    ...(brief.rooms ? [{ label: t.rooms, value: String(brief.rooms) }] : []),
    ...(budget ? [{ label: t.budget, value: budget }] : []),
    ...(brief.accessibilityOrDietaryNotes
      ? [{ label: t.notes, value: brief.accessibilityOrDietaryNotes }]
      : []),
  ]

  if (rows.length === 0 && !brief.interests?.length) {
    return <p className="text-sm text-muted-foreground">{messages.noContext}</p>
  }

  return (
    <div className="space-y-3 text-sm">
      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[10rem_1fr]">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="whitespace-pre-wrap">{row.value}</dd>
          </div>
        ))}
      </dl>
      {brief.interests?.length ? (
        <div>
          <p className="mb-1 text-muted-foreground">{t.interests}</p>
          <div className="flex flex-wrap gap-1">
            {brief.interests.map((interest) => (
              <Badge key={interest} variant="secondary">
                {interest}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
