package com.characteranimator.api.render;

import com.characteranimator.api.asset.AssetService;
import com.characteranimator.api.common.config.AppProperties;
import com.characteranimator.api.common.error.ApiException;
import com.characteranimator.api.common.error.ErrorCode;
import com.characteranimator.api.common.storage.StoragePort;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URL;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * 렌더 worker 전용 유스케이스. worker는 이 서비스가 노출하는 internal API만으로
 * 렌더를 완주할 수 있어야 한다 (DB 스키마를 알 필요가 없다).
 */
@Service
@Transactional
public class RenderJobWorkerService {

    private final RenderJobRepository renderJobRepository;
    private final AssetService assetService;
    private final StoragePort storagePort;
    private final AppProperties properties;

    public RenderJobWorkerService(RenderJobRepository renderJobRepository,
                                  AssetService assetService,
                                  StoragePort storagePort,
                                  AppProperties properties) {
        this.renderJobRepository = renderJobRepository;
        this.assetService = assetService;
        this.storagePort = storagePort;
        this.properties = properties;
    }

    public record ClaimedJob(
            UUID jobId,
            UUID projectId,
            OutputFormat outputFormat,
            JsonNode sceneSnapshot,
            List<ClaimedAsset> assets,
            URL outputUploadUrl
    ) {
        public record ClaimedAsset(UUID assetId, URL downloadUrl) {
        }
    }

    /**
     * 큐에서 job 하나를 원자적으로 가져간다. 응답에는 렌더에 필요한 모든 것
     * (문서 스냅샷, asset 다운로드 URL, 결과물 업로드 URL)이 담긴다.
     */
    public Optional<ClaimedJob> claim(String workerId) {
        return renderJobRepository.findNextPendingForUpdate().map(job -> {
            job.start(workerId);

            List<ClaimedJob.ClaimedAsset> assets = assetService.getReadyAssetsForProject(job.getProjectId())
                    .stream()
                    .map(a -> new ClaimedJob.ClaimedAsset(a.asset().getId(), a.downloadUrl()))
                    .toList();

            // 결과물의 object key도 서버가 결정한다. worker는 발급받은 URL에 올리기만 한다
            URL outputUploadUrl = storagePort.issueUploadUrl(
                    job.getOutputKey(),
                    job.getOutputFormat().contentType(),
                    properties.storage().uploadUrlTtl());

            return new ClaimedJob(job.getId(), job.getProjectId(), job.getOutputFormat(),
                    job.getSceneSnapshot(), assets, outputUploadUrl);
        });
    }

    public void updateProgress(UUID jobId, int progress) {
        getJob(jobId).updateProgress(progress);
    }

    public void complete(UUID jobId) {
        RenderJob job = getJob(jobId);
        // asset 업로드와 동일한 원칙: 결과물이 실제로 존재하는지 서버가 검증한다
        storagePort.head(job.getOutputKey())
                .orElseThrow(() -> new ApiException(ErrorCode.RENDER_OUTPUT_MISSING));
        job.complete();
    }

    public void fail(UUID jobId, String errorMessage) {
        // 재시도 여부(PENDING 복귀 vs FAILED 확정)는 worker가 아닌 도메인이 판단한다
        getJob(jobId).fail(errorMessage);
    }

    private RenderJob getJob(UUID jobId) {
        return renderJobRepository.findById(jobId)
                .orElseThrow(() -> new ApiException(ErrorCode.RENDER_JOB_NOT_FOUND));
    }
}
