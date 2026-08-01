# Product Detail Page Consolidation — Migration Handoff

> Status: **OPERATOR CUTOVER COMPLETE** ✅ — `@voyant-travel/inventory-react/ui` now owns the
> canonical `ProductDetailPage`; the operator consumes it via `ProductDetailHostProvider`.
> Both `@voyant-travel/inventory-react/ui` and `operator` typecheck + lint clean. The 36 operator
> dupes are deleted. ~~Remaining: migrate `dmc` + `apps/dev` onto the same page (§5.9).~~
> Resolved: `templates/dmc` and `apps/dev` were deleted by the packaged-admin work
> (`docs/architecture/packaged-admin-rfc.md` §5), so §5.9 is moot.
> Branch: `product-optimizations` (uncommitted working tree). Restart the operator dev
> server to pick up the route/page changes.
>
> All of §5.1–5.8 below are DONE; they are kept as the record of how it was done.
> The injection seam is: `ProductDetailHostProvider` (host.tsx) ← operator route
> (`apps/operator/src/routes/_workspace/products/$id.tsx`) supplies messages
> (`useAdminMessages()`), `api`, `locale`, `navigate` callbacks, `uploadMedia` (storage
> step only — the page creates the record via `api`), `setBreadcrumbs`, and
> `renderOptionExtras` (the availability panel).

---

## 1. Goal

Make a **single canonical product-detail page** that lives in `@voyant-travel/inventory-react/ui`
and is consumed by every template, instead of the current situation where each
template maintains its **own fork**.

### Current state

The canonical page is package-owned. Cross-domain option content composes
through `product.details.option-extras`; starters no longer maintain a product
detail fork.

### User directive
> "Replace products-ui page with the operator fork as that is exactly how it should be
> for everyone, and then import it back into the operator starter."

**Scope for now:** operator ↔ products-ui. `dmc` and `apps/dev` are a **follow-up**
(they are independent forks — they do **not** consume products-ui's `ProductDetailPage`,
so changing it does **not** break them).

---

## 2. Approach — Dependency Injection via a host context

The operator fork is deeply coupled to operator-only infra (admin i18n, REST client,
TanStack Router, app-shell breadcrumbs, local UI). To make it app-agnostic we inject
all of that through one context.

**`product-detail/host.tsx` (DONE, validated):**
```ts
interface ProductDetailHostValue {
  messages: ProductDetailMessages        // = OperatorAdminProductsMessages["products"]  (from @voyant-travel/i18n, type-only)
  api: ProductDetailApi                  // { get,post,patch,delete }<T>(path, body?) => Promise<T>
  locale: string
  navigate: ProductDetailNavigation      // toProducts / toProduct(id) / toAvailability(slotId)
  uploadMedia?: ProductMediaUploadHandler
  setBreadcrumbs?: (items: { label: string; href?: string }[]) => void
}
```
Hooks: `useProductDetailHost`, `useProductDetailMessages`, `useProductDetailApi`, `useProductLocale`.

**Message-shape trick (important):** `useProductDetailMessages()` returns
`{ products: <slice> }` so every moved component keeps its `messages.products.core.X`
access **byte-for-byte** — only the hook name changed (`useAdminMessages` →
`useProductDetailMessages`). The host stores just the `.products` slice; the operator
passes `useAdminMessages().products`.

The operator becomes a **thin wrapper**: render inventory-react's page inside
`<ProductDetailHostProvider value={…}>`, supplying messages/api/locale/nav/uploadMedia.

---

## 3. Where things physically are

All staged work is under:
`packages/inventory-react/src/components/product-detail/`

The **36 operator detail files were copied here** (operator originals are UNTOUCHED and
still working — copy-then-switch). The staged copies have had several coupling layers
rewritten already (see §4). Plus new files:
- `host.tsx` — the DI context (DONE).
- `zod-resolver.ts`, `timezone-options.ts` — moved app-agnostic helpers (DONE).
- `MIGRATION.md` — this file.

The operator originals live in:
`apps/operator/src/components/voyant/products/` (36 files; `products-list-skeleton.tsx`
is the only file there that is NOT part of the detail page and was NOT copied).

The **only external consumer** of the page is the route:
`apps/operator/src/routes/_workspace/products/$id.tsx`
(imports `ProductDetailPage` + a couple things from `product-detail-shared`).

---

## 4. DONE — decoupling already applied to the staged copies

