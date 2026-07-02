package com.characteranimator.api.render;

import com.characteranimator.api.common.config.AppProperties;
import com.characteranimator.api.common.error.ApiException;
import com.characteranimator.api.common.error.ErrorCode;
import com.characteranimator.api.common.storage.StoragePort;
import com.characteranimator.api.project.Project;
import com.characteranimator.api.project.ProjectService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URL;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * 사용자 관점의 렌더 작업 API. worker 관점은 RenderJobWorkerService가 담당한다.
 */
@Service
@Transactional(readOnly = true)
public class RenderJobService {

    private static final Set<RenderJob.Status> IN_PROGRESS_STATUSES =
            Set.of(RenderJob.Status.PENDING, RenderJob.Status.PROCESSING);

    private final RenderJobRepository renderJobRepository;
    private final ProjectService projectService;
    private final StoragePort storagePort;
    private final AppProperties properties;

    public RenderJobService(RenderJobRepository renderJobRepository,
                            ProjectService projectService,
                            StoragePort storagePort,
                            AppProperties properties) {
        this.renderJobRepository = renderJobRepository;
        this.projectService = projectService;
        this.storagePort = storagePort;
        this.properties = properties;
    }

    @Transactional
    public RenderJob request(UUID userId, UUID projectId, OutputFormat format) {
        Project project = projectService.getOwned(userId, projectId);
        // 렌더 버튼 연타로 큐가 도배되는 것을 서버가 막는다
        if (renderJobRepository.existsByProjectIdAndStatusIn(projectId, IN_PROGRESS_STATUSES)) {
            throw new ApiException(ErrorCode.RENDER_ALREADY_IN_PROGRESS);
        }
        RenderJob job = RenderJob.request(projectId, userId, format,
                project.getSceneDocument().deepCopy(), properties.render().maxAttempts());
        return renderJobRepository.save(job);
    }

    public record JobWithDownloadUrl(RenderJob job, URL downloadUrl) {
    }

    public JobWithDownloadUrl get(UUID userId, UUID jobId) {
        RenderJob job = renderJobRepository.findByIdAndUserId(jobId, userId)
                .orElseThrow(() -> new ApiException(ErrorCode.RENDER_JOB_NOT_FOUND));
        return withDownloadUrl(job);
    }

    public List<JobWithDownloadUrl> getHistory(UUID userId, UUID projectId) {
        projectService.getOwned(userId, projectId);
        return renderJobRepository.findAllByProjectIdOrderByCreatedAtDesc(projectId)
                .stream()
                .map(this::withDownloadUrl)
                .toList();
    }

    private JobWithDownloadUrl withDownloadUrl(RenderJob job) {
        URL downloadUrl = job.isCompleted()
                ? storagePort.issueDownloadUrl(job.getOutputKey(), properties.storage().downloadUrlTtl())
                : null;
        return new JobWithDownloadUrl(job, downloadUrl);
    }
}
