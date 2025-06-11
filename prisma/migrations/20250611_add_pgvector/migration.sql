-- This migration adds vector fields to the schema but doesn't require the pgvector extension
-- The extension would need to be installed on the PostgreSQL server first

-- Comment out the pgvector-specific operations since the extension isn't available
-- CREATE EXTENSION IF NOT EXISTS vector;
-- CREATE INDEX IF NOT EXISTS email_document_embedding_idx ON "EmailDocument" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- CREATE INDEX IF NOT EXISTS hubspot_contact_embedding_idx ON "HubspotContact" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- CREATE INDEX IF NOT EXISTS hubspot_note_embedding_idx ON "HubspotNote" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- CREATE INDEX IF NOT EXISTS calendar_event_embedding_idx ON "CalendarEvent" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Instead, we'll just add a comment to document that these fields are intended for vector embeddings
COMMENT ON COLUMN "EmailDocument".embedding IS 'Vector embedding for semantic search';
COMMENT ON COLUMN "HubspotContact".embedding IS 'Vector embedding for semantic search';
COMMENT ON COLUMN "HubspotNote".embedding IS 'Vector embedding for semantic search';
COMMENT ON COLUMN "CalendarEvent".embedding IS 'Vector embedding for semantic search';
