-- Portable-shape migration (kubuno-db 0.6.0): bring the PostgreSQL schema in
-- line with what a single binary running on three engines writes.
--
--   * Array columns become jsonb. MySQL and SQLite have no array type, so the
--     module now binds `tags` / `shared_types` as JSON arrays (a `Vec<String>`
--     encoded through kubuno_db::DbValue) and reads them back through
--     `#[sqlx(json)]`. On PostgreSQL the column must therefore be jsonb, not
--     TEXT[]; `to_jsonb` converts the existing rows losslessly.
--   * The `updated_at` BEFORE-UPDATE triggers retire: `updated_at` is now set in
--     Rust at every write site (bind `chrono::Utc::now()`), the one behaviour
--     that holds on all three engines. The trigger function goes with them.

ALTER TABLE app.apps
    ALTER COLUMN tags DROP DEFAULT,
    ALTER COLUMN tags TYPE JSONB USING to_jsonb(tags),
    ALTER COLUMN tags SET DEFAULT '[]'::jsonb;

ALTER TABLE app.apps
    ALTER COLUMN shared_types DROP DEFAULT,
    ALTER COLUMN shared_types TYPE JSONB USING to_jsonb(shared_types),
    ALTER COLUMN shared_types SET DEFAULT '[]'::jsonb;

DROP TRIGGER IF EXISTS apps_updated_at    ON app.apps;
DROP TRIGGER IF EXISTS records_updated_at ON app.records;
DROP FUNCTION IF EXISTS app.set_updated_at();
