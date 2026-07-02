package com.characteranimator.api.render.dto;

import com.characteranimator.api.render.OutputFormat;
import com.characteranimator.api.render.RenderJob;
import com.characteranimator.api.render.RenderJobService.JobWithDownloadUrl;
import com.characteranimator.api.render.RenderJobWorkerService.ClaimedJob;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.net.URL;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class RenderDtos {

    private RenderDtos() {
    }

    // ── 사용자용 ──────────────────────────────────────────────

    public record RequestRenderRequest(
            @NotNull(message = "출력 포맷이 필요합니다.")
            OutputFormat format
    ) {
    }

    public record RenderJobResponse(
            UUID id,
            UUID projectId,
            String status,
            String outputFormat,
            int progress,
            String errorMessage,
            String downloadUrl,
            Instant createdAt,
            Instant completedAt
    ) {
        public static RenderJobResponse from(JobWithDownloadUrl jobWithUrl) {
            RenderJob job = jobWithUrl.job();
            return new RenderJobResponse(
                    job.getId(),
                    job.getProjectId(),
                    job.getStatus().name(),
                    job.getOutputFormat().name(),
                    job.getProgress(),
                    job.getErrorMessage(),
                    jobWithUrl.downloadUrl() != null ? jobWithUrl.downloadUrl().toString() : null,
                    job.getCreatedAt(),
                    job.getCompletedAt()
            );
        }

        public static RenderJobResponse from(RenderJob job) {
            return from(new JobWithDownloadUrl(job, null));
        }
    }

    // ── worker(internal)용 ───────────────────────────────────

    public record ClaimRequest(
            @NotBlank(message = "workerId가 필요합니다.")
            @Size(max = 100)
            String workerId
    ) {
    }

    public record ClaimResponse(
            UUID jobId,
            UUID projectId,
            String outputFormat,
            JsonNode sceneSnapshot,
            List<ClaimedAssetResponse> assets,
            String outputUploadUrl
    ) {
        public record ClaimedAssetResponse(UUID assetId, String downloadUrl) {
        }

        public static ClaimResponse from(ClaimedJob claimed) {
            return new ClaimResponse(
                    claimed.jobId(),
                    claimed.projectId(),
                    claimed.outputFormat().name(),
                    claimed.sceneSnapshot(),
                    claimed.assets().stream()
                            .map(a -> new ClaimedAssetResponse(a.assetId(), a.downloadUrl().toString()))
                            .toList(),
                    claimed.outputUploadUrl().toString()
            );
        }
    }

    public record ProgressRequest(
            @Min(0) @Max(100)
            int progress
    ) {
    }

    public record FailRequest(
            @NotBlank(message = "errorMessage가 필요합니다.")
            String errorMessage
    ) {
    }
}
