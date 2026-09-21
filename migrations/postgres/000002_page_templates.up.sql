-- =====================
-- MODÈLES DE PAGES réutilisables (façon « enregistrer comme modèle »)
-- =====================
-- Une page conçue dans un projet peut être enregistrée comme modèle réutilisable
-- dans d'autres projets du même utilisateur. La définition stocke l'arbre `Page`.
CREATE TABLE IF NOT EXISTS app.page_templates (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id    UUID NOT NULL,
    name        VARCHAR(255) NOT NULL,
    theme       VARCHAR(120) NOT NULL DEFAULT 'Mes modèles',
    definition  JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_page_templates_owner
    ON app.page_templates(owner_id, created_at DESC);
