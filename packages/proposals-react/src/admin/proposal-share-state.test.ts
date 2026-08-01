import { describe, expect, it } from "vitest"

import { crmUiEnCommerceMessages } from "../i18n/en/commerce.js"
import { getProposalShareState } from "./proposal-share-state.js"

const messages = crmUiEnCommerceMessages.proposalDetailPage

describe("getProposalShareState", () => {
  it("labels draft product-only versions as review-only", () => {
    expect(getProposalShareState({ status: "draft", tripSnapshotId: null }, messages)).toEqual({
      actionLabel: "Send for review",
      isReviewOnly: true,
      notice: "Review-only: the client can suggest changes or decline, but can't accept yet.",
    })
  })

  it("labels sent product-only versions as review-only links", () => {
    expect(getProposalShareState({ status: "sent", tripSnapshotId: null }, messages)).toMatchObject(
      {
        actionLabel: "Copy review-only link",
        isReviewOnly: true,
      },
    )
  })

  it("keeps Trip-backed versions accept-oriented", () => {
    expect(
      getProposalShareState({ status: "draft", tripSnapshotId: "trsn_123" }, messages),
    ).toEqual({
      actionLabel: "Send to client",
      isReviewOnly: false,
      notice: null,
    })
    expect(
      getProposalShareState({ status: "sent", tripSnapshotId: "trsn_123" }, messages),
    ).toMatchObject({
      actionLabel: "Copy review link",
      isReviewOnly: false,
    })
  })
})
