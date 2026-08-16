import { catalogSourcesRuntimeExtensionPort } from "@voyant-travel/catalog/ports"
import { defineAdapter, providePort } from "@voyant-travel/graph-contracts"
import { insuranceProviderSourcePort } from "@voyant-travel/insurance/ports"
import { publicApiDynamicPackageSourceProviderPort } from "@voyant-travel/public-api/shopping/runtime-port"

/**
 * Voyant Connect as one catalog inventory channel.
 *
 * Declared as an adapter, not a plugin: RFC #3395 retired that classification,
 * and the catalog spine resolves this through a port rather than importing it,
 * so a self-hosted channel can provide the same contract.
 */
export const voyantConnectAdapter = defineAdapter({
  id: "@voyant-travel/voyant-connect-adapter",
  packageName: "@voyant-travel/voyant-connect-adapter",
  localId: "voyant-connect",
  provides: {
    ports: [
      providePort(catalogSourcesRuntimeExtensionPort),
      providePort(publicApiDynamicPackageSourceProviderPort),
      // One insurer among however many the deployment has bound. The insurance
      // module fans out across `insurance.provider-source`; this adapter is a
      // member of that set and holds no privileged position in it.
      providePort(insuranceProviderSourcePort),
    ],
  },
  meta: {
    ownership: "package",
    agentTools: {
      posture: "not-applicable",
      rationale:
        "This adapter binds an inventory channel behind the catalog sources port; agents act on catalog and booking Tools, never on the channel directly.",
    },
  },
})

export default voyantConnectAdapter
