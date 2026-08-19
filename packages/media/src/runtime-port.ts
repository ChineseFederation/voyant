import { definePort } from "@voyant-travel/core/project"

/**
 * Host-provided authorization for a server-side site/CMS media bridge.
 *
 * The media package owns the bridge protocol but deliberately does not know how
 * a deployment authenticates sites. Managed Cloud validates its workspace
 * credential; a self-hosted deployment may provide an equivalent verifier.
 */
export interface MediaSiteClientAuthRuntime {
  authorize(request: Request): Promise<boolean>
}

export const mediaSiteClientAuthRuntimePort = definePort<MediaSiteClientAuthRuntime>({
  id: "media.site-client-auth",
  test(provider) {
    if (
      provider === null ||
      typeof provider !== "object" ||
      typeof provider.authorize !== "function"
    ) {
      throw new Error("media.site-client-auth provider must implement authorize().")
    }
  },
})

export interface InquiryAttachmentAsset {
  id: string
  name: string
  mimeType: string | null
}
export interface PreparedInquiryAttachment {
  id: string
  mimeType: string
  operationKey: string
  /** Media-issued, persisted capability proving ownership of this exact preparation. */
  ownerToken: string
  created: boolean
}
export interface InquiryAttachmentDownload extends InquiryAttachmentAsset {
  body: ArrayBuffer
}

/** Media owner authority used before an Inquiry may link a private document. */
export interface MediaInquiryAttachmentRuntime {
  preparePrivateDocument(
    bindings: unknown,
    input: {
      operationKey: string
      name: string
      mimeType: string | null
      body: ArrayBuffer
      createdBy: string
    },
  ): Promise<PreparedInquiryAttachment>
  finalizePrivateDocument(bindings: unknown, prepared: PreparedInquiryAttachment): Promise<void>
  abortPrivateDocument(bindings: unknown, prepared: PreparedInquiryAttachment): Promise<void>
  claimPrivateDocument(
    db: unknown,
    prepared: PreparedInquiryAttachment,
    usageId: string,
  ): Promise<void>
  claimExistingPrivateDocument(db: unknown, assetId: string, usageId: string): Promise<void>
  releasePrivateDocument(db: unknown, assetId: string, usageId: string): Promise<void>
  requestPrivateDocumentPurge(db: unknown, assetId: string): Promise<void>
  resolvePrivateDocument(db: unknown, assetId: string): Promise<InquiryAttachmentAsset | null>
  downloadPrivateDocument(
    db: unknown,
    bindings: unknown,
    assetId: string,
  ): Promise<InquiryAttachmentDownload | null>
}

export const mediaInquiryAttachmentRuntimePort = definePort<MediaInquiryAttachmentRuntime>({
  id: "media.inquiry-attachment",
  test(provider) {
    if (
      provider === null ||
      typeof provider !== "object" ||
      typeof provider.preparePrivateDocument !== "function" ||
      typeof provider.finalizePrivateDocument !== "function" ||
      typeof provider.abortPrivateDocument !== "function" ||
      typeof provider.claimPrivateDocument !== "function" ||
      typeof provider.claimExistingPrivateDocument !== "function" ||
      typeof provider.releasePrivateDocument !== "function" ||
      typeof provider.requestPrivateDocumentPurge !== "function" ||
      typeof provider.resolvePrivateDocument !== "function" ||
      typeof provider.downloadPrivateDocument !== "function"
    ) {
      throw new Error("media.inquiry-attachment provider must implement resolvePrivateDocument().")
    }
  },
})

export interface MediaPreparedAttachmentCleanupRuntime {
  cleanup(bindings: unknown, before: Date): Promise<number>
}

export const mediaPreparedAttachmentCleanupRuntimePort =
  definePort<MediaPreparedAttachmentCleanupRuntime>({
    id: "media.prepared-attachment-cleanup",
    test(provider) {
      if (!provider || typeof provider !== "object" || typeof provider.cleanup !== "function") {
        throw new Error("media.prepared-attachment-cleanup must implement cleanup().")
      }
    },
  })
