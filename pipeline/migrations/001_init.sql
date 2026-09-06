CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE sources (
  id           serial PRIMARY KEY,
  domain       text UNIQUE NOT NULL,
  name         text NOT NULL,
  tier         int  NOT NULL CHECK (tier BETWEEN 1 AND 4),
  kind         text NOT NULL,
  note         text NOT NULL DEFAULT '',
  origin       text NOT NULL DEFAULT 'curated',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE documents (
  id           serial PRIMARY KEY,
  source_id    int REFERENCES sources(id) ON DELETE CASCADE,
  url          text UNIQUE NOT NULL,
  title        text NOT NULL DEFAULT '',
  raw_text     text NOT NULL,
  content_hash text NOT NULL,
  fetched_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chunks (
  id           serial PRIMARY KEY,
  document_id  int REFERENCES documents(id) ON DELETE CASCADE,
  seq          int NOT NULL,
  text         text NOT NULL,
  embedding    vector(1024),
  UNIQUE (document_id, seq)
);

CREATE INDEX chunks_embedding_idx ON chunks
  USING hnsw (embedding vector_cosine_ops);

CREATE TABLE query_logs (
  id           serial PRIMARY KEY,
  query        text NOT NULL,
  paths        jsonb NOT NULL,
  tier_mix     jsonb NOT NULL,
  source_urls  jsonb NOT NULL,
  latency_ms   int,
  created_at   timestamptz NOT NULL DEFAULT now()
);