- ✅ **i18n** (all 32 files): `useAdminMessages` → `useProductDetailMessages` (import from
  `./host.js`); type `AdminMessages` → `ProductMessagesRoot`. `messages.products.*` access unchanged.
- ✅ **Locale** (5 files): `const { resolvedLocale } = useLocale()` → `const resolvedLocale = useProductLocale()`.
- ✅ **Breadcrumbs** (`product-detail-header.tsx`): `useAdminBreadcrumbs([...])` → `host.setBreadcrumbs?.([...])` in a `useEffect`.
- ✅ **`formatMessage`** import source `@voyant-travel/admin` → `@voyant-travel/i18n`.
- ✅ **`@/lib/zod-resolver`** → `./zod-resolver.js` (file moved here).
- ✅ **`@/lib/timezone-options`** → `./timezone-options.js` (file moved here).
- ✅ **`@/components/ui/combobox` / `/date-picker`** → `@voyant-travel/ui/components/...`.

Verify: `grep -rln '@voyant-travel/admin\|@/lib/admin-i18n\|@/lib/zod-resolver\|@/lib/timezone-options' packages/inventory-react/src/components/product-detail/` → should be **0**.

---

## 5. TODO — remaining work (in order)

### 5.1 REST `api` threading (9 files, ~34 calls)
Files still importing `@/lib/api-client`:
`product-detail-shared.ts` (8, **module-scope**), `use-product-detail-data.ts` (10),
`product-detail-form.tsx` (4), `product-service-form.tsx` (4), `product-detail-sections.tsx` (3),
`product-departure-form.tsx` (2), `product-schedule-form.tsx` (2), `product-media-gallery.tsx` (1),
`product-detail-itinerary-section.tsx` (import only, 0 calls → just drop the import).

- **Component bodies:** add `const api = useProductDetailApi()` and drop the `@/lib/api-client` import.
- **`product-detail-shared.ts`** has 7 `queryOptions` factories using `api` at module scope
  (`getProductDaysQueryOptions`, `getProductSlotsQueryOptions`, `getProductRulesQueryOptions`,
  `getProductDayServicesQueryOptions`, `getChannelsQueryOptions`, `getProductChannelMappingsQueryOptions`,
  `getProductMediaQueryOptions`, `getProductDayMediaQueryOptions`). Give each an `api: ProductDetailApi`
  first param; update every call site (mostly in `use-product-detail-data.ts` and the sections — the
  callers have `api` from the host).
- The operator `api` interface: `get<T>(path, opts?)`, `post<T>(path, body?, opts?)`,
  `patch<T>(path, body?, opts?)`, `delete<T>(path, opts?)`. The host's `ProductDetailApi` matches
  (without the opts arg — add it if any call passes options).

### 5.2 `product-options-shared.ts` (fetcher coupling)
Uses `getApiUrl()` (`@/lib/env`) + `projectFetcher` (`@/lib/voyant-fetcher`) to build
`{ baseUrl, fetcher }` clients for inventory-react / commerce-react `queryOptions` helpers.
Replace with the **react context fetcher** the app already configures:
`useVoyantInventoryContext()` (inventory-react) — these are module-scope factories, so thread the
client in from the calling component, or convert to hooks. (This is the fiddliest file.)

### 5.3 Router (2 files)
`product-detail-page.tsx` (`useNavigate`) and `product-detail-sections.tsx` (`Link` + navigate):
- `navigate({ to: "/products" })` → `host.navigate.toProducts()`
- `navigate({ to: "/products/$id", params: { id } })` → `host.navigate.toProduct(id)`
- `navigate({ to: "/operations/availability/$id", params: { id: slotId } })` → `host.navigate.toAvailability(slotId)`
- `<Link to="/settings/channels">` in sections → either a host nav callback or render as a plain anchor/slot.

### 5.4 Availability panel slot
`product-detail-page.tsx` imports `@/components/voyant/operations/availability/option-resource-templates-panel`
(operator availability component) and uses it inside `renderOptionDetails` alongside `PricingPanel`.
Make the page accept a `renderOptionExtras?(productId, optionId)` slot prop (or similar); the operator
passes the availability panel. `PricingPanel` (`product-options-pricing.tsx`) is owned by inventory-react and commerce-react owner paths.

