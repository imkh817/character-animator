package com.characteranimator.api.asset;

import com.characteranimator.api.common.storage.StoragePort;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * presigned URL만 발급받고 업로드를 완료하지 않은 고아 asset을 주기적으로 청소한다.
 */
@Component
public class PendingAssetCleaner {

    private static final Logger log = LoggerFactory.getLogger(PendingAssetCleaner.class);
    private static final Duration STALE_THRESHOLD = Duration.ofHours(24);

    private final AssetRepository assetRepository;
    private final StoragePort storagePort;

    public PendingAssetCleaner(AssetRepository assetRepository, StoragePort storagePort) {
        this.assetRepository = assetRepository;
        this.storagePort = storagePort;
    }

    @Scheduled(fixedDelayString = "PT1H")
    @Transactional
    public void cleanUp() {
        Instant threshold = Instant.now().minus(STALE_THRESHOLD);
        List<Asset> staleAssets =
                assetRepository.findAllByStatusAndCreatedAtBefore(Asset.Status.PENDING, threshold);
        if (staleAssets.isEmpty()) {
            return;
        }
        log.info("Cleaning up {} stale pending assets", staleAssets.size());
        assetRepository.deleteAll(staleAssets);
        try {
            // URL만 발급받고 실제 업로드된 경우도 있을 수 있으므로 오브젝트도 함께 정리
            storagePort.deleteAll(staleAssets.stream().map(Asset::getObjectKey).toList());
        } catch (Exception e) {
            log.warn("Failed to delete stale storage objects", e);
        }
    }
}
