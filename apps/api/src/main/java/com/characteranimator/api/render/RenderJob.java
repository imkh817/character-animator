package com.characteranimator.api.render;

import com.characteranimator.api.common.entity.BaseEntity;
import com.characteranimator.api.common.error.ApiException;
import com.characteranimator.api.common.error.ErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.github.f4b6a3.uuid.UuidCreator;
import io.hypersistence.utils.hibernate.type.json.JsonType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import org.hibernate.annotations.Type;

import java.time.Instant;
import java.util.UUID;

/**
 * 렌더 작업. 상태 전이 규칙(PENDING → PROCESSING → COMPLETED/FAILED, 재시도 시 PENDING 복귀)은
 * 전부 이 엔티티가 소유한다. 서비스는 전이를 호출할 뿐 규칙을 알지 못한다.
 */
@Entity
@Table(name = "render_jobs")
public class RenderJob extends BaseEntity {

    public enum Status {
        PENDING, PROCESSING, COMPLETED, FAILED
    }

    @Column(nullable = false)
    private UUID projectId;

    @Column(nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Status status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private OutputFormat outputFormat;

    /**
     * 렌더 요청 시점의 Scene 문서 복사본. 렌더 중 사용자가 계속 편집해도
     * "요청한 그대로"의 영상이 나오는 것을 보장한다.
     */
    @Type(JsonType.class)
    @Column(columnDefinition = "jsonb", nullable = false)
    private JsonNode sceneSnapshot;

    @Column(nullable = false)
    private int progress;

    @Column(nullable = false, length = 512)
    private String outputKey;

    @Column(columnDefinition = "text")
    private String errorMessage;

    @Column(nullable = false)
    private int attemptCount;

    @Column(nullable = false)
    private int maxAttempts;

    @Column(length = 100)
    private String workerId;

    private Instant startedAt;

    private Instant completedAt;

    private Instant lastHeartbeatAt;

    protected RenderJob() {
    }

    private RenderJob(UUID id, UUID projectId, UUID userId, OutputFormat outputFormat,
                      JsonNode sceneSnapshot, int maxAttempts) {
        super(id);
        this.projectId = projectId;
        this.userId = userId;
        this.status = Status.PENDING;
        this.outputFormat = outputFormat;
        this.sceneSnapshot = sceneSnapshot;
        this.progress = 0;
        this.outputKey = "projects/%s/renders/%s.%s".formatted(projectId, id, outputFormat.extension());
        this.attemptCount = 0;
        this.maxAttempts = maxAttempts;
    }

    public static RenderJob request(UUID projectId, UUID userId, OutputFormat outputFormat,
                                    JsonNode sceneSnapshot, int maxAttempts) {
        return new RenderJob(UuidCreator.getTimeOrderedEpoch(), projectId, userId,
                outputFormat, sceneSnapshot, maxAttempts);
    }

    /** worker가 job을 가져갈 때 호출. 시도 횟수를 소모한다. */
    public void start(String workerId) {
        requireStatus(Status.PENDING);
        this.status = Status.PROCESSING;
        this.workerId = workerId;
        this.attemptCount++;
        this.progress = 0;
        this.startedAt = Instant.now();
        this.lastHeartbeatAt = this.startedAt;
    }

    public void updateProgress(int progress) {
        requireStatus(Status.PROCESSING);
        this.progress = Math.clamp(progress, 0, 99);
        this.lastHeartbeatAt = Instant.now();
    }

    public void complete() {
        requireStatus(Status.PROCESSING);
        this.status = Status.COMPLETED;
        this.progress = 100;
        this.errorMessage = null;
        this.completedAt = Instant.now();
    }

    /** 실패 처리. 시도 횟수가 남아 있으면 PENDING으로 복귀시켜 다른 worker가 재시도하게 한다. */
    public void fail(String errorMessage) {
        requireStatus(Status.PROCESSING);
        this.errorMessage = errorMessage;
        if (attemptCount >= maxAttempts) {
            this.status = Status.FAILED;
            this.completedAt = Instant.now();
        } else {
            this.status = Status.PENDING;
            this.workerId = null;
            this.progress = 0;
            this.startedAt = null;
            this.lastHeartbeatAt = null;
        }
    }

    public boolean isCompleted() {
        return status == Status.COMPLETED;
    }

    private void requireStatus(Status expected) {
        if (this.status != expected) {
            throw new ApiException(ErrorCode.INVALID_JOB_STATE,
                    "%s 상태에서는 수행할 수 없습니다 (현재: %s)".formatted(expected, status));
        }
    }

    public UUID getProjectId() {
        return projectId;
    }

    public UUID getUserId() {
        return userId;
    }

    public Status getStatus() {
        return status;
    }

    public OutputFormat getOutputFormat() {
        return outputFormat;
    }

    public JsonNode getSceneSnapshot() {
        return sceneSnapshot;
    }

    public int getProgress() {
        return progress;
    }

    public String getOutputKey() {
        return outputKey;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public int getAttemptCount() {
        return attemptCount;
    }

    public String getWorkerId() {
        return workerId;
    }

    public Instant getCompletedAt() {
        return completedAt;
    }
}
