---
"@voyant-travel/framework": minor
---

Require an explicit Redis binding on the Node runtime deployment.

`VoyantNodeRuntimeDeployment.redis` is now required, and the runtime no longer
infers Redis isolation and network from the deprecated `deployment.mode`. A host
that composes a deployment knows which Redis it bound and must say so; a caller
that cannot state the binding is a caller whose Redis safety posture nobody has
decided.

The generated Node runtime entry now resolves the binding its recorded mode has
always implied, so generated artifacts keep their exact posture. No deployment
changes behaviour.
