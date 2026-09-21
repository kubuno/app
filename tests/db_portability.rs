//! Runs the app module's own migrations and the no-code data engine's portable
//! SQL against a real server of **each** engine, from a single compiled binary —
//! the proof that the engine is a run-time choice, not a build-time one.
//!
//! The app/record CRUD proper is partly drive-backed (the `.kbapp` files live in
//! the `drive` module, reached over HTTP), so it cannot run in a unit test. This
//! binary exercises the DATABASE layer directly, issuing the very SQL the
//! handlers issue: id generated in Rust, `tags`/`shared_types` as JSON arrays,
//! the dynamic JSON-key filters (`equals`/`contains`/`greater_than`/…), the
//! text-vs-number JSON extraction, the count, and the Rust-side shallow merge
//! that replaces PostgreSQL's `data || patch`.
//!
//! * SQLite always runs (a temp file, no server).
//! * PostgreSQL runs when `KUBUNO_PG_TEST_URL` points at a throwaway database.
//! * MySQL/MariaDB runs when `KUBUNO_MYSQL_TEST_URL` does.
//!
//! ```sh
//! KUBUNO_PG_TEST_URL=postgres://u:p@127.0.0.1:5432/kubuno_test \
//! KUBUNO_MYSQL_TEST_URL=mysql://u:p@127.0.0.1:3306/app \
//!   SQLX_OFFLINE=true cargo test --test db_portability
//! ```

use kubuno_app::models::record::Record;
use kubuno_app::SCHEMA;
use kubuno_db::dialect::Backend;
use kubuno_db::{new_id, params, DbPool, DbQueryBuilder, JsonVec};
use serde_json::{json, Value};
use uuid::Uuid;

fn base_settings(engine: &str) -> kubuno_db::DbSettings {
    kubuno_db::DbSettings {
        engine: engine.to_string(),
        url: None,
        host: None,
        port: None,
        user: None,
        password: None,
        database: None,
        path: None,
        max_connections: 4,
        min_connections: 0,
        connect_timeout: std::time::Duration::from_secs(10),
        run_migrations: true,
    }
}

/// Migrations run one at a time: the PostgreSQL and MySQL suites may share a server.
static EXCLUSIVE: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

async fn migrated_pool(settings: kubuno_db::DbSettings) -> (DbPool, impl Sized) {
    let guard = EXCLUSIVE.lock().await;
    let pool = kubuno_db::connect(&settings, SCHEMA).await.expect("connect");
    kubuno_db::migrations!(
        "./migrations/postgres",
        "./migrations/mysql",
        "./migrations/sqlite",
    )
    .run(&pool, SCHEMA)
    .await
    .expect("migrations");
    (pool, guard)
}

// ── The portable JSON-key extraction the handler uses (mirrored here) ─────────

fn json_path(backend: Backend, field: &str) -> String {
    match backend {
        Backend::Postgres => field.to_string(),
        Backend::MySql | Backend::Sqlite => format!("$.\"{}\"", field.replace('"', "\\\"")),
    }
}

fn push_json_text(qb: &mut DbQueryBuilder, field: &str) {
    let b = qb.backend();
    match b {
        Backend::Postgres => {
            qb.push("data ->> ").push_bind(field.to_string());
        }
        Backend::MySql => {
            qb.push("JSON_UNQUOTE(JSON_EXTRACT(data, ")
                .push_bind(json_path(b, field))
                .push("))");
        }
        Backend::Sqlite => {
            qb.push("json_extract(data, ").push_bind(json_path(b, field)).push(")");
        }
    }
}

fn push_json_number(qb: &mut DbQueryBuilder, field: &str) {
    let b = qb.backend();
    match b {
        Backend::Postgres => {
            qb.push("(data ->> ").push_bind(field.to_string()).push(")::double precision");
        }
        Backend::MySql => {
            qb.push("CAST(JSON_UNQUOTE(JSON_EXTRACT(data, ")
                .push_bind(json_path(b, field))
                .push(")) AS DOUBLE)");
        }
        Backend::Sqlite => {
            qb.push("CAST(json_extract(data, ").push_bind(json_path(b, field)).push(") AS REAL)");
        }
    }
}

// ── Direct DB writes mirroring the handlers ──────────────────────────────────

