-- Kept in its own committed migration so PostgreSQL can commit the enum value
-- before later migrations use it in constraints and seed rows.
ALTER TYPE "channel_publication_reindex_intent_kind" ADD VALUE IF NOT EXISTS 'catalog';
