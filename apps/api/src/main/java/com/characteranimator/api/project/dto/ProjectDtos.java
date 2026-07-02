package com.characteranimator.api.project.dto;

import com.characteranimator.api.project.Project;
import com.characteranimator.api.project.ProjectRepository.ProjectSummary;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public final class ProjectDtos {

    private ProjectDtos() {
    }

    public record CreateProjectRequest(
            @NotBlank(message = "프로젝트 이름을 입력해 주세요.")
            @Size(max = 100, message = "프로젝트 이름은 100자 이하여야 합니다.")
            String title
    ) {
    }

    public record UpdateProjectRequest(
            @NotBlank(message = "프로젝트 이름을 입력해 주세요.")
            @Size(max = 100, message = "프로젝트 이름은 100자 이하여야 합니다.")
            String title
    ) {
    }

    public record UpdateSceneRequest(
            @NotNull(message = "baseVersion이 필요합니다.")
            Long baseVersion,

            @NotNull(message = "document가 필요합니다.")
            JsonNode document
    ) {
    }

    public record SceneVersionResponse(long version) {
    }

    public record ProjectSummaryResponse(
            UUID id,
            String title,
            String thumbnailKey,
            Instant createdAt,
            Instant updatedAt
    ) {
        public static ProjectSummaryResponse from(ProjectSummary summary) {
            return new ProjectSummaryResponse(
                    summary.getId(),
                    summary.getTitle(),
                    summary.getThumbnailKey(),
                    summary.getCreatedAt(),
                    summary.getUpdatedAt()
            );
        }
    }

    public record ProjectDetailResponse(
            UUID id,
            String title,
            long sceneVersion,
            JsonNode sceneDocument,
            String thumbnailKey,
            Instant createdAt,
            Instant updatedAt
    ) {
        public static ProjectDetailResponse from(Project project) {
            return new ProjectDetailResponse(
                    project.getId(),
                    project.getTitle(),
                    project.getSceneVersion(),
                    project.getSceneDocument(),
                    project.getThumbnailKey(),
                    project.getCreatedAt(),
                    project.getUpdatedAt()
            );
        }
    }
}
