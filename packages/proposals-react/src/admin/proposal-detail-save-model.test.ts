import { describe, expect, it } from "vitest"

import {
  hasProposalSnapshotChanges,
  shouldAcceptCurrentSentVersion,
} from "./proposal-detail-save-model.js"

const draft = {
  title: "Summer proposal",
  valueCurrency: "USD",
  description: "Client-facing notes",
  lineItems: [
    {
      id: "qprod_1",
      isNew: false,
      nameSnapshot: "Hotel",
      description: null,
      quantity: 1,
      unitPriceAmountCents: 10000,
      currency: "USD",
    },
  ],
}

describe("proposal detail save model", () => {
  it("does not treat deal status and stage edits as proposal snapshot changes", () => {
    const openDraft = { ...draft, status: "open", stageId: "stage_open" }
    const wonDraft = { ...draft, status: "won", stageId: "stage_won" }

    expect(hasProposalSnapshotChanges(openDraft, wonDraft)).toBe(false)
  })

  it("treats proposal line edits as proposal snapshot changes", () => {
    expect(
      hasProposalSnapshotChanges(draft, {
        ...draft,
        lineItems: [{ ...draft.lineItems[0]!, unitPriceAmountCents: 12500 }],
      }),
    ).toBe(true)
  })

  it("treats title edits as proposal snapshot changes", () => {
    expect(
      hasProposalSnapshotChanges(draft, {
        ...draft,
        title: "Updated summer proposal",
      }),
    ).toBe(true)
  })

  it("accepts the current sent version for an unchanged manual win", () => {
    expect(
      shouldAcceptCurrentSentVersion({
        previousStatus: "open",
        nextStatus: "won",
        acceptedVersionId: null,
        currentVersionStatus: "sent",
        proposalSnapshotChanged: false,
      }),
    ).toBe(true)
  })

  it("does not accept a sent version when proposal content changed", () => {
    expect(
      shouldAcceptCurrentSentVersion({
        previousStatus: "open",
        nextStatus: "won",
        acceptedVersionId: null,
        currentVersionStatus: "sent",
        proposalSnapshotChanged: true,
      }),
    ).toBe(false)
  })
})