async fn insert_app(pool: &DbPool, owner: Uuid, name: &str, tags: &[String]) -> Uuid {
    let id = new_id();
    let now = chrono::Utc::now();
    let slug = format!("s{}", &id.simple().to_string()[..8]);
    let shared: Vec<String> = Vec::new();
    pool.execute(
        "INSERT INTO app.apps \
             (id, owner_id, name, description, file_id, slug, tags, is_shared, shared_types, created_at, updated_at) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        params![id, owner, name, None::<String>, None::<Uuid>, slug, tags.to_vec(), false, shared, now, now],
    )
    .await
    .expect("insert app");
    id
}

async fn insert_record(pool: &DbPool, app_id: Uuid, owner: Uuid, type_name: &str, data: Value) -> Uuid {
    let id = new_id();
    let now = chrono::Utc::now();
    pool.execute(
        "INSERT INTO app.records (id, app_id, owner_id, type_name, created_by, data, created_at, updated_at) \
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        params![id, app_id, owner, type_name.to_string(), Some(owner), data, now, now],
    )
    .await
    .expect("insert record");
    id
}

/// Runs a filtered/sorted search (a single equality-or-comparison constraint),
/// returning the matched records in order plus the total count — the two queries
/// `do_search` issues, built the same way.
async fn search(
    pool: &DbPool,
    app_id: Uuid,
    owner: Uuid,
    type_name: &str,
    build_filter: impl Fn(&mut DbQueryBuilder),
    sort_field: &str,
) -> (Vec<Record>, i64) {
    let scope = |qb: &mut DbQueryBuilder| {
        qb.push("app_id = ")
            .push_bind(app_id)
            .push(" AND owner_id = ")
            .push_bind(owner)
            .push(" AND type_name = ")
            .push_bind(type_name.to_string());
        build_filter(qb);
    };

    let mut qb = DbQueryBuilder::new(pool.backend(), "SELECT * FROM app.records WHERE ");
    scope(&mut qb);
    qb.push(" ORDER BY ");
    push_json_text(&mut qb, sort_field);
    qb.push(" ASC");
    qb.push_limit_offset(200, 0);
    let rows = qb.fetch_all_as::<Record>(pool).await.expect("search rows");

    let mut cqb = DbQueryBuilder::new(
        pool.backend(),
        format!("SELECT {} FROM app.records WHERE ", pool.backend().count_bigint("*")),
    );
    scope(&mut cqb);
    let count = cqb.fetch_scalar::<i64>(pool).await.expect("search count");
    (rows, count)
}

fn names(rows: &[Record]) -> Vec<String> {
    rows.iter()
        .map(|r| r.data.get("name").and_then(Value::as_str).unwrap_or("").to_string())
        .collect()
}

#[derive(sqlx::FromRow)]
struct AppTags {
    #[sqlx(json)]
    tags: Vec<String>,
}

