import type { StandardOperatorRouterContext } from "@voyant-travel/operator-standard/standard-frontend"
import { operatorFrontend } from "../.voyant/routes/_lib/operator-frontend"
import { Route as workspaceRoute } from "../.voyant/routes/_workspace/route"
import { routeTree } from "../.voyant/routeTree.gen"

export type RouterContext = StandardOperatorRouterContext

export function getRouter() {
  return operatorFrontend.createRouter({ routeTree, workspaceRoute })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
