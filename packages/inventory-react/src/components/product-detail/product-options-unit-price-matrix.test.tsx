import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  type OperatorAdminMessages,
  operatorAdminMessageDefinitions,
  resolveLocaleMessages,
} from "@voyant-travel/i18n"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { VoyantProductsProvider } from "../../provider.js"
import {
  getOptionUnitPriceRulesQueryOptions,
  normalizeOptionUnitPriceRuleRecord,
  type OptionUnitPriceRuleRecord,
} from "./commerce-client.js"
import { type ProductDetailApi, ProductDetailHostProvider } from "./host.js"
import {
  getProductDetailOptionUnitsQueryOptions,
  getProductDetailPricingCategoriesQueryOptions,
} from "./product-options-shared.js"
import { UnitPriceMatrix } from "./product-options-unit-price-matrix.js"

const messages = resolveLocaleMessages<OperatorAdminMessages>({
  locale: "en",
  fallbackLocale: "en",
  definitions: operatorAdminMessageDefinitions,
})

const api: ProductDetailApi = {
  get: async <T,>() => ({ data: [] }) as T,
  post: async <T,>() => ({ data: {} }) as T,
  patch: async <T,>() => ({ data: {} }) as T,
  delete: async <T,>() => ({}) as T,
}

const productsClient = {
  baseUrl: "https://example.test",
  fetcher: async () => new Response(JSON.stringify({ data: [] })),
}

describe("UnitPriceMatrix", () => {
  it("normalizes snake_case option-unit price rows from the admin API", async () => {
    const queryClient = new QueryClient()
    const response = await queryClient.fetchQuery(
      getOptionUnitPriceRulesQueryOptions(
        {
          ...api,
          get: async <T,>() =>
            ({
              data: [
                {
                  id: "oupr_room_adult",
                  option_price_rule_id: "oprr_rate_plan",
                  option_id: "popt_standard",
                  unit_id: "ount_double",
                  pricing_category_id: "prcg_adult",
                  pricing_mode: "per_person",
                  sell_amount_cents: 36000,
                  cost_amount_cents: 24000,
                  min_quantity: 1,
                  max_quantity: 2,
                  sort_order: 1,
                  active: true,
                  notes: "Promo room/category override.",
                },
              ],
            }) as T,
        },
        {
          optionPriceRuleId: "oprr_rate_plan",
          limit: 100,
        },
      ),
    )

    expect(response.data[0]).toMatchObject<OptionUnitPriceRuleRecord>({
      id: "oupr_room_adult",
      optionPriceRuleId: "oprr_rate_plan",
      optionId: "popt_standard",
      unitId: "ount_double",
      pricingCategoryId: "prcg_adult",
      pricingMode: "per_person",
      sellAmountCents: 36000,
      costAmountCents: 24000,
      minQuantity: 1,
      maxQuantity: 2,
      sortOrder: 1,
      active: true,
      notes: "Promo room/category override.",
    })
  })

  it("renders a saved additional rate-plan room/category price with an actionable label", () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(
      getProductDetailOptionUnitsQueryOptions(productsClient, "popt_standard").queryKey,
      {
        data: [
          {
            id: "ount_double",
            optionId: "popt_standard",
            code: "DBL",
            name: "Double room",
            description: null,
            unitType: "room",
            occupancyMin: 1,
            occupancyMax: 2,
            minQuantity: 1,
            maxQuantity: 5,
            minAge: null,
            maxAge: null,
            isRequired: false,
            isHidden: false,
            sortOrder: 0,
          },
        ],
        total: 1,
        limit: 100,
        offset: 0,
      },
    )
    queryClient.setQueryData(getProductDetailPricingCategoriesQueryOptions(api).queryKey, {
      data: [
        {
          id: "prcg_adult",
          productId: "prod_tour",
          optionId: "popt_standard",
          unitId: null,
          code: "ADT",
          name: "Adult (ADT)",
          categoryType: "adult",
          seatOccupancy: 1,
          groupSize: null,
          isAgeQualified: false,
          minAge: null,
          maxAge: null,
          internalUseOnly: false,
          active: true,
          sortOrder: 0,
          metadata: null,
        },
      ],
      total: 1,
      limit: 100,
      offset: 0,
    })
    queryClient.setQueryData(
      getOptionUnitPriceRulesQueryOptions(api, {
        optionPriceRuleId: "oprr_rate_plan",
        limit: 100,
      }).queryKey,
      {
        data: [
          normalizeOptionUnitPriceRuleRecord({
            id: "oupr_room_adult",
            option_price_rule_id: "oprr_rate_plan",
            option_id: "popt_standard",
            unit_id: "ount_double",
            pricing_category_id: "prcg_adult",
            pricing_mode: "per_person",
            sell_amount_cents: 36000,
            cost_amount_cents: 24000,
            min_quantity: 1,
            max_quantity: 2,
            sort_order: 1,
            active: true,
            notes: "Promo room/category override.",
          }),
        ],
        total: 1,
        limit: 100,
        offset: 0,
      },
    )

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <VoyantProductsProvider baseUrl={productsClient.baseUrl} fetcher={productsClient.fetcher}>
          <ProductDetailHostProvider
            value={{
              messages,
              api,
              locale: "en",
              navigate: {
                toProducts: () => undefined,
                toProduct: () => undefined,
                toAvailability: () => undefined,
              },
            }}
          >
            <UnitPriceMatrix
              productId="prod_tour"
              optionPriceRuleId="oprr_rate_plan"
              optionId="popt_standard"
              pricingMode="per_person"
              allPricingCategories={false}
              productCurrency="EUR"
            />
          </ProductDetailHostProvider>
        </VoyantProductsProvider>
      </QueryClientProvider>,
    )

    expect(html).toContain("360.00 EUR")
    expect(html).toContain('aria-label="Edit - 360.00 EUR - Double room - Adult (ADT)"')
  })
})
