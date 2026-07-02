package com.characteranimator.api.asset;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface AssetRepository extends JpaRepository<Asset, UUID> {

    List<Asset> findAllByProjectIdAndStatusOrderByCreatedAtAsc(UUID projectId, Asset.Status status);

    List<Asset> findAllByProjectId(UUID projectId);

    List<Asset> findAllByStatusAndCreatedAtBefore(Asset.Status status, Instant threshold);
}
