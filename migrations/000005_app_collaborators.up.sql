-- User-to-user sharing of applications (same model as office document_collaborators).
-- A collaborator may open and co-edit an app in real time; only the owner manages
-- the collaborator list. Read/write ACLs are enforced in the handlers.
CREATE TABLE IF NOT EXISTS app.app_collaborators (
    app_id     UUID NOT NULL REFERENCES app.apps(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL,
    permission VARCHAR(20) NOT NULL DEFAULT 'edit'
                   CHECK (permission IN ('view', 'comment', 'edit')),
    added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (app_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_app_collaborators_user ON app.app_collaborators(user_id);