### 5.5 Dependencies to add to `packages/inventory-react/package.json`
- `@voyant-travel/utils` — used by `product-translation-popover.tsx` / `product-day-translation.tsx`
  (`/languages`) and `timezone-options.ts` (`/timezones`). **Not currently a dep.**
- `@voyant-travel/commerce-react` — used by `product-market-rules-section.tsx`. **Not currently a dep.**
- Confirm `@hookform/resolvers` is NOT needed (the moved `zod-resolver.ts` is hand-rolled — only needs `react-hook-form` + `zod`, both already deps).
- inventory-react already deps: `@voyant-travel/i18n`, `@voyant-travel/operations-react/availability`, `@voyant-travel/commerce-react`,
  `react-hook-form`, `zod`.

### 5.6 Wire inventory-react exports
- Decide the canonical export. Suggested: export `ProductDetailPage` + `ProductDetailHostProvider`
  (and the host types) from `product-detail/`. Update `packages/inventory-react/src/index.ts` (or add a
  `./components/product-detail` subpath export in `package.json`).
- The old packaged Product Detail Page surface is unused — can be deleted
  once nothing imports its named exports (`ProductOverviewCard`, etc.). Grep first.

### 5.7 Operator rewire (the cutover)
- Rewrite `apps/operator/src/routes/_workspace/products/$id.tsx` to render the inventory-react page
  inside `ProductDetailHostProvider`, supplying:
  - `messages: useAdminMessages().products`
  - `api: <operator api client>`
  - `locale: useLocale().resolvedLocale`
  - `navigate: { toProducts: () => navigate({to:"/products"}), toProduct: (id)=>navigate({to:"/products/$id",params:{id}}), toAvailability: (id)=>navigate({to:"/operations/availability/$id",params:{id}}) }`
  - `uploadMedia: <operator storage upload handler>` (see operator's `product-detail-itinerary-section` `uploadDayMediaToStorage`)
  - `setBreadcrumbs: <wire to useAdminBreadcrumbs or the admin-shell breadcrumb context>`
  - `renderOptionExtras: (productId, optionId) => <OptionResourceTemplatesPanel .../>`
- **Delete the 36 operator detail files** (the originals) once the route uses the inventory-react page.
- Any other operator file that imported one of those 36 (besides the route) must be repointed —
  grep confirmed the route is the only external importer, but re-verify after moving.

### 5.8 Typecheck / lint
- `pnpm -F @voyant-travel/inventory-react typecheck` (expect a long fix tail on first run), then
  `pnpm -F operator typecheck`, then `npx biome check --write` on the changed files.
- inventory-react typecheck will FAIL until §5.1–5.6 are complete — that's expected. The operator dev
  server is unaffected meanwhile (the staged files aren't imported anywhere yet).

### 5.9 Follow-up (separate effort, NOT in scope now)
Migrate any remaining product pages onto the same inventory-react page + host.

---

## 6. Gotchas / facts

- **macOS BSD `sed`**: no `\b` word boundaries. Use literal patterns (this bit us once).
- Cross-references between the moved files use `./<name>` (same dir) and are **unchanged** by the move.
- Operator providers configure inventory-react / operations-react / commerce-react contexts with
  `projectFetcher` (cookie auth, `credentials: "include"`) + `getApiUrl()` base. So routing
  data through those contexts (or the operator `api`) keeps auth working.
- The staged copies in this dir currently make inventory-react **fail typecheck** (unresolved
  `@/...` imports remain in §5 files). This is expected mid-migration and does not affect the
  running operator (vite only bundles imported files; these aren't imported yet).

---

## 7. SEPARATE, DONE work also in this working tree (do not confuse with the migration)

This session also produced operator **feature** work that is complete, typechecks, and is
**shippable on its own** (it is what the in-progress migration is consolidating):
- Product + itinerary-day **translations**, product **default language**, the **day Sheet**,
  the **activity card**, **market-rule labels**.
- Backend: `products.default_language_tag` column, `product_day_translations` table, service +
  routes, inventory-react hooks/schemas, `schema-kit` prefix.
- **Migrations `0051_product_default_language` + `0052_product_day_translations` are already
  APPLIED to the dev DB.** (Restart the operator dev server to clear drizzle's prepared-statement cache.)
- Changeset: `.changeset/product-day-translations.md`.

If the migration is paused, this feature work can be committed/PR'd independently (the only
migration artifacts in the tree are this `product-detail/` dir + `host.tsx`).
