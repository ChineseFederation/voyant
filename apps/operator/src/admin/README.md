# Custom admin UI (pages, widgets, nav)

Drop an admin extension here to extend the **dashboard UI** without forking —
a custom page, a dashboard/detail **widget**, or a **nav** entry. A directory
under `src/admin/<name>/` is auto-discovered and composed into the admin shell;
it survives `voyant upgrade`.

This is the UI counterpart to [`src/modules`](../modules/README.md) (API
modules) and [`src/extensions`](../extensions/README.md) (API routes on existing
modules).

## index.tsx

Default-export an `AdminExtension` via `defineAdminExtension` — a bundle of any
of `navigation`, `widgets`, and `routes`:

```tsx
import { defineAdminExtension } from "@voyant-travel/admin"
import { ConciergePage } from "./page.js"
import { ConciergeWidget } from "./widget.js"

export default defineAdminExtension({
  id: "concierge",
  // a sidebar entry
  navigation: [{ items: [{ id: "concierge", title: "Concierge", url: "/concierge" }] }],
  // a widget injected into a named slot (e.g. dashboard.after-kpis,
  // booking.details.header, invoice.details.after-summary, …)
  widgets: [{ id: "concierge-kpi", slot: "dashboard.after-kpis", component: ConciergeWidget }],
  // a full page at /app/concierge (component or lazy `page: () => import(...)`)
  routes: [{ id: "concierge", path: "/concierge", title: "Concierge", component: ConciergePage }],
})
```

## How it composes

- **navigation and widgets** are emitted into the generated project admin graph
  under `.voyant/admin/` and merged with selected package contributions.
- **page routes** are added to the TanStack route tree by the generated admin
  composition. Discovered pages are reachable by string navigation
  (`<Link to="/concierge">`); they are not in the generated typed-link map.

Discovery is build-time and produces static imports. The directory contains only
this guidance until the integration application needs a project-owned extension.

## Notes

- Keep page components lazy where possible (`page: () => import("./page.js")`)
  so they land in their own chunk instead of the workspace-chrome bundle.
- Widget `slot` names come from the selected admin contribution contracts.
  Targeting an unknown slot renders nothing.

See `docs/architecture/custom-modules.md` for the full extend-without-forking
guide.
