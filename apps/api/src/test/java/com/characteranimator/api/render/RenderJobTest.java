package com.characteranimator.api.render;

import com.characteranimator.api.common.error.ApiException;
import com.characteranimator.api.common.error.ErrorCode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RenderJobTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    private RenderJob newJob(int maxAttempts) {
        return RenderJob.request(UUID.randomUUID(), UUID.randomUUID(), OutputFormat.MP4,
                objectMapper.createObjectNode(), maxAttempts);
    }

    @Test
    @DisplayName("정상 흐름: PENDING → start → progress → complete")
    void happyPath() {
        RenderJob job = newJob(3);
        assertThat(job.getStatus()).isEqualTo(RenderJob.Status.PENDING);
        assertThat(job.getOutputKey()).endsWith(".mp4");

        job.start("worker-1");
        assertThat(job.getStatus()).isEqualTo(RenderJob.Status.PROCESSING);
        assertThat(job.getAttemptCount()).isEqualTo(1);

        job.updateProgress(50);
        assertThat(job.getProgress()).isEqualTo(50);

        job.complete();
        assertThat(job.getStatus()).isEqualTo(RenderJob.Status.COMPLETED);
        assertThat(job.getProgress()).isEqualTo(100);
        assertThat(job.getCompletedAt()).isNotNull();
    }

    @Test
    @DisplayName("PENDING 상태에서 complete를 호출하면 INVALID_JOB_STATE")
    void invalidTransitionRejected() {
        RenderJob job = newJob(3);

        assertThatThrownBy(job::complete)
                .isInstanceOf(ApiException.class)
                .extracting(e -> ((ApiException) e).errorCode())
                .isEqualTo(ErrorCode.INVALID_JOB_STATE);
    }

    @Test
    @DisplayName("시도 횟수가 남아 있으면 실패 시 PENDING으로 복귀한다 (재시도)")
    void failRequeuesWhenAttemptsRemain() {
        RenderJob job = newJob(3);
        job.start("worker-1");

        job.fail("out of memory");

        assertThat(job.getStatus()).isEqualTo(RenderJob.Status.PENDING);
        assertThat(job.getErrorMessage()).isEqualTo("out of memory");
        assertThat(job.getWorkerId()).isNull();
        assertThat(job.getProgress()).isZero();
    }

    @Test
    @DisplayName("최대 시도 횟수에 도달하면 FAILED로 확정된다")
    void failFinalizesAtMaxAttempts() {
        RenderJob job = newJob(2);

        job.start("worker-1");
        job.fail("crash 1");
        assertThat(job.getStatus()).isEqualTo(RenderJob.Status.PENDING);

        job.start("worker-2");
        job.fail("crash 2");
        assertThat(job.getStatus()).isEqualTo(RenderJob.Status.FAILED);
        assertThat(job.getErrorMessage()).isEqualTo("crash 2");
        assertThat(job.getCompletedAt()).isNotNull();
    }

    @Test
    @DisplayName("진행률은 0~99로 클램프된다 (100은 complete만이 만든다)")
    void progressClamped() {
        RenderJob job = newJob(3);
        job.start("worker-1");

        job.updateProgress(150);
        assertThat(job.getProgress()).isEqualTo(99);

        job.updateProgress(-5);
        assertThat(job.getProgress()).isZero();
    }
}