async fn full_suite(pool: &DbPool) {
    let owner = new_id();
    let tags = vec!["crm".to_string(), "démo".to_string()];
    let app_id = insert_app(pool, owner, "Mon app", &tags).await;

    // tags round-trips through the JSON-array column (#[sqlx(json)]).
    let back: AppTags = pool
        .fetch_one_as("SELECT tags FROM app.apps WHERE id = $1", params![app_id])
        .await
        .expect("read tags");
    assert_eq!(back.tags, tags, "tags JSON array round-trip on {:?}", pool.backend());

    // Three records of one type.
    insert_record(pool, app_id, owner, "Person", json!({"name":"Alice","age":30,"city":"Paris"})).await;
    let bob = insert_record(pool, app_id, owner, "Person", json!({"name":"Bob","age":25,"city":"Lyon"})).await;
    insert_record(pool, app_id, owner, "Person", json!({"name":"Charlie","age":40,"city":"Paris"})).await;

    // equals on a JSON key, sorted by another key.
    let (rows, count) = search(
        pool,
        app_id,
        owner,
        "Person",
        |qb| {
            qb.push(" AND ");
            push_json_text(qb, "city");
            qb.push(" = ").push_bind("Paris".to_string());
        },
        "name",
    )
    .await;
    assert_eq!(count, 2, "equals(city=Paris) count on {:?}", pool.backend());
    assert_eq!(names(&rows), vec!["Alice", "Charlie"], "equals rows on {:?}", pool.backend());

    // greater_than on a numeric JSON key (text extraction cast to a number).
    let (rows, count) = search(
        pool,
        app_id,
        owner,
        "Person",
        |qb| {
            qb.push(" AND ");
            push_json_number(qb, "age");
            qb.push(" > ").push_bind(28.0_f64);
        },
        "name",
    )
    .await;
    assert_eq!(count, 2, "age>28 count on {:?}", pool.backend());
    assert_eq!(names(&rows), vec!["Alice", "Charlie"], "age>28 rows on {:?}", pool.backend());

    // contains (case-insensitive LIKE on the extracted text).
    let (rows, _) = search(
        pool,
        app_id,
        owner,
        "Person",
        |qb| {
            qb.push(" AND LOWER(");
            push_json_text(qb, "name");
            qb.push(") LIKE LOWER(").push_bind("%OB%".to_string()).push(")");
        },
        "name",
    )
    .await;
    assert_eq!(names(&rows), vec!["Bob"], "contains(name~ob) on {:?}", pool.backend());

    // Shallow JSON merge (read-modify-write), the portable `data || patch`.
    let mut tx = pool.begin().await.expect("begin");
    let current: Value = tx
        .fetch_optional_row("SELECT data FROM app.records WHERE id = $1", params![bob])
        .await
        .expect("fetch data")
        .expect("row present")
        .try_get::<Value>("data")
        .expect("decode data");
    let patch = json!({"age": 26, "email": "bob@example.com"});
    let merged = match (current, patch) {
        (Value::Object(mut b), Value::Object(p)) => {
            for (k, v) in p {
                b.insert(k, v);
            }
            Value::Object(b)
        }
        (b, _) => b,
    };
    tx.execute(
        "UPDATE app.records SET data = $1 WHERE id = $2",
        params![merged, bob],
    )
    .await
    .expect("update merged");
    tx.commit().await.expect("commit");

    let rec: Record = pool
        .fetch_one_as("SELECT * FROM app.records WHERE id = $1", params![bob])
        .await
        .expect("reselect bob");
    assert_eq!(rec.data.get("age").and_then(Value::as_i64), Some(26), "merge overwrote age on {:?}", pool.backend());
    assert_eq!(
        rec.data.get("email").and_then(Value::as_str),
        Some("bob@example.com"),
        "merge added email on {:?}",
        pool.backend()
    );
    assert_eq!(rec.data.get("city").and_then(Value::as_str), Some("Lyon"), "merge kept city on {:?}", pool.backend());
    assert_eq!(rec.data.get("name").and_then(Value::as_str), Some("Bob"), "merge kept name on {:?}", pool.backend());

    // `shared_types` decodes as a JSON array (JsonVec), even when empty.
    let st: (JsonVec<String>,) = pool
        .fetch_one_as("SELECT shared_types FROM app.apps WHERE id = $1", params![app_id])
        .await
        .expect("read shared_types");
    assert!(st.0.is_empty(), "empty shared_types round-trip on {:?}", pool.backend());

    // Delete a record.
    let affected = pool
        .execute("DELETE FROM app.records WHERE id = $1", params![bob])
        .await
        .expect("delete");
    assert_eq!(affected, 1, "delete affected on {:?}", pool.backend());
    let (_, count) = search(pool, app_id, owner, "Person", |_| {}, "name").await;
    assert_eq!(count, 2, "count after delete on {:?}", pool.backend());
}

#[tokio::test]
async fn sqlite_from_the_one_binary() {
    let dir = tempfile::tempdir().expect("tempdir");
    let mut s = base_settings("sqlite");
    s.path = Some(dir.path().to_string_lossy().into_owned());
    let (pool, _keep) = migrated_pool(s).await;
    full_suite(&pool).await;
}

#[tokio::test]
async fn postgres_from_the_one_binary() {
    let Ok(url) = std::env::var("KUBUNO_PG_TEST_URL") else {
        eprintln!("skipping: KUBUNO_PG_TEST_URL not set");
        return;
    };
    let mut s = base_settings("postgres");
    s.url = Some(url);
    let (pool, _keep) = migrated_pool(s).await;
    full_suite(&pool).await;
}

#[tokio::test]
async fn mysql_from_the_one_binary() {
    let Ok(url) = std::env::var("KUBUNO_MYSQL_TEST_URL") else {
        eprintln!("skipping: KUBUNO_MYSQL_TEST_URL not set");
        return;
    };
    let mut s = base_settings("mysql");
    s.url = Some(url);
    let (pool, _keep) = migrated_pool(s).await;
    full_suite(&pool).await;
}
