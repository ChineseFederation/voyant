---
"@voyant-travel/catalog": minor
---

Make the catalog embedding provider selectable between OpenAI and Gemini.

`buildCatalogEmbeddingProvider` now reads `CATALOG_EMBEDDING_PROVIDER`
(`"openai" | "gemini"`) and builds the matching adapter over the Voyant Cloud
`/ai/v1/{provider}` gateway. Defaults to `gemini` for compatibility; deployments
that use the OpenAI embeddings proxy (e.g. managed runtimes) set `openai`.

Switching provider switches the embedding model/dimensionality, so it is a
deliberate `bulkReindex` operation. The Postgres indexer flips in place (unsized
`vector` column keyed by `embedding_model_id`); Typesense-backed deployments must
migrate the vector field's `num_dim` first, as `ensureCollection` does not.
