package com.characteranimator.api.asset;

import com.characteranimator.api.common.config.AppProperties;
import com.characteranimator.api.common.error.ApiException;
import com.characteranimator.api.common.error.ErrorCode;
import com.characteranimator.api.common.storage.StoragePort;
import com.characteranimator.api.project.Project;
import com.characteranimator.api.project.ProjectService;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URL;
import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class AssetService {

    private static final Logger log = LoggerFactory.getLogger(AssetService.class);
    private static final String SVG_CONTENT_TYPE = "image/svg+xml";

    private final AssetRepository assetRepository;
    private final ProjectService projectService;
    private final StoragePort storagePort;
    private final AppProperties properties;

    public AssetService(AssetRepository assetRepository,
                        ProjectService projectService,
                        StoragePort storagePort,
                        AppProperties properties) {
        this.assetRepository = assetRepository;
        this.projectService = projectService;
        this.storagePort = storagePort;
        this.properties = properties;
    }

    public record RegisteredAsset(Asset asset, URL uploadUrl) {
    }

    @Transactional
    public RegisteredAsset register(UUID userId, UUID projectId,
                                    String filename, String contentType, long declaredSizeBytes) {
        projectService.getOwned(userId, projectId);
        validate(contentType, declaredSizeBytes);

        Asset asset = assetRepository.save(Asset.register(projectId, filename, contentType, declaredSizeBytes));
        URL uploadUrl = storagePort.issueUploadUrl(
                asset.getObjectKey(), contentType, properties.storage().uploadUrlTtl());
        return new RegisteredAsset(asset, uploadUrl);
    }

    /**
     * 업로드 완료 확정. 스토리지에 오브젝트가 실제로 존재하는지 검증한 뒤 READY로 전환한다.
     * "업로드했다"는 클라이언트의 주장을 믿지 않는 것이 이 단계의 존재 이유다.
     */
    @Transactional
    public Asset complete(UUID userId, UUID assetId) {
        Asset asset = getOwned(userId, assetId);
        if (asset.isReady()) {
            return asset; // 네트워크 재시도 등으로 중복 호출돼도 안전 (멱등)
        }

        StoragePort.ObjectMetadata metadata = storagePort.head(asset.getObjectKey())
                .orElseThrow(() -> new ApiException(ErrorCode.ASSET_UPLOAD_INCOMPLETE));

        if (metadata.sizeBytes() > properties.asset().maxSizeBytes()) {
            storagePort.delete(asset.getObjectKey());
            assetRepository.delete(asset);
            throw new ApiException(ErrorCode.ASSET_TOO_LARGE);
        }
        asset.markReady(metadata.sizeBytes());
        return asset;
    }

    public record AssetWithUrl(Asset asset, URL downloadUrl) {
    }

    public List<AssetWithUrl> getReadyAssets(UUID userId, UUID projectId) {
        projectService.getOwned(userId, projectId);
        return getReadyAssetsForProject(projectId);
    }

    /** 소유권 검증 없는 내부용 조회. 렌더 worker의 claim 응답 구성에 사용한다. */
    public List<AssetWithUrl> getReadyAssetsForProject(UUID projectId) {
        return assetRepository.findAllByProjectIdAndStatusOrderByCreatedAtAsc(projectId, Asset.Status.READY)
                .stream()
                .map(asset -> new AssetWithUrl(asset,
                        storagePort.issueDownloadUrl(asset.getObjectKey(), properties.storage().downloadUrlTtl())))
                .toList();
    }

    @Transactional
    public void delete(UUID userId, UUID assetId) {
        Asset asset = getOwned(userId, assetId);
        Project project = projectService.getOwned(userId, asset.getProjectId());
        if (isReferencedInScene(project.getSceneDocument(), assetId)) {
            throw new ApiException(ErrorCode.ASSET_IN_USE);
        }
        assetRepository.delete(asset);
        deleteObjectQuietly(asset.getObjectKey());
    }

    /** 프로젝트 삭제 시 소속 asset의 row와 스토리지 오브젝트를 함께 정리한다. */
    @Transactional
    public void deleteAllForProject(UUID projectId) {
        List<Asset> assets = assetRepository.findAllByProjectId(projectId);
        assetRepository.deleteAll(assets);
        // 스토리지 삭제는 best-effort: 실패해도 트랜잭션을 깨지 않고, 고아 오브젝트는 배치로 회수한다
        try {
            storagePort.deleteAll(assets.stream().map(Asset::getObjectKey).toList());
        } catch (Exception e) {
            log.warn("Failed to delete storage objects for project {}", projectId, e);
        }
    }

    private Asset getOwned(UUID userId, UUID assetId) {
        Asset asset = assetRepository.findById(assetId)
                .orElseThrow(() -> new ApiException(ErrorCode.ASSET_NOT_FOUND));
        // 소유권은 asset이 속한 프로젝트를 통해 검증한다. 남의 것이면 404 (존재 여부 숨김)
        try {
            projectService.getOwned(userId, asset.getProjectId());
        } catch (ApiException e) {
            throw new ApiException(ErrorCode.ASSET_NOT_FOUND);
        }
        return asset;
    }

    private void validate(String contentType, long sizeBytes) {
        if (!SVG_CONTENT_TYPE.equals(contentType)) {
            throw new ApiException(ErrorCode.UNSUPPORTED_ASSET_TYPE);
        }
        if (sizeBytes <= 0 || sizeBytes > properties.asset().maxSizeBytes()) {
            throw new ApiException(ErrorCode.ASSET_TOO_LARGE);
        }
    }

    private boolean isReferencedInScene(JsonNode sceneDocument, UUID assetId) {
        String id = assetId.toString();
        for (JsonNode node : sceneDocument.path("nodes")) {
            if (id.equals(node.path("assetId").asText())) {
                return true;
            }
        }
        return false;
    }

    private void deleteObjectQuietly(String objectKey) {
        try {
            storagePort.delete(objectKey);
        } catch (Exception e) {
            log.warn("Failed to delete storage object {}", objectKey, e);
        }
    }
}
