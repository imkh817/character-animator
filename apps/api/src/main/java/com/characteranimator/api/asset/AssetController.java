package com.characteranimator.api.asset;

import com.characteranimator.api.asset.dto.AssetDtos.AssetResponse;
import com.characteranimator.api.asset.dto.AssetDtos.RegisterAssetRequest;
import com.characteranimator.api.asset.dto.AssetDtos.RegisterAssetResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
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
public class AssetController {

    private final AssetService assetService;

    public AssetController(AssetService assetService) {
        this.assetService = assetService;
    }

    @PostMapping("/projects/{projectId}/assets")
    public ResponseEntity<RegisterAssetResponse> register(@AuthenticationPrincipal UUID userId,
                                                          @PathVariable UUID projectId,
                                                          @Valid @RequestBody RegisterAssetRequest request) {
        var registered = assetService.register(
                userId, projectId, request.filename(), request.contentType(), request.sizeBytes());
        return ResponseEntity.status(HttpStatus.CREATED).body(RegisterAssetResponse.from(registered));
    }

    @PostMapping("/assets/{assetId}/complete")
    public AssetResponse complete(@AuthenticationPrincipal UUID userId,
                                  @PathVariable UUID assetId) {
        Asset asset = assetService.complete(userId, assetId);
        return AssetResponse.from(asset, null);
    }

    @GetMapping("/projects/{projectId}/assets")
    public List<AssetResponse> list(@AuthenticationPrincipal UUID userId,
                                    @PathVariable UUID projectId) {
        return assetService.getReadyAssets(userId, projectId).stream()
                .map(AssetResponse::from)
                .toList();
    }

    @DeleteMapping("/assets/{assetId}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal UUID userId,
                                       @PathVariable UUID assetId) {
        assetService.delete(userId, assetId);
        return ResponseEntity.noContent().build();
    }
}
