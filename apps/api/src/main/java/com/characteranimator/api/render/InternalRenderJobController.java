package com.characteranimator.api.render;

import com.characteranimator.api.render.dto.RenderDtos.ClaimRequest;
import com.characteranimator.api.render.dto.RenderDtos.ClaimResponse;
import com.characteranimator.api.render.dto.RenderDtos.FailRequest;
import com.characteranimator.api.render.dto.RenderDtos.ProgressRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * 렌더 worker 전용 API. InternalTokenFilter가 X-Internal-Token으로 인증한다.
 * 배포 시 /internal/** 은 외부 라우팅에서 차단해야 한다.
 */
@RestController
@RequestMapping("/internal/render-jobs")
public class InternalRenderJobController {

    private final RenderJobWorkerService workerService;

    public InternalRenderJobController(RenderJobWorkerService workerService) {
        this.workerService = workerService;
    }

    @PostMapping("/claim")
    public ResponseEntity<ClaimResponse> claim(@Valid @RequestBody ClaimRequest request) {
        return workerService.claim(request.workerId())
                .map(claimed -> ResponseEntity.ok(ClaimResponse.from(claimed)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PatchMapping("/{jobId}/progress")
    public ResponseEntity<Void> progress(@PathVariable UUID jobId,
                                         @Valid @RequestBody ProgressRequest request) {
        workerService.updateProgress(jobId, request.progress());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{jobId}/complete")
    public ResponseEntity<Void> complete(@PathVariable UUID jobId) {
        workerService.complete(jobId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{jobId}/fail")
    public ResponseEntity<Void> fail(@PathVariable UUID jobId,
                                     @Valid @RequestBody FailRequest request) {
        workerService.fail(jobId, request.errorMessage());
        return ResponseEntity.noContent().build();
    }
}
