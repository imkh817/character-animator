package com.characteranimator.api.render;

import com.characteranimator.api.render.dto.RenderDtos.RenderJobResponse;
import com.characteranimator.api.render.dto.RenderDtos.RequestRenderRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class RenderJobController {

    private final RenderJobService renderJobService;

    public RenderJobController(RenderJobService renderJobService) {
        this.renderJobService = renderJobService;
    }

    @PostMapping("/projects/{projectId}/render-jobs")
    public ResponseEntity<RenderJobResponse> request(@AuthenticationPrincipal UUID userId,
                                                     @PathVariable UUID projectId,
                                                     @Valid @RequestBody RequestRenderRequest request) {
        RenderJob job = renderJobService.request(userId, projectId, request.format());
        return ResponseEntity.status(HttpStatus.CREATED).body(RenderJobResponse.from(job));
    }

    @GetMapping("/render-jobs/{jobId}")
    public RenderJobResponse get(@AuthenticationPrincipal UUID userId,
                                 @PathVariable UUID jobId) {
        return RenderJobResponse.from(renderJobService.get(userId, jobId));
    }

    @GetMapping("/projects/{projectId}/render-jobs")
    public List<RenderJobResponse> history(@AuthenticationPrincipal UUID userId,
                                           @PathVariable UUID projectId) {
        return renderJobService.getHistory(userId, projectId).stream()
                .map(RenderJobResponse::from)
                .toList();
    }
}
