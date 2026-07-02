package com.characteranimator.api.project;

import com.characteranimator.api.common.error.ApiException;
import com.characteranimator.api.common.error.ErrorCode;
import com.characteranimator.api.project.ProjectRepository.ProjectSummary;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final SceneDocumentFactory sceneDocumentFactory;
    private final ApplicationEventPublisher eventPublisher;

    public ProjectService(ProjectRepository projectRepository,
                          SceneDocumentFactory sceneDocumentFactory,
                          ApplicationEventPublisher eventPublisher) {
        this.projectRepository = projectRepository;
        this.sceneDocumentFactory = sceneDocumentFactory;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public Project create(UUID userId, String title) {
        Project project = Project.create(userId, title, sceneDocumentFactory.createInitialDocument());
        return projectRepository.save(project);
    }

    public Page<ProjectSummary> getSummaries(UUID userId, Pageable pageable) {
        return projectRepository.findSummariesByUserId(userId, pageable);
    }

    public Project getOwned(UUID userId, UUID projectId) {
        // 소유자가 아니면 존재 여부를 숨기기 위해 403이 아닌 404를 반환한다.
        return projectRepository.findByIdAndUserId(projectId, userId)
                .orElseThrow(() -> new ApiException(ErrorCode.PROJECT_NOT_FOUND));
    }

    @Transactional
    public Project rename(UUID userId, UUID projectId, String title) {
        Project project = getOwned(userId, projectId);
        project.rename(title);
        return project;
    }

    @Transactional
    public long updateScene(UUID userId, UUID projectId, long baseVersion, JsonNode document) {
        if (!sceneDocumentFactory.isValid(document)) {
            throw new ApiException(ErrorCode.INVALID_SCENE_DOCUMENT);
        }
        Project project = getOwned(userId, projectId);
        return project.updateScene(baseVersion, document);
    }

    @Transactional
    public void delete(UUID userId, UUID projectId) {
        Project project = getOwned(userId, projectId);
        // 구독자(asset 등)의 정리 작업이 같은 트랜잭션 안에서 동기 실행된다
        eventPublisher.publishEvent(new ProjectDeletedEvent(projectId));
        projectRepository.delete(project);
    }
}
