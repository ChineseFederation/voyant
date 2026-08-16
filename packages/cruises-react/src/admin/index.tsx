import {
  type AdminExtension,
  type AdminRoutePageProps,
  adminRoutePageModule,
  defineAdminExtension,
  type NavItem,
  type SelectedAdminExtensionFactoryContext,
  withAdminRouteMessagesProvider,
} from "@voyant-travel/admin"
import { Ship } from "lucide-react"

/**
 * Semantic destinations the ships surfaces navigate to (packaged-admin RFC
 * §4.7). The pages link to routes by key rather than by importing a host route
 * tree; the host registers one resolver per key. `cruises-react`'s
 * `tests/admin-destinations.test.ts` is the compile-time proof that a resolver
 * map can satisfy these.
 */
declare module "@voyant-travel/admin" {
  interface AdminDestinations {
    /** The ships browse page. */
    "cruiseShip.list": Record<string, never>
    /** A ship's detail page. */
    "cruiseShip.detail": { shipId: string }
  }
}

/**
 * The cruises admin contribution: the **Ships** surface.
 *
 * Ships already had a table, admin and public REST routes, editorial overlays
 * and a document builder — everything except a way for an operator to look at
 * one. A vessel is referenced by many sailings and outlives all of them, so it
 * gets its own browse and detail pages rather than living as a tab inside
 * whichever cruise happened to be open.
 *
 * Endgame rule (packaged-admin RFC §4.8): this barrel re-exports no page or
 * host component values — it is evaluated with the workspace chrome, so a
 * static re-export would pin the ship pages into the entry chunk. Only types
 * and the pure presentation helpers cross this boundary.
 */
export type { ShipDetailPageProps } from "./ship-detail-page.js"
export { type ShipSpec, shipCoverImage, shipSpecs, shipSummary } from "./ship-presentation.js"
export type { ShipsIndexPageProps } from "./ships-index-page.js"

export interface CreateCruisesAdminExtensionOptions {
  /** Mount path of the Ships browse page. Default `/catalog/ships`. */
  path?: string
  /** Localized nav labels. Defaults are the English operator nav labels. */
  labels?: { ships?: string }
  /** Nav icon — icon choice stays with the host. */
  icon?: NavItem["icon"]
  /** Nav ordering. Default -139, so Ships lands just after the Catalog group. */
  order?: number
}

export function createCruisesAdminExtension(
  options: CreateCruisesAdminExtensionOptions = {},
): AdminExtension {
  const { path = "/catalog/ships", labels = {}, icon, order = -139 } = options
  const { ships = "Ships" } = labels

  return defineAdminExtension({
    id: "cruises",
    navigation: [{ order, items: [{ id: "catalog-ships", title: ships, url: path, icon }] }],
    routes: [
      {
        id: "cruises-ships-index",
        path,
        title: ships,
        // This module owns both ship surfaces, so each destination maps 1:1
        // onto one route and the host derives its resolver from the mount
        // path. Without the binding `useAdminHref` has nothing to resolve and
        // degrades to "#": the cards stop opening and the breadcrumb unlinks.
        destination: "cruiseShip.list",
        page: () =>
          import("./ships-hosts.js").then((module) =>
            adminRoutePageModule((props: AdminRoutePageProps) => (
              <module.ShipsIndexHost
                query={typeof props.search?.q === "string" ? props.search.q : ""}
                onQueryChange={(q) =>
                  props.updateSearch((prev: Record<string, unknown>) => ({
                    ...prev,
                    ...(q ? { q } : { q: undefined }),
                  }))
                }
              />
            )),
          ),
      },
      {
        id: "cruises-ships-detail",
        path: `${path}/$shipId`,
        title: ships,
        // The route param is already named `shipId`, so no destinationParams
        // mapping is needed.
        destination: "cruiseShip.detail",
        page: () =>
          import("./ships-hosts.js").then((module) =>
            adminRoutePageModule((props: AdminRoutePageProps) => (
              <module.ShipDetailHost id={props.params.shipId ?? ""} />
            )),
          ),
      },
    ],
  })
}

/** Selected-graph adapter owning the standard Operator copy key and icon. */
export function createSelectedCruisesAdminExtension(
  { navMessages }: SelectedAdminExtensionFactoryContext = { navMessages: {} },
): AdminExtension {
  // Without the provider the pages fall back to `useCruisesUiMessagesOrDefault`'s
  // hard-coded English, so a Romanian operator would get a localized nav label
  // and an English page behind it — the ro copy would ship and never render.
  return withAdminRouteMessagesProvider(
    createCruisesAdminExtension({
      labels: { ships: navMessages.catalogShips ?? "Ships" },
      icon: Ship,
    }),
    () =>
      import("../i18n/index.js").then((module) => ({ default: module.CruisesUiMessagesProvider })),
  )
}
