-- Kept in its own committed migration so PostgreSQL can commit the enum value
-- before the next migration uses it in the subject check constraint.
ALTER TYPE "channel_publication_reindex_intent_kind" ADD VALUE IF NOT EXISTS 'source';
