-- MySQL / MariaDB — the `app` database is created by kubuno-db's schema setup
-- before the migrator runs, so there is no CREATE DATABASE here. This single
-- file declares the FINAL shape the PostgreSQL side reached across its
-- 000001..000006 migrations.
--
-- Differences from PostgreSQL, and why:
--   * UUID -> BINARY(16): what sqlx encodes a `uuid::Uuid` as on MySQL.
--   * No DEFAULT on `id`: MySQL has no gen_random_uuid() and no RETURNING, so
--     the process supplies every primary key.
--   * TIMESTAMPTZ -> DATETIME(6); every value written is UTC (the pool pins
--     `time_zone = '+00:00'`). `updated_at` is set in Rust at each write, so
--     there is no ON UPDATE trigger.
--   * TEXT[] arrays and JSONB -> JSON (tags / shared_types / data), written as
--     JSON arrays/objects from Rust and read through `#[sqlx(json)]`.
--   * The jsonb GIN index has no MySQL equivalent and is dropped.
--   * utf8mb4_bin so a UNIQUE key stays case- and accent-sensitive.

CREATE TABLE apps (
    id           BINARY(16)   NOT NULL PRIMARY KEY,
    owner_id     BINARY(16)   NOT NULL,
    name         VARCHAR(255) NOT NULL,
    description  TEXT         NULL,
    file_id      BINARY(16)   NULL,
    slug         VARCHAR(64)  NOT NULL,
    is_published BOOLEAN      NOT NULL DEFAULT FALSE,
    tags         JSON         NOT NULL,
    is_trashed   BOOLEAN      NOT NULL DEFAULT FALSE,
    is_shared    BOOLEAN      NOT NULL DEFAULT FALSE,
    shared_types JSON         NOT NULL,
    is_starred   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at   DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UNIQUE (owner_id, slug)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE INDEX idx_app_apps_owner ON apps(owner_id, updated_at);

CREATE TABLE records (
    id         BINARY(16)   NOT NULL PRIMARY KEY,
    app_id     BINARY(16)   NOT NULL,
    owner_id   BINARY(16)   NOT NULL,
    type_name  VARCHAR(255) NOT NULL,
    created_by BINARY(16)   NULL,
    data       JSON         NOT NULL,
    created_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE INDEX idx_app_records_lookup ON records(app_id, owner_id, type_name, created_at);

CREATE TABLE page_templates (
    id         BINARY(16)   NOT NULL PRIMARY KEY,
    owner_id   BINARY(16)   NOT NULL,
    name       VARCHAR(255) NOT NULL,
    theme      VARCHAR(120) NOT NULL DEFAULT 'Mes modèles',
    definition JSON         NOT NULL,
    created_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE INDEX idx_app_page_templates_owner ON page_templates(owner_id, created_at);

CREATE TABLE app_collaborators (
    app_id     BINARY(16)  NOT NULL,
    user_id    BINARY(16)  NOT NULL,
    permission VARCHAR(20) NOT NULL DEFAULT 'edit'
                   CHECK (permission IN ('view', 'comment', 'edit')),
    added_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (app_id, user_id),
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE INDEX idx_app_collaborators_user ON app_collaborators(user_id);
