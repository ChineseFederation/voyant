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
