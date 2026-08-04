-- The cutline is intentionally one-way: custom fields were not used in
-- production deployments before namespaced storage became authoritative.
UPDATE "quotes"
SET "custom_fields" = jsonb_build_object('custom', "custom_fields")
WHERE "custom_fields" <> '{}'::jsonb
  AND NOT ("custom_fields" ? 'custom');
