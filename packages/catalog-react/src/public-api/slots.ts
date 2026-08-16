export interface PublicApiSlotsScope {
  market?: string
  locale?: string
  currency?: string
}

export function publicCatalogSlotsQueryKey(
  entityModule: string,
  entityId: string,
  scope: PublicApiSlotsScope,
): readonly [
  "public-catalog-slots",
  string,
  string,
  string | undefined,
  string | undefined,
  string | undefined,
] {
  return [
    "public-catalog-slots",
    entityModule,
    entityId,
    scope.market,
    scope.locale,
    scope.currency,
  ] as const
}

export function buildPublicCatalogSlotsUrl(
  apiUrl: string,
  entityModule: string,
  entityId: string,
  scope: PublicApiSlotsScope,
): string {
  const target = new URL(`${apiUrl.replace(/\/$/, "")}/v1/public/catalog/slots`)
  target.searchParams.set("entityModule", entityModule)
  target.searchParams.set("entityId", entityId)
  if (scope.market) target.searchParams.set("market", scope.market)
  if (scope.locale) target.searchParams.set("locale", scope.locale)
  if (scope.currency) target.searchParams.set("currency", scope.currency)
  return target.toString()
}

export function resolveSelectedCatalogSlotId(
  rows: ReadonlyArray<{ id: string }>,
  selectedSlotId: string | undefined,
): string | undefined {
  if (rows.length === 0) return undefined
  if (selectedSlotId && rows.some((row) => row.id === selectedSlotId)) {
    return selectedSlotId
  }
  return rows[0]?.id
}
