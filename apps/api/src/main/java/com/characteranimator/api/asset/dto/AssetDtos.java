package com.characteranimator.api.asset.dto;

import com.characteranimator.api.asset.Asset;
import com.characteranimator.api.asset.AssetService.AssetWithUrl;
import com.characteranimator.api.asset.AssetService.RegisteredAsset;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public final class AssetDtos {

    private AssetDtos() {
    }

    public record RegisterAssetRequest(
            @NotBlank(message = "파일 이름이 필요합니다.")
            @Size(max = 255, message = "파일 이름은 255자 이하여야 합니다.")
            String filename,

            @NotBlank(message = "contentType이 필요합니다.")
            String contentType,

            @Positive(message = "sizeBytes는 양수여야 합니다.")
            long sizeBytes
    ) {
    }

    public record RegisterAssetResponse(
            UUID id,
            String objectKey,
            String uploadUrl,
            String status
    ) {
        public static RegisterAssetResponse from(RegisteredAsset registered) {
            return new RegisterAssetResponse(
                    registered.asset().getId(),
                    registered.asset().getObjectKey(),
                    registered.uploadUrl().toString(),
                    registered.asset().getStatus().name()
            );
        }
    }

    public record AssetResponse(
            UUID id,
            String originalFilename,
            String contentType,
            long sizeBytes,
            String status,
            String downloadUrl,
            Instant createdAt
    ) {
        public static AssetResponse from(Asset asset, String downloadUrl) {
            return new AssetResponse(
                    asset.getId(),
                    asset.getOriginalFilename(),
                    asset.getContentType(),
                    asset.getSizeBytes(),
                    asset.getStatus().name(),
                    downloadUrl,
                    asset.getCreatedAt()
            );
        }

        public static AssetResponse from(AssetWithUrl assetWithUrl) {
            return from(assetWithUrl.asset(), assetWithUrl.downloadUrl().toString());
        }
    }
}
