"use client"

import { formatMessage } from "@voyant-travel/i18n"
import { Badge } from "@voyant-travel/ui/components/badge"
import { Card, CardContent, CardHeader } from "@voyant-travel/ui/components/card"
import { cn } from "@voyant-travel/ui/lib/utils"
import type * as React from "react"

import { useInsuranceUiI18nOrDefault } from "../i18n/index.js"
import type {
  BookingInsuranceRecord,
  InsuranceInsuredPersonRecord,
  InsurancePolicyRecord,
} from "../query-options.js"

export interface BookingInsuranceCardProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Card>, "children"> {
  insurance: BookingInsuranceRecord
}

const ISSUE_STATE_VARIANT = {
  pending: "secondary",
  issued: "default",
  issue_failed: "destructive",
  cancelled: "outline",
} as const

/**
 * What was sold, and whether the traveller actually got it.
 *
 * Purely presentational: retrying and cancelling are real acts against a real
 * insurer, so they stay with the caller that can confirm them rather than
 * appearing as buttons on a read-only summary.
 *
 * The identity block is rendered from `identityVisibility` rather than from
 * whether `identity` is null. "You may not see this" and "there is nothing
 * here" are different facts, and an operator who is shown the second when the
 * first is true will go looking for data that exists.
 */
export function BookingInsuranceCard({
  insurance,
  className,
  ...props
}: BookingInsuranceCardProps) {
  const i18n = useInsuranceUiI18nOrDefault()
  const m = i18n.messages

  if (insurance.applications.length === 0 && insurance.policies.length === 0) {
    return (
      <Card data-slot="booking-insurance-card" className={cn(className)} {...props}>
        <CardHeader>
          <h3 className="text-base font-semibold">{m.bookingCard.heading}</h3>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{m.bookingCard.empty}</p>
        </CardContent>
      </Card>
    )
  }

  const insuredByApplication = new Map(
    insurance.applications.map((application) => [application.id, application.insuredPersons]),
  )

  return (
    <Card data-slot="booking-insurance-card" className={cn(className)} {...props}>
      <CardHeader className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{m.bookingCard.heading}</h3>
      </CardHeader>
      <CardContent className="space-y-6">
        {insurance.policies.map((policy) => (
          <PolicyBlock
            key={policy.id}
            policy={policy}
            insuredPersons={insuredByApplication.get(policy.applicationId) ?? []}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function PolicyBlock({
  policy,
  insuredPersons,
}: {
  policy: InsurancePolicyRecord
  insuredPersons: readonly InsuranceInsuredPersonRecord[]
}) {
  const i18n = useInsuranceUiI18nOrDefault()
  const m = i18n.messages
  const issueStateLabel = {
    pending: m.issueState.pending,
    issued: m.issueState.issued,
    issue_failed: m.issueState.issueFailed,
    cancelled: m.issueState.cancelled,
  }[policy.issueState]

  return (
    <section data-slot="insurance-policy" className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant={ISSUE_STATE_VARIANT[policy.issueState]}>{issueStateLabel}</Badge>
        {policy.issueAttempts > 1 ? (
          <span className="text-xs text-muted-foreground">
            {formatMessage(m.bookingCard.attempts, { count: policy.issueAttempts })}
          </span>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Field label={m.bookingCard.provider} value={policy.providerId} />
        <Field
          label={m.bookingCard.premium}
          // Money always goes through the bound formatter, never a local one.
          value={i18n.formatCurrency(policy.premium.amountMinor / 100, policy.premium.currency)}
        />
        <Field label={m.bookingCard.policyNumber} value={policy.policyNumber ?? "—"} />
        <Field
          label={m.bookingCard.heading}
          value={formatMessage(m.bookingCard.coverWindow, {
            from: i18n.formatDate(policy.effectiveFrom),
            to: i18n.formatDate(policy.effectiveTo),
          })}
        />
      </dl>

      {policy.failure ? (
        <div data-slot="insurance-failure" className="rounded-md border p-3 text-sm">
          <p className="font-medium">{m.failure.heading}</p>
          <p className="text-muted-foreground">{policy.failure.message}</p>
          <p className="text-muted-foreground">
            {policy.failure.retryable ? m.failure.retryable : m.failure.notRetryable}
          </p>
        </div>
      ) : null}

      {policy.cancellation ? (
        <div data-slot="insurance-cancellation" className="rounded-md border p-3 text-sm">
          <p className="font-medium">{m.cancellation.heading}</p>
          <p className="text-muted-foreground">
            {policy.cancellation.refund
              ? formatMessage(m.cancellation.refund, {
                  amount: i18n.formatCurrency(
                    policy.cancellation.refund.amountMinor / 100,
                    policy.cancellation.refund.currency,
                  ),
                })
              : m.cancellation.noRefund}
          </p>
        </div>
      ) : null}

      <div data-slot="insurance-documents" className="text-sm">
        <p className="font-medium">{m.bookingCard.documents}</p>
        {policy.documents.length === 0 ? (
          <p className="text-muted-foreground">{m.bookingCard.noDocuments}</p>
        ) : (
          <ul className="text-muted-foreground">
            {policy.documents.map((document) => (
              <li key={document.documentId}>{document.filename}</li>
            ))}
          </ul>
        )}
      </div>

      <div data-slot="insurance-insured-persons" className="text-sm">
        <p className="font-medium">{m.bookingCard.insuredPersons}</p>
        <ul>
          {insuredPersons.map((person) => (
            <li key={person.id} className="text-muted-foreground">
              {formatMessage(m.identity.insuredPerson, { initial: person.displayInitial ?? "—" })}
              {person.identityVisibility === "revealed" ? null : (
                <span className="ml-2">
                  {person.identityVisibility === "absent" ? m.identity.absent : m.identity.redacted}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </>
  )
}
