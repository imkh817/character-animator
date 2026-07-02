CREATE TABLE render_jobs (
    id                UUID PRIMARY KEY,
    project_id        UUID         NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    user_id           UUID         NOT NULL REFERENCES users (id),
    status            VARCHAR(20)  NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    output_format     VARCHAR(10)  NOT NULL CHECK (output_format IN ('MP4', 'WEBM', 'GIF')),
    scene_snapshot    JSONB        NOT NULL,
    progress          INTEGER      NOT NULL DEFAULT 0,
    output_key        VARCHAR(512) NOT NULL,
    error_message     TEXT,
    attempt_count     INTEGER      NOT NULL DEFAULT 0,
    max_attempts      INTEGER      NOT NULL,
    worker_id         VARCHAR(100),
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    last_heartbeat_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ  NOT NULL,
    updated_at        TIMESTAMPTZ  NOT NULL
);

-- worker의 claim 폴링용: PENDING row만 인덱싱하므로 이력이 쌓여도 폴링 비용이 일정하다
CREATE INDEX idx_render_jobs_queue ON render_jobs (created_at) WHERE status = 'PENDING';

-- 죽은 worker의 job 회수용
CREATE INDEX idx_render_jobs_stale ON render_jobs (last_heartbeat_at) WHERE status = 'PROCESSING';

-- 프로젝트별 렌더 이력
CREATE INDEX idx_render_jobs_project ON render_jobs (project_id, created_at DESC);
