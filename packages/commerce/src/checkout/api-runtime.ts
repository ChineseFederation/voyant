import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"

import { ancillaryOfferSourceRuntimePort } from "./ancillary-ports.js"
import { createCatalogCheckoutApiExtension } from "./routes.js"
import { catalogCheckoutApiRuntimePort } from "./runtime-ports.js"

export const createCatalogCheckoutGraphExtension = defineGraphRuntimeFactory(
  async ({ getPort, getPorts }) => {
    // Many-valued and optional, so this is `getPorts`, and a deployment that
    // has bound no source gets an empty list rather than an error. Zero
    // sources must stay silent all the way down: nothing here treats it as a
    // degraded state to report.
    const ancillaryOfferSources = await getPorts(ancillaryOfferSourceRuntimePort)
    return createCatalogCheckoutApiExtension(await getPort(catalogCheckoutApiRuntimePort), {
      ancillaryOfferSources,
    })
  },
)
