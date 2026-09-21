-- SQLite — `app` is an ATTACHed database file, attached on every pooled
-- connection by kubuno-db, so the qualified names below resolve as they do on
-- the other two engines. This single file declares the FINAL shape the
-- PostgreSQL side reached across its 000001..000006 migrations.
--
-- Differences from PostgreSQL, and why:
--   * UUID -> BLOB, TIMESTAMPTZ -> TEXT (`%F %T%.f`, UTC), as sqlx encodes them.
--   * No DEFAULT on `id`: SQLite has no UUID generator; the process supplies it.
--   * TEXT[] arrays and JSONB -> TEXT holding JSON (tags / shared_types / data),
--     written as JSON from Rust and read through `#[sqlx(json)]`.
--   * updated_at is set in Rust at each write; no trigger.
--   * Foreign-key REFERENCES are unqualified (SQLite assumes the same database);
--     kubuno-db enables `PRAGMA foreign_keys`, so CASCADE deletes fire.

CREATE TABLE app.apps (
    id           BLOB    NOT NULL PRIMARY KEY,
    owner_id     BLOB    NOT NULL,
    name         TEXT    NOT NULL,
    description  TEXT,
    file_id      BLOB,
    slug         TEXT    NOT NULL,
    is_published INTEGER NOT NULL DEFAULT 0,
    tags         TEXT    NOT NULL DEFAULT '[]',
    is_trashed   INTEGER NOT NULL DEFAULT 0,
    is_shared    INTEGER NOT NULL DEFAULT 0,
    shared_types TEXT    NOT NULL DEFAULT '[]',
    is_starred   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    UNIQUE (owner_id, slug)
);
CREATE INDEX app.idx_app_apps_owner ON apps(owner_id, updated_at);

CREATE TABLE app.records (
    id         BLOB NOT NULL PRIMARY KEY,
    app_id     BLOB NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    owner_id   BLOB NOT NULL,
    type_name  TEXT NOT NULL,
    created_by BLOB,
    data       TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);
CREATE INDEX app.idx_app_records_lookup ON records(app_id, owner_id, type_name, created_at);

CREATE TABLE app.page_templates (
    id         BLOB NOT NULL PRIMARY KEY,
    owner_id   BLOB NOT NULL,
    name       TEXT NOT NULL,
    theme      TEXT NOT NULL DEFAULT 'Mes modèles',
    definition TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);
CREATE INDEX app.idx_app_page_templates_owner ON page_templates(owner_id, created_at);

CREATE TABLE app.app_collaborators (
    app_id     BLOB NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    user_id    BLOB NOT NULL,
    permission TEXT NOT NULL DEFAULT 'edit'
                   CHECK (permission IN ('view', 'comment', 'edit')),
    added_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
    PRIMARY KEY (app_id, user_id)
);
CREATE INDEX app.idx_app_collaborators_user ON app_collaborators(user_id);
