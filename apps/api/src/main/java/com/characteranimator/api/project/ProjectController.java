package com.characteranimator.api.project;

import com.characteranimator.api.common.dto.PageResponse;
import com.characteranimator.api.project.dto.ProjectDtos.CreateProjectRequest;
import com.characteranimator.api.project.dto.ProjectDtos.ProjectDetailResponse;
import com.characteranimator.api.project.dto.ProjectDtos.ProjectSummaryResponse;
import com.characteranimator.api.project.dto.ProjectDtos.SceneVersionResponse;
import com.characteranimator.api.project.dto.ProjectDtos.UpdateProjectRequest;
import com.characteranimator.api.project.dto.ProjectDtos.UpdateSceneRequest;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/projects")
public class ProjectController {

    private final ProjectService projectService;

    public ProjectController(ProjectService projectService) {
        this.projectService = projectService;
    }

    @PostMapping
    public ResponseEntity<ProjectDetailResponse> create(@AuthenticationPrincipal UUID userId,
                                                        @Valid @RequestBody CreateProjectRequest request) {
        Project project = projectService.create(userId, request.title());
        return ResponseEntity.status(HttpStatus.CREATED).body(ProjectDetailResponse.from(project));
    }

    @GetMapping
    public PageResponse<ProjectSummaryResponse> list(
            @AuthenticationPrincipal UUID userId,
            @PageableDefault(size = 20, sort = "updatedAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return PageResponse.of(projectService.getSummaries(userId, pageable), ProjectSummaryResponse::from);
    }

    @GetMapping("/{projectId}")
    public ProjectDetailResponse get(@AuthenticationPrincipal UUID userId,
                                     @PathVariable UUID projectId) {
        return ProjectDetailResponse.from(projectService.getOwned(userId, projectId));
    }

    @PatchMapping("/{projectId}")
    public ProjectDetailResponse rename(@AuthenticationPrincipal UUID userId,
                                        @PathVariable UUID projectId,
                                        @Valid @RequestBody UpdateProjectRequest request) {
        return ProjectDetailResponse.from(projectService.rename(userId, projectId, request.title()));
    }

    @PutMapping("/{projectId}/scene")
    public SceneVersionResponse updateScene(@AuthenticationPrincipal UUID userId,
                                            @PathVariable UUID projectId,
                                            @Valid @RequestBody UpdateSceneRequest request) {
        long version = projectService.updateScene(userId, projectId, request.baseVersion(), request.document());
        return new SceneVersionResponse(version);
    }

    @DeleteMapping("/{projectId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UUID userId,
                                       @PathVariable UUID projectId) {
        projectService.delete(userId, projectId);
        return ResponseEntity.noContent().build();
    }
}
