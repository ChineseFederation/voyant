import {
  type BuildSelectedGraphOpenApiDocumentsInput,
  buildSelectedGraphOpenApiDocuments,
  mergeSelectedGraphOpenApiDocuments,
} from "@voyant-travel/framework/selected-graph-openapi"
import {
  type GenerateOpenApiOptions,
  type OpenApiDocument,
  selectSurface,
} from "@voyant-travel/hono/openapi"

const DEFAULT_OPENAPI_OPTIONS: GenerateOpenApiOptions = {
  info: {
    title: "Voyant Operator API",
    version: "0.0.0",
    description: "Generated from the composed operator app. Do not edit by hand.",
  },
  servers: [{ url: "/", description: "This deployment (same origin)" }],
}

export interface OperatorOpenApiDocuments {
  full: OpenApiDocument
  admin: OpenApiDocument
  "public-api": OpenApiDocument
  modules: Map<string, OpenApiDocument>
}

export interface BuildOperatorOpenApiDocumentsInput
  extends Pick<BuildSelectedGraphOpenApiDocumentsInput, "runtime" | "app"> {
  options?: GenerateOpenApiOptions
}

/** Build deployment OpenAPI documents exclusively from selected graph claims. */
export async function buildOperatorOpenApiDocuments(
  input: BuildOperatorOpenApiDocumentsInput,
): Promise<OperatorOpenApiDocuments> {
  const modules = await buildSelectedGraphOpenApiDocuments({
    runtime: input.runtime,
    app: input.app,
    options: input.options ?? DEFAULT_OPENAPI_OPTIONS,
  })
  const full = mergeSelectedGraphOpenApiDocuments(modules)

  return {
    full,
    admin: selectSurface(full, "admin"),
    "public-api": selectSurface(full, "public-api"),
    modules,
  }
}
