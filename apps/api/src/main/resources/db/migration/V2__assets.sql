CREATE TABLE assets (
    id                UUID PRIMARY KEY,
    project_id        UUID         NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    original_filename VARCHAR(255) NOT NULL,
    object_key        VARCHAR(512) NOT NULL UNIQUE,
    content_type      VARCHAR(100) NOT NULL,
    size_bytes        BIGINT       NOT NULL,
    status            VARCHAR(20)  NOT NULL CHECK (status IN ('PENDING', 'READY')),
    created_at        TIMESTAMPTZ  NOT NULL,
    updated_at        TIMESTAMPTZ  NOT NULL
);

CREATE INDEX idx_assets_project ON assets (project_id);

-- 업로드가 완료되지 않은 고아 asset 청소용
CREATE INDEX idx_assets_pending_cleanup ON assets (created_at) WHERE status = 'PENDING';
