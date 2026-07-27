-- Seed the default quote pipeline and its stages.
--
-- `quotes.pipeline_id` and `quotes.stage_id` are both NOT NULL, and nothing
-- ever created a pipeline: not the module install, not a setup step, not a
-- service-layer find-or-create. A fresh operator therefore had no pipeline and
-- no stage, so `create_quote` could not succeed at all — the quotes surface was
-- unusable until someone authored a pipeline by hand through the admin.
--
-- Both operators inspected had exactly one "Sales" pipeline created manually,
-- one of them with its stages added two days after the pipeline itself, which
-- is what hand-authoring looks like.
--
-- Guarded on the table being empty rather than on a fixed id, so an operator
-- who already built their own pipeline (however they named it) is untouched.
-- The `is_default` flag already exists for exactly this record.
DO $$
DECLARE
  seeded_pipeline_id text := 'pipe_default_sales';
BEGIN
  IF EXISTS (SELECT 1 FROM "pipelines" WHERE "entity_type" = 'quote') THEN
    RETURN;
  END IF;

  INSERT INTO "pipelines" ("id", "entity_type", "name", "is_default", "sort_order")
  VALUES (seeded_pipeline_id, 'quote', 'Sales', true, 0);

  -- Probability climbs with commitment; the two terminal stages carry the
  -- closed/won/lost flags the pipeline reporting reads.
  INSERT INTO "stages"
    ("id", "pipeline_id", "name", "sort_order", "probability", "is_closed", "is_won", "is_lost")
  VALUES
    ('stg_default_new_inquiry', seeded_pipeline_id, 'New Inquiry',  0,  10, false, false, false),
    ('stg_default_qualified',   seeded_pipeline_id, 'Qualified',    1,  25, false, false, false),
    ('stg_default_quote_sent',  seeded_pipeline_id, 'Quote Sent',   2,  50, false, false, false),
    ('stg_default_negotiation', seeded_pipeline_id, 'Negotiation',  3,  75, false, false, false),
    ('stg_default_won',         seeded_pipeline_id, 'Won',          4, 100, true,  true,  false),
    ('stg_default_lost',        seeded_pipeline_id, 'Lost',         5,   0, true,  false, true);
END $$;
