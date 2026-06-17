CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- =====================
-- APPLICATIONS
-- =====================
CREATE TABLE IF NOT EXISTS app.apps (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id     UUID NOT NULL,
    name         VARCHAR(255) NOT NULL,
    description  TEXT,
    file_id      UUID,
    slug         VARCHAR(64) NOT NULL,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    tags         TEXT[] NOT NULL DEFAULT '{}',
    is_trashed   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_apps_owner ON app.apps(owner_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_apps_slug ON app.apps(owner_id, slug);

DROP TRIGGER IF EXISTS apps_updated_at ON app.apps;
CREATE TRIGGER apps_updated_at
    BEFORE UPDATE ON app.apps
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- =====================
-- RECORDS (« Things » dynamiques)
-- =====================
-- Les types de données définis par l'utilisateur n'ont pas de table physique :
-- leurs instances vivent ici, génériquement, dans la colonne JSONB `data`.
CREATE TABLE IF NOT EXISTS app.records (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    app_id     UUID NOT NULL REFERENCES app.apps(id) ON DELETE CASCADE,
    owner_id   UUID NOT NULL,
    type_name  VARCHAR(255) NOT NULL,
    created_by UUID,
    data       JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_records_lookup
    ON app.records(app_id, owner_id, type_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_records_data
    ON app.records USING GIN (data jsonb_path_ops);

DROP TRIGGER IF EXISTS records_updated_at ON app.records;
CREATE TRIGGER records_updated_at
    BEFORE UPDATE ON app.records
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
