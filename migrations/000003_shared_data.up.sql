-- =====================
-- DONNÉES PARTAGÉES multi-utilisateurs
-- =====================
-- Un type de données peut être déclaré « partagé » (`shared: true` dans la
-- définition). Ses enregistrements vivent alors dans un pool COMMUN (sous le
-- propriétaire de l'app) tout en gardant l'identité du vrai auteur (`created_by`),
-- ce qui permet des applications collaboratives temps réel (ex. messagerie).
ALTER TABLE app.apps ADD COLUMN IF NOT EXISTS is_shared    BOOLEAN  NOT NULL DEFAULT FALSE;
ALTER TABLE app.apps ADD COLUMN IF NOT EXISTS shared_types TEXT[]   NOT NULL DEFAULT '{}';
